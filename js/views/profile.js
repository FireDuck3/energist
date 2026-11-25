// Профіль: ім'я, email, роль, вихід; «Мої зарядки»; очистка історії пошуку; скидання демо-даних.
import { h, formatDate } from '../ui.js';
import { notify } from '../notifications.js';
import { validatePhone } from '../validate.js';
import { formatUAH, formatKwh } from '../pricing.js';
import { isoDay } from '../data.js';
import { signInPrompt } from './auth-modal.js';
import { logOut } from './auth-page.js';
import { pushState, enablePush, disablePush, PUSH_STATE_TEXT, pushErrorText } from '../push.js';
import { supabaseConfig } from '../supabase-config.js';
import { icon } from '../icons.js';

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
        error.textContent = pushErrorText(e?.code);
        error.hidden = false;
      } finally { button.disabled = false; void draw(); }
    };
  }
  void draw();
  return h('div', { class: 'card profile-card push-card' },
    h('h2', { class: 'panel-title' }, 'Сповіщення на пристрої'), text, button, error);
}

// «Ваша ціль» з макета: збігається з ролями профілю й режимами сайту.
const GOALS = [['guest', 'plug', 'Знайти розетку'], ['host', 'sun', 'Здати свою енергію']];

const pad = (n) => String(n).padStart(2, '0');
function when(iso) {
  const d = new Date(iso);
  return `${formatDate(isoDay(0, d))}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function render(_params, root, store, session, userHistory, pilot) {
  let draft = null; // незбережені зміни переживають перемальовування від сесії
  let phoneSaved; // телефон після збереження: сесія тримає профіль без нього
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
        h('span', { class: 'gate-icon' }, icon('flask', { size: 40 })), h('h1', {}, 'Демо-режим'),
        h('p', { class: 'muted' }, 'У демо-режимі профілю немає. Щоб створити акаунт, потрібен інтернет.')),
      resetLink()));
      return;
    }
    if (status !== 'signedIn') {
      draft = null;
      phoneSaved = undefined;
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

    draft ??= { name: profile.name, role: profile.role, phone: phoneSaved ?? profile.phone ?? '' };
    let errors = {};
    let busy = false;
    const box = h('div');

    function draw() {
      box.replaceChildren(
        h('label', { class: 'form-field' }, h('span', { class: 'field-label' }, 'Юзернейм'),
          h('input', { class: 'input', type: 'text', maxlength: 60, value: draft.name, disabled: busy,
            oninput: (e) => { draft.name = e.target.value; } }),
          h('span', { class: 'hint' }, 'Так вас бачать інші учасники WattWay.'),
          errors.name && h('span', { class: 'field-error' }, errors.name)),
        h('label', { class: 'form-field' }, h('span', { class: 'field-label' }, 'Телефон'),
          h('input', { class: 'input', type: 'tel', autocomplete: 'tel', maxlength: 25, value: draft.phone ?? '', disabled: busy,
            placeholder: '+380 67 123 45 67', oninput: (e) => { draft.phone = e.target.value; } }),
          h('span', { class: 'hint' }, 'Бачать лише гості з підтвердженим бронюванням ваших точок.'),
          errors.phone && h('span', { class: 'field-error' }, errors.phone)),
        h('div', { class: 'form-field' }, h('span', { class: 'field-label' }, 'Ваша ціль'),
          h('div', { class: 'goal-choice' }, GOALS.map(([value, iconName, label]) =>
            h('button', { type: 'button', class: `goal-option${draft.role === value ? ' active' : ''}`, disabled: busy,
              'aria-pressed': String(draft.role === value), onclick: () => { draft.role = value; draw(); } },
            icon(iconName, { size: 20 }), label))),
          errors.role && h('span', { class: 'field-error' }, errors.role)),
        h('div', { class: 'profile-actions' },
          h('button', { type: 'button', class: 'btn btn-ghost profile-logout', disabled: busy, onclick: () => logOut(session) }, 'Вийти'),
          h('button', { type: 'button', class: 'btn btn-paper', disabled: busy, onclick: save }, busy ? 'Зачекайте…' : 'Зберегти')));
    }

    async function save() {
      busy = true;
      errors = {};
      draw();
      try {
        const phone = validatePhone(draft.phone);
        if (!phone.ok) {
          errors = { phone: phone.error };
          return;
        }
        if (phone.phone !== (phoneSaved ?? profile.phone ?? null)) {
          await session.service.savePhone(user.uid, phone.phone);
          phoneSaved = phone.phone;
        }
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
        // Як у макеті: аватар, ім'я та прізвище з реєстрації й пошта.
        h('div', { class: 'profile-head' },
          h('span', { class: 'avatar profile-avatar' }, (draft.name || user.email)[0].toUpperCase()),
          h('div', { class: 'profile-who' },
            h('h2', { class: 'profile-name' }, [user.firstName, user.lastName].filter(Boolean).join(' ') || draft.name),
            h('span', { class: 'profile-email' }, user.email))),
        box),
      pushCard(session.service),
      h('p', { class: 'profile-privacy' }, 'Хто бачить ваші дані й як їх видалити — у ',
        h('a', { href: '#/privacy' }, 'Політиці конфіденційності'), '.'),
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

