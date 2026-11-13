// Сповіщення сайту: усе, що раніше спливало тостами, тепер збирається тут
// і показується лише під дзвіночком у шапці (js/views/bell.js). Живуть до перезавантаження сторінки.
const MAX_ITEMS = 30;

export function createNotifications({ now = () => new Date() } = {}) {
  let items = []; // новіші першими: { id, text, kind: 'info' | 'error', href, at, read }
  let seq = 0;
  const listeners = new Set();
  const emit = (added = null) => listeners.forEach((fn) => fn(items, added));

  return {
    getItems: () => items,
    unreadCount: () => items.filter((n) => !n.read).length,
    notify(text, { kind = 'info', href = null } = {}) {
      const item = { id: ++seq, text: String(text), kind, href, at: now(), read: false };
      items = [item, ...items].slice(0, MAX_ITEMS);
      emit(item);
      return item;
    },
    markAllRead() {
      if (!items.some((n) => !n.read)) return;
      items = items.map((n) => ({ ...n, read: true }));
      emit();
    },
    clear() {
      items = [];
      emit();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export const notifications = createNotifications();
export const notify = (text, options) => notifications.notify(text, options);
