import { test, eq } from './runner.js';
import { detailsFromRow, detailsToColumns, detailFacts, hostSince, sessionsLabel, toHostCard } from '../js/host-profile.js';
import { validateSpotDetails, validatePhone, normalizePhone } from '../js/validate.js';
import { toPilotSpot } from '../js/supabase.js';
import { createPilot } from '../js/pilot.js';

test('опис станції: рядок бази ↔ форма, порожнє стає null', () => {
  const row = { install_year: 2023, voltage_v: 380, inverter: ' Huawei SUN2000 ', storage_kwh: '10.5', charging_terms: '  ',
    has_wifi: true, territory: 'cctv', can_leave_car: false };
  const d = detailsFromRow(row);
  eq(d, { installYear: 2023, voltageV: 380, inverter: 'Huawei SUN2000', storageKwh: 10.5, terms: null, wifi: true, territory: 'cctv', canLeaveCar: false,
    description: null, sesType: null, sesPowerKw: null, hasEvse: null, parkingType: null });
  eq(detailsToColumns({ ...d, storageKwh: NaN, territory: undefined }), { install_year: 2023, voltage_v: 380, inverter: 'Huawei SUN2000',
    storage_kwh: null, charging_terms: null, has_wifi: true, territory: null, can_leave_car: false,
    description: null, ses_type: null, ses_power_kw: null, has_evse: null, parking_type: null });
  eq(detailsFromRow({ territory: 'castle' }).territory, null);
  eq(Object.values(detailsFromRow({})).every((v) => v === null), true); // стара база без нових колонок
});

test('toPilotSpot: опис станції з нових колонок', () => {
  const row = { id: 'p1', title: 'Т', district: 'Д', lat: 1, lng: 1, power_kw: 1, price_per_kwh: 10, devices: ['ev'],
    opens: '08:00:00', closes: '20:00:00', install_year: 2022, has_wifi: false };
  const s = toPilotSpot(row, [], (p) => p);
  eq([s.details.installYear, s.details.wifi, s.details.inverter], [2022, false, null]);
});

test('detailFacts: лише заповнені характеристики, 0 кВт·год — «немає»', () => {
  eq(detailFacts({ installYear: 2023, voltageV: 220, storageKwh: 0, wifi: false, territory: null, canLeaveCar: true }), [
    ['Накопичувач', 'немає'], ['Рік встановлення', '2023'], ['Напруга', '220 В (однофазна мережа)'],
    ['Wi-Fi', 'немає'], ['Залишити авто', 'можна на час зарядки']]);
  eq(detailFacts({ storageKwh: 10.5 }), [['Накопичувач', 'акумулятори 10,5 кВт·год']]);
  eq([detailFacts(undefined), detailFacts({})], [[], []]);
});

test('картка господаря: стаж, сесії, контакти', () => {
  eq(hostSince('2026-03-15T10:00:00'), 'на WattWay з березня 2026');
  eq(hostSince('not a date'), null);
  eq([sessionsLabel(0), sessionsLabel(3, [2, 1.5, 3]), sessionsLabel(1)],
    ['Завершених зарядок ще немає', 'Завершених зарядок: 3 · останні: 2 год, 1,5 год, 3 год', 'Завершених зарядок: 1']);
  const card = toHostCard({ host_name: '', registered_at: 'x', host_verified: true, phone: null, email: 'a@b.ua',
    completed_sessions: '4', recent_hours: ['2.0', '1.5'] });
  eq(card, { name: 'Господар точки', since: 'x', verified: true, phone: null, email: 'a@b.ua', sessions: 4, recentHours: [2, 1.5], photo: null, channels: [], hasContacts: false });
  eq(toHostCard({ avatar_path: 'u/avatar/a.jpg' }, (p) => `https://cdn/${p}`).photo, 'https://cdn/u/avatar/a.jpg');
  eq(toHostCard(undefined), null);
});

test('validateSpotDetails: усе необов\'язкове, заповнене — в межах таблиці', () => {
  eq(validateSpotDetails({}), { ok: true, errors: {} });
  eq(validateSpotDetails({ installYear: NaN, storageKwh: null, inverter: '', terms: '' }).ok, true);
  const bad = validateSpotDetails({ installYear: 2031, voltageV: 50, inverter: 'x'.repeat(101), storageKwh: -1,
    terms: 'x'.repeat(501), territory: 'castle' }, { year: 2026 });
  eq(Object.keys(bad.errors).sort(), ['installYear', 'inverter', 'storageKwh', 'terms', 'territory', 'voltageV']);
  eq(validateSpotDetails({ installYear: 2026, voltageV: 380, storageKwh: 0, territory: 'open' }, { year: 2026 }).ok, true);
  eq(validateSpotDetails({ installYear: 2023.5 }).ok, false);
});

test('телефон: нормалізація й перевірка як у profiles.phone', () => {
  eq([normalizePhone('+380 (67) 123-45-67'), normalizePhone('  '), normalizePhone(null)], ['+380671234567', null, null]);
  eq(validatePhone('067 123 45 67'), { ok: true, phone: '0671234567', error: null });
  eq(validatePhone(''), { ok: true, phone: null, error: null });
  eq([validatePhone('12345').ok, validatePhone('+38067abc4567').ok, validatePhone('+1234567890123456').ok], [false, false, false]);
});

test('картка господаря чекає, поки підвантажиться Supabase (відвідувач без входу)', async () => {
  let ready;
  const session = {
    service: null, ready: new Promise((r) => { ready = r; }),
    getState: () => ({ status: 'loading', user: null }), subscribe: () => () => {},
  };
  const pilot = createPilot(session, { getState: () => ({ pilotReady: true }), setPilotSpots() {} });
  const pending = pilot.hostCard('p1');
  session.service = { pilotSpotHostCard: async (id) => ({ name: 'Ірина', id }) };
  ready();
  eq(await pending, { name: 'Ірина', id: 'p1' });
});

test('анкета точки: нові поля з бази й факти для картки', () => {
  const d = detailsFromRow({ description: ' Дах будинку ', ses_type: 'hybrid', ses_power_kw: '10', has_evse: true, parking_type: 'yard', storage_kwh: 0 });
  eq([d.description, d.sesType, d.sesPowerKw, d.hasEvse, d.parkingType], ['Дах будинку', 'hybrid', 10, true, 'yard']);
  eq(detailsFromRow({ ses_type: 'nuclear', parking_type: 'roof' }).sesType, null);
  eq(detailFacts(d), [['Тип СЕС', 'Гібридна'], ['Встановлена потужність СЕС', '10 кВт'], ['Накопичувач', 'немає'],
    ['Зарядна станція', 'є (EVSE)'], ['Паркування', "У дворі / на подвір'ї"]]);
});

test('канали зв\'язку: підписи в сталому порядку, невідомі відкидаються', async () => {
  const { channelLabels, CONTACT_CHANNELS } = await import('../js/host-profile.js');
  eq(CONTACT_CHANNELS.map((c) => c.id), ['chat', 'phone', 'telegram', 'viber', 'whatsapp', 'email']);
  eq(channelLabels(['telegram', 'fax', 'chat']), ['Чат WattWay', 'Telegram']);
  eq(channelLabels(undefined), []);
  eq(toHostCard({ host_name: 'Олег', contact_channels: ['phone'] }).channels, ['phone']);
  eq(toHostCard({ host_name: 'Олег' }).channels, []);
});

test('availabilityLabel: відчинено, зачинено, вихідний, пауза — за часом Києва', async () => {
  const { availabilityLabel } = await import('../js/host-profile.js');
  const spot = { paused: false, closedWeekdays: [], schedule: { from: '08:00', to: '20:00' } };
  const at = (iso) => new Date(iso); // листопад: Київ = UTC+2
  eq(availabilityLabel(spot, at('2026-11-24T08:00:00Z')), { state: 'open', text: 'Відчинено до 20:00' });   // 10:00
  eq(availabilityLabel(spot, at('2026-11-24T18:00:00Z')), { state: 'closed', text: 'Зачинено · відкриється о 08:00' }); // 20:00
  eq(availabilityLabel(spot, at('2026-11-24T04:00:00Z')).state, 'closed');                                    // 06:00
  eq(availabilityLabel({ ...spot, closedWeekdays: [7] }, at('2026-11-29T10:00:00Z')), { state: 'dayoff', text: 'Сьогодні вихідний' }); // неділя
  eq(availabilityLabel({ ...spot, paused: true }, at('2026-11-24T08:00:00Z')), { state: 'paused', text: 'На паузі' });
});
