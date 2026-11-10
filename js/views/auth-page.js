// Окремі сторінки входу (#/login) і реєстрації (#/signup).
// Вікно входу (auth-modal.js) лишається для дій, що потребують акаунта посеред сценарію (бронювання).
import { h, toast } from '../ui.js';
import { authErrorMessage } from '../auth.js';
import { validateLogin, validateSignup, homePath, failureAdvice, MIN_PASSWORD } from '../auth-forms.js';

const ROLES = [['guest', '🔌 Шукаю зарядку'], ['host', '☀️ Маю енергію для продажу']];
const TEXT = {
  signin: { title: 'Вхід', lead: 'Раді бачити вас знову', submit: 'Увійти' },
  signup: { title: 'Створити акаунт', lead: 'Реєстрація займає хвилину', submit: 'Створити акаунт' },
};

// Вихід: повідомлення і повернення на головну, де знову видно «Увійти» й «Реєстрація».
export function logOut(session) {
  return session.service.signOut()
    .then(() => { toast('Ви вийшли з акаунта'); location.hash = '#/'; })
    .catch(() => toast('Не вдалося вийти — перевірте інтернет'));
}

export const loginPage = (_params, root, _store, session) => renderAuthPage('signin', root, session);
export const signupPage = (_params, root, _store, session) => renderAuthPage('signup', root, session);

function renderAuthPage(mode, root, session) {
  const st = { name: '', email: '', password: '', confirm: '', role: null, errors: {}, error: '', errorCode: '', busy: false };
  const text = TEXT[mode];
  let alive = true;

  const card = h('div', { class: 'auth-card card' });
  root.append(h('div', { class: 'container auth-page' }, card));

  function draw() {
    if (!alive) return;
    const { status } = session.getState();
    if (status === 'loading') return card.replaceChildren(h('p', { class: 'muted' }, 'Завантаження…'));
    if (status === 'signedIn' || status === 'demo') {
      return card.replaceChildren(h('span', { class: 'gate-icon' }, '✅'),
        h('h1', {}, `Ви вже в акаунті, ${session.currentName()}`),
        h('a', { class: 'btn btn-primary btn-lg', href: homePath(session.getState().profile?.role) }, 'Перейти до роботи'),
        h('a', { class: 'btn btn-secondary', href: '#/profile' }, 'Мій профіль'));
    }
    if (status === 'needsProfile' && mode === 'signin') {
      return card.replaceChildren(h('span', { class: 'gate-icon' }, '👤'),
        h('h1', {}, 'Завершіть профіль'),
        h('p', { class: 'muted' }, 'Акаунт уже створено — лишилось вказати ім\'я та роль.'),
        h('button', { type: 'button', class: 'btn btn-primary btn-lg', onclick: () => session.requireAuth(() => {}, '') }, 'Продовжити'));
    }
    if (status === 'unavailable') {
      return card.replaceChildren(h('span', { class: 'gate-icon' }, '📡'),
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
      signup && input('name', 'Як вас звати?', { type: 'text', autocomplete: 'given-name', maxlength: 60, placeholder: 'Ім\'я' }),
      input('email', 'Email', { type: 'email', autocomplete: 'email', placeholder: 'you@example.com' }),
      input('password', 'Пароль', { type: 'password', autocomplete: signup ? 'new-password' : 'current-password' },
        signup ? `Щонайменше ${MIN_PASSWORD} символів` : null),
      signup && input('confirm', 'Повторіть пароль', { type: 'password', autocomplete: 'new-password' }),
      signup && h('div', { class: 'form-field' },
        h('span', { class: 'field-label' }, 'Для чого вам WattWay?'),
        h('div', { class: 'role-choice' }, ROLES.map(([value, label]) =>
          h('button', { type: 'button', class: `chip${st.role === value ? ' active' : ''}`, disabled: st.busy,
            'aria-pressed': String(st.role === value), onclick: () => { st.role = value; draw(); } }, label))),
        st.errors.role && h('span', { class: 'field-error' }, st.errors.role)),
      errorBlock(),
      h('button', { type: 'submit', class: 'btn btn-primary btn-lg btn-block', disabled: st.busy }, st.busy ? 'Зачекайте…' : text.submit));

    card.replaceChildren(
      h('div', { class: 'auth-brand' }, h('span', { class: 'logo-mark' }, '⚡'), h('b', {}, 'WattWay')),
      h('h1', {}, text.title),
      h('p', { class: 'muted auth-lead' }, text.lead),
      form,
      h('p', { class: 'auth-switch' },
        signup ? 'Вже є акаунт? ' : 'Ще немає акаунта? ',
        h('a', { href: signup ? '#/login' : '#/signup' }, signup ? 'Увійти' : 'Зареєструватися')));
    const bad = card.querySelector('[aria-invalid="true"]');
    (bad ?? card.querySelector('input:not([disabled])'))?.focus();
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
        await svc.signUpWithPassword(st.email, st.password);
      }
      if (!(await session.waitForSignIn(10000))) {
        throw Object.assign(new Error('timeout'), { code: 'auth/network-request-failed' });
      }
      if (mode === 'signup') {
        try {
          await session.saveProfile({ name: st.name, role: st.role });
        } catch (e) {
          st.error = 'Акаунт створено, але профіль не збережено. Натисніть «Створити акаунт» ще раз';
          st.errorCode = e.code ?? '';
          return;
        }
      }
      // Вхід без профілю (реєстрація раніше обірвалась): сесія сама покаже крок «Завершіть профіль».
      if (session.getState().status === 'needsProfile') return;
      toast(mode === 'signup' ? `Акаунт створено. Вітаємо, ${session.currentName()}!` : `З поверненням, ${session.currentName()}!`);
      const role = session.getState().profile?.role;
      alive = false;
      location.hash = homePath(role);
    } catch (e) {
      st.error = authErrorMessage(e.code);
      st.errorCode = e.code ?? '';
      st.password = ''; // пароль не лишаємо в полі після помилки
      st.confirm = '';
    } finally {
      st.busy = false;
      draw();
    }
  }

  const unsubscribe = session.subscribe(() => { if (!st.busy) draw(); });
  draw();
  return () => { alive = false; unsubscribe(); };
}
