// Edge Function send-push: викликається Database Webhook на INSERT у booking_notifications
// і надсилає Web Push на всі пристрої отримувача.
//
// Безпека: тілу запиту НЕ довіряємо. Функція (1) вимагає секретний заголовок x-webhook-secret,
// який знає лише вебхук; (2) бере текст і отримувача з бази за record.id; (3) «забирає» рядок,
// ставлячи pushed_at, лише якщо він свіжий (до 5 хв) і ще не пушився — повтори нічого не дадуть.
//
// Секрети (Supabase → Edge Functions → Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT,
// WEBHOOK_SECRET. SUPABASE_URL і SUPABASE_SERVICE_ROLE_KEY Supabase передає функції автоматично.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { buildPayload, secretMatches } from './payload.js';

const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
};

webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
const WEBHOOK_SECRET = env('WEBHOOK_SECRET');
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const FRESH_MS = 5 * 60 * 1000;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method' });
  if (!secretMatches(req.headers.get('x-webhook-secret'), WEBHOOK_SECRET)) return json(401, { error: 'unauthorized' });

  let event: { type?: string; table?: string; record?: { id?: number } };
  try { event = await req.json(); } catch { return json(400, { error: 'body' }); }
  const id = event?.record?.id;
  if (event?.type !== 'INSERT' || event?.table !== 'booking_notifications' || !Number.isInteger(id)) {
    return json(400, { error: 'event' });
  }

  // Атомарно «беремо» сповіщення: лише свіже й ще не надіслане. Дані — з бази, не з запиту.
  const { data: claimed, error: claimError } = await db.from('booking_notifications')
    .update({ pushed_at: new Date().toISOString() })
    .eq('id', id).is('pushed_at', null).gt('created_at', new Date(Date.now() - FRESH_MS).toISOString())
    .select('id, recipient_id, body, booking_id');
  if (claimError) { console.error('claim failed', claimError.code); return json(500, { error: 'db' }); }
  const record = claimed?.[0];
  if (!record) return json(200, { sent: 0, removed: 0, skipped: true });

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
