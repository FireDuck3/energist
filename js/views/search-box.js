// Поле пошуку точок з підказками: нещодавні запити й переглянуті точки.
import { h } from '../ui.js';
import { recentQueries, recentSpots } from '../history.js';
import { normalizeQuery } from '../filters.js';

export function searchBox(store, userHistory) {
  const input = h('input', {
    type: 'search', class: 'input search-input', placeholder: 'Район або назва точки',
    'aria-label': 'Пошук точок', autocomplete: 'off', enterkeyhint: 'search',
  });
  const clear = h('button', { type: 'button', class: 'search-clear', 'aria-label': 'Очистити пошук', hidden: true }, '×');
  const panel = h('div', { class: 'search-panel card', hidden: true });
  const el = h('div', { class: 'search' }, h('span', { class: 'search-icon', 'aria-hidden': 'true' }, '🔍'), input, clear, panel);
  let focused = false;

  const apply = (q) => store.setFilters({ query: q });
  const save = (q) => { if (q.trim()) userHistory.recordQuery(q); };
  const close = () => { focused = false; panel.hidden = true; };
  const isPhone = () => window.matchMedia('(max-width: 768px)').matches;

  function choose(q) {
    input.value = q;
    clear.hidden = !q;
    apply(q);
    save(q);
    close();
    input.blur();
  }

  function draw() {
    if (!focused) return close();
    const { status, searches } = userHistory.getState();
    const typed = normalizeQuery(input.value);
    const queries = recentQueries(searches).filter((q) => !typed || normalizeQuery(q).includes(typed));
    const spots = typed ? [] : recentSpots(searches, store.getState().spots);
    const sections = [];

    if (status === 'off' && !typed) {
      sections.push(h('p', { class: 'search-hint muted' }, 'Увійдіть, щоб зберігати історію пошуку'));
    }
    if (queries.length) {
      sections.push(h('div', { class: 'search-section' },
        h('div', { class: 'search-head' }, h('span', {}, 'Нещодавні пошуки'),
          h('button', { type: 'button', class: 'link-btn', onclick: () => { userHistory.clearQueries(); input.focus(); } }, 'Очистити')),
        queries.map((q) => h('div', { class: 'search-item' },
          h('button', { type: 'button', class: 'search-pick', onclick: () => choose(q) }, h('span', { 'aria-hidden': 'true' }, '🕘'), q),
          h('button', { type: 'button', class: 'search-remove', 'aria-label': `Видалити «${q}» з історії`,
            onclick: () => { userHistory.removeQuery(q); input.focus(); } }, '×')))));
    }
    if (spots.length) {
      sections.push(h('div', { class: 'search-section' },
        h('div', { class: 'search-head' }, h('span', {}, 'Нещодавно переглянуті')),
        spots.map((s) => h('a', { class: 'search-pick', href: `#/spot/${s.id}`, onclick: close },
          h('span', { 'aria-hidden': 'true' }, '📍'), h('span', {}, s.title, h('small', { class: 'muted' }, ` · ${s.district}`))))));
    }
    panel.replaceChildren(...sections);
    panel.hidden = sections.length === 0;
  }

  input.addEventListener('focus', () => {
    focused = true;
    draw();
    // На телефоні клавіатура закриває низ екрана — піднімаємо поле нагору, щоб підказки були видні.
    if (isPhone()) setTimeout(() => el.scrollIntoView({ block: 'start' }), 300);
  });
  input.addEventListener('input', () => { clear.hidden = !input.value; apply(input.value); draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); save(input.value); close(); input.blur(); }
    if (e.key === 'Escape') { close(); input.blur(); }
  });
  clear.addEventListener('click', () => { input.value = ''; clear.hidden = true; apply(''); input.focus(); });

  // Закриваємо підказки кліком поза полем.
  const onOutside = (e) => { if (!el.contains(e.target)) close(); };
  document.addEventListener('pointerdown', onOutside);
  const unsubscribe = userHistory.subscribe(draw);

  return {
    el,
    // Синхронізація з фільтрами (напр., «Скинути фільтри» очистило запит).
    update(filters) {
      if (document.activeElement !== input && input.value !== filters.query) input.value = filters.query;
      clear.hidden = !input.value;
    },
    destroy() {
      document.removeEventListener('pointerdown', onOutside);
      unsubscribe();
    },
  };
}
