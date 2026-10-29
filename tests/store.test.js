import { test, eq } from './runner.js';
import { createStore, memoryStorage, STORAGE_KEY } from '../js/store.js';
import { spotRating, DEFAULT_FILTERS } from '../js/filters.js';
import { DATA_VERSION } from '../js/data.js';

const spot = (state, id) => state.spots.find((s) => s.id === id);

test('стартує із засіяних даних', () => {
  const st = createStore(memoryStorage()).getState();
  eq([st.spots.length, st.bookings.length, st.role, st.blackout], [15, 5, 'guest', false]);
});

test('setBlackout змінює стан і кличе підписника один раз', () => {
  const store = createStore(memoryStorage());
  let calls = 0;
  store.subscribe(() => calls++);
  const before = store.getState();
  store.setBlackout(true);
  eq([store.getState().blackout, calls, before.blackout], [true, 1, false]);
});

test('стан переживає перезавантаження', () => {
  const storage = memoryStorage();
  createStore(storage).setBlackout(true);
  eq(createStore(storage).getState().blackout, true);
});

test('бронювання і оплата: еталон 360 / 36 / 324', () => {
  const store = createStore(memoryStorage());
  const b = store.createBooking({ spotId: 'oleh-ses', device: 'ev', day: 'today', start: '10:00', hours: 3 });
  eq([b.estimatedKwh, b.heldAmount, b.status, b.guestName], [22.2, 266.4, 'held', 'Саша']);
  store.startCharging(b.id);
  eq(store.getState().bookings.find((x) => x.id === b.id).status, 'charging');
  store.finishCharging(b.id, 30);
  const paid = store.getState().bookings.find((x) => x.id === b.id);
  eq([paid.status, paid.actualKwh, paid.total, paid.fee, paid.hostPayout], ['paid', 30, 360, 36, 324]);
});

test('відгук додається і змінює рейтинг', () => {
  const store = createStore(memoryStorage());
  const before = spotRating(spot(store.getState(), 'oleh-ses'));
  const b = store.createBooking({ spotId: 'oleh-ses', device: 'ev', day: 'today', start: '10:00', hours: 1 });
  store.finishCharging(b.id, 5);
  store.addReview(b.id, { stars: 1, text: 'Тест' });
  const st = store.getState();
  eq(spot(st, 'oleh-ses').reviews.length, 4);
  eq(spotRating(spot(st, 'oleh-ses')) < before, true);
  eq(st.bookings.find((x) => x.id === b.id).status, 'reviewed');
});

test('addSpot додає точку Олега', () => {
  const store = createStore(memoryStorage());
  const s = store.addSpot({ title: 'Нова', lat: 49.22, lng: 28.41, pricePerKwh: 11, powerKw: 3.6, source: 'solar',
    connector: 'socket220', devices: ['ecoflow'], schedule: { from: '08:00', to: '20:00' } });
  eq([s.id.startsWith('user-'), s.hostId, s.reviews, store.getState().spots.length], [true, 'oleh', [], 16]);
});

test('підтвердити і відхилити запит', () => {
  const store = createStore(memoryStorage());
  store.confirmBooking('seed-4');
  store.declineBooking('seed-5');
  const st = store.getState();
  eq([st.bookings.find((b) => b.id === 'seed-4').status, st.bookings.find((b) => b.id === 'seed-5').status],
    ['held', 'declined']);
});

test('фільтри зливаються і скидаються', () => {
  const store = createStore(memoryStorage());
  store.setFilters({ device: 'ev' });
  eq(store.getState().filters, { ...DEFAULT_FILTERS, device: 'ev' });
  store.resetFilters();
  eq(store.getState().filters, DEFAULT_FILTERS);
});

test('reset повертає засіяні дані', () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  store.setBlackout(true);
  store.createBooking({ spotId: 'oleh-ses', device: 'ev', day: 'today', start: '10:00', hours: 1 });
  store.reset();
  eq([store.getState().blackout, store.getState().bookings.length], [false, 5]);
  eq(createStore(storage).getState().bookings.length, 5);
});

test('зіпсований JSON — засіяний стан', () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, '{garbage');
  eq(createStore(storage).getState().spots.length, 15);
});

test('стара форма стану без spots — засіяний стан', () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, '{"blackout":true}');
  eq(createStore(storage).getState().spots.length, 15);
});

test('стан іншої версії даних — засіяний стан', () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  store.setBlackout(true);
  const saved = JSON.parse(storage.getItem(STORAGE_KEY));
  storage.setItem(STORAGE_KEY, JSON.stringify({ ...saved, version: DATA_VERSION - 1 }));
  eq(createStore(storage).getState().blackout, false);
});

test('сховище кидає винятки — store працює', () => {
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
  const store = createStore(broken);
  store.setBlackout(true);
  store.reset();
  eq(store.getState().spots.length, 15);
});
