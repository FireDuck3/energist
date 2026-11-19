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

// Клітинки сітки не менші за радіус злиття (60 м): дублікати можуть бути лише в сусідніх клітинках.
const CELL_LAT = 0.0006; // ≈ 67 м
const CELL_LNG = 0.0009; // ≥ 62 м на широтах України (44–52°)
const cellKey = (x, y) => `${x}:${y}`;

// Об'єднує транзитивно (ланцюжок A~B, B~C → одна станція) через union-find.
// Порівнюються лише станції із сусідніх клітинок — лінійний час замість повного перебору.
export function mergeStations(list, stats = null) {
  const parent = list.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const grid = new Map();
  const cells = list.map((s, i) => {
    const x = Math.floor(s.lng / CELL_LNG);
    const y = Math.floor(s.lat / CELL_LAT);
    const key = cellKey(x, y);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
    return [x, y];
  });
  list.forEach((s, i) => {
    const [x, y] = cells[i];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const j of grid.get(cellKey(x + dx, y + dy)) ?? []) {
          if (j <= i) continue;
          if (stats) stats.comparisons++;
          if (isSameStation(s, list[j])) parent[find(j)] = find(i);
        }
      }
    }
  });
  const groups = new Map();
  list.forEach((s, i) => { const r = find(i); groups.set(r, [...(groups.get(r) ?? []), s]); });
  return [...groups.values()].map(mergeGroup);
}
