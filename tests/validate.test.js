import { test, eq } from './runner.js';
import { validateSpotInput } from '../js/validate.js';

const good = {
  title: 'Розетка в гаражі', lat: 49.22, lng: 28.41, pricePerKwh: 11, powerKw: 3.6,
  source: 'solar', connector: 'socket220', devices: ['ecoflow'],
  schedule: { from: '08:00', to: '20:00' },
};

test('валідний ввід', () => eq(validateSpotInput(good), { ok: true, errors: {} }));

test('без точки на карті', () => {
  const r = validateSpotInput({ ...good, lat: null, lng: null });
  eq([r.ok, typeof r.errors.location], [false, 'string']);
});

test('точка за межами Вінниці', () =>
  eq(typeof validateSpotInput({ ...good, lat: 50.45, lng: 30.52 }).errors.location, 'string'));

test('порожня назва', () => eq(typeof validateSpotInput({ ...good, title: '   ' }).errors.title, 'string'));

test('ціна 0 і 100', () => {
  eq(typeof validateSpotInput({ ...good, pricePerKwh: 0 }).errors.pricePerKwh, 'string');
  eq(typeof validateSpotInput({ ...good, pricePerKwh: 100 }).errors.pricePerKwh, 'string');
});

test('потужність поза 0,5–22', () =>
  eq(typeof validateSpotInput({ ...good, powerKw: 50 }).errors.powerKw, 'string'));

test('жодного пристрою', () => eq(typeof validateSpotInput({ ...good, devices: [] }).errors.devices, 'string'));

test('порожній час відкриття', () =>
  eq(typeof validateSpotInput({ ...good, schedule: { from: '', to: '20:00' } }).errors.schedule, 'string'));

test('графік навиворіт', () =>
  eq(typeof validateSpotInput({ ...good, schedule: { from: '20:00', to: '08:00' } }).errors.schedule, 'string'));
