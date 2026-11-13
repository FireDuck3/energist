// Дзвіночок у шапці — єдине місце, де видно сповіщення: лічильник непрочитаних і список під кліком.
// Елемент створюється один раз і переставляється в шапку при кожному її перемальовуванні,
// тож відкритий список не закривається, коли змінюється стан сайту.
import { h } from '../ui.js';

const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
  + '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>';

const pad = (n) => String(n).padStart(2, '0');

// «щойно», «5 хв тому», далі — годинник.
export function timeAgo(at, now = new Date()) {
  const minutes = Math.floor((now - at) / 60000);
  if (minutes < 1) return 'щойно';
  if (minutes < 60) return `${minutes} хв тому`;
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

export function createBell(notifications, { doc = document } = {}) {
  const count = h('span', { class: 'bell-count', 'aria-hidden': 'true', hidden: true });
  const button = h('button', { type: 'button', class: 'bell-button', 'aria-expanded': 'false', 'aria-haspopup': 'true',
    onclick: () => setOpen(!open) }, h('span', { class: 'bell-icon', html: ICON }), count);
  const list = h('ul', { class: 'bell-list' });
  const clearBtn = h('button', { type: 'button', class: 'link-btn', onclick: () => notifications.clear() }, 'Очистити');
  const panel = h('div', { class: 'bell-panel card', role: 'region', 'aria-label': 'Сповіщення', hidden: true },
    h('div', { class: 'bell-head' }, h('b', {}, 'Сповіщення'), clearBtn),
    list);
  const el = h('div', { class: 'bell' }, button, panel);
  // Для читачів екрана: нове сповіщення промовляється, але на екрані нічого не спливає.
  const live = h('span', { class: 'sr-only', 'aria-live': 'polite' });
  doc.body.append(live);

  let open = false;
  let fresh = new Set(); // що було непрочитаним на момент відкриття — підсвічуємо в списку

  function draw() {
    const items = notifications.getItems();
    const unread = notifications.unreadCount();
    count.hidden = !unread;
    count.textContent = unread > 9 ? '9+' : String(unread);
    button.setAttribute('aria-label', unread ? `Сповіщення, непрочитаних: ${unread}` : 'Сповіщення');
    clearBtn.hidden = !items.length;
    if (!open) return;
    const now = new Date();
    list.replaceChildren(...(items.length
      ? items.map((n) => {
        const body = [h('span', { class: 'bell-text' }, n.text), h('span', { class: 'bell-time' }, timeAgo(n.at, now))];
        const cls = ['bell-item', n.kind === 'error' && 'bell-item-error', fresh.has(n.id) && 'bell-item-new'].filter(Boolean).join(' ');
        return h('li', { class: cls }, n.href
          ? h('a', { class: 'bell-link', href: n.href, onclick: () => setOpen(false) }, body)
          : h('div', { class: 'bell-link' }, body));
      })
      : [h('li', { class: 'bell-empty muted' }, 'Сповіщень немає')]));
  }

  function setOpen(value) {
    open = value;
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) {
      fresh = new Set(notifications.getItems().filter((n) => !n.read).map((n) => n.id));
      notifications.markAllRead();
    } else fresh = new Set();
    draw();
  }

  function ring() {
    button.classList.remove('bell-ring');
    void button.offsetWidth; // перезапуск анімації, якщо сповіщення йдуть одне за одним
    button.classList.add('bell-ring');
  }
  button.addEventListener('animationend', () => button.classList.remove('bell-ring'));

  const onDown = (e) => { if (open && !el.contains(e.target)) setOpen(false); };
  const onKey = (e) => { if (open && e.key === 'Escape') { setOpen(false); button.focus(); } };
  doc.addEventListener('pointerdown', onDown);
  doc.addEventListener('keydown', onKey);

  const off = notifications.subscribe((_items, added) => {
    if (added) {
      live.textContent = added.text;
      if (open) {
        fresh.add(added.id);
        notifications.markAllRead(); // перемалює список
        return;
      }
      ring();
    }
    draw();
  });

  draw();
  return {
    el,
    setOpen,
    destroy() {
      off();
      doc.removeEventListener('pointerdown', onDown);
      doc.removeEventListener('keydown', onKey);
      live.remove();
      el.remove();
    },
  };
}
