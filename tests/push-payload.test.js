import { test, eq } from './runner.js';
import { buildPayload } from '../supabase/functions/send-push/payload.js';

test('buildPayload: заголовок, текст, посилання, тег бронювання', () => {
  eq(buildPayload({ body: 'Нове повідомлення · Гараж', booking_id: 'b1' }),
    { title: 'WattWay', body: 'Нове повідомлення · Гараж', url: '#/profile', tag: 'booking-b1' });
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
