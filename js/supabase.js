// Адаптер до Supabase — єдиний модуль, що знає про supabase-js.
// Решта коду бачить лише AuthService (контракт описано в js/auth.js).
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const CODES = {
  invalid_credentials: 'auth/invalid-credential',
  user_already_exists: 'auth/email-already-in-use',
  email_exists: 'auth/email-already-in-use',
  weak_password: 'auth/weak-password',
  otp_expired: 'auth/invalid-code',
  over_email_send_rate_limit: 'auth/email-rate-limit',
  over_request_rate_limit: 'auth/too-many-requests',
  email_address_not_authorized: 'auth/email-not-allowed',
  email_address_invalid: 'auth/invalid-email',
  validation_failed: 'auth/invalid-email',
  signup_disabled: 'auth/operation-not-allowed',
  email_provider_disabled: 'auth/operation-not-allowed',
};

// Помилка Supabase (або збій fetch) → код сесії з таблиці повідомлень js/auth.js.
export function toAuthCode(error) {
  if (!error) return 'auth/unknown';
  if (error instanceof TypeError || error.status === 0) return 'auth/network-request-failed';
  return CODES[error.code] ?? 'auth/unknown';
}

const fail = (error) => Object.assign(new Error(error?.message ?? 'auth error'), { code: toAuthCode(error) });

async function call(request) {
  let res;
  try { res = await request; } catch (e) { throw fail(e); }
  if (res.error) throw fail(res.error);
  return res.data;
}

const toUser = (u) => ({ uid: u.id, email: u.email, name: null, photoURL: null, provider: 'email', emailVerified: true });

// null — бібліотека чи конфіг не завантажились (немає інтернету): тоді сайт пропонує демо-режим.
export async function loadSupabase() {
  try {
    const [{ createClient }, { supabaseConfig }] = await Promise.all([
      import(window.__ENERGIST_SUPABASE_URL ?? SDK_URL),
      import('./supabase-config.js'),
    ]);
    const client = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    const auth = client.auth;

    return {
      onUser(cb) {
        auth.onAuthStateChange((event, session) => {
          if (event === 'TOKEN_REFRESHED') return;
          // Не кличемо Supabase всередині колбека: supabase-js тримає там блокування сесії.
          setTimeout(() => cb(session?.user ? toUser(session.user) : null), 0);
        });
      },
      signUpWithPassword: (email, password) => call(auth.signUp({ email, password })),
      signInWithPassword: (email, password) => call(auth.signInWithPassword({ email, password })),
      sendLoginCode: (email) => call(auth.signInWithOtp({ email, options: { shouldCreateUser: true } })),
      verifyLoginCode: (email, code) => call(auth.verifyOtp({ email, token: code, type: 'email' })),
      sendResetCode: (email) => call(auth.resetPasswordForEmail(email)),
      async resetPassword(email, code, newPassword) {
        await call(auth.verifyOtp({ email, token: code, type: 'recovery' }));
        await call(auth.updateUser({ password: newPassword }));
      },
      signOut: () => call(auth.signOut()),
      loadProfile: (uid) => call(client.from('profiles').select('name, role').eq('id', uid).maybeSingle()),
      saveProfile: (uid, { name, role }) => call(client.from('profiles').upsert({ id: uid, name, role })),
    };
  } catch {
    return null;
  }
}
