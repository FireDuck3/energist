// Точка входу для GitHub Actions: node scripts/sync-stations/run.js
// Потрібні змінні середовища: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OCM_API_KEY (лише секрети CI).
import { syncStations } from './sync.js';
import { fetchAllPages } from './paging.js';
import { buildSnapshot } from './snapshot.js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OCM_API_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OCM_API_KEY) {
  console.error('Не задано SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY або OCM_API_KEY');
  process.exit(1);
}

const headers = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };
const rest = async (path, init = {}) => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...headers, ...init.headers } });
  if (!r.ok) throw new Error(`Supabase ${init.method ?? 'GET'} ${path.split('?')[0]}: HTTP ${r.status}`);
  return r.status === 204 ? null : r.json().catch(() => null);
};
const T = 'public_charging_stations';

const supabase = {
  async upsert(rows) {
    for (let i = 0; i < rows.length; i += 500) {
      await rest(`${T}?on_conflict=source,external_id`, { method: 'POST', body: JSON.stringify(rows.slice(i, i + 500)),
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
    }
  },
  // Порціями по 1000: інакше PostgREST мовчки обрізає відповідь, і деактивація не бачить частини станцій.
  listActive: () => fetchAllPages((from, to) => rest(`${T}?select=id,source,external_id,sources,missed_runs&is_active=eq.true&order=id`,
    { headers: { 'Range-Unit': 'items', Range: `${from}-${to}` } })),
  async markMissed(items) {
    for (const { id, missed_runs } of items) await rest(`${T}?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ missed_runs }) });
  },
  async deactivate(ids) {
    for (let i = 0; i < ids.length; i += 100) {
      await rest(`${T}?id=in.(${ids.slice(i, i + 100).join(',')})`, { method: 'PATCH', body: JSON.stringify({ is_active: false }) });
    }
  },
  logRun: (run) => rest('station_sync_runs', { method: 'POST', body: JSON.stringify(run), headers: { Prefer: 'return=minimal' } }),
};

const out = await syncStations({ fetchImpl: fetch, supabase, apiKey: OCM_API_KEY });
console.log(JSON.stringify(out.results));

// Стислий знімок для карти: з таблиці (джерело правди), навіть якщо одне джерело сьогодні збоїло.
try {
  const rows = await fetchAllPages((from, to) => rest(
    `${T}?select=id,name,operator,lat,lng,max_power_kw,connectors,opening_hours,price_verified,price_per_kwh,is_active&is_active=eq.true&order=id`,
    { headers: { 'Range-Unit': 'items', Range: `${from}-${to}` } }));
  if (!rows.length) {
    console.error('snapshot skipped: no active stations'); // не затираємо попередній знімок порожнім
  } else {
    const body = JSON.stringify(buildSnapshot(rows));
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/public-data/stations-v1.json`, {
      method: 'POST', body,
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json', 'x-upsert': 'true', 'cache-control': 'max-age=3600' },
    });
    if (!r.ok) throw new Error(`snapshot upload HTTP ${r.status}`);
    console.log(JSON.stringify({ snapshot: { stations: rows.length, bytes: body.length } }));
  }
} catch (e) {
  console.error('snapshot failed:', e.message);
  process.exit(1);
}
process.exit(out.ok ? 0 : 1);
