# Етап 4а: чати й сповіщення — дизайн

## Мета
Гість і господар бачать нові повідомлення й події одразу, не пропускають бронювання й отримують сповіщення навіть із закритим сайтом (за їхнім дозволом). Чат захищено від спаму.

## Що вже є
- `booking_messages` (RLS: лише учасники), чат опитує сервер кожні 5 с (`js/views/conversation.js`).
- `booking_notifications` + тригери: новий запит, підтвердження, відхилення, скасування, завершення, нове повідомлення. Дзвіночок опитує кожні 20 с (`js/pilot.js`).
- Відгуки лише після `completed` (RLS).

## Цілі
1. **Realtime:** нові повідомлення в чаті й нові сповіщення приходять через Supabase Realtime; опитування лишається запасним (рідше: чат 20 с, сповіщення 60 с).
2. **Непрочитані:** у списку чатів — лічильник непрочитаних і час останнього повідомлення; загальна кількість біля «Мої чати». Відкриття чату позначає його прочитаним.
3. **Push з дозволу:** кнопка «Увімкнути сповіщення на пристрої» в профілі (і вимкнути). Push надходить для кожного нового запису в `booking_notifications` — це покриває нові запити, рішення, скасування, повідомлення та нагадування.
4. **Нагадування:** за ~1 год до підтвердженого бронювання обом учасникам (один раз).
5. **Антиспам:** не більше 10 повідомлень за хвилину й 300 за добу від одного автора; перевищення — зрозуміла помилка в чаті.

## Не цілі
Рейтинги, скарги, «Перевірена точка», повідомлення про неправильні дані (Етап 4б). Тонкі налаштування за типами сповіщень, e-mail/SMS, вкладення в чаті, «друкує…».

## Підходи до push
1. **Supabase Edge Function + Database Webhook (обрано користувачем).** Вебхук на `insert` у `booking_notifications` викликає функцію `send-push`, яка шле Web Push усім пристроям отримувача (VAPID). Нагадування — `pg_cron` у базі вставляє сповіщення, далі той самий шлях. Миттєво, працює з закритим сайтом.
2. Лише Notification API при відкритій вкладці — не доходить із закритим сайтом; відкинуто.
3. GitHub Actions за розкладом — затримка 5–15 хв для чату; відкинуто.

## Дизайн
**Міграція `202611180003_chats_push.sql`:**
- `alter publication supabase_realtime add table booking_messages, booking_notifications` (Realtime поважає RLS).
- `booking_reads(booking_id, user_id, last_read_at, primary key(booking_id, user_id))` — RLS лише свої рядки; RPC `mark_booking_read(booking uuid)` (учасник).
- RPC `list_my_chats()` — як `list_my_pilot_bookings` плюс `last_message_at`, `last_message_mine boolean`, `unread_count` (повідомлення співрозмовника після `last_read_at`).
- Тригер `before insert` на `booking_messages`: ліміт 10/хв і 300/добу на `author_id`, помилка з кодом `WW429`.
- `push_subscriptions(id, user_id default auth.uid(), endpoint unique, p256dh, auth, created_at)` — RLS: користувач вставляє/читає/видаляє лише свої; клієнту не видно чужих.
- `pilot_bookings.reminded_at timestamptz`; функція `send_booking_reminders()` вставляє «Нагадування: зарядка о HH:MM · <точка>» обом учасникам для `confirmed`, що починаються через 50–70 хв і ще без `reminded_at`, і ставить `reminded_at`; `pg_cron` кожні 10 хв.

**Edge Function `supabase/functions/send-push/index.ts`** (Deno, `npm:web-push`): приймає тіло вебхука (`record` з `booking_notifications`), читає підписки отримувача через `service_role` (змінні середовища функції), шле `{title: 'WattWay', body, url: '#/profile'}`; підписки з відповіддю 404/410 видаляє. Секрети: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — лише в Supabase, не в репозиторії. Формування payload — чистий модуль `supabase/functions/send-push/payload.js`, тестується в браузерному ранері.

**Фронтенд:**
- `sw.js` у корені: показ push і відкриття сайту по кліку.
- `js/push.js`: `pushSupported()`, `urlBase64ToUint8Array()`, `enablePush(service)` / `disablePush(service)` / `pushState()`; публічний VAPID-ключ у `js/supabase-config.js`.
- `js/chats.js` (чисті функції): `formatLastMessage(date, now)` («щойно», «14:05», «вчора», «12 лис»), `totalUnread(chats)`, `sortChats(chats)` (непрочитані й свіжі вгорі).
- `js/supabase.js`: `listMyChats`, `markBookingRead`, `subscribeToChat(bookingId, onInsert)`, `subscribeToNotifications(onInsert)`, `savePushSubscription`, `deletePushSubscription`.
- `pilot.js`/`conversation.js`: Realtime-підписки з відпискою при закритті/виході; помилка `WW429` → «Забагато повідомлень. Зачекайте хвилину.».
- Профіль: блок «Сповіщення на пристрої» (статус, увімкнути/вимкнути; якщо браузер заблокував дозвіл — пояснення).

**Тести:** `tests/chats.test.js`, `tests/push.test.js`, `tests/push-payload.test.js`; SQL і Edge Function — ручний чекліст у README (ліміт повідомлень, Realtime лише для учасників, push на телефон, нагадування).

## Мої рішення
- Push тексти без деталей бронювання понад наявний текст сповіщення (він уже без персональних даних, лише назва точки).
- Нагадування за 1 год, одне на бронювання; вікно 50–70 хв під крок cron 10 хв.
- Ліміти антиспаму: 10/хв, 300/добу.

## Від користувача знадобиться
1. Застосувати міграцію (вмикає `pg_cron`, якщо ще ні — або через Dashboard → Extensions).
2. Згенерувати VAPID-ключі (`npx web-push generate-vapid-keys` або будь-який онлайн-генератор VAPID), публічний — в `js/supabase-config.js`, обидва — у секрети функції.
3. Створити Edge Function `send-push` у Dashboard (вставити код із репозиторію) і Database Webhook: таблиця `booking_notifications`, подія Insert, тип «Supabase Edge Functions» → `send-push`.
