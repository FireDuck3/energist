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
  const overlay = h('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) close(); } }, dialog);
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

const COVERS = { solar: 'assets/house-ses.jpg', battery: 'assets/apartment.jpg', grid: 'assets/ev-charging.jpg' };
export function spotCover(spot) {
  return COVERS[spot.source];
}
