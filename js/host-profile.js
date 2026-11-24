// Опис станції й «паспорт» господаря (поля зі спринту, docs/host-data.md). Чисті функції без DOM.
import { VOLTAGES, TERRITORIES, SES_TYPES, PARKING_TYPES } from './data.js';
import { kyivNow, isoWeekday } from './calendar.js';

// Бажані канали зв'язку господаря (profiles.contact_channels, міграція 202611240003).
export const CONTACT_CHANNELS = [
  { id: 'chat', label: 'Чат WattWay' },
  { id: 'phone', label: 'Дзвінок' },
  { id: 'telegram', label: 'Telegram' },
  { id: 'viber', label: 'Viber' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'email', label: 'Email' },
];
// Скільки різних господарів на добу людина може відкрити контакти (reveal_host_contacts, міграція 202611240004).
// Захист від масового збору телефонів і email ботами; число має збігатися з лімітом у SQL.
export const CONTACT_REVEALS_PER_DAY = 20;
export const channelLabels =(ids = []) => CONTACT_CHANNELS.filter((c) => (ids ?? []).includes(c.id)).map((c) => c.label);

const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

// Статус доступності точки зараз (за часом Києва) — для вікна на карті й сторінки точки.
export function availabilityLabel(spot, now = new Date()) {
  if (spot.paused) return { state: 'paused', text: 'На паузі' };
  const k = kyivNow(now);
  if ((spot.closedWeekdays ?? []).includes(isoWeekday(k.day))) return { state: 'dayoff', text: 'Сьогодні вихідний' };
  const { from, to } = spot.schedule;
  if (k.minutes >= toMin(from) && k.minutes < toMin(to)) return { state: 'open', text: `Відчинено до ${to}` };
  return { state: 'closed', text: `Зачинено · відкриється о ${from}` };
}

// Колонки, які зберігає update_pilot_spot_details (202611200001) і update_pilot_spot_form (202611220001).
export const DETAIL_COLUMNS = ['install_year', 'voltage_v', 'inverter', 'storage_kwh', 'charging_terms', 'has_wifi', 'territory', 'can_leave_car'];
export const FORM_COLUMNS = ['description', 'ses_type', 'ses_power_kw', 'has_evse', 'parking_type'];
export const anyFilled = (columns, keys) => keys.some((k) => columns[k] != null);

const num = (x) => (x == null || x === '' ? null : Number(x));
const text = (x) => (typeof x === 'string' && x.trim() ? x.trim() : null);
const bool = (x) => (typeof x === 'boolean' ? x : null);

// Рядок pilot_spots → опис станції. Відсутні колонки (стара база) дають порожній опис.
export function detailsFromRow(row = {}) {
  return {
    installYear: num(row.install_year), voltageV: num(row.voltage_v), inverter: text(row.inverter),
    storageKwh: num(row.storage_kwh), terms: text(row.charging_terms), wifi: bool(row.has_wifi),
    territory: row.territory in TERRITORIES ? row.territory : null, canLeaveCar: bool(row.can_leave_car),
    description: text(row.description), sesType: row.ses_type in SES_TYPES ? row.ses_type : null,
    sesPowerKw: num(row.ses_power_kw), hasEvse: bool(row.has_evse),
    parkingType: row.parking_type in PARKING_TYPES ? row.parking_type : null,
  };
}

// Опис станції → колонки pilot_spots (для insert). NaN з порожнього поля форми стає null.
export function detailsToColumns(d = {}) {
  const n = (x) => (x == null || Number.isNaN(x) ? null : x);
  return {
    install_year: n(d.installYear), voltage_v: n(d.voltageV), inverter: text(d.inverter),
    storage_kwh: n(d.storageKwh), charging_terms: text(d.terms), has_wifi: bool(d.wifi),
    territory: d.territory ?? null, can_leave_car: bool(d.canLeaveCar),
    description: text(d.description), ses_type: d.sesType ?? null, ses_power_kw: n(d.sesPowerKw),
    has_evse: bool(d.hasEvse), parking_type: d.parkingType ?? null,
  };
}

const yesNo = (v, yes, no) => (v === true ? yes : v === false ? no : null);
const decimal = (x) => String(x).replace('.', ',');

// Рядки «характеристика — значення» для картки точки; незаповнені пропускаються.
export function detailFacts(d) {
  if (!d) return [];
  return [
    ['Тип СЕС', d.sesType && SES_TYPES[d.sesType]],
    ['Встановлена потужність СЕС', d.sesPowerKw && `${decimal(d.sesPowerKw)} кВт`],
    ['Інвертор', d.inverter],
    ['Накопичувач', d.storageKwh === 0 ? 'немає' : d.storageKwh && `акумулятори ${decimal(d.storageKwh)} кВт·год`],
    ['Зарядна станція', yesNo(d.hasEvse, 'є (EVSE)', 'немає — підключення до розетки')],
    ['Паркування', d.parkingType && PARKING_TYPES[d.parkingType]],
    ['Рік встановлення', d.installYear && String(d.installYear)],
    ['Напруга', d.voltageV && (VOLTAGES[d.voltageV] ?? `${d.voltageV} В`)],
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
// photoUrl перетворює шлях фото в Storage на публічну адресу.
export function toHostCard(row, photoUrl = (p) => p) {
  if (!row) return null;
  return {
    name: row.host_name || 'Господар точки', since: row.registered_at, verified: Boolean(row.host_verified),
    phone: row.phone || null, email: row.email || null,
    sessions: Number(row.completed_sessions) || 0, recentHours: (row.recent_hours ?? []).map(Number),
    photo: row.avatar_path ? photoUrl(row.avatar_path) : null,
    channels: Array.isArray(row.contact_channels) ? row.contact_channels : [],
    // Господар обрав дзвінок, месенджер чи email — контакти можна відкрити кнопкою (reveal_host_contacts).
    hasContacts: Boolean(row.has_contacts),
  };
}
