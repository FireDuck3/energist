// Синхронізація публічних станцій: OCM + Overpass → нормалізація → злиття → Supabase.
// Без Node-специфічних API: fetch і база передаються ззовні (тести підставляють підробки).
import { normalizeOcm, normalizeOsm } from './normalize.js';
import { mergeStations } from './dedupe.js';

// Прямокутник, що охоплює Вінницьку область (старт; далі розширюємо на всю Україну).
export const BBOX = { south: 47.9, west: 27.2, north: 49.8, east: 30.2 };
export const MAX_MISSED_RUNS = 3;

const inBox = (s, b) => s.lat >= b.south && s.lat <= b.north && s.lng >= b.west && s.lng <= b.east;
// Overpass відхиляє запити без описового User-Agent (HTTP 406); OCM теж просить ідентифікувати клієнта.
export const USER_AGENT = 'WattWay-station-sync/1.0 (+https://wattway.onrender.com)';
const HEADERS = { 'User-Agent': USER_AGENT, Accept: 'application/json' };

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Помилка без URL: у ньому ключ OCM, який не повинен потрапити в логи.
async function fetchJson(fetchImpl, url, init, sleep, tries = 3) {
  let last = 'мережева помилка';
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetchImpl(url, init);
      if (r.ok) return await r.json();
      last = `HTTP ${r.status}`;
      if (r.status !== 429 && r.status < 500) break;
    } catch {
      last = 'мережева помилка';
    }
    if (i < tries - 1) await sleep(1000 * 2 ** i);
  }
  throw new Error(last);
}

export function fetchOcm({ fetchImpl, apiKey, bbox, sleep = defaultSleep }) {
  const box = `(${bbox.south},${bbox.west}),(${bbox.north},${bbox.east})`;
  const url = `https://api.openchargemap.io/v3/poi/?output=json&countrycode=UA&maxresults=5000&compact=false&verbose=false&boundingbox=${encodeURIComponent(box)}&key=${encodeURIComponent(apiKey)}`;
  return fetchJson(fetchImpl, url, { headers: HEADERS }, sleep);
}

export async function fetchOsm({ fetchImpl, bbox, sleep = defaultSleep }) {
  const q = `[out:json][timeout:60];nwr["amenity"="charging_station"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});out center tags;`;
  const body = await fetchJson(fetchImpl, 'https://overpass-api.de/api/interpreter',
    { method: 'POST', body: `data=${encodeURIComponent(q)}`, headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' } }, sleep);
  // Overpass при перевантаженні відповідає 200 із remark і порожнім списком — це не успіх.
  if (body.remark) throw new Error('Overpass remark');
  return body.elements ?? [];
}

const rowKey = (r) => `${r.source}/${r.external_id}`;
const pairKeys = (r) => (r.sources ?? []).map((s) => `${s.source}:${s.external_id}`);

export async function syncStations({ fetchImpl, supabase, apiKey, bbox = BBOX, now = new Date(), sleep = defaultSleep }) {
  const results = {};
  const jobs = {
    ocm: { fetch: () => fetchOcm({ fetchImpl, apiKey, bbox, sleep }), normalize: normalizeOcm },
    osm: { fetch: () => fetchOsm({ fetchImpl, bbox, sleep }), normalize: normalizeOsm },
  };
  const collected = [];
  const succeeded = new Set();
  for (const [name, job] of Object.entries(jobs)) {
    const r = { fetched: 0, inserted: 0, updated: 0, skipped: 0, started_at: new Date().toISOString() };
    try {
      const raw = await job.fetch();
      if (raw.length === 0) throw new Error('порожня відповідь');
      r.fetched = raw.length;
      for (const item of raw) {
        const s = job.normalize(item);
        if (s && inBox(s, bbox)) collected.push(s); else r.skipped++;
      }
      succeeded.add(name);
    } catch (e) {
      r.error = e.message;
    }
    results[name] = r;
  }

  try {
  const active = succeeded.size ? await supabase.listActive() : [];
  const existingByKey = new Map(active.map((r) => [rowKey(r), r]));
  const stamp = now.toISOString();
  const rows = mergeStations(collected).map((s) => ({ ...s, is_active: true, missed_runs: 0, updated_at: stamp }));
  const newKeys = new Set(rows.map(rowKey));

  for (const row of rows) {
    const existed = existingByKey.has(rowKey(row));
    for (const src of row.sources) {
      const r = results[src.source];
      if (r) r[existed ? 'updated' : 'inserted']++;
    }
  }
  if (rows.length) await supabase.upsert(rows);

  // Стара копія, що ділить джерело з новим записом, але має інший ключ, — зайвий дублікат.
  const newPairs = new Set(rows.flatMap(pairKeys));
  const touchable = (r) => (r.sources ?? []).every((s) => succeeded.has(s.source)); // записи впалого джерела не чіпаємо
  const superseded = active.filter((r) => touchable(r) && !newKeys.has(rowKey(r)) && pairKeys(r).some((p) => newPairs.has(p)));
  const supersededIds = new Set(superseded.map((r) => r.id));
  const toDeactivate = superseded.map((r) => r.id);
  const missed = [];
  for (const r of active) {
    if (newKeys.has(rowKey(r)) || supersededIds.has(r.id)) continue;
    // Чіпаємо лише записи, усі джерела яких успішно відпрацювали в цьому запуску.
    if (!touchable(r)) continue;
    const n = (r.missed_runs ?? 0) + 1;
    if (n >= MAX_MISSED_RUNS) toDeactivate.push(r.id); else missed.push({ id: r.id, missed_runs: n });
  }
  if (missed.length) await supabase.markMissed(missed);
  if (toDeactivate.length) await supabase.deactivate(toDeactivate);

  } catch (e) {
    // Збій бази не повинен губити журнал: помічаємо всі джерела помилкою і все одно пишемо run.
    for (const r of Object.values(results)) r.error ??= `Supabase: ${e.message}`;
  }
  for (const [source, r] of Object.entries(results)) {
    await supabase.logRun({ source, started_at: r.started_at, finished_at: new Date().toISOString(),
      fetched: r.fetched, inserted: r.inserted, updated: r.updated, skipped: r.skipped, error: r.error ?? null });
    delete r.started_at;
  }
  return { ok: Object.values(results).every((r) => !r.error), results };
}
