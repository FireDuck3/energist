// Публічні зарядні станції (імпортуються щодня з OCM та OSM): завантаження, кеш і допоміжні підписи.
const CACHE_KEY = 'wattway-public-stations-v1';
const TTL_MS = 3 * 3600 * 1000;

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

function readCache(storage) {
  try {
    const c = JSON.parse(storage.getItem(CACHE_KEY));
    return Array.isArray(c?.rows) ? c : null;
  } catch { return null; }
}

// Ніколи не кидає: без мережі повертає кеш або [], щоб карта працювала з іншими точками.
export async function loadPublicStations({ fetchImpl = globalThis.fetch, storage = globalThis.sessionStorage, now = Date.now(), config } = {}) {
  const cached = storage ? readCache(storage) : null;
  if (cached && now - cached.at < TTL_MS) return cached.rows;
  try {
    const cfg = config ?? (await import('./supabase-config.js')).supabaseConfig;
    const res = await fetchImpl(`${cfg.url}/rest/v1/public_charging_stations?select=*&is_active=eq.true&limit=10000`,
      { headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error('bad response');
    if (rows.length === 0) return cached?.rows ?? [];
    try { storage?.setItem(CACHE_KEY, JSON.stringify({ at: now, rows })); } catch { /* сховище недоступне */ }
    return rows;
  } catch {
    return cached?.rows ?? [];
  }
}

// Приватні точки користувачів WattWay (пілот у Supabase) відрізняємо від засіяних демонстраційних.
export const spotKind = (spot) => (spot.pilot ? 'private' : 'demo');
