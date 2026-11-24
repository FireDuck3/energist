import { createPilot } from './pilot.js';
import * as chats from './views/chats.js';
import { unreadLabel } from './chats.js';
// Точка входу: store, сесія, шапка, маршрути.
import { createStore, safeLocalStorage, memoryStorage } from './store.js';
import { createSession } from './auth.js';
import { loadSupabase } from './supabase.js';
import { createUserHistory } from './user-history.js';
import { startRouter, currentPath } from './router.js';
import { h, installRipple } from './ui.js';
import { logoMark, icon, withIcon } from './icons.js';
import { notifications, notify } from './notifications.js';
import * as landing from './views/landing.js';
import * as map from './views/map.js';
import * as spot from './views/spot.js';
import * as host from './views/host.js';
import * as profile from './views/profile.js';
import * as bookings from './views/bookings.js';
import * as admin from './views/admin.js';
import { MODES, navFor, homeFor, modeForPath, chooseMode } from './mode.js';
import { openAuthModal } from './views/auth-modal.js';
import { loginPage, signupPage, logOut } from './views/auth-page.js';
import { createBell } from './views/bell.js';

export const store = createStore(safeLocalStorage() ?? memoryStorage());
export const session = createSession(loadSupabase);
// Вийшли з акаунта (напр., на спільному ноутбуці пітчу) — прибираємо і запит у полі пошуку.
export const userHistory = createUserHistory(session, { onReset: () => store.setFilters({ query: '' }) });

const pilot = createPilot(session, store);
// Бейджі непрочитаних у шапці й нижніх вкладках оновлюються разом із чатами.
pilot.subscribe(() => { renderHeader(); renderTabbar(); });
const view = (mod) => (params, root) => mod.render(params, root, store, session, userHistory, pilot);

const signIn = () => session.requireAuth(() => {}, '');
// Один дзвіночок на весь сайт: шапка перемальовується, а він лише переставляється, тож список не закривається.
const bell = createBell(notifications);

function accountArea() {
  const { status, user } = session.getState();
  if (status === 'loading') return h('span', { class: 'account-placeholder', 'aria-hidden': 'true' });
  if (status === 'signedOut' || status === 'unavailable') {
    return h('span', { class: 'auth-buttons' },
      h('a', { class: 'btn btn-secondary btn-sm', href: '#/login' }, 'Увійти'),
      h('a', { class: 'btn btn-primary btn-sm', href: '#/signup' }, 'Реєстрація'));
  }
  if (status === 'needsProfile') {
    return h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: signIn },
      h('span', { class: 'label-long' }, 'Завершити профіль'), h('span', { class: 'label-short' }, 'Профіль'));
  }
  const demo = status === 'demo';
  const name = session.currentName();
  return h('details', { class: 'account' },
    h('summary', { class: 'account-button', 'aria-label': 'Меню акаунта' },
      h('span', { class: 'avatar avatar-sm' }, name[0].toUpperCase()),
      h('span', { class: 'account-name' }, demo ? `${name} (демо)` : name)),
    h('div', { class: 'account-menu card' },
      !demo && h('span', { class: 'account-email muted' }, user.email),
      h('a', { href: '#/profile', onclick: (e) => e.target.closest('details').open = false }, demo ? 'Профіль' : 'Профіль і зарядки'),
      // Лише посилання: доступ до даних адмінки перевіряє сервер.
      !demo && user?.isAdmin && h('a', { href: '#/admin', onclick: (e) => e.target.closest('details').open = false }, withIcon('shield', 'Адмінпанель')),
      h('button', { type: 'button', onclick: () => (demo ? location.reload() : logOut(session)) },
        demo ? 'Вийти з демо-режиму' : 'Вийти')));
}

// Перемикання режиму: інший набір розділів і своя головна.
function switchMode(mode) {
  location.hash = chooseMode(mode, { store, session });
}

function renderHeader() {
  const { blackout, mode } = store.getState();
  const path = currentPath();
  const signedIn = session.getState().status === 'signedIn';
  const unread = pilot.totalUnread();
  // Профіль — у меню акаунта; чати й бронювання мають сенс лише після входу.
  const links = !mode ? [] : navFor(mode).filter(([href]) => href !== '#/profile' && (signedIn || href === '#/map' || href === '#/host'));

  document.getElementById('site-header').replaceChildren(
    h('div', { class: 'container header-inner' },
      h('a', { class: 'logo', href: homeFor(mode), 'aria-label': 'Wattway — на головну' }, logoMark()),
      mode && h('nav', { class: 'segmented mode-switch', 'aria-label': 'Режим' },
        ['guest', 'host'].map((m) => h('button', { type: 'button', class: `segment${mode === m ? ' active' : ''}`,
          'aria-pressed': String(mode === m), 'aria-label': MODES[m].label, title: MODES[m].label, onclick: () => switchMode(m) },
        icon(MODES[m].icon, { size: 18 }), h('span', { class: 'mode-label' }, MODES[m].short)))),
      h('div', { class: 'header-right' },
        h('nav', { class: 'header-nav', 'aria-label': 'Розділи' }, links.map(([href, , label, isActive]) =>
          h('a', { class: `nav-link${isActive(path) ? ' active' : ''}`, href, 'aria-current': isActive(path) ? 'page' : null },
            label, href === '#/chats' && unread > 0 && h('span', { class: 'unread-badge' }, unreadLabel(unread))))),
        h('label', { class: 'switch', title: 'Режим блекауту' },
          h('input', { type: 'checkbox', checked: blackout, 'aria-label': 'Режим блекауту', onchange: (e) => store.setBlackout(e.target.checked) }),
          h('span', { class: 'switch-track' }, h('span', { class: 'switch-thumb' })),
          // Як у макеті: сонце — світла тема, місяць — темна (режим блекауту).
          h('span', { class: 'switch-icon', 'aria-hidden': 'true' }, icon(blackout ? 'moon' : 'sun', { size: 22 })),
          h('span', { class: 'switch-label' }, 'Блекаут')),
        bell.el,
        accountArea())));
}

function applyTheme() {
  document.body.classList.toggle('blackout', store.getState().blackout);
}

store.subscribe(() => {
  applyTheme();
  renderHeader();
  renderTabbar();
});
session.subscribe(() => {
  // Режим ще не обрано, а в профілі є роль із реєстрації — беремо її.
  const { status, profile: saved } = session.getState();
  if (status === 'signedIn' && !store.getState().mode && (saved?.role === 'host' || saved?.role === 'guest')) store.setMode(saved.role);
  renderHeader();
  renderTabbar();
});
session.onNeedAuth((reason) => openAuthModal(session, { reason }));

// Нижня панель вкладок — лише на телефоні (CSS ховає її на ширших екранах). Набір залежить від режиму;
// на екрані вибору режиму панелі немає.
const tabbar = h('nav', { class: 'tabbar', 'aria-label': 'Розділи' });
document.body.append(tabbar);
function renderTabbar() {
  const path = currentPath();
  const { mode } = store.getState();
  tabbar.hidden = !mode || path === '/';
  document.body.classList.toggle('no-tabbar', tabbar.hidden);
  tabbar.replaceChildren(...navFor(mode).map(([href, iconName, label, isActive]) =>
    h('a', { class: `tab${isActive(path) ? ' active' : ''}`, href, 'aria-current': isActive(path) ? 'page' : null },
      h('span', { class: 'tab-icon', 'aria-hidden': 'true' }, icon(iconName, { size: 22 }),
        href === '#/chats' && pilot.totalUnread() > 0 && h('span', { class: 'tab-badge' }, unreadLabel(pilot.totalUnread()))),
      h('span', { class: 'tab-label' }, label))));
}

applyTheme();
installRipple();
// Повторний візит: режим уже обрано — одразу його головна, без екрана вибору.
// replaceState не шле hashchange, тож роутер нижче одразу відкриє потрібну сторінку один раз.
if (currentPath() === '/' && store.getState().mode) history.replaceState(null, '', homeFor(store.getState().mode));
const appRoot = document.getElementById('app');
const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
startRouter({
  '/': view(landing),
  '/map': view(map),
  '/spot/:id': view(spot),
  '/host': view(host),
  '/host/bookings': view({ render: bookings.renderHost }),
  '/bookings': view(bookings),
  '/profile': view(profile),
  '/chats': view(chats),
  '/chats/:id': view(chats),
  '/admin': view(admin),
  '/admin/:tab': view(admin),
  '/login': view({ render: loginPage }),
  '/signup': view({ render: signupPage }),
}, appRoot, {
  onChange(path) {
    // Нова сторінка плавно проявляється. Лише прозорість: transform зсунув би fixed-панелі всередині.
    if (!calm.matches) appRoot.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 280, easing: 'ease-out' });
    const mode = modeForPath(path);
    if (mode && mode !== store.getState().mode) store.setMode(mode); // перемалює шапку й вкладки
    else { renderHeader(); renderTabbar(); }
  },
});

// OAuth reloads the document, so resume at the saved route and finish a new profile.
session.ready.then(() => {
  const result = session.service?.oauthResult;
  if (!result?.returned) return;
  const state = session.getState();
  if (result.error || state.error) openAuthModal(session, { error: result.error ?? state.error });
  else if (state.status === 'needsProfile') openAuthModal(session, { mode: 'profile' });
});
