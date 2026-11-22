import { test, eq } from './runner.js';
import { validateSpotInput, validateSpotForm } from '../js/validate.js';

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

test('точка за межами Вінниці дозволена', () =>
  eq(validateSpotInput({ ...good, lat: 50.45, lng: 30.52 }).ok, true));

test('координати за межами світу відхиляються', () =>
  eq(typeof validateSpotInput({ ...good, lat: 91 }).errors.location, 'string'));

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

const fullForm = {
  ...good, district: 'Вінниця', connector: 'type2', powerKw: 7.4, hasBattery: true,
  details: { description: 'Панелі на даху', sesType: 'hybrid', sesPowerKw: 10, storageKwh: 10, hasEvse: true, parkingType: 'yard' },
  contact: { firstName: 'Олег', lastName: 'Коваль', phone: '+380 67 123 45 67', hasPhoto: true },
};

test('анкета точки: повна — без помилок', () => eq(validateSpotForm(fullForm, { needContact: true }), { ok: true, errors: {} }));

test("анкета точки: порожня — помилки на всіх обов'язкових полях", () => {
  const empty = { title: '', district: '', lat: null, lng: null, connector: null, powerKw: NaN, pricePerKwh: NaN,
    source: 'solar', devices: [], schedule: { from: '20:00', to: '08:00' }, hasBattery: null, details: {}, contact: {} };
  eq(Object.keys(validateSpotForm(empty, { needContact: true }).errors).sort(), ['avatar', 'connector', 'description', 'devices', 'district',
    'firstName', 'hasEvse', 'lastName', 'location', 'parkingType', 'phone', 'powerKw', 'pricePerKwh', 'schedule', 'sesPowerKw',
    'sesType', 'hasBattery', 'title'].sort());
  // Без реального акаунта (демо) контакти господаря не вимагаються.
  eq(['firstName', 'lastName', 'phone', 'avatar'].some((k) => k in validateSpotForm(empty).errors), false);
});

test('анкета точки: конектор відповідає EVSE, потужність — типу підключення, ємність — акумулятору', () => {
  const f = (over, details = {}) => validateSpotForm({ ...fullForm, ...over, details: { ...fullForm.details, ...details } }, { needContact: true }).errors;
  eq(typeof f({ connector: 'socket220', powerKw: 3 }).connector, 'string'); // EVSE є, а обрано розетку
  eq(f({ connector: 'socket220', powerKw: 3 }, { hasEvse: false }), {});
  eq(f({ connector: 'ccs2', powerKw: 60 }), {}); // швидка зарядна станція
  eq(typeof f({ connector: 'socket220', powerKw: 60 }, { hasEvse: false }).powerKw, 'string');
  eq(typeof f({ hasBattery: true }, { storageKwh: NaN }).storageKwh, 'string');
  eq(f({ hasBattery: false }, { storageKwh: 0 }), {});
  eq(typeof f({ contact: { ...fullForm.contact, phone: '' } }).phone, 'string');
  eq(typeof f({ contact: { ...fullForm.contact, hasPhoto: false } }).avatar, 'string');
  eq(f({}, { inverter: undefined }), {}); // інвертор — бажано, не обов'язково
});
