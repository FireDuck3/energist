// Точка входу: store, сесія, шапка, маршрути.
import { createStore, safeLocalStorage, memoryStorage } from './store.js';
import { createSession } from './auth.js';
import { loadSupabase } from './supabase.js';
import { createUserHistory } from './user-history.js';
import { startRouter, currentPath } from './router.js';
import { h, toast } from './ui.js';
import * as landing from './views/landing.js';
import * as map from './views/map.js';
import * as spot from './views/spot.js';
import * as host from './views/host.js';
import * as calculator from './views/calculator.js';
import * as profile from './views/profile.js';
import { openAuthModal } from './views/auth-modal.js';

export const store = createStore(safeLocalStorage() ?? memoryStorage());
export const session = createSession(loadSupabase);
export const userHistory = createUserHistory(session);

const view = (mod) => (params, root) => mod.render(params, root, store, session, userHistory);

const signIn = () => session.requireAuth(() => {}, '');

function accountArea() {
  const { status, user } = session.getState();
  if (status === 'loading') return h('span', { class: 'account-placeholder', 'aria-hidden': 'true' });
  if (status === 'signedOut' || status === 'unavailable') {
    return h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: signIn }, 'Увійти');
  }
  if (status === 'needsProfile') {
    return h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: signIn }, 'Завершити профіль');
  }
  const demo = status === 'demo';
  const name = session.currentName();
  return h('details', { class: 'account' },
    h('summary', { class: 'account-button', 'aria-label': 'Меню акаунта' },
      h('span', { class: 'avatar avatar-sm' }, name[0].toUpperCase()),
      h('span', { class: 'account-name' }, demo ? `${name} (демо)` : name)),
    h('div', { class: 'account-menu card' },
      !demo && h('span', { class: 'account-email muted' }, user.email),
      !demo && h('a', { href: '#/profile', onclick: (e) => e.target.closest('details').open = false }, 'Профіль і зарядки'),
      h('button', { type: 'button', onclick: () => (demo ? location.reload() : session.service.signOut().catch(() => toast('Не вдалося вийти — перевірте інтернет'))) },
        demo ? 'Вийти з демо-режиму' : 'Вийти')));
}

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
          h('span', { class: 'switch-label' }, '⚡ Блекаут')),
        accountArea())));
}

function applyTheme() {
  document.body.classList.toggle('blackout', store.getState().blackout);
}

store.subscribe(() => {
  applyTheme();
  renderHeader();
});
session.subscribe(renderHeader);
session.onNeedAuth((reason) => openAuthModal(session, { reason }));

// Нижня панель вкладок — лише на телефоні (CSS ховає її на ширших екранах).
const TABS = [
  ['#/map', '🔌', 'Зарядка', (p) => p.startsWith('/map') || p.startsWith('/spot')],
  ['#/host', '☀️', 'Господар', (p) => p.startsWith('/host')],
  ['#/calc', '🧮', 'Калькулятор', (p) => p === '/calc'],
  ['#/profile', '👤', 'Профіль', (p) => p.startsWith('/profile')],
];
const tabbar = h('nav', { class: 'tabbar', 'aria-label': 'Розділи' });
document.body.append(tabbar);
function renderTabbar() {
  const path = currentPath();
  tabbar.replaceChildren(...TABS.map(([href, icon, label, isActive]) =>
    h('a', { class: `tab${isActive(path) ? ' active' : ''}`, href, 'aria-current': isActive(path) ? 'page' : null },
      h('span', { class: 'tab-icon', 'aria-hidden': 'true' }, icon),
      h('span', { class: 'tab-label' }, label))));
}

applyTheme();
startRouter({
  '/': view(landing),
  '/map': view(map),
  '/spot/:id': view(spot),
  '/host': view(host),
  '/calc': view(calculator),
  '/profile': view(profile),
}, document.getElementById('app'), {
  onChange(path) {
    renderTabbar();
    const role = path.startsWith('/host') ? 'host' : (path.startsWith('/map') || path.startsWith('/spot')) ? 'guest' : null;
    if (role && role !== store.getState().role) store.setRole(role);
    else renderHeader();
  },
});
