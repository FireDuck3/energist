import { test, eq } from './runner.js';
import { buildPayload } from '../supabase/functions/send-push/payload.js';

test('buildPayload: заголовок, текст, посилання, тег бронювання', () => {
  eq(buildPayload({ body: 'Нове повідомлення · Гараж', booking_id: 'b1' }),
    { title: 'WattWay', body: 'Нове повідомлення · Гараж', url: '#/chats/b1', tag: 'booking-b1' });
});

test('buildPayload: довгий текст обрізається до 180 символів', () => {
  const p = buildPayload({ body: 'я'.repeat(500), booking_id: 'b1' });
  eq(p.body.length, 180);
  eq(p.body.endsWith('…'), true);
});

test('secretMatches: лише точний збіг непорожнього секрету', async () => {
  const { secretMatches } = await import('../supabase/functions/send-push/payload.js');
  eq(secretMatches('s3cret', 's3cret'), true);
  eq(secretMatches('s3creT', 's3cret'), false);
  eq(secretMatches('s3cre', 's3cret'), false);
  eq(secretMatches(null, 's3cret'), false);
  eq(secretMatches('', ''), false);
});

test('buildPayload: посилання веде одразу в чат бронювання', () => {
  eq(buildPayload({ body: 'x', booking_id: 'b1' }).url, '#/chats/b1');
  eq(buildPayload({ body: 'x' }).url, '#/chats');
});

test('isPushEndpoint: лише https-адреси справжніх push-сервісів браузерів', async () => {
  const { isPushEndpoint } = await import('../supabase/functions/send-push/payload.js');
  const ok = ['https://fcm.googleapis.com/fcm/send/abc:APA91', 'https://updates.push.services.mozilla.com/wpush/v2/gAAA',
    'https://web.push.apple.com/QGx', 'https://wns2-par02p.notify.windows.com/w/?token=BQY'];
  const bad = ['http://fcm.googleapis.com/fcm/send/x', 'https://evil.example/fcm.googleapis.com/x', 'https://fcm.googleapis.com.evil.example/x',
    'https://evil.example/?h=web.push.apple.com', 'https://notify.windows.com.evil.example/w', 'https://user@fcm.googleapis.com/x',
    'https://fcm.googleapis.com:8443/x', 'https://127.0.0.1/x', 'javascript:alert(1)', '', null, undefined, 42];
  eq(ok.map(isPushEndpoint), ok.map(() => true));
  eq(bad.map(isPushEndpoint), bad.map(() => false));
});
