// Точка входу: store, шапка, маршрути.
import { createStore, safeLocalStorage, memoryStorage } from './store.js';
import { startRouter, currentPath } from './router.js';
import { h, toast } from './ui.js';
import * as landing from './views/landing.js';
import * as map from './views/map.js';
import * as spot from './views/spot.js';
import * as host from './views/host.js';
import * as calculator from './views/calculator.js';

export const store = createStore(safeLocalStorage() ?? memoryStorage());

const view = (mod) => (params, root) => mod.render(params, root, store);

function renderHeader() {
  const { blackout } = store.getState();
  const path = currentPath();
  const isHost = path.startsWith('/host');
  const isGuest = path.startsWith('/map') || path.startsWith('/spot');
  const roleBtn = (label, active, href) =>
    h('a', { class: `segment${active ? ' active' : ''}`, href }, label);

  document.getElementById('site-header').replaceChildren(
    h('div', { class: 'container header-inner' },
      h('a', { class: 'logo', href: '#/' },
        h('span', { class: 'logo-mark' }, '⚡'), h('span', {}, 'Енер', h('b', {}, 'Гість'))),
      h('nav', { class: 'segmented', 'aria-label': 'Роль' },
        roleBtn('Я шукаю зарядку', isGuest, '#/map'),
        roleBtn('Я ділюсь енергією', isHost, '#/host')),
      h('div', { class: 'header-right' },
        h('a', { class: `nav-link${path === '/calc' ? ' active' : ''}`, href: '#/calc' }, 'Калькулятор'),
        h('label', { class: 'switch', title: 'Режим блекауту' },
          h('input', { type: 'checkbox', checked: blackout, onchange: (e) => store.setBlackout(e.target.checked) }),
          h('span', { class: 'switch-track' }, h('span', { class: 'switch-thumb' })),
          h('span', { class: 'switch-label' }, '⚡ Блекаут')))));
}

function applyTheme() {
  document.body.classList.toggle('blackout', store.getState().blackout);
}

store.subscribe(() => {
  applyTheme();
  renderHeader();
});

document.getElementById('reset-demo').addEventListener('click', () => {
  store.reset();
  location.hash = '#/';
  toast('Демо скинуто до початкового стану');
});

applyTheme();
startRouter({
  '/': view(landing),
  '/map': view(map),
  '/spot/:id': view(spot),
  '/host': view(host),
  '/calc': view(calculator),
}, document.getElementById('app'), {
  onChange(path) {
    const role = path.startsWith('/host') ? 'host' : (path.startsWith('/map') || path.startsWith('/spot')) ? 'guest' : null;
    if (role && role !== store.getState().role) store.setRole(role);
    else renderHeader();
  },
});
