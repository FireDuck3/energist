import { test, eq } from './runner.js';
import { loadPublicStations, routeUrl, statusLabel, attribution, connectorLabel } from '../js/stations.js';

const config = { url: 'https://x.supabase.co', anonKey: 'anon' };
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const ok = (rows) => async () => ({ ok: true, status: 200, json: async () => rows });
const ROW = { id: '1', name: 'ЕКО', lat: 49.2, lng: 28.4, sources: [{ source: 'ocm', license: 'CC BY 4.0 Open Charge Map' }] };
const H = 3600 * 1000;

const SNAP = { v: 1, generated_at: '2026-11-19T03:00:00.000Z', count: 2,
  rows: [['s1', 49.2, 28.4, 50, 3, 1, null, 'ЕКО'], ['s2', 50.45, 30.52, null, 16, 0, null, null]] };
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('loadPublicStations: знімок → розгорнуті станції, без запитів до таблиці', async () => {
  const urls = [];
  const out = await loadPublicStations({ config, cache: {}, fetchImpl: async (u) => { urls.push(String(u)); return json(200, SNAP); } });
  eq(out.map((s) => [s.id, s.compact, s.max_power_kw]), [['s1', true, 50], ['s2', true, null]]);
  eq(urls, ['https://x.supabase.co/storage/v1/object/public/public-data/stations-v1.json']);
});

test('loadPublicStations: повторний виклик бере дані з пам\'яті', async () => {
  const cache = {}; let calls = 0;
  const fetchImpl = async () => { calls++; return json(200, SNAP); };
  await loadPublicStations({ config, cache, fetchImpl });
  await loadPublicStations({ config, cache, fetchImpl });
  eq(calls, 1);
});

test('loadPublicStations: без знімка — таблиця порціями, не більше 2000 станцій', async () => {
  const ranges = [];
  const fetchImpl = async (u, init) => {
    if (String(u).includes('/storage/')) return json(404, {});
    ranges.push(init.headers.Range);
    return json(200, Array.from({ length: 1000 }, (_, i) => ({ id: `${ranges.length}-${i}`, lat: 49, lng: 28 })));
  };
  const out = await loadPublicStations({ config, cache: {}, fetchImpl });
  eq([out.length, ranges], [2000, ['0-999', '1000-1999']]);
});

test('loadPublicStations: усе недоступне → [] без винятку', async () => {
  eq(await loadPublicStations({ config, cache: {}, fetchImpl: async () => { throw new TypeError('offline'); } }), []);
});

test('loadStationDetails: повний рядок або null', async () => {
  const { loadStationDetails } = await import('../js/stations.js');
  eq((await loadStationDetails('s1', { config, fetchImpl: async () => json(200, [ROW]) })).name, 'ЕКО');
  eq(await loadStationDetails('s1', { config, fetchImpl: async () => json(500, {}) }), null);
  eq(await loadStationDetails('s1', { config, fetchImpl: async () => json(200, []) }), null);
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

test('spotKind: пілотна точка — приватна, засіяна — демонстраційна', async () => {
  const { spotKind } = await import('../js/stations.js');
  eq(spotKind({ pilot: true }), 'private');
  eq(spotKind({ id: 'oleh-ses' }), 'demo');
});

test('safeUrl: пропускає лише http(s)', async () => {
  const { safeUrl } = await import('../js/stations.js');
  eq(safeUrl('https://a.ua/'), 'https://a.ua/');
  eq(safeUrl('javascript:alert(1)'), null);
  eq(safeUrl(null), null);
});

test('loadStationsDetails: один запит на всі id, результат — Map за id', async () => {
  const { loadStationsDetails } = await import('../js/stations.js');
  const urls = [];
  const out = await loadStationsDetails(['a', 'b'], { config, fetchImpl: async (u) => { urls.push(decodeURIComponent(String(u))); return json(200, [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]); } });
  eq([urls.length, urls[0].includes('id=in.(a,b)'), out.get('b').name], [1, true, 'B']);
  eq((await loadStationsDetails(['a'], { config, fetchImpl: async () => json(500, {}) })).size, 0);
  eq((await loadStationsDetails([], { config, fetchImpl: async () => { throw new Error('не мав викликатися'); } })).size, 0);
});
