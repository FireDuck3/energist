# Чати й сповіщення (Етап 4а) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Realtime-чати з лічильником непрочитаних і часом останнього повідомлення, антиспам, push-сповіщення з дозволу через Edge Function і нагадування про бронювання.

**Architecture:** Міграція додає Realtime-публікацію, прочитання чатів, `list_my_chats`, ліміт повідомлень, підписки push і нагадування через `pg_cron`. Edge Function `send-push` шле Web Push на кожен новий запис `booking_notifications` (Database Webhook). Чисті модулі (`js/chats.js`, `js/push.js`, `supabase/functions/send-push/payload.js`) тестуються в браузерному ранері; Realtime і UI — у `supabase.js`, `pilot.js`, `conversation.js`, `profile.js`.

**Tech Stack:** HTML/CSS/JS, supabase-js 2.45.4 (Realtime), Service Worker + Push API, Supabase Edge Functions (Deno, `npm:web-push@3.6.7`), pg_cron.

**Spec:** `docs/specs/2026-11-18-chats-notifications-design.md`

## Global Constraints

- Тести: `bash tests/run-headless.sh` (сервер 8420), нові файли — у `tests/index.html`; база 193/193; `revealOnScroll` — відомий нестабільний тест.
- Ліміт повідомлень: 10 за хвилину, 300 за добу на автора; SQLSTATE `WW429`; текст для користувача «Забагато повідомлень. Зачекайте хвилину.».
- Нагадування: для `confirmed`, старт через 50–70 хв за Києвом, один раз (`reminded_at`), cron кожні 10 хв; текст «Нагадування: зарядка о HH:MM · <назва точки>».
- Резервне опитування: чат 20 с, сповіщення 60 с.
- Секрети (VAPID private, service_role) лише в секретах Edge Function; у репозиторії й `js/` — тільки публічний VAPID-ключ.
- Push лише після явного кліку користувача й дозволу браузера.
- Тексти українською; коміти малі з `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- Realtime-підписка не відписується при закритті чату/виході з акаунта → подвійні обробники, витоки (Task 5).
- Чужі повідомлення/сповіщення через Realtime (RLS має відсікати; ручний чекліст, Task 1).
- Браузер без Push/ServiceWorker або з заблокованим дозволом — зрозумілий стан, без винятків (Task 3).
- Повторне нагадування для того самого бронювання (Task 1, `reminded_at`).
- Мертва push-підписка (404/410) видаляється, інші помилки не ламають розсилку решті пристроїв (Task 4).

---

### Task 1: Міграція й чекліст

**Files:**
- Create: `supabase/migrations/202611180003_chats_push.sql`
- Modify: `README.md`

**Interfaces:**
- Produces: Realtime для `booking_messages`, `booking_notifications`; таблиця `booking_reads`; RPC `mark_booking_read(booking uuid) returns void`; RPC `list_my_chats() returns table(id, spot_id, guest_id, owner_id, slot, status, counterpart_name, last_message_at timestamptz, last_message_mine boolean, unread_count integer)`; тригер ліміту `WW429`; таблиця `push_subscriptions(id uuid pk, user_id uuid default auth.uid(), endpoint text unique, p256dh text, auth text, created_at)` з RLS (insert/select/delete своїх); `pilot_bookings.reminded_at`; `send_booking_reminders() returns integer`; `cron.schedule('wattway-booking-reminders', '*/10 * * * *', 'select public.send_booking_reminders()')`.

- [ ] **Step 1:** Написати міграцію в стилі наявних (`security definer set search_path=''`, `account_is_active()`, revoke/grant). `list_my_chats` будується на запиті `list_my_pilot_bookings` + бічні підзапити по `booking_messages` і `booking_reads`. Ліміт — `before insert` тригер, що рахує повідомлення автора за `now() - interval '1 minute'` і `'1 day'` (індекс `booking_messages(author_id, created_at)`).
- [ ] **Step 2:** README: розділ «Чати й push: розгортання» (міграція; `create extension if not exists pg_cron` вже в міграції; VAPID-ключі; створення функції `send-push` у Dashboard з кодом із репозиторію і секретами `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`; Database Webhook) і ручний чекліст: 11-те повідомлення за хвилину → `WW429`; B не отримує Realtime-подій чужого чату; `list_my_chats` рахує непрочитані й обнуляє після `mark_booking_read`; нагадування приходить один раз; push на телефон із закритим сайтом; вимкнення push видаляє підписку.
- [ ] **Step 3:** Перевірити очима кількість `security definer` і відсутність грантів на чужі рядки; коміт `feat(db): realtime chats, unread state, rate limit, push subscriptions and reminders`.

### Task 2: Чисті функції чатів

**Files:**
- Create: `js/chats.js`
- Test: `tests/chats.test.js` (додати в `tests/index.html`)

**Interfaces:**
- Produces: `formatLastMessage(iso: string|null, now: Date): string` — `''` для null, «щойно» (< 1 хв), `HH:MM` (сьогодні за Києвом), «вчора», інакше `D міс` (`12 лис`); `totalUnread(chats): number`; `sortChats(chats): chats` — спершу з `unread_count > 0`, далі за `last_message_at` (новіші вище, без повідомлень — унизу), стабільно; `unreadLabel(n): string` — `''`, `'1'`…`'99'`, `'99+'`.

- [ ] **Step 1:** Падаючі тести для кожного випадку (зокрема межа доби за Києвом: `now=2026-11-18T22:30Z` — це 19 листопада 00:30 у Києві; повідомлення `2026-11-18T21:50Z` — 18 листопада 23:50 → «вчора»).
- [ ] **Step 2:** Запустити — падають. **Step 3:** Реалізувати (використати `kyivNow` з `js/calendar.js`). **Step 4:** Проходять; коміт `feat(chats): unread and last-message helpers`.

### Task 3: Push у браузері

**Files:**
- Create: `js/push.js`, `sw.js`, `supabase/functions/send-push/payload.js`
- Modify: `js/supabase-config.js` (`vapidPublicKey: ''` з коментарем, де взяти)
- Test: `tests/push.test.js`, `tests/push-payload.test.js` (додати в `tests/index.html`)

**Interfaces:**
- Produces: `urlBase64ToUint8Array(s: string): Uint8Array`; `pushSupported(env = globalThis): boolean` (є `serviceWorker`, `PushManager`, `Notification`); `pushState({env, vapidKey}): Promise<'unsupported'|'unconfigured'|'denied'|'on'|'off'>`; `enablePush({service, vapidKey, env}): Promise<void>` (реєструє `sw.js`, просить дозвіл, підписується, `service.savePushSubscription(sub.toJSON())`); `disablePush({service, env}): Promise<void>` (відписка + `service.deletePushSubscription(endpoint)`). `buildPayload(record: {body, booking_id}): {title: 'WattWay', body, url: '#/profile', tag: string}` (`tag = 'booking-' + booking_id`, текст обрізано до 180 символів).

- [ ] **Step 1:** Падаючі тести: `urlBase64ToUint8Array('AQID')` → `[1,2,3]`, з `-`/`_`; `pushSupported({})===false`; `pushState` з env без `PushManager` → `'unsupported'`, з порожнім ключем → `'unconfigured'`, `Notification.permission==='denied'` → `'denied'`, наявна підписка → `'on'`, інакше `'off'` (підроблені `navigator.serviceWorker.getRegistration` і `pushManager.getSubscription`); `enablePush` викликає `savePushSubscription` з endpoint і ключами, при `denied` кидає `code:'denied'`; `buildPayload` поля й обрізання.
- [ ] **Step 2:** Запустити — падають. **Step 3:** Реалізувати; `sw.js`: `push` → `showNotification(title, {body, tag, data:{url}})`, `notificationclick` → фокус на відкритій вкладці або `clients.openWindow('/' + url)`. **Step 4:** Проходять; коміт `feat(push): browser subscription and payload`.

### Task 4: Edge Function `send-push`

**Files:**
- Create: `supabase/functions/send-push/index.ts`

**Interfaces:**
- Consumes: `buildPayload` з `./payload.js`; тіло вебхука `{type:'INSERT', table:'booking_notifications', record}`.
- Produces: HTTP 200 `{sent, removed}`; 400 для неправильного тіла.

- [ ] **Step 1:** Реалізувати: `Deno.serve`; `npm:web-push@3.6.7` з `setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)`; `npm:@supabase/supabase-js@2.45.4` з `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` (стандартні змінні функції); читати підписки `recipient_id`; `Promise.allSettled` надсилань; 404/410 → видалити підписку; інші помилки — лише в лог без вмісту ключів.
- [ ] **Step 2:** Перевірити очима: жодних секретів у коді; коміт `feat(push): send-push edge function`.

### Task 5: Realtime, непрочитані, антиспам і блок push у профілі

**Files:**
- Modify: `js/supabase.js`, `js/pilot.js`, `js/views/conversation.js`, `js/views/profile.js`, `css/styles.css`, `README.md`
- Test: повний набір

**Interfaces:**
- Consumes: усе з Task 1–3.
- Produces: методи сервісу `listMyChats()`, `markBookingRead(id)`, `subscribeToChat(bookingId, onInsert): () => void`, `subscribeToNotifications(userId, onInsert): () => void`, `savePushSubscription(json)`, `deletePushSubscription(endpoint)`; `pilot.chats()` дані з `listMyChats`; `pilot.totalUnread()`.

- [ ] **Step 1:** `supabase.js`: методи вище (Realtime через `client.channel(...).on('postgres_changes', {event:'INSERT', schema:'public', table, filter}, cb).subscribe()`, відписка `client.removeChannel`); помилка вставки з кодом `WW429` пробрасується з `code:'WW429'` (додати до `call`).
- [ ] **Step 2:** `pilot.js`: опитування 60 с; підписка на сповіщення поточного користувача (перепідписка при зміні акаунта, відписка при виході) → `refresh()`; чати з `listMyChats` (`sortChats`), у `chatsPanel` — `formatLastMessage`, бейдж `unreadLabel`, заголовок «Мої чати · N»; відкриття чату → `markBookingRead` і оновлення.
- [ ] **Step 3:** `conversation.js`: Realtime-підписка на чат → `load()`; опитування 20 с; відписка при закритті; `markBookingRead` після кожного завантаження з новими повідомленнями; `WW429` → «Забагато повідомлень. Зачекайте хвилину.».
- [ ] **Step 4:** `profile.js`: блок «Сповіщення на пристрої» в розділі «Профіль» зі станом з `pushState` (тексти для кожного стану) і кнопкою «Увімкнути» / «Вимкнути»; помилки показуються в блоці.
- [ ] **Step 5:** Стилі бейджа непрочитаних; README — опис функцій. Повний набір тестів `PASS`; вручну в браузері: профіль показує «не налаштовано» без ключа; чат з підробленим сервісом показує повідомлення «Забагато повідомлень…» на `WW429`; список чатів сортується з бейджами; консоль без помилок.
- [ ] **Step 6:** Коміт `feat(chats): realtime, unread counters, rate-limit message and device notifications`.
