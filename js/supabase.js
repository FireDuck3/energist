import { signInWithGoogle, finishGoogleOAuth } from './oauth.js';
import { checkedCredentials } from './credentials.js';
// Адаптер до Supabase — єдиний модуль, що знає про supabase-js.
// Решта коду бачить лише AuthService (контракт описано в js/auth.js).
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const CODES = {
  user_banned: 'auth/account-disabled',
  email_not_confirmed: 'auth/email-not-confirmed',
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

// Відповідь бази (PostgREST) без мережі має status 0 і порожній code — це теж «немає з'єднання».
export function responseCode(res) {
  if (res?.status === 0) return 'auth/network-request-failed';
  return toAuthCode(res?.error);
}

const fail = (error, code = toAuthCode(error)) => Object.assign(new Error(error?.message ?? 'auth error'), { code });

async function call(request) {
  let res;
  try { res = await request; } catch (e) { throw fail(e); }
  if (res.error) throw fail(res.error, res.error.code === '23P01' ? '23P01' : responseCode(res));
  return res.data;
}

const toUser = (u) => ({ uid: u.id, email: u.email, name: u.user_metadata?.full_name ?? u.user_metadata?.name ?? null, photoURL: u.user_metadata?.avatar_url ?? null, provider: u.app_metadata?.provider ?? 'email', emailVerified: Boolean(u.email_confirmed_at) });

// null — бібліотека чи конфіг не завантажились (немає інтернету): тоді сайт пропонує демо-режим.
export async function loadSupabase() {
  try {
    const [{ createClient }, { supabaseConfig }] = await Promise.all([
      import(window.__ENERGIST_SUPABASE_URL ?? SDK_URL),
      import('./supabase-config.js'),
    ]);
    const client = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' },
    });
    const auth = client.auth;
    const oauthResult = await finishGoogleOAuth(auth);

    return {
      oauthResult,
      async listPilotSpots() {
        const rows = await call(client.from('pilot_spots').select('*').order('title'));
        return rows.map(row => ({
          id: row.id, archivedAt: row.archived_at, ownerId: row.owner_id, pilot: true, hostName: 'Господар точки',
          title: row.title, district: row.district, lat: Number(row.lat), lng: Number(row.lng),
          source: row.source, connector: row.connector, powerKw: Number(row.power_kw),
          pricePerKwh: Number(row.price_per_kwh), devices: row.devices, reviews: [],
          schedule: { from: row.opens.slice(0, 5), to: row.closes.slice(0, 5) },
        }));
      },
      archivePilotSpot: id => call(client.rpc('archive_pilot_spot', { point_id: id })),
      publishPilotSpot: (input, uid) => call(client.from('pilot_spots').insert({
        owner_id: uid, title: input.title, district: input.district, lat: input.lat, lng: input.lng,
        source: input.source, connector: input.connector, power_kw: input.powerKw,
        price_per_kwh: input.pricePerKwh, devices: input.devices, opens: input.schedule.from, closes: input.schedule.to,
      })),
      listPilotBookings: () => call(client.rpc('list_my_pilot_bookings')),
      listNotifications: () => call(client.from('booking_notifications').select('*').order('created_at', { ascending: false }).limit(100)),
      readNotification: id => call(client.from('booking_notifications').update({ read_at: new Date().toISOString() }).eq('id', id)),
      listMessages: async id => (await call(client.from('booking_messages').select('*').eq('booking_id', id).order('created_at', { ascending: false }).limit(500))).reverse(),
      sendMessage: message => call(client.from('booking_messages').insert(message)),
      listReviews: id => call(client.from('booking_reviews').select('*').eq('booking_id', id).order('created_at')),
      sendReview: review => call(client.from('booking_reviews').insert(review)),
      completeBooking: id => call(client.rpc('complete_pilot_booking', { booking: id })),
      requestPilotBooking: (id, { date, start, hours, device }) => call(client.rpc('request_pilot_booking', {
        point_id: id, requested_day: date, starts: start, hours, requested_device: device,
      })),
      respondPilotBooking: (id, status) => call(client.rpc('respond_to_pilot_booking', { booking_id: id, decision: status })),
      signInWithGoogle: () => signInWithGoogle(auth),
      emailCodes: supabaseConfig.emailCodes !== false,
      onUser(cb) {
        auth.onAuthStateChange((event, session) => {
          if (event === 'TOKEN_REFRESHED') return;
          // Не кличемо Supabase всередині колбека: supabase-js тримає там блокування сесії.
          setTimeout(() => cb(session?.user ? toUser(session.user) : null), 0);
        });
      },
      async signUpWithPassword(email, password, names = {}) {
        const v = checkedCredentials({ email, password, ...names }, { signup: true });
        const data = await call(auth.signUp({ email: v.email, password: v.password,
          options: { data: { first_name: v.firstName, last_name: v.lastName } } }));
        if (data.user?.identities?.length === 0) throw fail(null, 'auth/email-already-in-use');
        if (!data.session) throw fail(null, 'auth/email-not-confirmed');
        return data;
      },
      async signInWithPassword(email, password) {
        const v = checkedCredentials({ email, password });
        return call(auth.signInWithPassword(v));
      },
      // Performs a server request; never trust a locally decoded token as identity proof.
      async verifyUser() {
        const { user } = await call(auth.getUser());
        if (!user) throw fail(null, 'auth/invalid-credential');
        const account = await call(client.from('users')
          .select('status, first_name, last_name, email').eq('id', user.id).single());
        if (account.status !== 'active') throw fail(null, 'auth/account-disabled');
        return {
          ...toUser(user),
          firstName: account.first_name,
          lastName: account.last_name,
          email: account.email ?? user.email,
        };
      },
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

      // Історія: по 50 останніх, новіші першими. Postgres віддає numeric рядком — перетворюємо на числа.
      async loadHistory(uid) {
        const [searches, charges] = await Promise.all([
          call(client.from('search_history').select('kind, value, created_at')
            .eq('user_id', uid).order('created_at', { ascending: false }).limit(50)),
          call(client.from('charge_history').select('spot_id, spot_title, district, kwh, total, charged_at')
            .eq('user_id', uid).order('charged_at', { ascending: false }).limit(50)),
        ]);
        return { searches, charges: charges.map((c) => ({ ...c, kwh: Number(c.kwh), total: Number(c.total) })) };
      },
      addSearch: (uid, { kind, value }) => call(client.from('search_history').insert({ user_id: uid, kind, value })),
      removeSearch: (uid, { kind, value }) =>
        call(client.from('search_history').delete().eq('user_id', uid).eq('kind', kind).eq('value', value)),
      clearSearches: (uid) => call(client.from('search_history').delete().eq('user_id', uid).eq('kind', 'query')),
      addCharge: (uid, { spot_id, spot_title, district, kwh, total }) =>
        call(client.from('charge_history').insert({ user_id: uid, spot_id, spot_title, district, kwh, total })),
    };
  } catch {
    return null;
  }
}

