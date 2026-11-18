// Профіль: ім'я, email, роль, вихід; «Мої зарядки»; очистка історії пошуку; скидання демо-даних.
import { h, formatDate } from '../ui.js';
import { notify } from '../notifications.js';
import { formatUAH, formatKwh } from '../pricing.js';
import { isoDay } from '../data.js';
import { signInPrompt } from './auth-modal.js';
import { logOut } from './auth-page.js';
import { pushState, enablePush, disablePush, PUSH_STATE_TEXT } from '../push.js';
import { supabaseConfig } from '../supabase-config.js';

// Блок «Сповіщення на пристрої»: стан, увімкнення й вимкнення push лише за кліком.
function pushCard(service) {
  const vapidKey = supabaseConfig.vapidPublicKey;
  const text = h('p', { class: 'muted' }, 'Перевіряємо…');
  const error = h('p', { class: 'field-error', role: 'alert', hidden: true });
  const button = h('button', { type: 'button', class: 'btn btn-secondary btn-sm', hidden: true });
  async function draw() {
    let state;
    try { state = service?.savePushSubscription ? await pushState({ vapidKey, service }) : 'unconfigured'; } catch { state = 'unsupported'; }
    text.textContent = PUSH_STATE_TEXT[state];
    button.hidden = !['on', 'off'].includes(state);
    button.textContent = state === 'on' ? 'Вимкнути' : 'Увімкнути';
    button.onclick = async () => {
      button.disabled = true;
      error.hidden = true;
      try {
        if (state === 'on') await disablePush({ service });
        else await enablePush({ service, vapidKey });
      } catch (e) {
        error.textContent = e?.code === 'denied' ? PUSH_STATE_TEXT.denied : 'Не вдалося змінити налаштування. Спробуйте ще раз.';
        error.hidden = false;
      } finally { button.disabled = false; void draw(); }
    };
  }
  void draw();
  return h('div', { class: 'card profile-card push-card' },
    h('h2', { class: 'panel-title' }, 'Сповіщення на пристрої'), text, button, error);
}

const ROLES = [['guest', '🔌 Шукаю зарядку'], ['host', '☀️ Маю енергію для продажу']];

const pad = (n) => String(n).padStart(2, '0');
function when(iso) {
  const d = new Date(iso);
  return `${formatDate(isoDay(0, d))}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function render(_params, root, store, session, userHistory, pilot) {
  let draft = null; // незбережені зміни переживають перемальовування від сесії
  let activeSection = 'account';

  // Для репетицій пітчу: скидає демо-дані, але не виходить з акаунта.
  const resetLink = () => h('p', { class: 'reset-demo' },
    h('button', { type: 'button', class: 'link-btn', onclick: () => {
      store.reset();
      location.hash = '#/';
      notify('Демо скинуто до початкового стану');
    } }, 'Скинути демо-дані'));

  const chargesBox = h('section', { class: 'card profile-card charges' });
  function drawCharges() {
    const { status, searches, charges } = userHistory.getState();
    const hasQueries = searches.some((r) => r.kind === 'query');
    let body;
    if (status === 'loading') body = h('p', { class: 'muted' }, 'Завантаження…');
    else if (status === 'error') {
      body = h('div', { class: 'charges-empty' },
        h('p', { class: 'muted' }, 'Не вдалося завантажити історію'),
        h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => userHistory.retry() }, 'Спробувати ще раз'));
    } else if (!charges.length) {
      body = h('div', { class: 'charges-empty' },
        h('p', { class: 'muted' }, 'Ви ще не заряджались'),
        h('a', { class: 'btn btn-primary', href: '#/map' }, 'Знайти розетку'));
    } else {
      body = h('ul', { class: 'charges-list' }, charges.map((c) =>
        h('li', { class: 'charge' },
          h('div', { class: 'charge-main' },
            h('b', {}, c.spot_title),
            h('span', { class: 'muted' }, `${c.district ? `${c.district} · ` : ''}${when(c.charged_at)}`),
            h('span', {}, `${formatKwh(c.kwh)} · ${formatUAH(c.total)}`)),
          h('a', { class: 'btn btn-secondary btn-sm', href: `#/spot/${c.spot_id}` }, 'Забронювати знову'))));
    }
    chargesBox.replaceChildren(...[
      h('h2', { class: 'panel-title' }, 'Мої зарядки'),
      body,
      hasQueries && h('button', { type: 'button', class: 'link-btn clear-searches', onclick: () => {
        userHistory.clearQueries();
        notify('Історію пошуку очищено');
      } }, 'Очистити історію пошуку'),
    ].filter(Boolean));
  }

  const pilotBox = h('div');
  const chatsBox = h('div');
  const drawPilot = () => {
    pilotBox.replaceChildren(pilot.panel());
    chatsBox.replaceChildren(pilot.chatsPanel());
  };
  function update() {
    const { status, user, profile } = session.getState();
    if (status === 'loading') {
      root.replaceChildren(h('div', { class: 'container gate muted' }, 'Завантаження…'));
      return;
    }
    if (status === 'demo') {
      root.replaceChildren(h('div', { class: 'container gate' }, h('div', { class: 'gate-card card' },
        h('span', { class: 'gate-icon' }, '🧪'), h('h1', {}, 'Демо-режим'),
        h('p', { class: 'muted' }, 'У демо-режимі профілю немає. Щоб створити акаунт, потрібен інтернет.')),
      resetLink()));
      return;
    }
    if (status !== 'signedIn') {
      draft = null;
      activeSection = 'account';
      const gate = signInPrompt({
        title: 'Профіль доступний після входу',
        text: 'Увійдіть або зареєструйтесь — це займе хвилину.',
        reason: 'Увійдіть, щоб відкрити профіль',
      }, session);
      gate.append(resetLink());
      root.replaceChildren(gate);
      return;
    }

    draft ??= { name: profile.name, role: profile.role };
    let errors = {};
    let busy = false;
    const box = h('div');

    function draw() {
      box.replaceChildren(
        h('dl', { class: 'account-details' },
          [['Ім’я', user.firstName], ['Прізвище', user.lastName], ['Електронна пошта', user.email]]
            .map(([label, value]) => h('div', {},
              h('dt', { class: 'field-label' }, label),
              h('dd', {}, value || 'Не вказано')))),
        h('label', { class: 'form-field' }, h('span', { class: 'field-label' }, 'Ім’я в WattWay'),
          h('input', { class: 'input', type: 'text', maxlength: 60, value: draft.name, disabled: busy,
            oninput: (e) => { draft.name = e.target.value; } }),
          errors.name && h('span', { class: 'field-error' }, errors.name)),
        h('div', { class: 'form-field' }, h('span', { class: 'field-label' }, 'Для чого вам WattWay?'),
          h('div', { class: 'role-choice' }, ROLES.map(([value, label]) =>
            h('button', { type: 'button', class: `chip${draft.role === value ? ' active' : ''}`, disabled: busy,
              onclick: () => { draft.role = value; draw(); } }, label))),
          errors.role && h('span', { class: 'field-error' }, errors.role)),
        h('div', { class: 'profile-actions' },
          h('button', { type: 'button', class: 'btn btn-ghost', disabled: busy, onclick: () => logOut(session) }, 'Вийти'),
          h('button', { type: 'button', class: 'btn btn-primary', disabled: busy, onclick: save }, busy ? 'Зачекайте…' : 'Зберегти')));
    }

    async function save() {
      busy = true;
      errors = {};
      draw();
      try {
        await session.saveProfile(draft);
        draft = null;
        notify('Профіль збережено');
      } catch (e) {
        if (e.code === 'invalid-profile') errors = e.errors;
        else notify('Не вдалося зберегти профіль — перевірте інтернет', { kind: 'error' });
      } finally {
        busy = false;
        if (draft) draw();
      }
    }

    draw();
    drawCharges();
    drawPilot();
    const account = h('div', {},
      h('div', { class: 'card profile-card' },
        h('div', { class: 'profile-head' },
          h('span', { class: 'avatar' }, (draft.name || user.email)[0].toUpperCase()),
          h('div', {}, h('h2', { class: 'panel-title' }, 'Дані профілю'), h('p', { class: 'muted' }, 'Ці дані бачите лише ви.'))),
        box),
      pushCard(session.service),
      resetLink());
    const sections = [
      ['account', 'Профіль', account],
      ['bookings', 'Бронювання', pilotBox],
      ['chats', 'Чати', chatsBox],
      ['charges', 'Історія зарядок', chargesBox],
    ];
    const menu = h('nav', { class: 'cabinet-menu card', 'aria-label': 'Меню особистого кабінету' });
    const content = h('div', { class: 'cabinet-content' });
    const items = sections.map(([id, label, body]) => {
      const panel = h('div', { id: `cabinet-${id}` }, body);
      const button = h('button', {
        type: 'button',
        class: 'cabinet-menu-item',
        'aria-controls': panel.id,
        onclick: () => { activeSection = id; showSection(); },
      }, label);
      menu.append(button);
      content.append(panel);
      return { id, panel, button };
    });
    function showSection() {
      for (const { id, panel, button } of items) {
        const selected = id === activeSection;
        panel.hidden = !selected;
        button.setAttribute('aria-pressed', String(selected));
      }
    }
    showSection();
    const siteMenu = h('nav', { class: 'cabinet-site-menu', 'aria-label': 'Основні розділи WattWay' },
      [['#/', 'Головна'], ['#/map', 'Карта зарядок'], ['#/host', 'Господар']]
        .map(([href, label]) => h('a', { class: 'btn btn-secondary btn-sm', href }, label)));
    root.replaceChildren(h('div', { class: 'container cabinet-page' },
      h('h1', {}, 'Особистий кабінет'),
      siteMenu,
      h('div', { class: 'cabinet-layout' }, menu, content)));
  }

  update();
  const offSession = session.subscribe(update);
  const offPilot = pilot.subscribe(drawPilot);
  const offHistory = userHistory.subscribe(drawCharges);
  return () => { offSession(); offHistory(); offPilot(); };
}

