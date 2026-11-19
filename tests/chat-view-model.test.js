import { test, eq } from './runner.js';
import {
  dayLabel, groupByDay, messageTicks, chatPreview, filterChats, mergeMessages, bookingActions, systemEvents, isTypingFresh,
} from '../js/chat-view-model.js';

const NOW = new Date('2026-11-18T12:00:00Z'); // 14:00 у Києві
const msg = (id, created_at, author_id = 'me', extra = {}) => ({ id, created_at, author_id, body: id, ...extra });

test('dayLabel: сьогодні, вчора, дата, інший рік', () => {
  eq(dayLabel('2026-11-18', NOW), 'Сьогодні');
  eq(dayLabel('2026-11-17', NOW), 'Вчора');
  eq(dayLabel('2026-11-12', NOW), '12 листопада');
  eq(dayLabel('2025-03-01', NOW), '1 березня 2025');
});

test('groupByDay: межа доби за Києвом і хронологічний порядок', () => {
  const now = new Date('2026-11-18T22:30:00Z'); // 19 листопада 00:30 у Києві
  const groups = groupByDay([msg('b', '2026-11-18T22:10:00Z'), msg('a', '2026-11-18T21:50:00Z')], now);
  eq(groups.map((g) => [g.label, g.items.map((i) => i.id)]), [['Вчора', ['a']], ['Сьогодні', ['b']]]);
});

test('messageTicks: надсилається, збій, надіслано, прочитано, чуже', () => {
  eq(messageTicks(msg('a', '2026-11-18T10:00:00Z', 'me', { pending: true }), 'me', null), 'sending');
  eq(messageTicks(msg('a', '2026-11-18T10:00:00Z', 'me', { failed: true }), 'me', null), 'failed');
  eq(messageTicks(msg('a', '2026-11-18T10:00:00Z'), 'me', '2026-11-18T09:00:00Z'), 'sent');
  eq(messageTicks(msg('a', '2026-11-18T10:00:00Z'), 'me', '2026-11-18T10:00:01Z'), 'read');
  eq(messageTicks(msg('a', '2026-11-18T10:00:00Z', 'other'), 'me', '2026-11-18T11:00:00Z'), null);
});

test('chatPreview', () => {
  eq(chatPreview({ last_message_body: 'Буду о 9', last_message_mine: true }, 'me'), 'Ви: Буду о 9');
  eq(chatPreview({ last_message_body: 'Добрий день', last_message_mine: false }, 'me'), 'Добрий день');
  eq(chatPreview({ last_message_body: null }, 'me'), 'Немає повідомлень');
});

test('filterChats: без регістру й апострофів, за іменем і точкою', () => {
  const chats = [{ id: 1, counterpart_name: 'Олег', spot_title: 'Гараж' }, { id: 2, counterpart_name: 'Ірина', spot_title: 'Дах на П’ятничанах' }];
  eq(filterChats(chats, 'олег').map((c) => c.id), [1]);
  eq(filterChats(chats, "п'ятн").map((c) => c.id), [2]);
  eq(filterChats(chats, '  ').length, 2);
});

test('mergeMessages: без дублів, серверна версія перемагає, локальні збої лишаються', () => {
  const server = [msg('a', '2026-11-18T10:00:00Z'), msg('b', '2026-11-18T10:05:00Z')];
  const local = [msg('b', '2026-11-18T10:04:00Z', 'me', { pending: true }), msg('c', '2026-11-18T10:06:00Z', 'me', { failed: true })];
  const out = mergeMessages(server, local);
  eq(out.map((m) => m.id), ['a', 'b', 'c']);
  eq(out[1].pending, undefined);
  eq(out[2].failed, true);
});

test('bookingActions: господар і гість у різних статусах', () => {
  const b = (status, end = '2026-11-18 12:00:00') => ({ status, guest_id: 'g', owner_id: 'h', slot: `["2026-11-18 10:00:00","${end}")` });
  eq(bookingActions(b('pending'), 'h', NOW), ['confirm', 'decline']);
  eq(bookingActions(b('pending'), 'g', NOW), ['cancel']);
  eq(bookingActions(b('confirmed', '2026-11-18 18:00:00'), 'g', NOW), ['cancel']);
  eq(bookingActions(b('confirmed', '2026-11-18 13:00:00'), 'g', NOW), ['cancel', 'complete']);
  eq(bookingActions(b('confirmed', '2026-11-18 13:00:00'), 'h', NOW), ['complete']);
  eq(bookingActions(b('completed'), 'g', NOW), []);
});

test('systemEvents: запит і поточний статус', () => {
  eq(systemEvents({ status: 'confirmed', created_at: '2026-11-18T08:00:00Z', status_changed_at: '2026-11-18T09:00:00Z' }).map((e) => e.text),
    ['Запит на бронювання надіслано', 'Бронювання підтверджено']);
  eq(systemEvents({ status: 'pending', created_at: '2026-11-18T08:00:00Z' }).length, 1);
});

test('isTypingFresh: 5 секунд', () => {
  eq([isTypingFresh(null, 10000), isTypingFresh(6000, 10000), isTypingFresh(4000, 10000)], [false, true, false]);
});
