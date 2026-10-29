import { test, eq } from './runner.js';
import { hostSummary, bookingHostAmount } from '../js/stats.js';
import { sessionCost } from '../js/pricing.js';

const now = new Date(2026, 9, 29, 12);
const state = {
  hosts: [{ id: 'oleh', chargesCount: 10, sesCost: 10000, pastMonths: [100, 200, 300, 400, 500] }],
  spots: [
    { id: 'a', hostId: 'oleh', reviews: [{ stars: 5 }, { stars: 4 }] },
    { id: 'b', hostId: 'oleh', reviews: [{ stars: 3 }] },
    { id: 'x', hostId: 'other', reviews: [{ stars: 1 }] },
  ],
  bookings: [
    { id: '1', spotId: 'a', status: 'paid', date: '2026-10-28', actualKwh: 10, hostPayout: 108 },
    { id: '2', spotId: 'b', status: 'reviewed', date: '2026-10-02', actualKwh: 5, hostPayout: 45 },
    { id: '3', spotId: 'a', status: 'paid', date: '2026-09-30', actualKwh: 7, hostPayout: 63 },
    { id: '4', spotId: 'a', status: 'pending', date: '2026-10-30', actualKwh: null, hostPayout: null },
    { id: '5', spotId: 'x', status: 'paid', date: '2026-10-28', actualKwh: 99, hostPayout: 999 },
  ],
};

test('заробіток за поточний місяць — лише оплачені на своїх точках', () =>
  eq(hostSummary(state, 'oleh', now).monthEarned, 153));

test('зарядки, кВт·год, рейтинг', () => {
  const s = hostSummary(state, 'oleh', now);
  eq([s.charges, s.kwhSold, s.rating], [13, 22, 4]);
});

test('6 місяців для графіка: 5 засіяних + поточний', () => {
  const s = hostSummary(state, 'oleh', now);
  eq(s.months.map((m) => m.earned), [100, 200, 300, 400, 500, 153]);
  eq(s.months.map((m) => m.label), ['тра', 'чер', 'лип', 'сер', 'вер', 'жов']);
});

test('окупність СЕС у відсотках', () => eq(hostSummary(state, 'oleh', now).paybackPct, 16.5)); // 1653 / 10000

test('поточний місяць і кВт·год мають засіяну базу', () => {
  const withBase = { ...state, hosts: [{ ...state.hosts[0], monthBase: 1000, kwhBase: 100 }] };
  const s = hostSummary(withBase, 'oleh', now);
  eq([s.monthEarned, s.kwhSold, s.months[5].earned], [1153, 122, 1153]);
});

test('сума господарю в списку бронювань', () => {
  const spot = { pricePerKwh: 12 };
  eq(bookingHostAmount({ status: 'paid', hostPayout: 324 }, spot), 324);
  eq(bookingHostAmount({ status: 'pending', estimatedKwh: 14.8 }, spot), sessionCost(14.8, 12).hostPayout);
  eq(bookingHostAmount({ status: 'declined', estimatedKwh: 14.8 }, spot), null);
});

test('бронювання господаря — новіші зверху, чужих немає', () =>
  eq(hostSummary(state, 'oleh', now).bookings.map((b) => b.id), ['4', '3', '2', '1']));
