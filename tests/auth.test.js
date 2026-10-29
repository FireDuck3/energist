import { test, eq } from './runner.js';
import { createSession, validateProfile, authErrorMessage } from '../js/auth.js';

const user = { uid: 'u1', email: 'a@b.ua', name: 'Ірина', photoURL: null, provider: 'google', emailVerified: true };
const tick = () => new Promise((r) => setTimeout(r, 0));

// Підроблений AuthService: emit(user) імітує onAuthStateChanged.
function fake({ profile = null, saveError = null, loadFailures = 0 } = {}) {
  let cb = null;
  const saved = [];
  const stats = { loads: 0, failNext: loadFailures };
  const svc = {
    onUser(fn) { cb = fn; },
    async loadProfile() {
      stats.loads++;
      if (stats.failNext > 0) { stats.failNext--; throw { code: 'auth/network-request-failed' }; }
      return profile;
    },
    async saveProfile(uid, p, opts) {
      if (saveError) throw saveError;
      saved.push({ uid, p, opts });
      profile = p;
    },
  };
  return { svc, saved, stats, emit: async (u) => { cb(u); await tick(); await tick(); } };
}

async function started(f) {
  const s = createSession(async () => f.svc, { retryMs: 5 });
  await tick();
  return s;
}

test('без сервісу → unavailable, enterDemo → demo, ім\'я Саша', async () => {
  const s = createSession(async () => null);
  await s.ready;
  eq(s.getState().status, 'unavailable');
  s.enterDemo();
  eq([s.getState().status, s.currentName()], ['demo', 'Саша']);
});

test('onUser(null) → signedOut', async () => {
  const f = fake();
  const s = await started(f);
  await f.emit(null);
  eq(s.getState().status, 'signedOut');
});

test('без профілю → needsProfile', async () => {
  const f = fake();
  const s = await started(f);
  await f.emit(user);
  eq([s.getState().status, s.getState().user.uid], ['needsProfile', 'u1']);
});

test('з профілем → signedIn і currentName', async () => {
  const f = fake({ profile: { name: 'Ірина', role: 'guest' } });
  const s = await started(f);
  await f.emit(user);
  eq([s.getState().status, s.currentName()], ['signedIn', 'Ірина']);
});

test('requireAuth у signedOut: дія чекає, onNeedAuth отримав причину', async () => {
  const f = fake();
  const s = await started(f);
  await f.emit(null);
  const reasons = [];
  let calls = 0;
  s.onNeedAuth((r) => reasons.push(r));
  s.requireAuth(() => calls++, 'Увійдіть, щоб забронювати зарядку');
  eq([calls, reasons], [0, ['Увійдіть, щоб забронювати зарядку']]);
});

test('після входу і профілю дія виконується рівно один раз', async () => {
  const f = fake();
  const s = await started(f);
  await f.emit(null);
  let calls = 0;
  s.requireAuth(() => calls++, 'x');
  await f.emit(user);
  eq([s.getState().status, calls], ['needsProfile', 0]);
  await s.saveProfile({ name: 'Ірина', role: 'guest' });
  // Дія — після того, як вікно входу встигне закритися (не поверх нього).
  eq([s.getState().status, calls, f.saved[0].opts], ['signedIn', 0, { create: true }]);
  await tick();
  eq(calls, 1);
  await f.emit(user);
  eq(calls, 1);
});

test('бібліотека зависла — через таймаут unavailable і вікно входу', async () => {
  const s = createSession(() => new Promise(() => {}), { timeoutMs: 20 });
  const reasons = [];
  s.onNeedAuth((r) => reasons.push(r));
  s.requireAuth(() => {}, 'x');
  eq(s.getState().status, 'loading');
  await new Promise((r) => setTimeout(r, 40));
  eq([s.getState().status, reasons], ['unavailable', ['x']]);
});

test('мережа впала після завантаження: демо-режим доступний і з signedOut', async () => {
  const f = fake();
  const s = await started(f);
  await f.emit(null);
  s.enterDemo();
  eq(s.getState().status, 'demo');
});

test('enterDemo не чіпає увійденого користувача', async () => {
  const f = fake({ profile: { name: 'Ірина', role: 'guest' } });
  const s = await started(f);
  await f.emit(user);
  s.enterDemo();
  eq(s.getState().status, 'signedIn');
});

test('профіль не прочитався з першого разу — повторюємо, а не просимо заповнити знову', async () => {
  const f = fake({ profile: { name: 'Ірина', role: 'host' }, loadFailures: 1 });
  const s = await started(f);
  await f.emit(user);
  await new Promise((r) => setTimeout(r, 20));
  eq([s.getState().status, s.currentName()], ['signedIn', 'Ірина']);
});

test('повторна подія входу того ж користувача не перечитує профіль і не стирає його', async () => {
  const f = fake({ profile: { name: 'Ірина', role: 'host' } });
  const s = await started(f);
  await f.emit(user);
  f.stats.failNext = 5;
  await f.emit(user);
  await new Promise((r) => setTimeout(r, 20));
  eq([s.getState().status, s.currentName(), f.stats.loads], ['signedIn', 'Ірина', 1]);
});

test('waitForSignIn: true, коли сесія змінилась; false по таймауту', async () => {
  const f = fake();
  const s = await started(f);
  await f.emit(null);
  const waiting = s.waitForSignIn(1000);
  await f.emit(user);
  eq([await waiting, await s.waitForSignIn(1000)], [true, true]);
  const g = fake();
  const t = await started(g);
  await g.emit(null);
  eq(await t.waitForSignIn(20), false);
});

test('requireAuth у signedIn і demo — одразу', async () => {
  const f = fake({ profile: { name: 'Ірина', role: 'guest' } });
  const s = await started(f);
  await f.emit(user);
  let calls = 0;
  s.requireAuth(() => calls++, 'x');
  const d = createSession(async () => null);
  await d.ready;
  d.enterDemo();
  d.requireAuth(() => calls++, 'x');
  eq(calls, 2);
});

test('cancelPending — після входу дія не виконується', async () => {
  const f = fake({ profile: { name: 'Ірина', role: 'guest' } });
  const s = await started(f);
  await f.emit(null);
  let calls = 0;
  s.requireAuth(() => calls++, 'x');
  s.cancelPending();
  await f.emit(user);
  eq(calls, 0);
});

test('loading: дія чекає без вікна входу; signedIn → виконується', async () => {
  const f = fake({ profile: { name: 'Ірина', role: 'guest' } });
  const s = await started(f);
  eq(s.getState().status, 'loading');
  let calls = 0;
  let asked = 0;
  s.onNeedAuth(() => asked++);
  s.requireAuth(() => calls++, 'x');
  eq([calls, asked], [0, 0]);
  await f.emit(user);
  eq([calls, asked], [1, 0]);
});

test('loading → signedOut: onNeedAuth викликається тоді', async () => {
  const f = fake();
  const s = await started(f);
  const reasons = [];
  s.onNeedAuth((r) => reasons.push(r));
  s.requireAuth(() => {}, 'причина');
  eq(reasons, []);
  await f.emit(null);
  eq(reasons, ['причина']);
});

test('saveProfile впав — needsProfile, дія не виконана, помилка проброшена', async () => {
  const f = fake({ saveError: { code: 'permission-denied' } });
  const s = await started(f);
  await f.emit(null);
  let calls = 0;
  s.requireAuth(() => calls++, 'x');
  await f.emit(user);
  let code = null;
  try { await s.saveProfile({ name: 'Ірина', role: 'guest' }); } catch (e) { code = e.code; }
  eq([code, s.getState().status, calls], ['permission-denied', 'needsProfile', 0]);
});

test('saveProfile з порожнім ім\'ям — сервіс не викликано', async () => {
  const f = fake();
  const s = await started(f);
  await f.emit(user);
  let code = null;
  try { await s.saveProfile({ name: '   ', role: 'guest' }); } catch (e) { code = e.code; }
  eq([code, f.saved.length], ['invalid-profile', 0]);
});

test('validateProfile', () => {
  eq(validateProfile({ name: '  Ірина ', role: 'host' }), { ok: true, errors: {}, value: { name: 'Ірина', role: 'host' } });
  eq(validateProfile({ name: '   ', role: 'guest' }).ok, false);
  eq(validateProfile({ name: 'а'.repeat(61), role: 'guest' }).ok, false);
  eq(validateProfile({ name: 'а'.repeat(60), role: 'guest' }).ok, true);
  eq(validateProfile({ name: 'Ірина', role: 'admin' }).ok, false);
});

test('authErrorMessage', () => {
  eq(authErrorMessage('auth/invalid-credential'), 'Невірний email або пароль');
  eq(authErrorMessage('auth/invalid-code'), 'Код невірний або застарів — надішліть новий');
  eq(authErrorMessage('auth/email-rate-limit'), 'Забагато листів за годину. Спробуйте пізніше або увійдіть паролем');
  eq(authErrorMessage('auth/email-not-allowed'), 'Вхід кодом зараз недоступний для цієї пошти — увійдіть паролем');
  eq(authErrorMessage('auth/popup-blocked'), 'Щось пішло не так. Спробуйте ще раз'); // Google-входу більше немає
  eq(authErrorMessage('щось/нове'), 'Щось пішло не так. Спробуйте ще раз');
});
