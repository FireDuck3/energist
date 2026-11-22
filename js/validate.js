// Перевірка форми «Додати розетку». Повертає помилки по полях українською.
import { SOURCES, CONNECTORS, TERRITORIES, SES_TYPES, PARKING_TYPES, EVSE_CONNECTORS, SOCKET_CONNECTORS } from './data.js';

const inRange = (x, min, max) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;

export function validateSpotInput(input) {
  const errors = {};

  if (!input.title || !input.title.trim()) errors.title = 'Вкажіть назву точки';
  if (input.lat == null || input.lng == null) {
    errors.location = 'Клікніть на карті, де знаходиться точка';
  } else if (!inRange(input.lat, -90, 90) || !inRange(input.lng, -180, 180)) {
    errors.location = 'Вкажіть коректні координати точки';
  }
  if (!inRange(input.pricePerKwh, 5, 25)) errors.pricePerKwh = 'Ціна від 5 до 25 грн за кВт·год';
  // Зарядна станція (EVSE) буває швидкою — до 150 кВт; розетка — до 22 кВт.
  const maxPower = EVSE_CONNECTORS.includes(input.connector) ? 150 : 22;
  if (!inRange(input.powerKw, 0.5, maxPower)) errors.powerKw = `Потужність від 0,5 до ${maxPower} кВт`;
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

const filledText = (x, max) => typeof x === 'string' && x.trim().length >= 1 && x.trim().length <= max;

// Анкета точки (15 полів, docs/host-data.md). input — як у validateSpotInput, плюс
// details (опис станції), hasBattery (true/false/null) і contact (господар; перевіряємо лише needContact).
export function validateSpotForm(input, { needContact = false, year } = {}) {
  const d = input.details ?? {};
  const base = validateSpotInput(input);
  const extra = validateSpotDetails(d, year ? { year } : undefined);
  const errors = { ...base.errors, ...extra.errors };

  // 1. Господар: ім'я, прізвище, телефон, фото — обов'язково.
  if (needContact) {
    const c = input.contact ?? {};
    if (!filledText(c.firstName, 60)) errors.firstName = "Вкажіть ім'я";
    if (!filledText(c.lastName, 60)) errors.lastName = 'Вкажіть прізвище';
    const phone = validatePhone(c.phone);
    if (!phone.ok) errors.phone = phone.error;
    else if (!phone.phone) errors.phone = 'Вкажіть телефон';
    if (!c.hasPhoto) errors.avatar = 'Додайте своє фото';
  }
  // 2. Назва (у validateSpotInput) і короткий опис СЕС — обов'язково.
  if (!filledText(d.description, 500)) errors.description = 'Коротко опишіть станцію (до 500 символів)';
  // 3. Населений пункт і координати (координати — у validateSpotInput).
  if (!filledText(input.district, 60)) errors.district = 'Вкажіть населений пункт';
  // 4–5. Тип і встановлена потужність СЕС.
  if (!(d.sesType in SES_TYPES)) errors.sesType = 'Оберіть тип СЕС';
  if (!inRange(d.sesPowerKw, 0.1, 1000)) errors.sesPowerKw = 'Потужність СЕС від 0,1 до 1000 кВт';
  // 7. Акумулятор: є/немає, і ємність, якщо є.
  if (input.hasBattery !== true && input.hasBattery !== false) errors.hasBattery = 'Вкажіть, чи є акумулятор';
  else if (input.hasBattery && !inRange(d.storageKwh, 0.1, 500)) errors.storageKwh = 'Ємність акумулятора від 0,1 до 500 кВт·год';
  // 8–9. Зарядна станція і відповідний їй конектор.
  if (d.hasEvse !== true && d.hasEvse !== false) errors.hasEvse = 'Вкажіть, чи є зарядна станція';
  else if (!(d.hasEvse ? EVSE_CONNECTORS : SOCKET_CONNECTORS).includes(input.connector)) {
    errors.connector = d.hasEvse ? 'Оберіть конектор зарядної станції' : 'Оберіть розетку або USB';
  }
  // 11. Тип паркування.
  if (!(d.parkingType in PARKING_TYPES)) errors.parkingType = 'Оберіть тип паркування';
  return { ok: Object.keys(errors).length === 0, errors };
}
