import { test, eq } from './runner.js';
import { kyivNow, addDays, isoWeekday, calendarDays, freeStarts, maxHoursFrom, dayStatus, DAY_STATUS_LABEL } from '../js/calendar.js';

const NOW = new Date('2026-11-18T08:00:00Z'); // 10:00 за Києвом, середа
const DAY = '2026-11-25';                   // майбутня середа
const spot = (o = {}) => ({ paused: false, closedWeekdays: [], schedule: { from: '08:00', to: '20:00' }, ...o });
const busy10to12 = [{ starts: `${DAY}T10:00:00`, ends: `${DAY}T12:00:00` }];

test('kyivNow: UTC 22:30 — це вже наступна доба в Києві', () => {
  eq(kyivNow(new Date('2026-11-18T22:30:00Z')), { day: '2026-11-19', minutes: 30 });
});

test('addDays, isoWeekday', () => {
  eq(addDays('2026-11-30', 1), '2026-12-01');
  eq(isoWeekday('2026-11-23'), 1);
  eq(isoWeekday('2026-11-29'), 7);
});

test('calendarDays: 30 днів від київського «сьогодні»', () => {
  const days = calendarDays(new Date('2026-11-18T22:30:00Z'));
  eq(days.length, 30); eq(days[0], '2026-11-19'); eq(days[29], '2026-12-18');
});

test('freeStarts: зайняті години пропущено, край інтервалу дозволено', () => {
  const starts = freeStarts(DAY, spot(), busy10to12, NOW);
  eq(starts.includes('10:00') || starts.includes('11:00'), false);
  eq(starts.includes('12:00'), true);
  eq(starts[0], '08:00'); eq(starts.at(-1), '19:00');
});

test('freeStarts: тривалість 3 год не перетинає зайняте', () => {
  const starts = freeStarts(DAY, spot(), busy10to12, NOW, 3);
  eq(starts.includes('08:00') || starts.includes('09:00'), false);
  eq(starts.includes('12:00'), true);
  eq(starts.at(-1), '17:00');
});

test('freeStarts: сьогодні о 13:30 за Києвом перший старт — 14:00', () => {
  eq(freeStarts('2026-11-18', spot(), [], new Date('2026-11-18T11:30:00Z'))[0], '14:00');
});

test('maxHoursFrom: до зайнятого, до закриття, максимум 6', () => {
  eq(maxHoursFrom(DAY, '08:00', spot(), busy10to12), 2);
  eq(maxHoursFrom(DAY, '08:00', spot(), []), 6);
  eq(maxHoursFrom(DAY, '08:00', spot({ schedule: { from: '08:00', to: '10:00' } }), []), 2);
});

test('dayStatus: пауза, неробочий день тижня, вихідний, усе зайнято, відкрито', () => {
  const ctx = { daysOff: [], busy: [] };
  eq(dayStatus(DAY, spot({ paused: true }), ctx, NOW), 'paused');
  eq(dayStatus('2026-11-29', spot({ closedWeekdays: [7] }), ctx, NOW), 'closed');
  eq(dayStatus(DAY, spot(), { daysOff: [DAY], busy: [] }, NOW), 'dayoff');
  eq(dayStatus(DAY, spot(), { daysOff: [], busy: [{ starts: `${DAY}T08:00:00`, ends: `${DAY}T20:00:00` }] }, NOW), 'full');
  eq(dayStatus(DAY, spot(), ctx, NOW), 'open');
  eq(typeof DAY_STATUS_LABEL.full, 'string');
});
