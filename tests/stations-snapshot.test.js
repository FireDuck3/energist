import { test, eq } from './runner.js';
import { CONNECTOR_BITS, buildSnapshot, expandSnapshot } from '../scripts/sync-stations/snapshot.js';
import { matchStation } from '../js/map-filters.js';
import { DEFAULT_FILTERS } from '../js/filters.js';

const row = (o = {}) => ({ id: 'a', is_active: true, name: 'ЕКО', operator: 'ЕКО', lat: 49.2331234, lng: 28.4682999, max_power_kw: 50,
  connectors: [{ type: 'type2' }, { type: 'ccs2' }, { type: 'tesla' }], opening_hours: null, price_verified: false, price_per_kwh: 12, ...o });

test('buildSnapshot: формат рядка, біти роз\'ємів і прапорців, округлення', () => {
  const snap = buildSnapshot([row(), row({ id: 'b', is_active: false })], new Date('2026-11-19T03:00:00Z'));
  eq([snap.v, snap.count, snap.generated_at], [1, 1, '2026-11-19T03:00:00.000Z']);
  const [id, lat, lng, kw, mask, flags, price, name] = snap.rows[0];
  eq([id, lat, lng, kw, mask, flags, price, name], ['a', 49.23312, 28.4683, 50, CONNECTOR_BITS.type2 | CONNECTOR_BITS.ccs2 | CONNECTOR_BITS.other, 0, null, 'ЕКО']);
});

test('buildSnapshot: цілодобово і перевірена ціна', () => {
  const [r] = buildSnapshot([row({ opening_hours: 'Цілодобово', price_verified: true })]).rows;
  eq([r[5], r[6]], [1 | 2, 12]);
});

test('expandSnapshot: фільтри дають той самий результат, що й на повних рядках', () => {
  const full = [
    row({ id: '1' }),
    row({ id: '2', max_power_kw: 150, connectors: [{ type: 'chademo' }], opening_hours: 'Цілодобово' }),
    row({ id: '3', max_power_kw: null, connectors: [{ type: 'gbt' }], price_verified: true, price_per_kwh: 9 }),
  ];
  const compact = expandSnapshot(buildSnapshot(full));
  const filters = [
    { connectors: ['ccs2'] }, { connectors: ['chademo'] }, { connectors: ['other'] }, { power: '50-150' }, { power: '22-50' },
    { only24h: true }, { maxPrice: 10 }, { maxPrice: 25 },
  ];
  for (const f of filters) {
    const ff = { ...DEFAULT_FILTERS, ...f };
    eq(compact.filter((s) => matchStation(s, ff, {})).map((s) => s.id), full.filter((s) => matchStation(s, ff, {})).map((s) => s.id), JSON.stringify(f));
  }
  eq(compact[0].compact, true);
});

test('знімок зберігає коротку адресу й оператора для пошуку', () => {
  const [st] = expandSnapshot(buildSnapshot([row({ name: 'ЕКО Келецька', operator: 'ЕКО', address: 'вул. Келецька 1, Вінниця' })]));
  eq([st.address, st.operator], ['вул. Келецька 1, Вінниця', 'ЕКО']);
  const [long] = buildSnapshot([row({ address: 'я'.repeat(200) })]).rows;
  eq(long[8].length, 60);
});
