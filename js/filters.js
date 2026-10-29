// Чисті функції відбору точок і слотів. Без DOM і стану.

export const DEFAULT_FILTERS = { device: null, maxPrice: 15, minRating: 0, availableNow: false, query: '' };

// «  П’ЯТНИЧАНИ » → «п'ятничани»: регістр, різні апострофи й зайві пробіли не важать.
export function normalizeQuery(s) {
  return String(s ?? '').toLowerCase().replace(/[’ʼ`]/g, "'").replace(/\s+/g, ' ').trim();
}

export function matchSpots(spots, query) {
  const q = normalizeQuery(query);
  if (!q) return spots;
  return spots.filter((s) => normalizeQuery(s.title).includes(q) || normalizeQuery(s.district).includes(q));
}

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export function spotRating(spot) {
  if (!spot.reviews.length) return 0;
  const avg = spot.reviews.reduce((sum, r) => sum + r.stars, 0) / spot.reviews.length;
  return Math.round(avg * 10) / 10;
}

export function isLiveInBlackout(spot) {
  return spot.source !== 'grid';
}

export function isOpenAt(spot, date) {
  const now = date.getHours() * 60 + date.getMinutes();
  return now >= toMinutes(spot.schedule.from) && now < toMinutes(spot.schedule.to);
}

export function filterSpots(spots, filters, { blackout, now }) {
  return matchSpots(spots, filters.query).filter((s) =>
    (!blackout || isLiveInBlackout(s)) &&
    (!filters.device || s.devices.includes(filters.device)) &&
    s.pricePerKwh <= filters.maxPrice &&
    spotRating(s) >= filters.minRating &&
    (!filters.availableNow || isOpenAt(s, now)));
}

// Повні години, з яких можна почати зарядку: від відкриття до останньої години перед закриттям.
export function availableStarts(schedule, day, now) {
  const first = Math.ceil(toMinutes(schedule.from) / 60);
  const last = Math.floor(toMinutes(schedule.to) / 60) - 1;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const starts = [];
  for (let h = first; h <= last; h++) {
    if (day === 'today' && h * 60 <= nowMin) continue;
    starts.push(`${String(h).padStart(2, '0')}:00`);
  }
  return starts;
}
