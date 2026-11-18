// Злиття однієї станції, знайденої в кількох джерелах (OCM і OSM).
export const MERGE_RADIUS_M = 60;

export function distanceM(a, b) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

const key = (s) => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

export function isSameStation(a, b) {
  if (distanceM(a, b) >= MERGE_RADIUS_M) return false;
  const opA = key(a.operator);
  const nameA = key(a.name);
  return (opA !== '' && opA === key(b.operator)) || (nameA !== '' && nameA === key(b.name));
}

const first = (items, field) => items.map((i) => i[field]).find((v) => v != null && v !== '') ?? null;

function mergeGroup(group) {
  if (group.length === 1) return group[0];
  const ordered = [...group].sort((x, y) => (x.source === 'ocm' ? 0 : 1) - (y.source === 'ocm' ? 0 : 1));
  const seen = new Set();
  const connectors = [];
  for (const c of ordered.flatMap((s) => s.connectors)) {
    const k = `${c.type}:${c.power_kw}`;
    if (!seen.has(k)) { seen.add(k); connectors.push(c); }
  }
  const sources = ordered.flatMap((s) => s.sources);
  const powers = connectors.map((c) => c.power_kw).filter((p) => p != null);
  const lead = ordered[0];
  return {
    ...lead,
    source: 'merged',
    external_id: `${lead.source}:${lead.external_id}`,
    name: first(ordered, 'name'), address: first(ordered, 'address'), operator: first(ordered, 'operator'),
    connectors, max_power_kw: powers.length ? Math.max(...powers) : null,
    price_per_kwh: first(ordered, 'price_per_kwh'), price_verified: ordered.some((s) => s.price_verified),
    opening_hours: first(ordered, 'opening_hours'), access: first(ordered, 'access'), operator_url: first(ordered, 'operator_url'),
    sources, source_updated_at: first(ordered, 'source_updated_at'),
  };
}

// Об'єднує транзитивно (ланцюжок A~B, B~C → одна станція) через union-find.
export function mergeStations(list) {
  const parent = list.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (isSameStation(list[i], list[j])) parent[find(j)] = find(i);
    }
  }
  const groups = new Map();
  list.forEach((s, i) => { const r = find(i); groups.set(r, [...(groups.get(r) ?? []), s]); });
  return [...groups.values()].map(mergeGroup);
}
