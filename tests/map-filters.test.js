import { test, eq } from './runner.js';
import { RADII, POWER_BANDS, distanceKm, spotConnector, stationConnectors, matchSpotExtra, matchStation, sortByDistance, nearest, resultsLabel } from '../js/map-filters.js';
import { DEFAULT_FILTERS } from '../js/filters.js';

const F = (o = {}) => ({ ...DEFAULT_FILTERS, ...o });
const st = (o = {}) => ({ lat: 49.2331, lng: 28.4682, max_power_kw: 50, connectors: [{ type: 'ccs2' }], price_verified: false, price_per_kwh: null, opening_hours: null, ...o });
const ORIGIN = { lat: 49.2331, lng: 28.4682 };
const dLat = (km) => km / 111.32;

test('DEFAULT_FILTERS має нові ключі, RADII — п\'ять значень', () => {
  eq([DEFAULT_FILTERS.connectors, DEFAULT_FILTERS.power, DEFAULT_FILTERS.radiusKm, DEFAULT_FILTERS.only24h, DEFAULT_FILTERS.blackoutReady], [[], null, null, false, false]);
  eq(RADII, [1, 5, 10, 25, 50]);
});

test('distanceKm: Вінниця — Київ ≈ 200 км', () => {
  const d = distanceKm({ lat: 49.2331, lng: 28.4682 }, { lat: 50.4501, lng: 30.5234 });
  eq(d > 195 && d < 205, true);
});

test('роз\'єми: точки і станції нормалізуються', () => {
  eq([spotConnector({ connector: 'socket220' }), spotConnector({ connector: 'usb' }), spotConnector({ connector: 'type2' })], ['other', 'other', 'type2']);
  eq(stationConnectors({ connectors: [{ type: 'type2' }, { type: 'ccs2' }, { type: 'tesla' }, { type: 'type2' }] }), ['type2', 'ccs2', 'other']);
  eq(stationConnectors({}), []);
});

test('смуги потужності: межі 22/50/150', () => {
  const band = (kw) => POWER_BANDS.filter((b) => b.test(kw)).map((b) => b.id);
  eq([band(22), band(22.1), band(50), band(150), band(150.1)], [['lt22'], ['22-50'], ['22-50'], ['50-150'], ['gt150']]);
});

test('matchStation: роз\'єм, потужність, невідома потужність', () => {
  eq(matchStation(st(), F({ connectors: ['ccs2'] }), {}), true);
  eq(matchStation(st(), F({ connectors: ['chademo'] }), {}), false);
  eq(matchStation(st(), F({ power: '22-50' }), {}), true);
  eq(matchStation(st({ max_power_kw: null }), F({ power: '22-50' }), {}), false);
  eq(matchStation(st({ max_power_kw: null }), F(), {}), true);
  eq(matchStation(st({ connectors: [] }), F({ connectors: ['type2'] }), {}), false);
});

test('matchStation: ціна, цілодобово, блекаут', () => {
  eq(matchStation(st(), F({ maxPrice: 12 }), {}), false);
  eq(matchStation(st({ price_verified: true, price_per_kwh: 10 }), F({ maxPrice: 12 }), {}), true);
  eq(matchStation(st({ price_verified: true, price_per_kwh: 15 }), F({ maxPrice: 12 }), {}), false);
  eq(matchStation(st(), F({ maxPrice: 25 }), {}), true);
  eq(matchStation(st({ opening_hours: 'Цілодобово' }), F({ only24h: true }), {}), true);
  eq(matchStation(st(), F({ only24h: true }), {}), false);
  eq(matchStation(st(), F({ blackoutReady: true }), {}), false);
  eq(matchStation(st(), F(), { blackout: true }), false);
});

test('matchStation: радіус діє лише з origin', () => {
  const far = st({ lat: 49.2331 + dLat(8) });
  eq(matchStation(far, F({ radiusKm: 5 }), { origin: ORIGIN }), false);
  eq(matchStation(far, F({ radiusKm: 10 }), { origin: ORIGIN }), true);
  eq(matchStation(far, F({ radiusKm: 5 }), { origin: null }), true);
});

test('matchSpotExtra: роз\'єм, потужність, 24h, блекаут, радіус', () => {
  const spot = { connector: 'type2', powerKw: 7.4, schedule: { from: '00:00', to: '24:00' }, source: 'solar', lat: 49.2331, lng: 28.4682 };
  eq(matchSpotExtra(spot, F({ connectors: ['type2'], power: 'lt22', only24h: true, blackoutReady: true }), { origin: ORIGIN }), true);
  eq(matchSpotExtra(spot, F({ connectors: ['ccs2'] }), {}), false);
  eq(matchSpotExtra(spot, F({ power: 'gt150' }), {}), false);
  eq(matchSpotExtra({ ...spot, schedule: { from: '08:00', to: '20:00' } }, F({ only24h: true }), {}), false);
  eq(matchSpotExtra({ ...spot, source: 'grid' }, F({ blackoutReady: true }), {}), false);
  eq(matchSpotExtra({ ...spot, lat: 49.2331 + dLat(8) }, F({ radiusKm: 5 }), { origin: ORIGIN }), false);
});

test('sortByDistance і nearest: без origin стабільно, з origin за зростанням', () => {
  const a = { id: 'a', lat: 49.2331 + dLat(5), lng: 28.4682 };
  const b = { id: 'b', lat: 49.2331 + dLat(1), lng: 28.4682 };
  eq(sortByDistance([a, b], null).map((x) => x.id), ['a', 'b']);
  eq(sortByDistance([a, b], ORIGIN).map((x) => x.id), ['b', 'a']);
  eq(nearest([a, b], ORIGIN).id, 'b');
  eq(nearest([], ORIGIN), null);
});

test('resultsLabel: відмінювання', () => {
  eq(resultsLabel(3, 1), 'Знайдено 3 точки · 1 публічна станція');
  eq(resultsLabel(0, 5), 'Знайдено 0 точок · 5 публічних станцій');
  eq(resultsLabel(2, 0), 'Знайдено 2 точки');
  eq(resultsLabel(1, 22), 'Знайдено 1 точку · 22 публічні станції');
});
