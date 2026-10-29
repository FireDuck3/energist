// Дрібні DOM-хелпери, спільні для всіх екранів.

// h('button', { class: 'btn', onclick: fn }, 'Текст', childNode, [масив], null)
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value == null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'html') el.innerHTML = value;
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, value);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) append(el, child);
    else el.append(child instanceof Node ? child : String(child));
  }
}

// Модалка з фоном, кнопкою ×, Esc і кліком повз вікно. body — куди класти вміст.
export function openModal(content, { onClose, className = '' } = {}) {
  const body = h('div', { class: 'modal-body' }, content);
  const dialog = h('div', { class: `modal ${className}`, role: 'dialog', 'aria-modal': 'true' },
    h('button', { class: 'modal-close', type: 'button', 'aria-label': 'Закрити', onclick: () => close() }, '×'),
    body);
  // Закриваємо лише справжній клік по фону: якщо натиснули у вікні (напр., тягнули карту) і відпустили
  // на фоні, браузер шле click на фон — такий «клік» ігноруємо.
  let downOnOverlay = false;
  const overlay = h('div', {
    class: 'modal-overlay',
    onpointerdown: (e) => { downOnOverlay = e.target === overlay; },
    onclick: (e) => { if (e.target === overlay && downOnOverlay) close(); },
  }, dialog);
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  let closed = false;

  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    document.body.classList.remove('modal-open');
    overlay.remove();
    onClose?.();
  }

  document.addEventListener('keydown', onKey);
  document.body.classList.add('modal-open');
  document.body.append(overlay);
  return { close, body, setContent: (node) => body.replaceChildren(node) };
}

export function toast(text) {
  const el = h('div', { class: 'toast' }, text);
  document.getElementById('toast-root').append(el);
  setTimeout(() => el.classList.add('toast-hide'), 2600);
  setTimeout(() => el.remove(), 3000);
}

export function stars(rating, count) {
  return h('span', { class: 'rating', title: `Рейтинг ${rating}` },
    h('span', { class: 'rating-star' }, '★'), ' ', rating ? String(rating).replace('.', ',') : 'новий',
    count != null ? h('span', { class: 'muted' }, ` (${count})`) : null);
}

const MONTHS = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'];
// '2026-10-30' → '30 жов'
export function formatDate(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

export function monthLabel(date) {
  return MONTHS[date.getMonth()];
}

// plural(5, ['точка', 'точки', 'точок']) → 'точок'
export function plural(n, [one, few, many]) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const COVERS = { solar: 'assets/house-ses.jpg', battery: 'assets/apartment.jpg', grid: 'assets/ev-charging.jpg' };
export function spotCover(spot) {
  return COVERS[spot.source];
}
