import { test, eq } from './runner.js';
import { syncStations, BBOX } from '../scripts/sync-stations/sync.js';
import { OCM_POI, OCM_NO_COORDS, OSM_NODE } from './fixtures/stations.js';

const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const fakeFetch = ({ ocm = res(200, [OCM_POI]), osm = res(200, { elements: [OSM_NODE] }), seen = [] } = {}) => async (url) => {
  seen.push(String(url));
  return String(url).includes('openchargemap') ? ocm : osm;
};
const fakeDb = (active = []) => {
  const db = { upserts: [], deactivated: [], missed: [], runs: [], active };
  return Object.assign(db, {
    upsert: async (rows) => { db.upserts.push(...rows); },
    listActive: async () => db.active,
    markMissed: async (items) => { db.missed.push(...items); },
    deactivate: async (ids) => { db.deactivated.push(...ids); },
    logRun: async (run) => { db.runs.push(run); },
  });
};
const run = (o = {}) => syncStations({ apiKey: 'SECRET-KEY', bbox: BBOX, now: new Date('2026-11-18T03:00:00Z'), sleep: async () => {}, ...o });

test('sync: обидва джерела → одна злита станція без дублів і лог на кожне джерело', async () => {
  const db = fakeDb();
  const out = await run({ fetchImpl: fakeFetch(), supabase: db });
  eq(out.ok, true);
  eq(db.upserts.length, 1); eq(db.upserts[0].source, 'merged'); eq(db.upserts[0].sources.length, 2);
  eq(db.upserts[0].updated_at, '2026-11-18T03:00:00.000Z');
  eq(db.runs.map((r) => r.source).sort(), ['ocm', 'osm']);
});

test('sync: OSM 503 тричі → помилка в run, OCM записано, нічого не деактивовано', async () => {
  const stale = { id: 'a', source: 'osm', external_id: 'node/9', sources: [{ source: 'osm', external_id: 'node/9' }], missed_runs: 2 };
  const db = fakeDb([stale]);
  const out = await run({ fetchImpl: fakeFetch({ osm: res(503, {}) }), supabase: db });
  eq(out.ok, false); eq(typeof out.results.osm.error, 'string');
  eq(db.upserts.length, 1); eq(db.deactivated, []); eq(db.missed, []);
});

test('sync: записи без координат чи поза BBOX рахуються в skipped', async () => {
  const far = { type: 'node', id: 9, lat: 50.45, lon: 30.52, tags: {} }; // Київ
  const db = fakeDb();
  const out = await run({ fetchImpl: fakeFetch({ ocm: res(200, [OCM_POI, OCM_NO_COORDS]), osm: res(200, { elements: [far] }) }), supabase: db });
  eq(out.results.ocm.skipped, 1); eq(out.results.osm.skipped, 1); eq(db.upserts.length, 1);
});

test('sync: станція зникла з обох джерел — деактивується лише після 3 поспіль промахів', async () => {
  const gone = (n) => ({ id: 'g', source: 'ocm', external_id: '999', sources: [{ source: 'ocm', external_id: '999' }], missed_runs: n });
  const d1 = fakeDb([gone(0)]); await run({ fetchImpl: fakeFetch(), supabase: d1 });
  eq(d1.missed, [{ id: 'g', missed_runs: 1 }]); eq(d1.deactivated, []);
  const d3 = fakeDb([gone(2)]); await run({ fetchImpl: fakeFetch(), supabase: d3 });
  eq(d3.deactivated, ['g']);
});

test('sync: стара злита копія з тим самим джерелом деактивується одразу (без видимого дубліката)', async () => {
  const old = { id: 'old', source: 'ocm', external_id: '4242', sources: [{ source: 'ocm', external_id: '4242' }], missed_runs: 0 };
  const db = fakeDb([old]);
  await run({ fetchImpl: fakeFetch(), supabase: db });
  eq(db.deactivated, ['old']);
});

test('sync: ключ OCM іде в запит, але не потрапляє в текст помилки', async () => {
  const seen = [];
  const db = fakeDb();
  const out = await run({ fetchImpl: fakeFetch({ ocm: res(500, {}), seen }), supabase: db });
  eq(seen.some((u) => u.includes('key=SECRET-KEY')), true);
  eq(JSON.stringify(out).includes('SECRET-KEY'), false);
});
