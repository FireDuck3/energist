// Профіль: ім'я, email, роль, вихід; «Мої зарядки»; очистка історії пошуку; скидання демо-даних.
import { h, toast, formatDate } from '../ui.js';
import { formatUAH, formatKwh } from '../pricing.js';
import { isoDay } from '../data.js';
import { signInPrompt } from './auth-modal.js';

const ROLES = [['guest', '🔌 Шукаю зарядку'], ['host', '☀️ Маю енергію для продажу']];

const pad = (n) => String(n).padStart(2, '0');
function when(iso) {
  const d = new Date(iso);
  return `${formatDate(isoDay(0, d))}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function render(_params, root, store, session, userHistory) {
  let draft = null; // незбережені зміни переживають перемальовування від сесії

  // Для репетицій пітчу: скидає демо-дані, але не виходить з акаунта.
  const resetLink = () => h('p', { class: 'reset-demo' },
    h('button', { type: 'button', class: 'link-btn', onclick: () => {
      store.reset();
      location.hash = '#/';
      toast('Демо скинуто до початкового стану');
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
        toast('Історію пошуку очищено');
      } }, 'Очистити історію пошуку'),
    ].filter(Boolean));
  }

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
        h('label', { class: 'form-field' }, h('span', { class: 'field-label' }, 'Ім\'я'),
          h('input', { class: 'input', type: 'text', maxlength: 60, value: draft.name, disabled: busy,
            oninput: (e) => { draft.name = e.target.value; } }),
          errors.name && h('span', { class: 'field-error' }, errors.name)),
        h('div', { class: 'form-field' }, h('span', { class: 'field-label' }, 'Email'), h('span', {}, user.email)),
        h('div', { class: 'form-field' }, h('span', { class: 'field-label' }, 'Для чого вам ЕнерГість?'),
          h('div', { class: 'role-choice' }, ROLES.map(([value, label]) =>
            h('button', { type: 'button', class: `chip${draft.role === value ? ' active' : ''}`, disabled: busy,
              onclick: () => { draft.role = value; draw(); } }, label))),
          errors.role && h('span', { class: 'field-error' }, errors.role)),
        h('div', { class: 'profile-actions' },
          h('button', { type: 'button', class: 'btn btn-ghost', disabled: busy, onclick: () => {
            session.service.signOut().catch(() => toast('Не вдалося вийти — перевірте інтернет'));
          } }, 'Вийти'),
          h('button', { type: 'button', class: 'btn btn-primary', disabled: busy, onclick: save }, busy ? 'Зачекайте…' : 'Зберегти')));
    }

    async function save() {
      busy = true;
      errors = {};
      draw();
      try {
        await session.saveProfile(draft);
        draft = null;
        toast('Профіль збережено');
      } catch (e) {
        if (e.code === 'invalid-profile') errors = e.errors;
        else toast('Не вдалося зберегти — перевірте інтернет');
      } finally {
        busy = false;
        if (draft) draw();
      }
    }

    draw();
    drawCharges();
    root.replaceChildren(h('div', { class: 'container profile-page' },
      h('div', { class: 'card profile-card' },
        h('div', { class: 'profile-head' },
          h('span', { class: 'avatar' }, (draft.name || user.email)[0].toUpperCase()),
          h('div', {}, h('h1', {}, 'Профіль'), h('p', { class: 'muted' }, 'Ці дані бачите лише ви.'))),
        box),
      chargesBox,
      resetLink()));
  }

  update();
  const offSession = session.subscribe(update);
  const offHistory = userHistory.subscribe(drawCharges);
  return () => { offSession(); offHistory(); };
}
