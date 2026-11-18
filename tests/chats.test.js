import { test, eq } from './runner.js';
import { formatLastMessage, totalUnread, sortChats, unreadLabel } from '../js/chats.js';

const NOW = new Date('2026-11-18T12:00:00Z'); // 14:00 у Києві

test('formatLastMessage: щойно, сьогодні, вчора, давніше', () => {
  eq(formatLastMessage(null, NOW), '');
  eq(formatLastMessage('2026-11-18T11:59:30Z', NOW), 'щойно');
  eq(formatLastMessage('2026-11-18T08:05:00Z', NOW), '10:05');
  eq(formatLastMessage('2026-11-17T20:00:00Z', NOW), 'вчора');
  eq(formatLastMessage('2026-11-12T10:00:00Z', NOW), '12 лис');
});

test('formatLastMessage: межа доби за Києвом', () => {
  // 19 листопада 00:30 у Києві; повідомлення 18 листопада 23:50 за Києвом → «вчора».
  eq(formatLastMessage('2026-11-18T21:50:00Z', new Date('2026-11-18T22:30:00Z')), 'вчора');
});

test('totalUnread і unreadLabel', () => {
  eq(totalUnread([{ unread_count: 2 }, { unread_count: 0 }, {}]), 2);
  eq([unreadLabel(0), unreadLabel(1), unreadLabel(99), unreadLabel(150)], ['', '1', '99', '99+']);
});

test('sortChats: непрочитані вгорі, далі новіші, без повідомлень — унизу', () => {
  const chats = [
    { id: 'empty', unread_count: 0, last_message_at: null },
    { id: 'old', unread_count: 0, last_message_at: '2026-11-10T10:00:00Z' },
    { id: 'unread', unread_count: 3, last_message_at: '2026-11-01T10:00:00Z' },
    { id: 'new', unread_count: 0, last_message_at: '2026-11-18T10:00:00Z' },
  ];
  eq(sortChats(chats).map((c) => c.id), ['unread', 'new', 'old', 'empty']);
  eq(chats[0].id, 'empty'); // вхідний масив не змінюється
});
