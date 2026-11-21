// Перевірка форми «Додати розетку». Повертає помилки по полях українською.
import { SOURCES, CONNECTORS, TERRITORIES } from './data.js';

const inRange = (x, min, max) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;

export function validateSpotInput(input) {
  const errors = {};

  if (!input.title || !input.title.trim()) errors.title = 'Вкажіть назву точки';
  if (input.lat == null || input.lng == null) {
    errors.location = 'Клікніть на карті, де знаходиться розетка';
  } else if (!inRange(input.lat, -90, 90) || !inRange(input.lng, -180, 180)) {
    errors.location = 'Вкажіть коректні координати точки';
  }
  if (!inRange(input.pricePerKwh, 5, 25)) errors.pricePerKwh = 'Ціна від 5 до 25 грн за кВт·год';
  if (!inRange(input.powerKw, 0.5, 22)) errors.powerKw = 'Потужність від 0,5 до 22 кВт';
  if (!(input.source in SOURCES)) errors.source = 'Оберіть джерело енергії';
  if (!(input.connector in CONNECTORS)) errors.connector = 'Оберіть тип підключення';
  if (!input.devices || !input.devices.length) errors.devices = 'Оберіть хоча б один пристрій';
  const isTime = (t) => /^\d{2}:\d{2}$/.test(t ?? '');
  if (!input.schedule || !isTime(input.schedule.from) || !isTime(input.schedule.to) ||
      !(input.schedule.from < input.schedule.to)) {
    errors.schedule = 'Час відкриття має бути раніше за закриття';
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

// Опис станції: усі поля необов'язкові (порожнє — null), але заповнені мають бути коректні.
// Межі ті самі, що в перевірках таблиці pilot_spots.
export function validateSpotDetails(d = {}, { year = new Date().getFullYear() } = {}) {
  const errors = {};
  const empty = (x) => x == null || (typeof x === 'number' && Number.isNaN(x));
  if (!empty(d.installYear) && !(Number.isInteger(d.installYear) && d.installYear >= 1990 && d.installYear <= year)) {
    errors.installYear = `Рік від 1990 до ${year}`;
  }
  if (!empty(d.voltageV) && !inRange(d.voltageV, 100, 1000)) errors.voltageV = 'Напруга від 100 до 1000 В';
  if ((d.inverter ?? '').trim().length > 100) errors.inverter = 'До 100 символів';
  if (!empty(d.storageKwh) && !inRange(d.storageKwh, 0, 500)) errors.storageKwh = 'Ємність від 0 до 500 кВт·год';
  if ((d.terms ?? '').trim().length > 500) errors.terms = 'До 500 символів';
  if (d.territory != null && !(d.territory in TERRITORIES)) errors.territory = 'Оберіть варіант зі списку';
  return { ok: Object.keys(errors).length === 0, errors };
}

// '+380 (67) 123-45-67' → '+380671234567'; порожнє — null. Формат як у перевірці profiles.phone.
export function normalizePhone(raw) {
  const s = String(raw ?? '').replace(/[\s()\-.]/g, '');
  return s === '' ? null : s;
}

export function validatePhone(raw) {
  const phone = normalizePhone(raw);
  if (phone !== null && !/^\+?[0-9]{7,15}$/.test(phone)) return { ok: false, phone, error: 'Номер з 7–15 цифр, напр. +380 67 123 45 67' };
  return { ok: true, phone, error: null };
}
