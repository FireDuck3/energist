// Список чатів: час останнього повідомлення, непрочитані, порядок. Чисті функції.
import { kyivNow, addDays } from './calendar.js';

const MONTHS = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'];
const pad = (n) => String(n).padStart(2, '0');

export function formatLastMessage(iso, now) {
  if (!iso) return '';
  const at = new Date(iso);
  if (now - at < 60000) return 'щойно';
  const msg = kyivNow(at);
  const today = kyivNow(now).day;
  if (msg.day === today) return `${pad(Math.floor(msg.minutes / 60))}:${pad(msg.minutes % 60)}`;
  if (msg.day === addDays(today, -1)) return 'вчора';
  return `${Number(msg.day.slice(8, 10))} ${MONTHS[Number(msg.day.slice(5, 7)) - 1]}`;
}

export const totalUnread = (chats) => chats.reduce((sum, c) => sum + (c.unread_count || 0), 0);

export const unreadLabel = (n) => (!n ? '' : n > 99 ? '99+' : String(n));

export function sortChats(chats) {
  const time = (c) => (c.last_message_at ? Date.parse(c.last_message_at) : -Infinity);
  return chats.map((c, i) => ({ c, i }))
    .sort((a, b) => (b.c.unread_count > 0) - (a.c.unread_count > 0) || time(b.c) - time(a.c) || a.i - b.i)
    .map((x) => x.c);
}
