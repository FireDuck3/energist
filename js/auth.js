// Сесія користувача: стани входу, «спершу увійди», профіль. Не знає про конкретний сервіс —
// працює з будь-яким AuthService (реалізація: js/supabase.js), тому тестується з підробкою.
//
// AuthService: onUser(cb), loadProfile(uid), saveProfile(uid, {name, role}, {create}),
//   signUpWithPassword, signInWithPassword, sendLoginCode, verifyLoginCode,
//   sendResetCode, resetPassword, signOut; помилки — { code: 'auth/…' }.
import { DEMO_GUEST_NAME } from './data.js';

const ROLES = ['guest', 'host'];
const FALLBACK_MESSAGE = 'Щось пішло не так. Спробуйте ще раз';
const MESSAGES = {
  'auth/invalid-email': 'Невірний формат email',
  'auth/missing-password': 'Введіть пароль',
  'auth/weak-password': 'Пароль має бути щонайменше 6 символів',
  'auth/email-already-in-use': 'Цей email уже зареєстровано — увійдіть',
  'auth/invalid-credential': 'Невірний email або пароль',
  'auth/invalid-code': 'Код невірний або застарів — надішліть новий',
  'auth/email-rate-limit': 'Забагато листів за годину. Спробуйте пізніше або увійдіть паролем',
  'auth/email-not-allowed': 'Вхід кодом зараз недоступний для цієї пошти — увійдіть паролем',
  'auth/too-many-requests': 'Забагато спроб. Спробуйте за кілька хвилин',
  'auth/network-request-failed': 'Немає з\'єднання з інтернетом',
  'auth/operation-not-allowed': 'Цей спосіб входу зараз вимкнено',
};

const failure = (code, extra = {}) => Object.assign(new Error(code), { code, ...extra });

export function authErrorMessage(code) {
  return code in MESSAGES ? MESSAGES[code] : FALLBACK_MESSAGE;
}

export function validateProfile({ name, role } = {}) {
  const value = { name: String(name ?? '').trim(), role };
  const errors = {};
  if (!value.name) errors.name = 'Вкажіть ім\'я';
  else if (value.name.length > 60) errors.name = 'Ім\'я — до 60 символів';
  if (!ROLES.includes(role)) errors.role = 'Оберіть, для чого вам ЕнерГість';
  return { ok: Object.keys(errors).length === 0, errors, value };
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const SIGNED = ['needsProfile', 'signedIn', 'demo'];

// timeoutMs — скільки чекати бібліотеку (поганий Wi-Fi), retryMs — пауза перед повторним читанням профілю.
export function createSession(loadService, { timeoutMs = 8000, retryMs = 1000 } = {}) {
  let state = { status: 'loading', user: null, profile: null };
  let service = null;
  let pending = null; // { action, reason, waiting } — одна відкладена дія, нова замінює стару
  let userSeq = 0;
  const listeners = new Set();
  const needAuth = new Set();
  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });

  const isIn = () => state.status === 'signedIn' || state.status === 'demo';
  const ask = (reason) => needAuth.forEach((fn) => fn(reason));

  function set(patch) {
    state = { ...state, ...patch };
    // Дію забираємо до сповіщення: модалка входу, закриваючись, викликає cancelPending().
    let run = null;
    if (pending && isIn()) {
      run = pending.action;
      pending = null;
    }
    listeners.forEach((fn) => fn(state));
    // Дію запускаємо наступним кроком — коли вікно входу вже закрилось, а не поверх нього.
    if (run) setTimeout(run, 0);
    else if (pending?.waiting && state.status !== 'loading') {
      pending.waiting = false;
      ask(pending.reason);
    }
  }

  (async () => {
    try {
      service = await Promise.race([loadService(), delay(timeoutMs).then(() => null)]);
    } catch {
      service = null;
    }
    if (!service) {
      set({ status: 'unavailable' });
      resolveReady();
      return;
    }
    service.onUser(async (user) => {
      const seq = ++userSeq;
      if (!user) {
        set({ status: 'signedOut', user: null, profile: null });
        resolveReady();
        return;
      }
      // supabase-js повторює подію входу (напр., коли вкладка знову видима) — профіль уже є, не перечитуємо.
      if (state.user?.uid === user.uid && state.profile) {
        resolveReady();
        return;
      }
      let profile = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          profile = await service.loadProfile(user.uid);
          break;
        } catch {
          if (attempt === 0) await delay(retryMs); // один збій мережі — ще не «профілю немає»
        }
      }
      if (seq !== userSeq) return; // поки читали профіль, користувач змінився
      set({ status: profile ? 'signedIn' : 'needsProfile', user, profile });
      resolveReady();
    });
  })();

  return {
    ready,
    get service() { return service; },
    getState: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    onNeedAuth(fn) {
      needAuth.add(fn);
      return () => needAuth.delete(fn);
    },
    requireAuth(action, reason = '') {
      if (isIn()) {
        action();
        return;
      }
      pending = { action, reason, waiting: state.status === 'loading' };
      if (!pending.waiting) ask(reason);
    },
    cancelPending() {
      pending = null;
    },
    async saveProfile(input) {
      const { ok, errors, value } = validateProfile(input);
      if (!ok) throw failure('invalid-profile', { errors });
      if (!service || !state.user) throw failure('not-signed-in');
      await service.saveProfile(state.user.uid, value, { create: state.status === 'needsProfile' });
      set({ status: 'signedIn', profile: value });
    },
    // Демо-режим — коли сервер акаунтів недосяжний: не завантажився або мережа впала пізніше.
    enterDemo() {
      if (['unavailable', 'signedOut', 'needsProfile'].includes(state.status)) set({ status: 'demo' });
    },
    // Після успішного запиту входу чекаємо, поки сесія справді зміниться; false — не дочекались.
    waitForSignIn(ms = 10000) {
      if (SIGNED.includes(state.status)) return Promise.resolve(true);
      return new Promise((resolve) => {
        const check = () => {
          if (!SIGNED.includes(state.status)) return;
          clearTimeout(timer);
          listeners.delete(check);
          resolve(true);
        };
        const timer = setTimeout(() => { listeners.delete(check); resolve(false); }, ms);
        listeners.add(check);
      });
    },
    currentName: () => state.profile?.name ?? DEMO_GUEST_NAME,
  };
}
