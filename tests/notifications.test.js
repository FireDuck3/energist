import { test, eq } from './runner.js';
import { createNotifications } from '../js/notifications.js';
import { createBell, timeAgo } from '../js/views/bell.js';
import { createPilot } from '../js/pilot.js';

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

test('сповіщення з ключем: без дублів, за часом, прочитане на сервері знімається з лічильника', () => {
  const n = createNotifications({ now: () => new Date(2026, 10, 13, 12, 0) });
  const rings = [];
  n.subscribe((_items, added) => { if (added) rings.push(added.text); });
  n.notify('Локальне');
  n.notify('Старе прочитане', { key: 's:1', at: new Date(2026, 10, 12), read: true });
  n.notify('Нове з сервера', { key: 's:2', at: new Date(2026, 10, 13, 11, 0) });
  n.notify('Нове з сервера', { key: 's:2', at: new Date(2026, 10, 13, 11, 0) }); // наступне оновлення
  eq([n.getItems().map((x) => x.text), n.unreadCount(), rings], [['Локальне', 'Нове з сервера', 'Старе прочитане'], 2, ['Локальне', 'Нове з сервера']]);
  n.notify('Нове з сервера', { key: 's:2', read: true }); // прочитали на іншому пристрої
  eq(n.unreadCount(), 1);
});

test('сповіщення: «прочитано» й «очистити» кличуть onRead, очищені серверні не повертаються', () => {
  const n = createNotifications();
  const read = [];
  n.notify('A', { key: 'a', onRead: () => read.push('a') });
  n.notify('B', { key: 'b', read: true, onRead: () => read.push('b') });
  n.markAllRead();
  n.notify('C', { key: 'c', onRead: () => read.push('c') });
  n.clear();
  n.notify('A', { key: 'a' });
  n.notify('C', { key: 'c' });
  eq([read, n.getItems().length], [['a', 'c'], 0]);
  n.notify('D', { key: 'x:1' });
  n.notify('E');
  n.remove((x) => String(x.key).startsWith('x:'));
  eq(n.getItems().map((x) => x.text), ['E']);
});

function fakeAccount(rows) {
  const listeners = new Set();
  let state = { status: 'signedIn', user: { uid: 'u1' } };
  const marked = [];
  const service = {
    listPilotSpots: async () => [],
    listPilotBookings: async () => [],
    listNotifications: async () => rows,
    readNotification: async (id) => { marked.push(id); },
  };
  return {
    marked,
    session: {
      service, ready: Promise.resolve(),
      getState: () => state,
      subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      signOut() { state = { status: 'signedOut', user: null }; listeners.forEach((fn) => fn(state)); },
    },
    store: { getState: () => ({ pilotReady: true }), setPilotSpots() {} },
  };
}

test('бронювання: серверні сповіщення йдуть у дзвіночок, без дублів; вихід з акаунта їх прибирає', async () => {
  const rows = [
    { id: 7, booking_id: 'b1', body: 'Новий запит на бронювання · Гараж', created_at: '2026-11-13T10:00:00Z', read_at: null },
    { id: 6, booking_id: 'b1', body: 'Нове повідомлення · Гараж', created_at: '2026-11-13T09:00:00Z', read_at: '2026-11-13T09:30:00Z' },
  ];
  const { session, store, marked } = fakeAccount(rows);
  const list = createNotifications();
  list.notify('Профіль збережено');
  const pilot = createPilot(session, store, { notifications: list });
  await pilot.refresh();
  await pilot.refresh();
  const texts = () => list.getItems().map((x) => x.text);
  eq([texts().filter((t) => t.includes('Гараж')).sort(), list.unreadCount()],
    [['Нове повідомлення · Гараж', 'Новий запит на бронювання · Гараж'], 2]);
  eq(typeof list.getItems().find((x) => x.key === 'booking-notice:7').open, 'function');
  list.markAllRead();
  await Promise.resolve();
  eq(marked, [7]);
  session.signOut();
  eq(texts(), ['Профіль збережено']);
});
