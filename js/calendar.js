// Календар доступності приватної точки: дні, вільні години, стан дня. Чисті функції, час — за Києвом.

const KYIV = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function kyivNow(now) {
  const p = Object.fromEntries(KYIV.formatToParts(now).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

const dayIndex = (day) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / 86400000;
const fromIndex = (i) => new Date(i * 86400000).toISOString().slice(0, 10);
const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const pad = (n) => String(n).padStart(2, '0');

export const addDays = (day, n) => fromIndex(dayIndex(day) + n);
export const isoWeekday = (day) => new Date(dayIndex(day) * 86400000).getUTCDay() || 7;

export function calendarDays(now, n = 30) {
  const { day } = kyivNow(now);
  return Array.from({ length: n }, (_, i) => addDays(day, i));
}

// Хвилини від початку епохи за київським «настінним» часом; інтервали бронювань — напіввідкриті [початок, кінець).
const absDay = (day) => dayIndex(day) * 1440;
const absTs = (ts) => absDay(ts.slice(0, 10)) + toMin(ts.slice(11, 16));
const absNow = (now) => { const k = kyivNow(now); return absDay(k.day) + k.minutes; };
const overlaps = (start, end, busy) => busy.some((b) => start < absTs(b.ends) && absTs(b.starts) < end);

export function freeStarts(day, spot, busy, now, hours = 1) {
  const first = Math.ceil(toMin(spot.schedule.from) / 60);
  const last = Math.floor(toMin(spot.schedule.to) / 60) - hours;
  const nowAbs = absNow(now);
  const starts = [];
  for (let hh = first; hh <= last; hh++) {
    const start = absDay(day) + hh * 60;
    if (start <= nowAbs || overlaps(start, start + hours * 60, busy)) continue;
    starts.push(`${pad(hh)}:00`);
  }
  return starts;
}

export function maxHoursFrom(day, start, spot, busy, cap = 6) {
  const begin = absDay(day) + toMin(start);
  const close = absDay(day) + toMin(spot.schedule.to);
  let n = 0;
  while (n < cap && begin + (n + 1) * 60 <= close && !overlaps(begin + n * 60, begin + (n + 1) * 60, busy)) n++;
  return Math.max(1, n);
}

export const DAY_STATUS_LABEL = {
  paused: 'На паузі',
  closed: 'Вихідний',
  dayoff: 'Вихідний',
  full: 'Усе зайнято',
  open: 'Є вільні години',
};

export function dayStatus(day, spot, { daysOff = [], busy = [] } = {}, now) {
  if (spot.paused) return 'paused';
  if ((spot.closedWeekdays ?? []).includes(isoWeekday(day))) return 'closed';
  if (daysOff.includes(day)) return 'dayoff';
  return freeStarts(day, spot, busy, now).length ? 'open' : 'full';
}
