// Сповіщення сайту: усе, що раніше спливало тостами, і серверні сповіщення про бронювання й чат
// збираються тут і показуються лише під дзвіночком у шапці (js/views/bell.js).
// Локальні живуть до перезавантаження сторінки; серверні щоразу приходять із бази (js/pilot.js).
const MAX_ITEMS = 30;

export function createNotifications({ now = () => new Date() } = {}) {
  // Новіші першими: { id, key, text, kind: 'info' | 'error', href, open, at, read, onRead }
  let items = [];
  let seq = 0;
  const gone = new Set(); // ключі очищених і витіснених — серверні не повертаються при наступному оновленні
  const listeners = new Set();
  const emit = (added = null) => listeners.forEach((fn) => fn(items, added));

  return {
    getItems: () => items,
    unreadCount: () => items.filter((n) => !n.read).length,
    // key — для серверних сповіщень: те саме сповіщення не дублюється при кожному оновленні.
    // open — дія по кліку (замість href); onRead — що зробити, коли людина його побачила.
    notify(text, { kind = 'info', href = null, open = null, key = null, at = now(), read = false, onRead = null } = {}) {
      if (key != null) {
        if (gone.has(key)) return null;
        const known = items.find((n) => n.key === key);
        if (known) {
          // Прочитали на іншому пристрої — знімаємо з лічильника; назад у «непрочитані» не повертаємо.
          if (read && !known.read) {
            items = items.map((n) => (n === known ? { ...n, read: true } : n));
            emit();
          }
          return known;
        }
      }
      const item = { id: ++seq, key, text: String(text), kind, href, open, at, read: Boolean(read), onRead };
      const sorted = [item, ...items].sort((a, b) => b.at - a.at);
      sorted.slice(MAX_ITEMS).forEach((n) => { if (n.key != null) gone.add(n.key); });
      items = sorted.slice(0, MAX_ITEMS);
      if (items.includes(item)) emit(item.read ? null : item);
      return item;
    },
    markAllRead() {
      const unread = items.filter((n) => !n.read);
      if (!unread.length) return;
      unread.forEach((n) => n.onRead?.());
      items = items.map((n) => (n.read ? n : { ...n, read: true }));
      emit();
    },
    clear() {
      items.forEach((n) => {
        if (!n.read) n.onRead?.();
        if (n.key != null) gone.add(n.key);
      });
      items = [];
      emit();
    },
    // Напр., серверні сповіщення попереднього акаунта після виходу.
    remove(predicate) {
      const kept = items.filter((n) => !predicate(n));
      if (kept.length === items.length) return;
      items = kept;
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
