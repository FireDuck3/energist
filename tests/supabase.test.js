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
