// Перевірка форми «Додати розетку». Повертає помилки по полях українською.
import { VINNYTSIA_BOUNDS, SOURCES, CONNECTORS } from './data.js';

const inRange = (x, min, max) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;

export function validateSpotInput(input) {
  const errors = {};
  const [[south, west], [north, east]] = VINNYTSIA_BOUNDS;

  if (!input.title || !input.title.trim()) errors.title = 'Вкажіть назву точки';
  if (input.lat == null || input.lng == null) {
    errors.location = 'Клікніть на карті, де знаходиться розетка';
  } else if (!inRange(input.lat, south, north) || !inRange(input.lng, west, east)) {
    errors.location = 'Точка має бути у Вінниці';
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
