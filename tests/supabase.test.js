import { test, eq } from './runner.js';
import { toAuthCode, responseCode } from '../js/supabase.js';

test('коди Supabase → коди сесії', () => {
  eq(toAuthCode({ code: 'invalid_credentials' }), 'auth/invalid-credential');
  eq(toAuthCode({ code: 'user_already_exists' }), 'auth/email-already-in-use');
  eq(toAuthCode({ code: 'email_exists' }), 'auth/email-already-in-use');
  eq(toAuthCode({ code: 'weak_password' }), 'auth/weak-password');
  eq(toAuthCode({ code: 'otp_expired' }), 'auth/invalid-code');
  eq(toAuthCode({ code: 'over_email_send_rate_limit' }), 'auth/email-rate-limit');
  eq(toAuthCode({ code: 'over_request_rate_limit' }), 'auth/too-many-requests');
  eq(toAuthCode({ code: 'email_address_not_authorized' }), 'auth/email-not-allowed');
  eq(toAuthCode({ code: 'email_address_invalid' }), 'auth/invalid-email');
  eq(toAuthCode({ code: 'validation_failed' }), 'auth/invalid-email');
  eq(toAuthCode({ code: 'signup_disabled' }), 'auth/operation-not-allowed');
  eq(toAuthCode({ status: 0, message: 'Failed to fetch' }), 'auth/network-request-failed');
  eq(toAuthCode(new TypeError('Failed to fetch')), 'auth/network-request-failed');
  eq(toAuthCode({ code: 'щось_нове' }), 'auth/unknown');
  eq(toAuthCode(undefined), 'auth/unknown');
});

test("відповідь без мережі (status 0, порожній code) → немає з'єднання", () => {
  eq(responseCode({ status: 0, error: { code: '', message: 'TypeError: Failed to fetch' } }), 'auth/network-request-failed');
  eq(responseCode({ status: 400, error: { code: 'invalid_credentials' } }), 'auth/invalid-credential');
  eq(responseCode({ status: 401, error: { code: '42501', message: 'RLS' } }), 'auth/unknown');
});

test('toPilotSpot: пауза, неробочі дні, фото як публічні URL', async () => {
  const { toPilotSpot } = await import('../js/supabase.js');
  const row = { id: 'p1', owner_id: 'u', archived_at: null, title: 'Т', district: 'Д', lat: '49.2', lng: '28.4', source: 'solar',
    connector: 'type2', power_kw: '7.4', price_per_kwh: '11', devices: ['ev'], opens: '08:00:00', closes: '20:00:00',
    paused: true, closed_weekdays: [6, 7], photos: ['u/p1/a.jpg'] };
  const s = toPilotSpot(row, [{ spot_id: 'p1', author_name: 'А', rating: 5, body: 'ок', created_at: 'x' }], (p) => `https://cdn/${p}`);
  eq([s.paused, s.closedWeekdays, s.photos, s.photoPaths], [true, [6, 7], ['https://cdn/u/p1/a.jpg'], ['u/p1/a.jpg']]);
  eq([s.lat, s.powerKw, s.schedule, s.pilot, s.reviews.length], [49.2, 7.4, { from: '08:00', to: '20:00' }, true, 1]);
  const old = toPilotSpot({ ...row, paused: undefined, closed_weekdays: undefined, photos: undefined }, [], (p) => p);
  eq([old.paused, old.closedWeekdays, old.photos], [false, [], []]);
});

test('spotCover: перше фото точки, інакше — обкладинка джерела', async () => {
  const { spotCover } = await import('../js/ui.js');
  eq(spotCover({ source: 'solar', photos: ['https://cdn/x.jpg'] }), 'https://cdn/x.jpg');
  eq(spotCover({ source: 'solar', photos: [] }), spotCover({ source: 'solar' }));
});
