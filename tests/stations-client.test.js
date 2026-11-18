import { test, eq } from './runner.js';
import { loadPublicStations, routeUrl, statusLabel, attribution, connectorLabel } from '../js/stations.js';

const config = { url: 'https://x.supabase.co', anonKey: 'anon' };
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const ok = (rows) => async () => ({ ok: true, status: 200, json: async () => rows });
const ROW = { id: '1', name: 'ЕКО', lat: 49.2, lng: 28.4, sources: [{ source: 'ocm', license: 'CC BY 4.0 Open Charge Map' }] };
const H = 3600 * 1000;

test('loadPublicStations: успіх кладе кеш, повторний виклик у межах 3 год не б\'є мережу', async () => {
  const storage = mem(); let calls = 0;
  const fetchImpl = async (...a) => { calls++; return ok([ROW])(...a); };
  eq((await loadPublicStations({ fetchImpl, storage, now: 0, config })).length, 1);
  eq((await loadPublicStations({ fetchImpl, storage, now: 2 * H, config })).length, 1);
  eq(calls, 1);
  await loadPublicStations({ fetchImpl, storage, now: 4 * H, config });
  eq(calls, 2);
});

test('loadPublicStations: запит іде на PostgREST з anon-ключем', async () => {
  let seen;
  await loadPublicStations({ fetchImpl: async (u, i) => { seen = { u, i }; return ok([])(); }, storage: mem(), now: 0, config });
  eq(seen.u.startsWith('https://x.supabase.co/rest/v1/public_charging_stations?'), true);
  eq(seen.i.headers.apikey, 'anon');
});

test('loadPublicStations: збій мережі без кешу → [] без винятку; з кешем → кеш', async () => {
  const boom = async () => { throw new TypeError('offline'); };
  eq(await loadPublicStations({ fetchImpl: boom, storage: mem(), now: 0, config }), []);
  const storage = mem();
  await loadPublicStations({ fetchImpl: ok([ROW]), storage, now: 0, config });
  eq((await loadPublicStations({ fetchImpl: boom, storage, now: 5 * H, config })).length, 1);
});

test('loadPublicStations: порожня відповідь не затирає непорожній кеш', async () => {
  const storage = mem();
  await loadPublicStations({ fetchImpl: ok([ROW]), storage, now: 0, config });
  eq((await loadPublicStations({ fetchImpl: ok([]), storage, now: 5 * H, config })).length, 1);
});

test('loadPublicStations: HTTP-помилка не кидає', async () => {
  eq(await loadPublicStations({ fetchImpl: async () => ({ ok: false, status: 500 }), storage: mem(), now: 0, config }), []);
});

test('routeUrl, statusLabel, connectorLabel', () => {
  eq(routeUrl({ lat: 49.23, lng: 28.46 }), 'https://www.google.com/maps/dir/?api=1&destination=49.23,28.46');
  eq(statusLabel({ status: 'unknown' }), 'Статус невідомий');
  eq(connectorLabel('ccs2'), 'CCS2'); eq(connectorLabel('gbt'), 'GB/T'); eq(connectorLabel('x'), 'Інший');
});

test('attribution: для злитої станції і CC BY, і ODbL', () => {
  const s = { sources: [{ license: 'CC BY 4.0 Open Charge Map' }, { license: 'ODbL © OpenStreetMap contributors' }, { license: 'ODbL © OpenStreetMap contributors' }] };
  eq(attribution(s), ['CC BY 4.0 Open Charge Map', 'ODbL © OpenStreetMap contributors']);
});
