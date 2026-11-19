// Стислий знімок публічних станцій для карти: ~130 байт на станцію замість ~750.
// Будується синхронізацією, читається сайтом. Чистий ES-модуль (Node 20 і браузер).

export const SNAPSHOT_VERSION = 1;
export const CONNECTOR_BITS = { type2: 1, ccs2: 2, chademo: 4, gbt: 8, other: 16 };
const FLAG_24H = 1;
const FLAG_PRICE = 2;
const round5 = (x) => Math.round(x * 1e5) / 1e5;

function connectorMask(connectors) {
  return (connectors ?? []).reduce((mask, c) => mask | (CONNECTOR_BITS[c.type] ?? CONNECTOR_BITS.other), 0);
}

// Рядок: [id, lat, lng, maxPowerKw|null, connMask, flags, priceUah|null, name, address|null, operator|null]
// Адреса (до 60 символів) і оператор (до 40) — щоб пошук на карті знаходив станції за вулицею чи мережею.
const cut = (v, n) => (v ? String(v).slice(0, n) : null);
export function buildSnapshot(rows, now = new Date()) {
  const active = rows.filter((r) => r.is_active !== false);
  return {
    v: SNAPSHOT_VERSION,
    generated_at: now.toISOString(),
    count: active.length,
    rows: active.map((r) => {
      const verified = Boolean(r.price_verified && r.price_per_kwh != null);
      return [
        r.id, round5(Number(r.lat)), round5(Number(r.lng)),
        r.max_power_kw == null ? null : Number(r.max_power_kw),
        connectorMask(r.connectors),
        (r.opening_hours === 'Цілодобово' ? FLAG_24H : 0) | (verified ? FLAG_PRICE : 0),
        verified ? Number(r.price_per_kwh) : null,
        r.name ?? r.operator ?? null,
        cut(r.address, 60),
        cut(r.operator, 40),
      ];
    }),
  };
}

const TYPES = Object.entries(CONNECTOR_BITS);

// Легкі об'єкти, сумісні з фільтрами карти (matchStation, stationConnectors, sortByDistance).
export function expandSnapshot(snap) {
  if (snap?.v !== SNAPSHOT_VERSION || !Array.isArray(snap.rows)) return [];
  return snap.rows.map(([id, lat, lng, kw, mask, flags, price, name, address = null, operator = null]) => ({
    id, lat, lng, name, address, operator, compact: true,
    max_power_kw: kw,
    connectors: TYPES.filter(([, bit]) => mask & bit).map(([type]) => ({ type })),
    opening_hours: flags & FLAG_24H ? 'Цілодобово' : null,
    price_verified: Boolean(flags & FLAG_PRICE),
    price_per_kwh: price,
    updated_at: snap.generated_at,
  }));
}
