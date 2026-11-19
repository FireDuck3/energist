// Розмова «як у Telegram»: дні, галочки, прев'ю, пошук, злиття повідомлень, дії бронювання. Чисті функції.
import { kyivNow, addDays } from './calendar.js';
import { normalizeQuery } from './filters.js';

const MONTHS_GEN = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
const pad = (n) => String(n).padStart(2, '0');

export function dayLabel(day, now) {
  const today = kyivNow(now).day;
  if (day === today) return 'Сьогодні';
  if (day === addDays(today, -1)) return 'Вчора';
  const label = `${Number(day.slice(8, 10))} ${MONTHS_GEN[Number(day.slice(5, 7)) - 1]}`;
  return day.slice(0, 4) === today.slice(0, 4) ? label : `${label} ${day.slice(0, 4)}`;
}

export function groupByDay(items, now) {
  const sorted = [...items].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const groups = [];
  for (const item of sorted) {
    const day = kyivNow(new Date(item.created_at)).day;
    const last = groups.at(-1);
    if (last?.day === day) last.items.push(item);
    else groups.push({ day, label: dayLabel(day, now), items: [item] });
  }
  return groups;
}

export function messageTicks(msg, me, counterpartReadAt) {
  if (msg.author_id !== me) return null;
  if (msg.failed) return 'failed';
  if (msg.pending) return 'sending';
  return counterpartReadAt && Date.parse(counterpartReadAt) >= Date.parse(msg.created_at) ? 'read' : 'sent';
}

export function chatPreview(chat) {
  if (!chat.last_message_body) return 'Немає повідомлень';
  return chat.last_message_mine ? `Ви: ${chat.last_message_body}` : chat.last_message_body;
}

export function filterChats(chats, query) {
  const q = normalizeQuery(query);
  if (!q) return chats;
  return chats.filter((c) => normalizeQuery(`${c.counterpart_name ?? ''} ${c.spot_title ?? ''}`).includes(q));
}

// Серверні повідомлення перемагають локальні з тим самим id (оптимістична відправка + Realtime).
export function mergeMessages(server, local) {
  const ids = new Set(server.map((m) => m.id));
  return [...server, ...local.filter((m) => !ids.has(m.id))]
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}

// Кінець слоту «["2026-11-18 10:00:00","2026-11-18 12:00:00")» — київський час, як і в базі.
const slotEnd = (slot) => (String(slot).match(/\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/g) ?? [])[1]?.replace('T', ' ') ?? null;

export function bookingActions(booking, me, now) {
  const actions = [];
  const host = booking.owner_id === me;
  const guest = booking.guest_id === me;
  if (host && booking.status === 'pending') actions.push('confirm', 'decline');
  if (guest && ['pending', 'confirmed'].includes(booking.status)) actions.push('cancel');
  if (booking.status === 'confirmed' && (host || guest)) {
    const k = kyivNow(now);
    const nowKey = `${k.day} ${pad(Math.floor(k.minutes / 60))}:${pad(k.minutes % 60)}`;
    const end = slotEnd(booking.slot);
    if (end && end <= nowKey) actions.push('complete');
  }
  return actions;
}

const STATUS_TEXT = {
  confirmed: 'Бронювання підтверджено',
  declined: 'Запит відхилено',
  cancelled: 'Бронювання скасовано',
  completed: 'Співпрацю завершено — залиште відгук',
};

export function systemEvents(booking) {
  const events = [];
  if (booking.created_at) events.push({ id: `sys-created-${booking.id}`, system: true, created_at: booking.created_at, text: 'Запит на бронювання надіслано' });
  const text = STATUS_TEXT[booking.status];
  if (text && booking.status_changed_at) events.push({ id: `sys-status-${booking.id}`, system: true, created_at: booking.status_changed_at, text });
  return events;
}

export const TYPING_TTL_MS = 5000;
export const isTypingFresh = (lastTypingAt, now) => lastTypingAt != null && now - lastTypingAt < TYPING_TTL_MS;
