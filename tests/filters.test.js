import { test, eq } from './runner.js';
import { spotRating, filterSpots, availableStarts, isLiveInBlackout, DEFAULT_FILTERS, normalizeQuery, matchSpots } from '../js/filters.js';
import { SPOTS } from '../js/data.js';

const s = (o) => ({
  id: 'x', source: 'solar', devices: ['ev'], pricePerKwh: 10,
  schedule: { from: '08:00', to: '20:00' }, reviews: [{ stars: 5 }, { stars: 4 }], ...o,
});
const noon = new Date(2026, 9, 29, 12);
const late = new Date(2026, 9, 29, 21);

test('spotRating', () => {
  eq(spotRating(s()), 4.5);
  eq(spotRating(s({ reviews: [] })), 0);
  eq(spotRating(s({ reviews: [{ stars: 5 }, { stars: 4 }, { stars: 4 }] })), 4.3);
});

test('isLiveInBlackout', () => {
  eq(isLiveInBlackout(s()), true);
  eq(isLiveInBlackout(s({ source: 'battery' })), true);
  eq(isLiveInBlackout(s({ source: 'grid' })), false);
});

test('блекаут ховає grid', () =>
  eq(filterSpots([s({ id: 'a' }), s({ id: 'b', source: 'grid' })], DEFAULT_FILTERS,
    { blackout: true, now: noon }).map((x) => x.id), ['a']));

test('без блекауту grid видно', () =>
  eq(filterSpots([s({ id: 'a' }), s({ id: 'b', source: 'grid' })], DEFAULT_FILTERS,
    { blackout: false, now: noon }).map((x) => x.id), ['a', 'b']));

test('пристрій, ціна, рейтинг', () => {
  const list = [s({ id: 'a' }), s({ id: 'b', devices: ['gadget'] }), s({ id: 'c', pricePerKwh: 14 })];
  eq(filterSpots(list, { ...DEFAULT_FILTERS, device: 'ev', maxPrice: 12 }, { blackout: false, now: noon }).map((x) => x.id), ['a']);
  eq(filterSpots(list, { ...DEFAULT_FILTERS, minRating: 4.8 }, { blackout: false, now: noon }), []);
});

test('availableNow', () => {
  eq(filterSpots([s()], { ...DEFAULT_FILTERS, availableNow: true }, { blackout: false, now: late }), []);
  eq(filterSpots([s()], { ...DEFAULT_FILTERS, availableNow: true }, { blackout: false, now: noon }).length, 1);
});

test('слоти після закриття — порожньо сьогодні, повно завтра', () => {
  eq(availableStarts({ from: '08:00', to: '20:00' }, 'today', late), []);
  eq(availableStarts({ from: '08:00', to: '11:00' }, 'tomorrow', late), ['08:00', '09:00', '10:00']);
  eq(availableStarts({ from: '08:00', to: '20:00' }, 'today', new Date(2026, 9, 29, 17, 30)), ['18:00', '19:00']);
});

const ids = (list) => list.map((x) => x.id).sort();

test('normalizeQuery: регістр, апострофи, пробіли', () => {
  eq(normalizeQuery('  П’ЯТНИЧАНИ  '), "п'ятничани");
  eq(normalizeQuery('Пʼятничани'), "п'ятничани");
  eq(normalizeQuery('a   b'), 'a b');
  eq(normalizeQuery(''), '');
});

test('matchSpots: за районом і назвою', () => {
  eq(ids(matchSpots(SPOTS, 'вишенька')), ['oleh-garage', 'oleh-ses', 'vyshenka-private']);
  eq(ids(matchSpots(SPOTS, 'п’ятничани')), ['piatnychany-battery']);
  eq(ids(matchSpots(SPOTS, 'гараж')), ['oleh-garage', 'tiazhyliv-garage', 'tiazhyliv-roof']);
  eq(matchSpots(SPOTS, '').length, 15);
  eq(matchSpots(SPOTS, '   ').length, 15);
});

test('filterSpots враховує запит разом з іншими фільтрами', () => {
  const now = new Date(2026, 9, 29, 12);
  eq(ids(filterSpots(SPOTS, { ...DEFAULT_FILTERS, query: 'вишенька', device: 'ev' }, { blackout: false, now })),
    ['oleh-garage', 'oleh-ses', 'vyshenka-private']);
  eq(ids(filterSpots(SPOTS, { ...DEFAULT_FILTERS, query: 'вишенька', maxPrice: 11 }, { blackout: false, now })),
    ['oleh-garage', 'vyshenka-private']);
  eq(DEFAULT_FILTERS.query, '');
});
