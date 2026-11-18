// Приведення записів Open Charge Map і OpenStreetMap до єдиної моделі станції.
// Чистий ES-модуль без Node-специфічних API: працює і в CI, і в браузерних тестах.

const OCM_LICENSE = 'CC BY 4.0 Open Charge Map';
const OSM_LICENSE = 'ODbL © OpenStreetMap contributors';

export function normalizeConnector(raw) {
  const t = String(raw ?? '').toLowerCase();
  if (/ccs|combo/.test(t)) return 'ccs2';
  if (/chademo/.test(t)) return 'chademo';
  if (/gb\/?t/.test(t)) return 'gbt';
  if (/tesla|nacs/.test(t)) return 'tesla';
  if (/type\s*2|mennekes|iec 62196-2/.test(t)) return 'type2';
  return 'other';
}

export function parseOpeningHours(raw) {
  if (!raw || !String(raw).trim()) return null;
  const v = String(raw).trim();
  return v === '24/7' ? 'Цілодобово' : v;
}

// Лише офіційні http(s)-посилання: OSM-теги редагує будь-хто, javascript:/data: у href недопустимі.
export function safeHttpUrl(v) {
  try {
    const u = new URL(String(v));
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch { return null; }
}

const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);
const maxPower = (connectors) => connectors.reduce((m, c) => (c.power_kw != null && (m == null || c.power_kw > m) ? c.power_kw : m), null);

export function normalizeOcm(poi) {
  const a = poi?.AddressInfo;
  const lat = num(a?.Latitude);
  const lng = num(a?.Longitude);
  if (lat == null || lng == null) return null;
  const connectors = (poi.Connections ?? []).map((c) => ({
    type: normalizeConnector(c.ConnectionType?.Title),
    power_kw: num(c.PowerKW),
    count: num(c.Quantity) ?? 1,
  }));
  const address = [a.AddressLine1, a.Town].filter(Boolean).join(', ') || null;
  return {
    source: 'ocm', external_id: String(poi.ID), name: a.Title ?? null, address,
    operator: poi.OperatorInfo?.Title ?? null, lat, lng, max_power_kw: maxPower(connectors), connectors,
    price_per_kwh: null, price_verified: false, opening_hours: null,
    access: poi.UsageType?.Title ?? null, operator_url: safeHttpUrl(poi.OperatorInfo?.WebsiteURL),
    sources: [{ source: 'ocm', external_id: String(poi.ID), url: `https://openchargemap.org/site/poi/details/${poi.ID}`, license: OCM_LICENSE }],
    source_updated_at: poi.DateLastStatusUpdate ?? null,
  };
}

const OSM_SOCKETS = { type2: 'type2', type2_combo: 'ccs2', chademo: 'chademo', gb_ac: 'gbt', gb_dc: 'gbt', tesla_supercharger: 'tesla' };

export function normalizeOsm(el) {
  const lat = num(el?.lat ?? el?.center?.lat);
  const lng = num(el?.lon ?? el?.center?.lon);
  if (lat == null || lng == null) return null;
  const tags = el.tags ?? {};
  const connectors = [];
  for (const [key, type] of Object.entries(OSM_SOCKETS)) {
    const count = num(tags[`socket:${key}`]);
    if (!count) continue;
    const kw = /([\d.,]+)\s*kw/i.exec(tags[`socket:${key}:output`] ?? '');
    connectors.push({ type, power_kw: kw ? num(kw[1].replace(',', '.')) : null, count });
  }
  const id = `${el.type}/${el.id}`;
  return {
    source: 'osm', external_id: id, name: tags.name ?? null,
    address: [tags['addr:street'], tags['addr:housenumber'], tags['addr:city']].filter(Boolean).join(' ') || null,
    operator: tags.operator ?? tags.brand ?? null, lat, lng, max_power_kw: maxPower(connectors), connectors,
    price_per_kwh: null, price_verified: false, opening_hours: parseOpeningHours(tags.opening_hours),
    access: tags.access ?? null, operator_url: safeHttpUrl(tags.website ?? tags['contact:website']),
    sources: [{ source: 'osm', external_id: id, url: `https://www.openstreetmap.org/${id}`, license: OSM_LICENSE }],
    source_updated_at: null,
  };
}
