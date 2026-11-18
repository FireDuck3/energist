import { test, eq } from './runner.js';
import { normalizeConnector, normalizeOcm, normalizeOsm, parseOpeningHours } from '../scripts/sync-stations/normalize.js';
import { OCM_POI, OCM_NO_COORDS, OSM_NODE, OSM_WAY, OSM_NO_COORDS } from './fixtures/stations.js';

test('normalizeConnector: відомі та невідомі типи', () => {
  eq(normalizeConnector('IEC 62196-3 Configuration FF (CCS Type 2)'), 'ccs2');
  eq(normalizeConnector('CHAdeMO'), 'chademo');
  eq(normalizeConnector('Type 2 (Socket Only)'), 'type2');
  eq(normalizeConnector('GB/T AC'), 'gbt');
  eq(normalizeConnector('Tesla Supercharger'), 'tesla');
  eq(normalizeConnector('невідомо'), 'other');
});

test('normalizeOcm: поля, максимальна потужність, ціна невідома, ліцензія', () => {
  const s = normalizeOcm(OCM_POI);
  eq(s.source, 'ocm'); eq(s.external_id, '4242'); eq(s.operator, 'ЕКО');
  eq(s.max_power_kw, 50); eq(s.price_per_kwh, null); eq(s.price_verified, false);
  eq(s.connectors.map((c) => c.type), ['type2', 'ccs2', 'other']);
  eq(s.connectors[2].power_kw, null);
  eq(s.operator_url, 'https://eco.example/');
  eq(s.sources[0].license.includes('CC BY'), true);
});

test('normalizeOsm: node, way із center, ліцензія ODbL, потужність з output', () => {
  const s = normalizeOsm(OSM_NODE);
  eq(s.source, 'osm'); eq(s.external_id, 'node/123'); eq(s.max_power_kw, 22);
  eq(s.opening_hours, 'Цілодобово'); eq(s.sources[0].license.includes('ODbL'), true);
  eq(normalizeOsm(OSM_WAY).lat, 49.1);
  eq(normalizeOsm(OSM_WAY).max_power_kw, null);
});

test('normalize*: без координат повертає null', () => {
  eq(normalizeOcm(OCM_NO_COORDS), null);
  eq(normalizeOsm(OSM_NO_COORDS), null);
});

test('parseOpeningHours', () => {
  eq(parseOpeningHours('24/7'), 'Цілодобово');
  eq(parseOpeningHours('Mo-Su 08:00-22:00'), 'Mo-Su 08:00-22:00');
  eq(parseOpeningHours(null), null);
});

test('operator_url: лише http(s); javascript: і адреса без схеми відкидаються', () => {
  const osm = (website) => normalizeOsm({ ...OSM_NODE, tags: { ...OSM_NODE.tags, website } }).operator_url;
  eq(osm('javascript:alert(1)'), null);
  eq(osm('www.op.ua'), null);
  eq(osm('https://op.ua/x'), 'https://op.ua/x');
  eq(normalizeOcm({ ...OCM_POI, OperatorInfo: { Title: 'X', WebsiteURL: 'data:text/html,hi' } }).operator_url, null);
});
