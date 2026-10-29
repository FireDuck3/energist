import { test, eq } from './runner.js';
import { SPOTS, HOSTS, SEED_BOOKINGS, DEMO_HOST_ID, VINNYTSIA_BOUNDS } from '../js/data.js';

test('id точок унікальні', () => eq(new Set(SPOTS.map((s) => s.id)).size, SPOTS.length));

test('кожен hostId є в HOSTS', () => {
  const ids = new Set(HOSTS.map((h) => h.id));
  eq(SPOTS.filter((s) => !ids.has(s.hostId)).map((s) => s.id), []);
});

test('15 точок, усі у Вінниці', () => {
  const [[s, w], [n, e]] = VINNYTSIA_BOUNDS;
  eq(SPOTS.length, 15);
  eq(SPOTS.filter((p) => p.lat < s || p.lat > n || p.lng < w || p.lng > e).map((p) => p.id), []);
});

test('ціни 8–15 грн', () =>
  eq(SPOTS.filter((s) => s.pricePerKwh < 8 || s.pricePerKwh > 15).map((s) => s.id), []));

test('2–4 відгуки на точку', () =>
  eq(SPOTS.filter((s) => s.reviews.length < 2 || s.reviews.length > 4).map((s) => s.id), []));

test('мережеві точки не живуть у блекаут, решта — живуть', () => {
  eq(SPOTS.filter((s) => s.source === 'grid' && s.blackoutHours !== 0).map((s) => s.id), []);
  eq(SPOTS.filter((s) => s.source !== 'grid' && !(s.blackoutHours > 0)).map((s) => s.id), []);
});

test('мікс джерел: 7–8 СЕС, 4 батареї, 3–4 мережа', () => {
  const n = (src) => SPOTS.filter((s) => s.source === src).length;
  eq([n('solar') >= 7 && n('solar') <= 8, n('battery'), n('grid') >= 3 && n('grid') <= 4], [true, 4, true]);
});

test('в Олега ≥ 2 точки і ≥ 2 pending бронювання', () => {
  const own = new Set(SPOTS.filter((s) => s.hostId === DEMO_HOST_ID).map((s) => s.id));
  eq(own.size >= 2, true);
  eq(SEED_BOOKINGS.filter((b) => own.has(b.spotId) && b.status === 'pending').length >= 2, true);
  eq(SEED_BOOKINGS.every((b) => own.has(b.spotId)), true);
});
