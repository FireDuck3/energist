// Чисті функції пошуку й фільтрів для карти: відстань, радіус, роз'єми, потужність. Без DOM і стану.
import { plural } from './ui.js';

export const RADII = [1, 5, 10, 25, 50];

export const POWER_BANDS = [
  { id: 'lt22', label: 'до 22 кВт', test: (kw) => kw <= 22 },
  { id: '22-50', label: '22–50 кВт', test: (kw) => kw > 22 && kw <= 50 },
  { id: '50-150', label: '50–150 кВт', test: (kw) => kw > 50 && kw <= 150 },
  { id: 'gt150', label: 'понад 150 кВт', test: (kw) => kw > 150 },
];

export const CONNECTOR_FILTERS = [
  { id: 'type2', label: 'Type 2' },
  { id: 'ccs2', label: 'CCS2' },
  { id: 'chademo', label: 'CHAdeMO' },
  { id: 'gbt', label: 'GB/T' },
  { id: 'other', label: 'Інший' },
];

export function distanceKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const x = Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
}

export const spotConnector = (spot) => (spot.connector === 'type2' ? 'type2' : 'other');

const KNOWN = new Set(['type2', 'ccs2', 'chademo', 'gbt']);
export const stationConnectors = (st) => [...new Set((st.connectors ?? []).map((c) => (KNOWN.has(c.type) ? c.type : 'other')))];

const inBand = (id, kw) => kw != null && Boolean(POWER_BANDS.find((b) => b.id === id)?.test(kw));
const inRadius = (item, f, origin) => !(origin && f.radiusKm) || distanceKm(origin, item) <= f.radiusKm;

export function matchSpotExtra(spot, f, { origin = null } = {}) {
  return (!f.connectors?.length || f.connectors.includes(spotConnector(spot))) &&
    (!f.power || inBand(f.power, spot.powerKw)) &&
    (!f.only24h || (spot.schedule.from === '00:00' && ['24:00', '23:59'].includes(spot.schedule.to))) &&
    (!f.blackoutReady || spot.source !== 'grid') &&
    inRadius(spot, f, origin);
}

// Публічна станція не має підтвердженої автономності — у блекаут її не показуємо.
export function matchStation(st, f, { origin = null, blackout = false } = {}) {
  if (blackout || f.blackoutReady) return false;
  return (!f.connectors?.length || stationConnectors(st).some((t) => f.connectors.includes(t))) &&
    (!f.power || inBand(f.power, st.max_power_kw)) &&
    (f.maxPrice >= 25 || (st.price_verified && st.price_per_kwh != null && st.price_per_kwh <= f.maxPrice)) &&
    (!f.only24h || st.opening_hours === 'Цілодобово') &&
    inRadius(st, f, origin);
}

export function sortByDistance(items, origin) {
  if (!origin) return [...items];
  return items.map((item, i) => ({ item, i, d: distanceKm(origin, item) }))
    .sort((a, b) => a.d - b.d || a.i - b.i).map((x) => x.item);
}

export const nearest = (items, origin) => sortByDistance(items, origin)[0] ?? null;

export function resultsLabel(spotCount, stationCount) {
  const spots = `Знайдено ${spotCount} ${plural(spotCount, ['точку', 'точки', 'точок'])}`;
  return stationCount ? `${spots} · ${stationCount} ${plural(stationCount, ['публічна станція', 'публічні станції', 'публічних станцій'])}` : spots;
}
