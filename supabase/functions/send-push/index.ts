// Edge Function send-push: викликається Database Webhook на INSERT у booking_notifications
// і надсилає Web Push на всі пристрої отримувача.
// Секрети (лише в Supabase → Edge Functions → Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
// SUPABASE_URL і SUPABASE_SERVICE_ROLE_KEY Supabase передає функції автоматично.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { buildPayload } from './payload.js';

const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
};

webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method' });
  let event: { type?: string; table?: string; record?: { recipient_id?: string; body?: string; booking_id?: string } };
  try { event = await req.json(); } catch { return json(400, { error: 'body' }); }
  const record = event?.record;
  if (event?.type !== 'INSERT' || event?.table !== 'booking_notifications' || !record?.recipient_id) {
    return json(400, { error: 'event' });
  }

  const { data: subs, error } = await db.from('push_subscriptions')
    .select('id, endpoint, p256dh, auth').eq('user_id', record.recipient_id);
  if (error) { console.error('load subscriptions failed', error.code); return json(500, { error: 'db' }); }

  const payload = JSON.stringify(buildPayload(record));
  const results = await Promise.allSettled((subs ?? []).map((s) =>
    webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 })));

  // Мертві підписки (пристрій відписався або браузер їх скасував) прибираємо; інші помилки лише в лог.
  const dead: string[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') return;
    const code = (r.reason as { statusCode?: number })?.statusCode;
    if (code === 404 || code === 410) dead.push(subs![i].id);
    else console.error('push failed', code ?? 'network');
  });
  if (dead.length) await db.from('push_subscriptions').delete().in('id', dead);

  return json(200, { sent: results.filter((r) => r.status === 'fulfilled').length, removed: dead.length });
});
