// Відбір нещодавнього з історії пошуку. Рядки: { kind: 'query' | 'spot', value, created_at }.
import { normalizeQuery } from './filters.js';

const newestFirst = (rows, kind) => rows
  .filter((r) => r.kind === kind)
  .slice()
  .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

// Останні різні запити; «Вишенька» і «вишенька» — один, у найсвіжішому написанні.
export function recentQueries(rows, limit = 5) {
  const seen = new Set();
  const out = [];
  for (const r of newestFirst(rows, 'query')) {
    const key = normalizeQuery(r.value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(r.value);
    if (out.length === limit) break;
  }
  return out;
}

// Останні різні переглянуті точки; ті, яких уже немає в даних, пропускаємо.
export function recentSpots(rows, spots, limit = 5) {
  const byId = new Map(spots.map((s) => [s.id, s]));
  const seen = new Set();
  const out = [];
  for (const r of newestFirst(rows, 'spot')) {
    if (seen.has(r.value) || !byId.has(r.value)) continue;
    seen.add(r.value);
    out.push(byId.get(r.value));
    if (out.length === limit) break;
  }
  return out;
}
