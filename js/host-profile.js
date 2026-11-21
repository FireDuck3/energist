// Опис станції й «паспорт» господаря (поля зі спринту, docs/host-data.md). Чисті функції без DOM.
import { VOLTAGES, TERRITORIES } from './data.js';

const num = (x) => (x == null || x === '' ? null : Number(x));
const text = (x) => (typeof x === 'string' && x.trim() ? x.trim() : null);
const bool = (x) => (typeof x === 'boolean' ? x : null);

// Рядок pilot_spots → опис станції. Відсутні колонки (стара база) дають порожній опис.
export function detailsFromRow(row = {}) {
  return {
    installYear: num(row.install_year), voltageV: num(row.voltage_v), inverter: text(row.inverter),
    storageKwh: num(row.storage_kwh), terms: text(row.charging_terms), wifi: bool(row.has_wifi),
    territory: row.territory in TERRITORIES ? row.territory : null, canLeaveCar: bool(row.can_leave_car),
  };
}

// Опис станції → колонки pilot_spots (для insert). NaN з порожнього поля форми стає null.
export function detailsToColumns(d = {}) {
  const n = (x) => (x == null || Number.isNaN(x) ? null : x);
  return {
    install_year: n(d.installYear), voltage_v: n(d.voltageV), inverter: text(d.inverter),
    storage_kwh: n(d.storageKwh), charging_terms: text(d.terms), has_wifi: bool(d.wifi),
    territory: d.territory ?? null, can_leave_car: bool(d.canLeaveCar),
  };
}

const yesNo = (v, yes, no) => (v === true ? yes : v === false ? no : null);
const decimal = (x) => String(x).replace('.', ',');

// Рядки «характеристика — значення» для картки точки; незаповнені пропускаються.
export function detailFacts(d) {
  if (!d) return [];
  return [
    ['Рік встановлення', d.installYear && String(d.installYear)],
    ['Напруга', d.voltageV && (VOLTAGES[d.voltageV] ?? `${d.voltageV} В`)],
    ['Інвертор', d.inverter],
    ['Накопичувач', d.storageKwh === 0 ? 'немає' : d.storageKwh && `акумулятори ${decimal(d.storageKwh)} кВт·год`],
    ['Wi-Fi', yesNo(d.wifi, 'є для гостей', 'немає')],
    ['Територія', d.territory && TERRITORIES[d.territory]],
    ['Залишити авто', yesNo(d.canLeaveCar, 'можна на час зарядки', 'лише поруч з авто')],
  ].filter(([, value]) => value);
}

const MONTHS_GENITIVE = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня',
  'вересня', 'жовтня', 'листопада', 'грудня'];

// '2026-11-03T…' → 'на WattWay з листопада 2026'
export function hostSince(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `на WattWay з ${MONTHS_GENITIVE[d.getMonth()]} ${d.getFullYear()}`;
}

// 3, [2, 1.5, 3] → 'Завершених зарядок: 3 · останні: 2 год, 1,5 год, 3 год'
export function sessionsLabel(count, hours = []) {
  if (!count) return 'Завершених зарядок ще немає';
  const recent = hours.map((x) => `${decimal(Number(x))} год`).join(', ');
  return `Завершених зарядок: ${count}${recent ? ` · останні: ${recent}` : ''}`;
}

// Відповідь pilot_spot_host_card → картка господаря (або null, якщо точку не видно).
export function toHostCard(row) {
  if (!row) return null;
  return {
    name: row.host_name || 'Господар точки', since: row.registered_at, verified: Boolean(row.host_verified),
    phone: row.phone || null, email: row.email || null,
    sessions: Number(row.completed_sessions) || 0, recentHours: (row.recent_hours ?? []).map(Number),
  };
}
