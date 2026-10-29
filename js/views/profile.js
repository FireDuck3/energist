// Профіль: ім'я, email, роль, вихід.
import { h, toast } from '../ui.js';
import { signInPrompt } from './auth-modal.js';

const ROLES = [['guest', '🔌 Шукаю зарядку'], ['host', '☀️ Маю енергію для продажу']];

export function render(_params, root, _store, session) {
  let draft = null; // незбережені зміни переживають перемальовування від сесії

  function update() {
    const { status, user, profile } = session.getState();
    if (status === 'loading') {
      root.replaceChildren(h('div', { class: 'container gate muted' }, 'Завантаження…'));
      return;
    }
    if (status === 'demo') {
      root.replaceChildren(h('div', { class: 'container gate' }, h('div', { class: 'gate-card card' },
        h('span', { class: 'gate-icon' }, '🧪'), h('h1', {}, 'Демо-режим'),
        h('p', { class: 'muted' }, 'У демо-режимі профілю немає. Щоб створити акаунт, потрібен інтернет.'))));
      return;
    }
    if (status !== 'signedIn') {
      draft = null;
      root.replaceChildren(signInPrompt({
        title: 'Профіль доступний після входу',
        text: 'Увійдіть або зареєструйтесь — це займе хвилину.',
        reason: 'Увійдіть, щоб відкрити профіль',
      }, session));
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
    root.replaceChildren(h('div', { class: 'container profile-page' },
      h('div', { class: 'card profile-card' },
        h('div', { class: 'profile-head' },
          h('span', { class: 'avatar' }, (draft.name || user.email)[0].toUpperCase()),
          h('div', {}, h('h1', {}, 'Профіль'), h('p', { class: 'muted' }, 'Ці дані бачите лише ви.'))),
        box)));
  }

  update();
  return session.subscribe(update);
}
