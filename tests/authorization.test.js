import { test, eq } from './runner.js';
import { createSession } from '../js/auth.js';
const tick = () => new Promise(r => setTimeout(r, 0));
test('server rejects inactive account: profile and deferred action stay inaccessible', async () => {
  let emit;
  let loads = 0;
  let actions = 0;
  const session = createSession(async () => ({
    onUser(cb) { emit = cb; },
    async verifyUser() { throw { code: 'auth/account-disabled' }; },
    async loadProfile() { loads++; return { name: 'Test', role: 'guest' }; },
  }), { timeoutMs: 20 });
  await tick();
  session.requireAuth(() => actions++);
  await emit({ uid: 'u1' });
  await session.ready;
  eq([session.getState().status, session.getState().error, loads, actions], ['signedOut', 'auth/account-disabled', 0, 0]);
});
test('late identity verification cannot restore a signed-out account', async () => {
  let emit, release;
  const pending = new Promise(r => { release = r; });
  const session = createSession(async () => ({
    onUser(cb) { emit = cb; },
    verifyUser: () => pending,
    async loadProfile() { return { name: 'Test', role: 'guest' }; },
  }), { timeoutMs: 20 });
  await tick();
  const verification = emit({ uid: 'u1' });
  await emit(null);
  release({ uid: 'u1' });
  await verification;
  eq([session.getState().status, session.getState().user], ['signedOut', null]);
});
