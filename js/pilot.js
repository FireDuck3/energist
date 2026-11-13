import { h, formatDate } from './ui.js';
import { notify } from './notifications.js';

const GUEST_NEWS = {
  confirmed: 'Господар підтвердив бронювання',
  declined: 'Господар відхилив бронювання',
  cancelled: 'Бронювання скасовано',
};

// '["2026-11-13 10:00:00","2026-11-13 12:00:00")' → '13 лис, 10:00–12:00'
export function slotLabel(slot) {
  const m = String(slot).match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}).*?[ T](\d{2}:\d{2})/);
  return m ? `${formatDate(m[1])}, ${m[2]}–${m[3]}` : '';
}

// Що змінилось у бронюваннях з минулого завантаження → сповіщення для дзвіночка.
// before — Map id → статус (null — перше завантаження акаунта: старе не сповіщаємо);
// own — `${id}:${status}` змін, які зробив сам користувач (про них він уже знає).
export function bookingNews(before, rows, spots, uid, own = new Set()) {
  if (!before || !uid) return [];
  const byId = new Map(spots.map((s) => [s.id, s]));
  const news = [];
  for (const b of rows) {
    const was = before.get(b.id);
    if (was === b.status || own.has(`${b.id}:${b.status}`)) continue;
    const spot = byId.get(b.spot_id);
    const where = `«${spot?.title ?? 'Точка зарядки'}», ${slotLabel(b.slot)}`;
    if (spot?.ownerId === uid) {
      if (!was && b.status === 'pending') news.push({ text: `Новий запит на бронювання: ${where}`, href: '#/host' });
      else if (was && b.status === 'cancelled') news.push({ text: `Гість скасував бронювання: ${where}`, href: '#/host' });
    } else if (b.guest_id === uid && was && GUEST_NEWS[b.status]) {
      news.push({ text: `${GUEST_NEWS[b.status]}: ${where}`, href: '#/profile' });
    }
  }
  return news;
}

export function createPilot(session, store) {
  let spots = [], bookings = [], error = false, seq = 0;
  let known = null; // id → статус бронювань поточного акаунта на момент минулого завантаження
  const own = new Set();
  const listeners = new Set();
  const emit = () => listeners.forEach(fn => fn());
  const uid = () => session.getState().status === 'signedIn' ? session.getState().user.uid : null;

  async function refresh() {
    const service = session.service;
    if (!service?.listPilotSpots) return;
    const request = ++seq;
    const account = uid();
    try {
      const [points, requests] = await Promise.all([
        service.listPilotSpots(),
        account ? service.listPilotBookings() : [],
      ]);
      if (request !== seq) return;
      const changed = JSON.stringify(points) !== JSON.stringify(spots);
      spots = points;
      bookings = requests;
      if (account) {
        bookingNews(known, requests, points, account, own).forEach(({ text, href }) => notify(text, { href }));
        known = new Map(requests.map((b) => [b.id, b.status]));
      }
      error = false;
      if (changed || !store.getState().pilotReady) store.setPilotSpots(spots.filter(spot => !spot.archivedAt));
    } catch {
      if (request !== seq) return;
      error = true;
      if (!store.getState().pilotReady) store.setPilotSpots([]);
    }
    emit();
  }

  let account = null;
  session.subscribe(() => {
    if (account !== uid()) { account = uid(); bookings = []; known = null; own.clear(); emit(); }
    void refresh();
  });
  void session.ready.then(refresh);
  setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 20000);

  async function change(id, status) {
    own.add(`${id}:${status}`);
    try {
      await session.service.respondPilotBooking(id, status);
      notify('Статус бронювання оновлено');
    } catch { notify('Не вдалося змінити статус. Оновіть список і спробуйте ще раз.', { kind: 'error' }); }
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
      // Прибрана точка скасовує свої бронювання — господар це зробив сам, тож без сповіщень.
      bookings.filter((b) => b.spot_id === id).forEach((b) => own.add(`${b.id}:cancelled`));
      await session.service.archivePilotSpot(id);
      await refresh();
    },
    ownSpots: () => spots.filter(spot => !spot.archivedAt && spot.ownerId === uid()),
    panel(host = false) {
      const names = { pending: 'Очікує підтвердження', confirmed: 'Підтверджено', declined: 'Відхилено', cancelled: 'Скасовано' };
      const byId = new Map(spots.map(spot => [spot.id, spot]));
      const rows = bookings.filter(b => host ? byId.get(b.spot_id)?.ownerId === uid() : b.guest_id === uid());
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
            h('span', {}, b.slot.replace(/["\[\]()]/g, '').replaceAll('T', ' ').split(',').map(s => s.slice(0, 16)).join(' — ') + ' (Київ)'),
            h('b', {}, names[b.status])),
          h('div', { class: 'booking-actions' },
            host && b.status === 'pending' && button(b, 'confirmed', 'Підтвердити'),
            host && b.status === 'pending' && button(b, 'declined', 'Відхилити'),
            !host && ['pending', 'confirmed'].includes(b.status) && button(b, 'cancelled', 'Скасувати'))))));
    },
  };
}
