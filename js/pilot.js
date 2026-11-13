import { h, toast } from './ui.js';

export function createPilot(session, store) {
  let spots = [], bookings = [], error = false, seq = 0;
  const listeners = new Set();
  const emit = () => listeners.forEach(fn => fn());
  const uid = () => session.getState().status === 'signedIn' ? session.getState().user.uid : null;

  async function refresh() {
    const service = session.service;
    if (!service?.listPilotSpots) return;
    const request = ++seq;
    const account = uid();
    try {
      const [points, requests] = await Promise.allSettled([
        service.listPilotSpots(),
        account ? service.listPilotBookings() : [],
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
    } catch {
      if (request !== seq) return;
      error = true;
      if (!store.getState().pilotReady) store.setPilotSpots([]);
    }
    emit();
  }

  let account = null;
  session.subscribe(() => {
    if (account !== uid()) { account = uid(); bookings = []; emit(); }
    void refresh();
  });
  void session.ready.then(refresh);
  setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 20000);

  async function change(id, status) {
    try {
      await session.service.respondPilotBooking(id, status);
      toast('Статус бронювання оновлено');
    } catch { toast('Не вдалося змінити статус. Оновіть список і спробуйте ще раз.'); }
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
      const names = { pending: 'Очікує підтвердження', confirmed: 'Підтверджено', declined: 'Відхилено', cancelled: 'Скасовано' };
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
            host && b.status === 'pending' && button(b, 'confirmed', 'Підтвердити'),
            host && b.status === 'pending' && button(b, 'declined', 'Відхилити'),
            !host && ['pending', 'confirmed'].includes(b.status) && button(b, 'cancelled', 'Скасувати'))))));
    },
  };
}
