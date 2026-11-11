// PKCE keeps provider tokens out of the hash router. Only an internal route is saved.
const RETURN_KEY = 'wattway-oauth-return';
export const safeReturnHash = (hash) => /^#\/(?:|map|host|calc|profile|spot\/[a-zA-Z0-9_-]+)$/.test(hash ?? '') ? hash : '#/map';

export async function signInWithGoogle(auth, env = window) {
  try { env.sessionStorage.setItem(RETURN_KEY, safeReturnHash(env.location.hash)); }
  catch { /* The SDK will report unavailable PKCE storage if needed. */ }
  const redirectTo = new URL(env.location.pathname, env.location.origin).href;
  const result = await auth.signInWithOAuth({ provider: 'google', options: { redirectTo, queryParams: { prompt: 'select_account' } } });
  if (result.error) throw Object.assign(new Error('Google sign-in failed'), { code: result.error.code === 'provider_disabled' ? 'auth/google-unavailable' : 'auth/oauth-failed' });
  return result.data;
}

export async function finishGoogleOAuth(auth, env = window) {
  const url = new URL(env.location.href);
  // Some provider errors return in a fragment rather than a query string.
  const fragment = new URLSearchParams(url.hash.startsWith('#/') ? '' : url.hash.slice(1));
  const denied = url.searchParams.has('error') || fragment.has('error');
  const code = url.searchParams.get('code');
  if (!code && !denied) return { returned: false, error: null };
  let hash = '#/map';
  try { hash = safeReturnHash(env.sessionStorage.getItem(RETURN_KEY)); env.sessionStorage.removeItem(RETURN_KEY); } catch { /* safe fallback */ }
  let error = denied ? 'auth/oauth-cancelled' : null;
  // Remove the one-use code and untrusted provider messages before further navigation.
  for (const key of ['code', 'error', 'error_code', 'error_description']) url.searchParams.delete(key);
  url.hash = hash;
  env.history.replaceState(null, '', url.pathname + url.search + url.hash);
  if (!error) {
    try {
      const result = await auth.exchangeCodeForSession(code);
      if (result.error) error = 'auth/oauth-failed';
    } catch { error = 'auth/oauth-failed'; }
  }
  // replaceState does not notify the hash router.
  env.dispatchEvent(new Event('hashchange'));
  return { returned: true, error };
}
