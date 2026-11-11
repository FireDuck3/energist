import { test, eq } from './runner.js';
import { safeReturnHash, signInWithGoogle, finishGoogleOAuth } from '../js/oauth.js';
function environment(href = 'https://wattway.onrender.com/?code=one-use') {
  const values = new Map([['wattway-oauth-return', '#/spot/oleh-ses']]);
  const env = { location: new URL(href),
    sessionStorage: { setItem: (k,v) => values.set(k,v), getItem: k => values.get(k), removeItem: k => values.delete(k) },
    history: { replaceState(_,__,path) { env.replaced = path; } },
    dispatchEvent(event) { env.event = event.type; },
  };
  return env;
}
test('Google starts PKCE redirect to current origin without route or query', async () => {
  const env = environment('https://wattway.onrender.com/?untrusted=1#/spot/oleh-ses');
  let args;
  await signInWithGoogle({ async signInWithOAuth(input) { args = input; return { data: {} }; } }, env);
  eq(args, { provider: 'google', options: { redirectTo: 'https://wattway.onrender.com/', queryParams: { prompt: 'select_account' } } });
});
test('OAuth callback exchanges code once and removes it from URL', async () => {
  const env = environment();
  let code;
  const result = await finishGoogleOAuth({ async exchangeCodeForSession(value) { code = value; return {}; } }, env);
  eq([result, code, env.replaced, env.event], [{ returned: true, error: null }, 'one-use', '/#/spot/oleh-ses', 'hashchange']);
});
test('OAuth cancellation does not exchange code or display provider text', async () => {
  const env = environment('https://wattway.onrender.com/?error=access_denied&error_description=unsafe');
  const result = await finishGoogleOAuth({ exchangeCodeForSession() { throw new Error('must not be called'); } }, env);
  eq([result.error, env.replaced], ['auth/oauth-cancelled', '/#/spot/oleh-ses']);
});
test('expired code and failed network produce recoverable OAuth error', async () => {
  for (const exchangeCodeForSession of [async () => ({ error: {} }), async () => { throw new Error('network'); }]) {
    const result = await finishGoogleOAuth({ exchangeCodeForSession }, environment());
    eq(result.error, 'auth/oauth-failed');
  }
});
test('normal navigation is untouched and return routes cannot be external', async () => {
  const env = environment('https://wattway.onrender.com/#/map');
  eq(await finishGoogleOAuth({}, env), { returned: false, error: null });
  eq(env.replaced, undefined);
  for (const hash of ['https://evil.example', '#//evil.example', '#/spot/x<script>', null]) eq(safeReturnHash(hash), '#/map');
});
test('disabled Google provider gives an actionable error', async () => {
  let code;
  try { await signInWithGoogle({ async signInWithOAuth() { return { error: { code: 'provider_disabled' } }; } }, environment()); }
  catch (e) { code = e.code; }
  eq(code, 'auth/google-unavailable');
});
