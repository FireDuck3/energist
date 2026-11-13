import { test, eq } from './runner.js';
import { createNotifications } from '../js/notifications.js';
import { createBell, timeAgo } from '../js/views/bell.js';
import { bookingNews, slotLabel } from '../js/pilot.js';

test('сповіщення: новіші першими, лічильник непрочитаних, прочитати й очистити', () => {
  const n = createNotifications();
  const seen = [];
  n.subscribe((_items, added) => seen.push(added?.text ?? null));
  n.notify('Перше');
  n.notify('Друге', { kind: 'error', href: '#/host' });
  const [last] = n.getItems();
  eq([n.getItems().map((x) => x.text), n.unreadCount(), last.kind, last.href], [['Друге', 'Перше'], 2, 'error', '#/host']);
  n.markAllRead();
  n.markAllRead(); // нічого непрочитаного — без зайвого сповіщення підписникам
  eq(n.unreadCount(), 0);
  n.clear();
  eq([n.getItems().length, seen], [0, ['Перше', 'Друге', null, null]]);
});

test('сповіщення: зберігаються лише 30 останніх', () => {
  const n = createNotifications();
  for (let i = 1; i <= 35; i++) n.notify(`#${i}`);
  eq([n.getItems().length, n.getItems()[0].text, n.getItems().at(-1).text], [30, '#35', '#6']);
});

test('timeAgo: щойно, хвилини, далі годинник', () => {
  const at = new Date(2026, 10, 13, 9, 5);
  eq([timeAgo(at, new Date(2026, 10, 13, 9, 5, 30)), timeAgo(at, new Date(2026, 10, 13, 9, 17)), timeAgo(at, new Date(2026, 10, 13, 11, 0))],
    ['щойно', '12 хв тому', '09:05']);
});

test('дзвіночок: лічильник, «дзвін» і список; відкриття позначає прочитаним', () => {
  const n = createNotifications();
  const bell = createBell(n);
  document.body.append(bell.el);
  try {
    const count = bell.el.querySelector('.bell-count');
    const button = bell.el.querySelector('.bell-button');
    const panel = bell.el.querySelector('.bell-panel');
    eq([count.hidden, panel.hidden, button.getAttribute('aria-label')], [true, true, 'Сповіщення']);

    n.notify('Профіль збережено');
    n.notify('Не вдалося вийти', { kind: 'error' });
    eq([count.hidden, count.textContent, button.classList.contains('bell-ring'), button.getAttribute('aria-label')],
      [false, '2', true, 'Сповіщення, непрочитаних: 2']);
    eq(document.querySelector('.sr-only[aria-live]').textContent, 'Не вдалося вийти');

    button.click();
    const items = [...panel.querySelectorAll('.bell-item')];
    eq([panel.hidden, count.hidden, n.unreadCount(), button.getAttribute('aria-expanded')], [false, true, 0, 'true']);
    eq(items.map((li) => [li.querySelector('.bell-text').textContent, li.classList.contains('bell-item-new'), li.classList.contains('bell-item-error')]),
      [['Не вдалося вийти', true, true], ['Профіль збережено', true, false]]);

    n.notify('Поки список відкритий'); // одразу прочитане, без лічильника
    eq([count.hidden, panel.querySelectorAll('.bell-item').length], [true, 3]);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    eq(panel.hidden, true);
    button.click();
    panel.querySelector('.bell-head .link-btn').click(); // «Очистити»
    eq(panel.querySelector('.bell-empty')?.textContent, 'Сповіщень немає');
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); // клік повз список
    eq(panel.hidden, true);
  } finally { bell.destroy(); }
});

test('дзвіночок: сповіщення з посиланням веде на сторінку і закриває список', () => {
  const n = createNotifications();
  const bell = createBell(n);
  document.body.append(bell.el);
  try {
    n.notify('Новий запит', { href: '#/host' });
    bell.setOpen(true);
    const link = bell.el.querySelector('a.bell-link');
    link.addEventListener('click', (e) => e.preventDefault()); // не міняємо адресу сторінки тестів
    eq(link.getAttribute('href'), '#/host');
    link.click();
    eq(bell.el.querySelector('.bell-panel').hidden, true);
  } finally { bell.destroy(); }
});

const SPOTS = [{ id: 's1', title: 'Гараж Олега', ownerId: 'host' }, { id: 's2', title: 'Дах Ірини', ownerId: 'other' }];
const row = (id, spot_id, guest_id, status) => ({ id, spot_id, guest_id, status, slot: '["2026-11-13 10:00:00","2026-11-13 12:00:00")' });

test('slotLabel: інтервал бронювання по-людськи', () => {
  eq([slotLabel('["2026-11-13 10:00:00","2026-11-13 12:00:00")'), slotLabel('2026-11-14T08:00:00,2026-11-14T09:00:00'), slotLabel('')],
    ['13 лис, 10:00–12:00', '14 лис, 08:00–09:00', '']);
});

test('bookingNews: господарю — новий запит і скасування гостем', () => {
  const before = new Map([['b1', 'pending']]);
  const rows = [row('b1', 's1', 'guest', 'cancelled'), row('b2', 's1', 'guest', 'pending'), row('b3', 's1', 'guest', 'confirmed')];
  eq(bookingNews(before, rows, SPOTS, 'host'), [
    { text: 'Гість скасував бронювання: «Гараж Олега», 13 лис, 10:00–12:00', href: '#/host' },
    { text: 'Новий запит на бронювання: «Гараж Олега», 13 лис, 10:00–12:00', href: '#/host' },
  ]);
});

test('bookingNews: гостю — рішення господаря; свої дії й перше завантаження без сповіщень', () => {
  const before = new Map([['b1', 'pending'], ['b2', 'pending'], ['b3', 'confirmed']]);
  const rows = [row('b1', 's2', 'guest', 'confirmed'), row('b2', 's2', 'guest', 'declined'), row('b3', 'gone', 'guest', 'cancelled'), row('b4', 's2', 'guest', 'pending')];
  eq(bookingNews(before, rows, SPOTS, 'guest').map((x) => x.text), [
    'Господар підтвердив бронювання: «Дах Ірини», 13 лис, 10:00–12:00',
    'Господар відхилив бронювання: «Дах Ірини», 13 лис, 10:00–12:00',
    'Бронювання скасовано: «Точка зарядки», 13 лис, 10:00–12:00',
  ]);
  eq(bookingNews(before, rows, SPOTS, 'guest', new Set(['b3:cancelled'])).length, 2);
  eq([bookingNews(null, rows, SPOTS, 'guest'), bookingNews(before, rows, SPOTS, null)], [[], []]);
});
