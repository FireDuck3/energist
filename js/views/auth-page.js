// Окремі сторінки входу (#/login) і реєстрації (#/signup).
// Вікно входу (auth-modal.js) лишається для дій, що потребують акаунта посеред сценарію (бронювання).
import { h } from '../ui.js';
import { logoMark, icon, withIcon } from '../icons.js';
import { disablePush } from '../push.js';
import { notify } from '../notifications.js';
import { authErrorMessage } from '../auth.js';
import { validateLogin, validateSignup, displayName, homePath, failureAdvice } from '../auth-forms.js';
import { privacyNote } from './privacy.js';

const ROLES = [['guest', 'plug', 'Шукаю зарядку'], ['host', 'sun', 'Маю енергію для продажу']];
const TEXT = {
  signin: { title: 'Вхід', lead: 'Раді бачити вас знову', submit: 'Увійти' },
  signup: { title: 'Створити акаунт', lead: 'Реєстрація займає хвилину', submit: 'Створити акаунт' },
};

// Вихід: повідомлення і повернення на головну, де знову видно «Увійти» й «Реєстрація».
export async function logOut(session) {
  // Спільний пристрій: після виходу він не отримує push цього акаунта. Збій не заважає виходу.
  try { await disablePush({ service: session.service }); } catch { /* ігноруємо */ }
  return session.service.signOut()
    .then(() => { notify('Ви вийшли з акаунта'); location.hash = '#/'; })
    .catch(() => notify('Не вдалося вийти — перевірте інтернет', { kind: 'error' }));
}

export const loginPage = (_params, root, _store, session) => renderAuthPage('signin', root, session);
export const signupPage = (_params, root, _store, session) => renderAuthPage('signup', root, session);

function renderAuthPage(mode, root, session) {
  const st = { firstName: '', lastName: '', email: '', password: '', role: null, errors: {}, error: '', errorCode: '', busy: false };
  const text = TEXT[mode];
  let alive = true;

  const card = h('div', { class: 'auth-card card' });
  root.append(h('div', { class: 'container auth-page' }, card));

  function draw() {
    if (!alive) return;
    const { status } = session.getState();
    if (status === 'loading') return card.replaceChildren(h('p', { class: 'muted' }, 'Завантаження…'));
    if (status === 'signedIn' || status === 'demo') {
      return card.replaceChildren(h('span', { class: 'gate-icon' }, icon('circle-check', { size: 40 })),
        h('h1', {}, `Ви вже в акаунті, ${session.currentName()}`),
        h('a', { class: 'btn btn-primary btn-lg', href: homePath(session.getState().profile?.role) }, 'Перейти до роботи'),
        h('a', { class: 'btn btn-secondary', href: '#/profile' }, 'Мій профіль'));
    }
    if (status === 'needsProfile' && mode === 'signin') {
      return card.replaceChildren(h('span', { class: 'gate-icon' }, icon('user', { size: 40 })),
        h('h1', {}, 'Завершіть профіль'),
        h('p', { class: 'muted' }, 'Акаунт уже створено — лишилось вказати ім\'я та роль.'),
        h('button', { type: 'button', class: 'btn btn-primary btn-lg', onclick: () => session.requireAuth(() => {}, '') }, 'Продовжити'));
    }
    if (status === 'unavailable') {
      return card.replaceChildren(h('span', { class: 'gate-icon' }, icon('wifi-off', { size: 40 })),
        h('h1', {}, 'Вхід недоступний без інтернету'),
        h('p', { class: 'muted' }, 'Не вдалося з\'єднатися із сервером акаунтів. Можна продовжити в демо-режимі.'),
        h('button', { type: 'button', class: 'btn btn-primary btn-lg', onclick: () => session.enterDemo() }, 'Продовжити в демо-режимі'));
    }
    drawForm();
  }

  const input = (key, label, attrs, hint) => {
    const err = st.errors[key];
    const id = `auth-${mode}-${key}`;
    return h('div', { class: 'form-field' },
      h('label', { class: 'field-label', for: id }, label),
      h('input', { class: 'input', id, value: st[key], disabled: st.busy, 'aria-invalid': err ? 'true' : null,
        'aria-describedby': err ? `${id}-err` : null, ...attrs, oninput: (e) => { st[key] = e.target.value; } }),
      err ? h('span', { class: 'field-error', id: `${id}-err` }, err) : hint && h('span', { class: 'hint' }, hint));
  };

  function errorBlock() {
    if (!st.error) return null;
    const advice = failureAdvice(st.errorCode, mode);
    return h('div', { class: 'auth-error', role: 'alert' },
      h('span', {}, st.error),
      advice.link && h('a', { class: 'link-btn', href: advice.link.to }, advice.link.label),
      advice.demo && h('button', { type: 'button', class: 'link-btn', onclick: () => session.enterDemo() }, 'Продовжити в демо-режимі'));
  }

  function drawForm() {
    const signup = mode === 'signup';
    const form = h('form', { class: 'auth-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); submit(); } },
      signup && input('firstName', 'Ім’я', { type: 'text', autocomplete: 'given-name', maxlength: 60 }),
      signup && input('lastName', 'Прізвище', { type: 'text', autocomplete: 'family-name', maxlength: 60 }),
      input('email', 'Email', { type: 'email', autocomplete: 'email', placeholder: 'you@example.com' }),
      input('password', 'Пароль', { type: 'password', autocomplete: signup ? 'new-password' : 'current-password' }),
      signup && h('div', { class: 'form-field' },
        h('span', { class: 'field-label' }, 'Для чого вам WattWay?'),
        h('div', { class: 'role-choice' }, ROLES.map(([value, iconName, label]) =>
          h('button', { type: 'button', class: `chip${st.role === value ? ' active' : ''}`, disabled: st.busy,
            'aria-pressed': String(st.role === value), onclick: () => { st.role = value; draw(); } }, withIcon(iconName, label)))),
        st.errors.role && h('span', { class: 'field-error' }, st.errors.role)),
      errorBlock(),
      h('button', { type: 'submit', class: 'btn btn-primary btn-lg btn-block', disabled: st.busy }, st.busy ? 'Зачекайте…' : text.submit));
    // Вхід через Google відкриває сторінку Google і повертає на сайт уже із сесією (js/oauth.js).
    const google = session.service?.signInWithGoogle && [
      h('div', { class: 'auth-divider' }, 'або'),
      h('button', { type: 'button', class: 'btn btn-secondary btn-lg btn-block', disabled: st.busy, onclick: googleSignIn },
        signup ? 'Продовжити з Google' : 'Увійти через Google')];

    card.replaceChildren(
      h('div', { class: 'auth-brand' }, logoMark()),
      h('h1', {}, text.title),
      h('p', { class: 'muted auth-lead' }, text.lead),
      form,
      ...(google || []),
      privacyNote(),
      h('p', { class: 'auth-switch' },
        signup ? 'Вже є акаунт? ' : 'Ще немає акаунта? ',
        h('a', { href: signup ? '#/login' : '#/signup' }, signup ? 'Увійти' : 'Зареєструватися')));
    const bad = card.querySelector('[aria-invalid="true"]');
    (bad ?? card.querySelector('input:not([disabled])'))?.focus();
  }

  async function googleSignIn() {
    if (st.busy) return;
    st.busy = true;
    st.error = '';
    st.errors = {};
    draw();
    try {
      await session.service.signInWithGoogle();
    } catch (e) {
      st.error = authErrorMessage(e.code);
      st.errorCode = e.code ?? '';
    } finally {
      st.busy = false;
      draw();
    }
  }

  async function submit() {
    if (st.busy) return;
    const check = mode === 'signup' ? validateSignup(st) : validateLogin(st);
    st.errors = check.errors;
    st.error = '';
    st.errorCode = '';
    if (!check.ok) return draw();
    Object.assign(st, check.value);
    st.busy = true;
    draw();
    try {
      const svc = session.service;
      if (mode === 'signin') {
        await svc.signInWithPassword(st.email, st.password);
      } else if (session.getState().status !== 'needsProfile') { // після збою збереження профілю акаунт уже є
        await svc.signUpWithPassword(st.email, st.password, { firstName: st.firstName, lastName: st.lastName });
      }
      if (!(await session.waitForSignIn(10000))) {
        // Сесія відхилила вхід (напр., акаунт заблоковано) або сервер не відповів.
        throw Object.assign(new Error('timeout'), { code: session.getState().error ?? 'auth/network-request-failed' });
      }
      if (mode === 'signup') {
        try {
          await session.saveProfile({ name: displayName(st), role: st.role });
        } catch (e) {
          st.error = 'Акаунт створено, але профіль не збережено. Натисніть «Створити акаунт» ще раз';
          st.errorCode = e.code ?? '';
          return;
        }
      }
      // Вхід без профілю (реєстрація раніше обірвалась): сесія сама покаже крок «Завершіть профіль».
      if (session.getState().status === 'needsProfile') return;
      notify(mode === 'signup' ? `Акаунт створено. Вітаємо, ${session.currentName()}!` : `З поверненням, ${session.currentName()}!`);
      const role = session.getState().profile?.role;
      alive = false;
      location.hash = homePath(role);
    } catch (e) {
      st.error = authErrorMessage(e.code);
      st.errorCode = e.code ?? '';
      st.password = ''; // пароль не лишаємо в полі після помилки
    } finally {
      st.busy = false;
      draw();
    }
  }

  const unsubscribe = session.subscribe(() => { if (!st.busy) draw(); });
  draw();
  return () => { alive = false; unsubscribe(); };
}
