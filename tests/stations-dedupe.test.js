import { test, eq } from './runner.js';
import { distanceM, isSameStation, mergeStations } from '../scripts/sync-stations/dedupe.js';

const st = (o) => ({ source: 'ocm', external_id: '1', name: null, address: null, operator: null, lat: 49.2331, lng: 28.4682,
  max_power_kw: null, connectors: [], price_per_kwh: null, price_verified: false, opening_hours: null, access: null,
  operator_url: null, sources: [{ source: o.source ?? 'ocm', external_id: o.external_id ?? '1', url: '', license: '' }], source_updated_at: null, ...o });
const dLat = (m) => m / 111320;

test('distanceM: ~111 м на 0.001° широти', () => {
  const d = distanceM({ lat: 49, lng: 28 }, { lat: 49.001, lng: 28 });
  eq(d > 109 && d < 113, true);
});

test('mergeStations: 30 м і той самий оператор зливаються в одну станцію', () => {
  const a = st({ operator: 'ЕКО', name: 'A' });
  const b = st({ source: 'osm', external_id: 'node/1', operator: 'ЕКО', name: 'Інша назва', lat: 49.2331 + dLat(30) });
  const out = mergeStations([a, b]);
  eq(out.length, 1); eq(out[0].source, 'merged'); eq(out[0].sources.length, 2); eq(out[0].external_id, 'ocm:1');
});

test('30 м, різні оператори й різні назви — не зливаються', () => {
  const a = st({ operator: 'ЕКО', name: 'Альфа' });
  const b = st({ source: 'osm', external_id: 'node/2', operator: 'ОККО', name: 'Бета', lat: 49.2331 + dLat(30) });
  eq(isSameStation(a, b), false);
  eq(mergeStations([a, b]).length, 2);
});

test('200 м з однаковою назвою — не зливаються', () => {
  const a = st({ name: 'ЕКО' });
  const b = st({ source: 'osm', external_id: 'node/3', name: 'ЕКО', lat: 49.2331 + dLat(200) });
  eq(mergeStations([a, b]).length, 2);
});

test('злитий запис бере opening_hours з OSM, коли в OCM порожньо; OCM — оператор і роз\'єми', () => {
  const a = st({ operator: 'ЕКО', connectors: [{ type: 'type2', power_kw: 22, count: 2 }] });
  const b = st({ source: 'osm', external_id: 'node/4', operator: 'ЕКО', opening_hours: 'Цілодобово', access: 'yes',
    connectors: [{ type: 'type2', power_kw: 22, count: 1 }, { type: 'chademo', power_kw: 50, count: 1 }] });
  const [m] = mergeStations([b, a]);
  eq(m.opening_hours, 'Цілодобово'); eq(m.access, 'yes'); eq(m.operator, 'ЕКО');
  eq(m.connectors.map((c) => `${c.type}:${c.power_kw}`), ['type2:22', 'chademo:50']);
  eq(m.max_power_kw, 50);
});

test('ланцюжок ocm+osm+osm дає одну станцію, а не копії', () => {
  const a = st({ operator: 'ЕКО' });
  const b = st({ source: 'osm', external_id: 'node/5', operator: 'ЕКО', lat: 49.2331 + dLat(25) });
  const c = st({ source: 'osm', external_id: 'node/6', operator: 'ЕКО', lat: 49.2331 + dLat(50) });
  const out = mergeStations([a, b, c]);
  eq(out.length, 1); eq(out[0].sources.length, 3);
});
