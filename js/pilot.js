import { h } from './ui.js';
import { notifications as bellList, notify } from './notifications.js';
import { openConversation } from './views/conversation.js';

// Серверні сповіщення (нові запити, рішення господаря, повідомлення в чаті) показуються лише
// під дзвіночком у шапці; клік відкриває чат бронювання.
const NOTICE = 'booking-notice:';

export function createPilot(session, store, { notifications = bellList } = {}) {
  let spots = [], bookings = [], error = false, seq = 0;
  const listeners = new Set();
  const emit = () => listeners.forEach(fn => fn());
  const uid = () => session.getState().status === 'signedIn' ? session.getState().user.uid : null;

  function openBooking(id) {
    const booking = bookings.find(b => b.id === id);
    if (booking) openConversation(booking, session, refresh);
    else location.hash = '#/profile';
  }

  function syncNotices(rows) {
    for (const n of rows) {
      notifications.notify(n.body, {
        key: NOTICE + n.id,
        at: new Date(n.created_at),
        read: Boolean(n.read_at),
        open: () => openBooking(n.booking_id),
        // Не вдалося позначити на сервері — нічого страшного: сповіщення лишиться прочитаним тут.
        onRead: () => { Promise.resolve(session.service?.readNotification?.(n.id)).catch(() => {}); },
      });
    }
  }

  async function refresh() {
    const service = session.service;
    if (!service?.listPilotSpots) return;
    const request = ++seq;
    const account = uid();
    try {
      const [points, requests, notices] = await Promise.allSettled([
        service.listPilotSpots(),
        account ? service.listPilotBookings() : [],
        account && service.listNotifications ? service.listNotifications() : [],
      ]);
      if (request !== seq) return;
      if (account !== uid()) return;
      if (points.status === 'fulfilled') {
        const changed = JSON.stringify(points.value) !== JSON.stringify(spots);
        spots = points.value;
        if (changed || !store.getState().pilotReady) store.setPilotSpots(spots.filter(spot => !spot.archivedAt));
      }
      if (requests.status === 'fulfilled') bookings = requests.value;
      error = requests.status === 'rejected';
      if (account && notices.status === 'fulfilled') syncNotices(notices.value);
    } catch {
      if (request !== seq) return;
      error = true;
      if (!store.getState().pilotReady) store.setPilotSpots([]);
    }
    emit();
  }

  let account = uid();
  session.subscribe(() => {
    if (account !== uid()) {
      account = uid();
      bookings = [];
      // Сповіщення попереднього акаунта не лишаються під дзвіночком (спільний ноутбук на пітчі).
      notifications.remove(n => String(n.key).startsWith(NOTICE));
      emit();
    }
    void refresh();
  });
  void session.ready.then(refresh);
  setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 20000);

  // Успіх видно одразу: статус у списку змінюється, а сервер надсилає сповіщення в дзвіночок.
  async function change(id, status) {
    try {
      if (status === 'completed') await session.service.completeBooking(id);
      else await session.service.respondPilotBooking(id, status);
    } catch {
      notify(status === 'completed'
        ? 'Завершення доступне після закінчення підтвердженого часу бронювання.'
        : 'Не вдалося змінити статус. Оновіть список і спробуйте ще раз.', { kind: 'error' });
    }
    await refresh();
  }

  return {
    refresh,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    publish: async (input) => {
      if (!uid()) throw new Error('Sign-in required');
      await session.service.publishPilotSpot(input, uid());
      await refresh();
    },
    request: async (point, selection) => {
      if (!uid()) throw new Error('Sign-in required');
      await session.service.requestPilotBooking(point, selection);
      await refresh();
    },
    async archive(id) {
      await session.service.archivePilotSpot(id);
      await refresh();
    },
    ownSpots: () => spots.filter(spot => !spot.archivedAt && spot.ownerId === uid()),
    panel(host = false) {
      const names = { pending: 'Очікує підтвердження', confirmed: 'Підтверджено', declined: 'Відхилено', cancelled: 'Скасовано', completed: 'Завершено' };
      const byId = new Map(spots.map(spot => [spot.id, spot]));
      const rows = bookings.filter(b => host ? b.owner_id === uid() : b.guest_id === uid());
      const button = (b, status, label) => h('button', {
        type: 'button', class: 'btn btn-secondary btn-sm',
        async onclick(e) { e.currentTarget.disabled = true; await change(b.id, status); },
      }, label);
      return h('section', { class: 'card panel' },
        h('h2', { class: 'panel-title' }, host ? 'Запити гостей' : 'Мої бронювання'),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: refresh }, 'Оновити'),
        error && h('p', { role: 'alert' }, 'Не вдалося завантажити бронювання. Спробуйте оновити.'),
        !error && !rows.length && h('p', { class: 'muted' }, 'Бронювань ще немає.'),
        h('ul', { class: 'bookings' }, rows.map(b => h('li', { class: 'booking' },
          h('div', { class: 'booking-main' },
            h('a', { href: '#/spot/' + b.spot_id }, byId.get(b.spot_id)?.title ?? 'Точка зарядки'),
            h('span', {}, host ? 'Гість — ' : 'Господар — ', b.counterpart_name || 'Нік не вказано'),
            h('span', {}, b.slot.replace(/["\[\]()]/g, '').replaceAll('T', ' ').split(',').map(s => s.slice(0, 16)).join(' — ') + ' (Київ)'),
            h('b', {}, names[b.status])),
          h('div', { class: 'booking-actions' },
            h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => openConversation(b, session, refresh) }, b.status === 'completed' ? 'Чат і відгук' : 'Чат'),
            b.status === 'confirmed' && button(b, 'completed', 'Завершити співпрацю'),
            host && b.status === 'pending' && button(b, 'confirmed', 'Підтвердити'),
            host && b.status === 'pending' && button(b, 'declined', 'Відхилити'),
            !host && ['pending', 'confirmed'].includes(b.status) && button(b, 'cancelled', 'Скасувати'))))));
    },
  };
}
