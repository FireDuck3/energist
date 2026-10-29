// Стан демо: одне джерело правди для всіх екранів, зберігається в localStorage.
import { SPOTS, HOSTS, SEED_BOOKINGS, DEMO_HOST_ID, DEMO_GUEST_NAME, DATA_VERSION, isoDay } from './data.js';
import { DEFAULT_FILTERS } from './filters.js';
import { estimateKwh, holdAmount, sessionCost } from './pricing.js';

export const STORAGE_KEY = 'energist-demo-v1';

export function seedState() {
  return structuredClone({
    version: DATA_VERSION, role: 'guest', blackout: false, filters: DEFAULT_FILTERS,
    spots: SPOTS, hosts: HOSTS, bookings: SEED_BOOKINGS,
  });
}

export function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
  };
}

// null, якщо браузер не дає писати (приватний режим, заблоковані дані сайту).
export function safeLocalStorage() {
  try {
    const s = window.localStorage;
    s.setItem('__energist_probe', '1');
    s.removeItem('__energist_probe');
    return s;
  } catch {
    return null;
  }
}

function load(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY));
    const valid = parsed?.version === DATA_VERSION &&
      ['spots', 'hosts', 'bookings'].every((k) => Array.isArray(parsed[k]));
    if (!valid) return null;
    return { ...seedState(), ...parsed, filters: { ...DEFAULT_FILTERS, ...parsed.filters } };
  } catch {
    return null;
  }
}

let seq = 0;
const newId = (prefix) => `${prefix}-${Date.now().toString(36)}${(seq++).toString(36)}`;

export function createStore(storage) {
  let state = load(storage) ?? seedState();
  const listeners = new Set();

  const save = () => {
    try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* демо працює і без збереження */ }
  };
  const set = (patch) => {
    state = { ...state, ...patch };
    save();
    listeners.forEach((fn) => fn(state));
  };
  const findSpot = (id) => state.spots.find((s) => s.id === id);
  const findBooking = (id) => state.bookings.find((b) => b.id === id);
  const updateBooking = (id, patch) =>
    set({ bookings: state.bookings.map((b) => (b.id === id ? { ...b, ...patch } : b)) });

  return {
    getState: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    setRole: (role) => set({ role }),
    setBlackout: (on) => set({ blackout: Boolean(on) }),
    setFilters: (partial) => set({ filters: { ...state.filters, ...partial } }),
    resetFilters: () => set({ filters: { ...DEFAULT_FILTERS } }),

    addSpot(input) {
      const spot = { ...input, id: newId('user'), hostId: DEMO_HOST_ID, reviews: [],
        blackoutHours: input.source === 'grid' ? 0 : (input.blackoutHours ?? 6) };
      set({ spots: [...state.spots, spot] });
      return spot;
    },

    createBooking({ spotId, device, day, start, hours }) {
      const spot = findSpot(spotId);
      const estimatedKwh = estimateKwh(spot.powerKw, hours, device);
      const booking = {
        id: newId('b'), spotId, guestName: DEMO_GUEST_NAME, device,
        date: isoDay(day === 'tomorrow' ? 1 : 0), start, hours, estimatedKwh,
        heldAmount: holdAmount(estimatedKwh, spot.pricePerKwh), status: 'held',
        actualKwh: null, total: null, fee: null, hostPayout: null, createdAt: isoDay(0),
      };
      set({ bookings: [...state.bookings, booking] });
      return booking;
    },
    startCharging: (id) => updateBooking(id, { status: 'charging' }),
    finishCharging(id, actualKwh) {
      const spot = findSpot(findBooking(id).spotId);
      updateBooking(id, { status: 'paid', actualKwh, ...sessionCost(actualKwh, spot.pricePerKwh) });
    },
    addReview(bookingId, { stars, text }) {
      const booking = findBooking(bookingId);
      const review = { author: DEMO_GUEST_NAME, stars, text, date: isoDay(0) };
      state = {
        ...state,
        spots: state.spots.map((s) => (s.id === booking.spotId ? { ...s, reviews: [review, ...s.reviews] } : s)),
      };
      updateBooking(bookingId, { status: 'reviewed' });
    },
    confirmBooking: (id) => updateBooking(id, { status: 'held' }),
    declineBooking: (id) => updateBooking(id, { status: 'declined' }),

    reset() {
      try { storage.removeItem(STORAGE_KEY); } catch { /* ігноруємо */ }
      state = seedState();
      listeners.forEach((fn) => fn(state));
    },
  };
}
