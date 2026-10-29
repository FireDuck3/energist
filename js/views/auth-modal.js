// Вікно входу: вхід і реєстрація паролем, вхід кодом з пошти, скидання пароля кодом,
// перший крок профілю і демо-режим без інтернету. Одне вікно за раз.
import { h, openModal } from '../ui.js';
import { authErrorMessage } from '../auth.js';

const RESEND_SECONDS = 60;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = [['guest', '🔌 Шукаю зарядку'], ['host', '☀️ Маю енергію для продажу']];
// Після цих помилок пропонуємо вхід паролем.
const SUGGEST_PASSWORD = new Set(['auth/email-not-allowed', 'auth/email-rate-limit']);

let current = null;

function defaultMode(status) {
  if (status === 'needsProfile') return 'profile';
  if (status === 'unavailable') return 'unavailable';
  return 'signin';
}

const invalid = (message) => Object.assign(new Error(message), { local: message });

// Заглушка для сторінок, що потребують входу (кабінет, профіль).
export function signInPrompt({ title, text, reason }, session) {
  return h('div', { class: 'container gate' },
    h('div', { class: 'gate-card card' },
      h('span', { class: 'gate-icon' }, '🔐'),
      h('h1', {}, title),
      h('p', { class: 'muted' }, text),
      h('button', { type: 'button', class: 'btn btn-primary btn-lg', onclick: () => session.requireAuth(() => {}, reason) }, 'Увійти')));
}

export function openAuthModal(session, { reason = '', mode } = {}) {
  if (current) {
    current.switchTo(mode ?? defaultMode(session.getState().status));
    return;
  }

  const st = {
    mode: mode ?? defaultMode(session.getState().status),
    email: '', password: '', code: '', newPassword: '', name: '', role: null,
    error: '', errorCode: '', fieldErrors: {}, busy: false, sentAt: 0,
  };
  let timer = null;
  let closedByLogin = false;

  const modal = openModal(h('div'), {
    className: 'modal-auth',
    onClose() {
      unsubscribe();
      clearInterval(timer);
      current = null;
      if (!closedByLogin) session.cancelPending();
    },
  });

  function close() {
    closedByLogin = true;
    modal.close();
  }

  // Синхронізація з сесією: увійшов — закрити; потрібен профіль — показати крок профілю.
  function sync() {
    const { status } = session.getState();
    if (status === 'signedIn' || status === 'demo') close();
    else if (status === 'needsProfile' && st.mode !== 'profile') switchTo('profile');
  }
  const unsubscribe = session.subscribe(() => { if (!st.busy) sync(); });

  function switchTo(mode) {
    Object.assign(st, { mode, error: '', errorCode: '', fieldErrors: {} });
    render();
  }

  async function run(task) {
    st.busy = true;
    st.error = '';
    st.errorCode = '';
    st.fieldErrors = {};
    render();
    try {
      await task();
    } catch (e) {
      if (e.local) st.error = e.local;
      else if (e.code === 'invalid-profile') st.fieldErrors = e.errors;
      else {
        st.error = authErrorMessage(e.code);
        st.errorCode = e.code;
      }
    } finally {
      st.busy = false;
      if (current) {
        render();
        sync();
      }
    }
  }

  // ---- Поля й дрібні елементи ----
  const input = (key, attrs) => h('input', { class: 'input', value: st[key], disabled: st.busy, ...attrs,
    oninput: (e) => { st[key] = e.target.value; } });
  const field = (label, control, hint) =>
    h('label', { class: 'form-field' }, h('span', { class: 'field-label' }, label), control, hint && h('span', { class: 'hint' }, hint));
  const emailField = () => field('Email', input('email', { type: 'email', autocomplete: 'email', placeholder: 'you@example.com' }));
  const primary = (label) => h('button', { type: 'submit', class: 'btn btn-primary btn-lg btn-block', disabled: st.busy },
    st.busy ? 'Зачекайте…' : label);
  const linkBtn = (label, mode) => h('button', { type: 'button', class: 'link-btn', disabled: st.busy, onclick: () => switchTo(mode) }, label);
  const form = (onsubmit, ...children) => h('form', { class: 'auth-form', novalidate: true,
    onsubmit: (e) => { e.preventDefault(); run(onsubmit); } }, children);

  function errorBlock() {
    if (!st.error) return null;
    return h('div', { class: 'auth-error', role: 'alert' },
      h('span', {}, st.error),
      SUGGEST_PASSWORD.has(st.errorCode) && h('button', { type: 'button', class: 'link-btn', onclick: () => switchTo('signin') }, 'Увійти паролем'),
      st.errorCode === 'auth/network-request-failed' && h('button', { type: 'button', class: 'link-btn', onclick: () => session.enterDemo() }, 'Продовжити в демо-режимі'));
  }

  // Запит входу вже успішний — тримаємо «Зачекайте…», доки сесія не зміниться (профіль ще читається).
  async function settled() {
    if (!(await session.waitForSignIn(10000))) throw invalid('Не вдалося завершити вхід — перевірте інтернет і спробуйте ще раз');
  }

  const checkEmail = () => {
    st.email = st.email.trim();
    if (!EMAIL_RE.test(st.email)) throw invalid('Невірний формат email');
  };
  const checkPassword = (pw) => {
    if (!pw) throw invalid('Введіть пароль');
    if (pw.length < 6) throw invalid('Пароль має бути щонайменше 6 символів');
  };
  const checkCode = () => {
    st.code = st.code.replace(/\s/g, '');
    if (!/^\d{6}$/.test(st.code)) throw invalid('Введіть 6 цифр з листа');
  };

  function resendButton(send) {
    const left = Math.max(0, RESEND_SECONDS - Math.floor((Date.now() - st.sentAt) / 1000));
    return h('button', { type: 'button', class: 'link-btn resend', disabled: st.busy || left > 0,
      onclick: () => run(async () => { await send(); st.sentAt = Date.now(); }) },
    left > 0 ? `Надіслати ще раз через ${left} с` : 'Надіслати ще раз');
  }
  function startCountdown() {
    clearInterval(timer);
    timer = setInterval(() => {
      const btn = modal.body.querySelector('.resend');
      if (!btn) return clearInterval(timer);
      const left = Math.max(0, RESEND_SECONDS - Math.floor((Date.now() - st.sentAt) / 1000));
      btn.textContent = left > 0 ? `Надіслати ще раз через ${left} с` : 'Надіслати ще раз';
      btn.disabled = st.busy || left > 0;
      if (left === 0) clearInterval(timer);
    }, 1000);
  }

  const tabs = (active) => h('div', { class: 'auth-tabs', role: 'tablist' },
    h('button', { type: 'button', role: 'tab', class: active === 'signin' ? 'active' : '', 'aria-selected': String(active === 'signin'), onclick: () => switchTo('signin') }, 'Вхід'),
    h('button', { type: 'button', role: 'tab', class: active === 'signup' ? 'active' : '', 'aria-selected': String(active === 'signup'), onclick: () => switchTo('signup') }, 'Реєстрація'));

  // ---- Режими ----
  const svc = () => session.service;
  // Без листів із кодом (немає власного SMTP) кнопки входу кодом і скидання пароля ховаємо.
  const codesOn = () => session.service?.emailCodes !== false;
  const views = {
    signin: () => [tabs('signin'),
      form(async () => { checkEmail(); checkPassword(st.password); await svc().signInWithPassword(st.email, st.password); await settled(); },
        emailField(),
        field('Пароль', input('password', { type: 'password', autocomplete: 'current-password' })),
        errorBlock(), primary('Увійти')),
      codesOn() && h('div', { class: 'auth-links' }, linkBtn('Забули пароль?', 'reset'), linkBtn('Увійти без пароля', 'code'))],

    signup: () => [tabs('signup'),
      form(async () => { checkEmail(); checkPassword(st.password); await svc().signUpWithPassword(st.email, st.password); await settled(); },
        emailField(),
        field('Пароль', input('password', { type: 'password', autocomplete: 'new-password' }), 'Щонайменше 6 символів'),
        errorBlock(), primary('Створити акаунт')),
      codesOn() && h('div', { class: 'auth-links' }, linkBtn('Увійти без пароля', 'code'))],

    code: () => [h('h2', {}, 'Вхід без пароля'),
      h('p', { class: 'muted' }, 'Надішлемо 6-значний код на вашу пошту.'),
      form(async () => { checkEmail(); await svc().sendLoginCode(st.email); st.sentAt = Date.now(); st.code = ''; st.mode = 'codeSent'; },
        emailField(), errorBlock(), primary('Надіслати код')),
      h('div', { class: 'auth-links' }, linkBtn('← Увійти паролем', 'signin'))],

    codeSent: () => [h('h2', {}, 'Введіть код'),
      h('p', { class: 'muted' }, `Ми надіслали код на ${st.email}. Він діє 1 годину.`),
      form(async () => { checkCode(); await svc().verifyLoginCode(st.email, st.code); await settled(); },
        field('Код з листа', input('code', { inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, placeholder: '000000', class: 'input code-input' })),
        errorBlock(), primary('Увійти')),
      h('div', { class: 'auth-links' }, resendButton(() => svc().sendLoginCode(st.email)), linkBtn('Змінити email', 'code'))],

    reset: () => [h('h2', {}, 'Зміна пароля'),
      h('p', { class: 'muted' }, 'Надішлемо 6-значний код, щоб ви задали новий пароль.'),
      form(async () => { checkEmail(); await svc().sendResetCode(st.email); st.sentAt = Date.now(); st.code = ''; st.mode = 'resetSent'; },
        emailField(), errorBlock(), primary('Надіслати код')),
      h('div', { class: 'auth-links' }, linkBtn('← Назад до входу', 'signin'))],

    resetSent: () => [h('h2', {}, 'Новий пароль'),
      h('p', { class: 'muted' }, `Ми надіслали код на ${st.email}. Він діє 1 годину.`),
      form(async () => { checkCode(); checkPassword(st.newPassword); await svc().resetPassword(st.email, st.code, st.newPassword); await settled(); },
        field('Код з листа', input('code', { inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, placeholder: '000000', class: 'input code-input' })),
        field('Новий пароль', input('newPassword', { type: 'password', autocomplete: 'new-password' }), 'Щонайменше 6 символів'),
        errorBlock(), primary('Змінити пароль')),
      h('div', { class: 'auth-links' }, resendButton(() => svc().sendResetCode(st.email)))],

    profile: () => [h('h2', {}, 'Ще один крок'),
      form(async () => {
        await session.saveProfile({ name: st.name, role: st.role });
        if (!reason) location.hash = st.role === 'host' ? '#/host' : '#/map';
      },
      field('Як вас звати?', input('name', { type: 'text', autocomplete: 'given-name', maxlength: 60, placeholder: 'Ім\'я' })),
      st.fieldErrors.name && h('span', { class: 'field-error' }, st.fieldErrors.name),
      h('div', { class: 'form-field' },
        h('span', { class: 'field-label' }, 'Для чого вам WattWay?'),
        h('div', { class: 'role-choice' }, ROLES.map(([value, label]) =>
          h('button', { type: 'button', class: `chip${st.role === value ? ' active' : ''}`, disabled: st.busy,
            onclick: () => { st.role = value; render(); } }, label)))),
      st.fieldErrors.role && h('span', { class: 'field-error' }, st.fieldErrors.role),
      errorBlock(), primary('Продовжити'))],

    unavailable: () => [h('h2', {}, 'Вхід недоступний без інтернету'),
      h('p', { class: 'muted' }, 'Не вдалося з\'єднатися із сервером акаунтів. Можна продовжити в демо-режимі — від імені Саші.'),
      h('button', { type: 'button', class: 'btn btn-primary btn-lg btn-block', onclick: () => session.enterDemo() }, 'Продовжити в демо-режимі')],
  };

  function render() {
    modal.setContent(h('div', { class: 'auth' },
      h('div', { class: 'auth-brand' }, h('span', { class: 'logo-mark' }, '⚡'), h('b', {}, 'WattWay')),
      reason && st.mode !== 'profile' && h('p', { class: 'auth-reason' }, reason),
      views[st.mode]()));
    if (st.mode === 'codeSent' || st.mode === 'resetSent') startCountdown();
    modal.body.querySelector('input:not([disabled])')?.focus();
  }

  current = { switchTo };
  render();
}
