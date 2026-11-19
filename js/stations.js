// Публічні зарядні станції (імпортуються щодня з OCM та OSM): завантаження стислого знімка, деталі й підписи.
import { expandSnapshot } from '../scripts/sync-stations/snapshot.js';

const SNAPSHOT_PATH = '/storage/v1/object/public/public-data/stations-v1.json';
const FALLBACK_LIMIT = 2000; // без знімка не тягнемо більше — інакше сторінка підвисає
const PAGE = 1000;
const memory = {}; // кеш на час сесії сторінки; HTTP-кеш браузера тримає сам файл

const configOf = async (config) => config ?? (await import('./supabase-config.js')).supabaseConfig;
const authHeaders = (cfg) => ({ apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}` });

const CONNECTOR_LABELS = { type2: 'Type 2', ccs2: 'CCS2', chademo: 'CHAdeMO', gbt: 'GB/T', tesla: 'Tesla' };
export const connectorLabel = (type) => CONNECTOR_LABELS[type] ?? 'Інший';

export const statusLabel = (_station) => 'Статус невідомий'; // офіційних інтеграцій з операторами ще немає

export const routeUrl = ({ lat, lng }) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

// Посилання оператора з бази: лише http(s), решта (javascript:, data:, без схеми) відкидається.
export function safeUrl(v) {
  try {
    const u = new URL(String(v));
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch { return null; }
}

export const attribution = (station) => [...new Set((station.sources ?? []).map((s) => s.license).filter(Boolean))];

async function fromSnapshot(fetchImpl, cfg) {
  const res = await fetchImpl(`${cfg.url}${SNAPSHOT_PATH}`);
  if (!res.ok) throw new Error(`snapshot HTTP ${res.status}`);
  const stations = expandSnapshot(await res.json());
  if (!stations.length) throw new Error('empty snapshot');
  return stations;
}

async function fromTable(fetchImpl, cfg) {
  const all = [];
  for (let from = 0; from < FALLBACK_LIMIT; from += PAGE) {
    const res = await fetchImpl(`${cfg.url}/rest/v1/public_charging_stations?select=*&is_active=eq.true&order=id`,
      { headers: { ...authHeaders(cfg), 'Range-Unit': 'items', Range: `${from}-${from + PAGE - 1}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const page = await res.json();
    if (!Array.isArray(page)) throw new Error('bad response');
    all.push(...page);
    if (page.length < PAGE) break;
  }
  return all.slice(0, FALLBACK_LIMIT);
}

// Ніколи не кидає: спершу стислий знімок, без нього — таблиця (до 2000), інакше [] — карта працює з іншими точками.
export async function loadPublicStations({ fetchImpl = globalThis.fetch, config, cache = memory } = {}) {
  if (cache.stations) return cache.stations;
  const cfg = await configOf(config);
  for (const source of [fromSnapshot, fromTable]) {
    try {
      const stations = await source(fetchImpl, cfg);
      cache.stations = stations;
      return stations;
    } catch { /* наступне джерело */ }
  }
  return [];
}

// Повні дані для видимих у списку станцій — одним запитом (до 50 id).
export async function loadStationsDetails(ids, { fetchImpl = globalThis.fetch, config } = {}) {
  const out = new Map();
  if (!ids.length) return out;
  try {
    const cfg = await configOf(config);
    const list = ids.map((id) => encodeURIComponent(id)).join(',');
    const res = await fetchImpl(`${cfg.url}/rest/v1/public_charging_stations?select=*&id=in.(${list})`, { headers: authHeaders(cfg) });
    if (!res.ok) return out;
    const rows = await res.json();
    for (const r of Array.isArray(rows) ? rows : []) out.set(r.id, r);
  } catch { /* лишаються короткі картки */ }
  return out;
}

// Повна картка станції (адреса, оператор, роз'єми з потужністю, джерела) — при відкритті.
export async function loadStationDetails(id, { fetchImpl = globalThis.fetch, config } = {}) {
  try {
    const cfg = await configOf(config);
    const res = await fetchImpl(`${cfg.url}/rest/v1/public_charging_stations?select=*&id=eq.${encodeURIComponent(id)}`, { headers: authHeaders(cfg) });
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch { return null; }
}

// Приватні точки користувачів WattWay (пілот у Supabase) відрізняємо від засіяних демонстраційних.
export const spotKind = (spot) => (spot.pilot ? 'private' : 'demo');
