import { test, eq } from './runner.js';
import {
  createSession, validateProfile, authErrorMessage, rememberLinkEmail, takeLinkEmail,
} from '../js/auth.js';
import { memoryStorage } from '../js/store.js';

const user = { uid: 'u1', email: 'a@b.ua', name: 'Ірина', photoURL: null, provider: 'google', emailVerified: true };
const tick = () => new Promise((r) => setTimeout(r, 0));

// Підроблений AuthService: emit(user) імітує onAuthStateChanged.
function fake({ profile = null, saveError = null } = {}) {
  let cb = null;
  const saved = [];
  const svc = {
    onUser(fn) { cb = fn; },
    async loadProfile() { return profile; },
    async saveProfile(uid, p, opts) {
      if (saveError) throw saveError;
      saved.push({ uid, p, opts });
      profile = p;
    },
  };
  return { svc, saved, emit: async (u) => { cb(u); await tick(); await tick(); } };
}

async function started(f) {
  const s = createSession(async () => f.svc);
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
  eq([s.getState().status, calls, f.saved[0].opts], ['signedIn', 1, { create: true }]);
  await f.emit(user);
  eq(calls, 1);
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
  eq(authErrorMessage('auth/wrong-password'), 'Невірний email або пароль');
  eq(authErrorMessage('auth/popup-closed-by-user'), '');
  eq(authErrorMessage('auth/popup-blocked'), 'Браузер заблокував вікно входу — дозвольте спливні вікна і спробуйте ще раз');
  eq(authErrorMessage('auth/expired-action-code'), 'Посилання застаріло або вже використане — надішліть нове');
  eq(authErrorMessage('щось/нове'), 'Щось пішло не так. Спробуйте ще раз');
});

test('посилання з пошти: email запам\'ятовується, видається один раз', () => {
  const st = memoryStorage();
  rememberLinkEmail('a@b.ua', '#/spot/oleh-ses', st);
  eq(takeLinkEmail(st), { email: 'a@b.ua', returnTo: '#/spot/oleh-ses' });
  eq(takeLinkEmail(st), null);
  st.setItem('energist-signin-email', '{bad');
  eq(takeLinkEmail(st), null);
});
