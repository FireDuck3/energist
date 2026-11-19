# Чати «як у Telegram» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Окрема вкладка «Чати» (`#/chats`, `#/chats/:id`) зі списком розмов і перепискою в стилі Telegram: бульбашки, дні, ✓/✓✓, «друкує…», дії бронювання й відгук у розмові; модалку чату прибрано.

**Architecture:** Міграція розширює `list_my_chats`, додає `status_changed_at`, читання прочитаності співрозмовником (RLS + Realtime) і авторизацію приватних broadcast-каналів для «друкує». Чисті функції — `js/chat-view-model.js`; сторінка — `js/views/chats.js`; поле вводу — `js/views/chat-composer.js`; сервісні методи — `js/supabase.js`; навігація — `js/app.js`.

**Tech Stack:** HTML/CSS/JS, supabase-js 2.45.4 (Postgres changes + broadcast з `config.private`), Supabase Realtime Authorization (`realtime.messages`).

**Spec:** `docs/specs/2026-11-19-telegram-chats-design.md`

## Global Constraints

- Тести: `py tests/serve.py 8420` у фоні, `bash tests/run-headless.sh`; база 214/214; `revealOnScroll` — відомий нестабільний тест.
- Маршрути: `/chats`, `/chats/:id` (id бронювання). Вкладка телефону: `['#/chats', '💬', 'Чати', p => p.startsWith('/chats')]` між «Господар» і «Профіль»; пункт «Чати» в шапці.
- Тексти: «Чати», «Пошук…», «Оберіть розмову», «Чатів ще немає — вони з'являються після запиту на бронювання.», «Знайти зарядку», «Увійдіть, щоб бачити чати», «Сьогодні», «Вчора», «Ви: », «Немає повідомлень», «друкує…», «Не надіслано · Повторити», «↓ Нові повідомлення», «Забагато повідомлень. Зачекайте хвилину.», «Повідомлення…».
- Enter — надіслати, Shift+Enter — новий рядок; поле до 5 рядків; прев'ю 120 символів.
- «Друкує»: подія не частіше 1 раз / 3 с, зникає через 5 с.
- Опитування як запасний шлях: розмова 20 с, список 60 с (як зараз).
- Без статусу «онлайн». Один чат = одне бронювання.
- Коміти з `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- Перехід між чатами або вихід із маршруту лишає старі Realtime-підписки → подвійні повідомлення / витік (Task 4).
- Посилання `#/chats/<id>` на чужий або неіснуючий чат → «Чат не знайдено», без помилок (Task 4).
- Повідомлення, надіслане оптимістично, і та сама подія з Realtime → показується один раз (Task 2 `mergeMessages`).
- Межа доби за Києвом у роздільниках днів (Task 2).
- Вихід з акаунта з відкритим чатом → сторінка очищується, підписки знято (Task 4).

---

### Task 1: Міграція

**Files:**
- Create: `supabase/migrations/202611190002_chat_ux.sql`
- Modify: `README.md` (розділ «Чати як у Telegram: розгортання й перевірка»)

**Interfaces:**
- Produces:
  - `pilot_bookings.status_changed_at timestamptz` + тригер `before update of status` (`new.status_changed_at := now()` при зміні статусу).
  - `drop function list_my_chats(); create function list_my_chats()` з полями: `id, spot_id, guest_id, owner_id, slot, status, counterpart_name, created_at, status_changed_at, spot_title, last_message_at, last_message_mine, last_message_body (left(body,120)), unread_count, counterpart_last_read_at`.
  - Політика `booking_reads`: `select` для `user_id = auth.uid() or public.booking_participant(booking_id)`; `alter publication supabase_realtime add table public.booking_reads`.
  - Realtime Authorization: функція `public.chat_topic_booking(topic text) returns uuid` (повертає uuid з `chat:<uuid>` або null без винятку) і політики на `realtime.messages` для `authenticated`: `select` і `insert` лише коли `extension = 'broadcast'` і `public.booking_participant(public.chat_topic_booking(realtime.topic()))`.

- [ ] **Step 1:** Написати міграцію за стилем попередніх (`security definer set search_path=''`, revoke/grant). `chat_topic_booking`: `case when topic ~ '^chat:[0-9a-f-]{36}$' then substring(topic from 6)::uuid end`.
- [ ] **Step 2:** README: застосування; у Supabase → Realtime → Settings вимкнути «Allow public access» не обов'язково (канали приватні з `config.private`); чекліст: сторонній користувач не бачить `last_message_body`; не отримує подій `booking_reads` і broadcast чужого чату; `status_changed_at` оновлюється при підтвердженні.
- [ ] **Step 3:** Коміт `feat(db): chat previews, read receipts and typing channel auth`.

### Task 2: Чисті функції розмови

**Files:**
- Create: `js/chat-view-model.js`
- Test: `tests/chat-view-model.test.js` (додати в `tests/index.html`)

**Interfaces:**
- Consumes: `kyivNow`, `addDays` з `js/calendar.js`; `normalizeQuery` з `js/filters.js`; `formatLastMessage`, `sortChats` з `js/chats.js`.
- Produces:
  - `dayLabel(day: 'YYYY-MM-DD', now: Date): string` — «Сьогодні», «Вчора», інакше «12 листопада» (+ рік, якщо не поточний).
  - `groupByDay(items: {created_at}[], now): {day, label, items}[]` за київською датою, у хронологічному порядку.
  - `messageTicks(msg: {author_id, created_at, pending?, failed?}, me, counterpartReadAt: string|null): 'sending'|'failed'|'sent'|'read'|null` (`null` для чужих).
  - `chatPreview(chat, me): string` — «Ви: <текст>» / «<текст>» / «Немає повідомлень».
  - `filterChats(chats, query)` — за `counterpart_name` і `spot_title`, без регістру й апострофів.
  - `mergeMessages(server: Msg[], local: Msg[]): Msg[]` — злиття за `id`, серверна версія перемагає, локальні `pending/failed` без серверної пари лишаються наприкінці; сортування за `created_at`.
  - `bookingActions(booking, me, now): ('confirm'|'decline'|'cancel'|'complete')[]` — господар + `pending` → confirm, decline; гість + `pending|confirmed` → cancel; будь-хто + `confirmed` і кінець слоту ≤ now (Київ) → complete.
  - `systemEvents(booking): {created_at, text}[]` — «Запит на бронювання надіслано» (`created_at`) і текст поточного статусу (`status_changed_at`): confirmed «Бронювання підтверджено», declined «Запит відхилено», cancelled «Бронювання скасовано», completed «Співпрацю завершено — залиште відгук».
  - `isTypingFresh(lastTypingAt: number|null, now: number): boolean` — менше 5000 мс.

- [ ] **Step 1:** Падаючі тести на кожну функцію, зокрема: межа доби (`now=2026-11-18T22:30Z`, повідомлення `21:50Z` → група «Вчора»); `messageTicks` своє з `counterpartReadAt` пізніше → `'read'`, раніше → `'sent'`, `pending` → `'sending'`, чуже → `null`; `mergeMessages` не дублює повідомлення з однаковим `id`; `bookingActions` для господаря/гостя в кожному статусі; `filterChats('олег')` знаходить «Олег», `"п'ятн"` знаходить «П’ятничани».
- [ ] **Step 2:** Запустити — падають. **Step 3:** Реалізувати. **Step 4:** Проходять; коміт `feat(chats): conversation view-model helpers`.

### Task 3: Сервіс і поле вводу

**Files:**
- Create: `js/views/chat-composer.js`
- Modify: `js/supabase.js`, `js/pilot.js`, `supabase/functions/send-push/payload.js`, `tests/push-payload.test.js`
- Test: `tests/chat-composer.test.js` (додати в `tests/index.html`)

**Interfaces:**
- Produces:
  - Сервіс: `getChatReadState(bookingId)` → `counterpart_last_read_at` (через `list_my_chats` або `booking_reads` select по booking); `subscribeToReads(bookingId, onChange) → off`; `openTypingChannel(bookingId, onTyping: (userId) => void) → { sendTyping(), close() }` (канал `chat:<id>`, `config: { private: true, broadcast: { self: false } }`, подія `typing` з `{ user_id }`).
  - `pilot.chats()` → відсортовані чати; `pilot.act(bookingId, action)` для `confirm|decline|cancel|complete` (на основі наявного `change`).
  - `createComposer({ onSend: (text) => Promise<void>, onTyping: () => void }) → { el, focus(), setDisabled(bool) }`: textarea з авторозміром до 5 рядків, Enter надсилає (без Shift), Shift+Enter — рядок, порожнє не надсилається, `onTyping` не частіше 1 раз / 3 с.
  - `buildPayload` повертає `url: '#/chats/' + booking_id` (якщо є `booking_id`), інакше `#/chats`.

- [ ] **Step 1:** Падаючі тести: composer — Enter викликає `onSend('текст')` і очищує поле; Shift+Enter не надсилає; пробіли не надсилаються; `onTyping` при трьох введеннях за 1 с викликається один раз (підроблений годинник через параметр `now`); `buildPayload({booking_id:'b1'}).url === '#/chats/b1'`.
- [ ] **Step 2:** Запустити — падають. **Step 3:** Реалізувати composer, payload, сервісні методи, `pilot.act`. **Step 4:** Проходять; коміт `feat(chats): composer, typing channel and service methods`.

### Task 4: Сторінка «Чати» й навігація

**Files:**
- Create: `js/views/chats.js`
- Modify: `js/app.js` (маршрути, шапка, вкладка з бейджем), `js/pilot.js` (сповіщення відкривають `#/chats/<id>`, кнопки «Чат» у панелях → посилання), `js/views/profile.js` (розділ «Чати» → посилання «Відкрити чати»), `css/styles.css`, `README.md`
- Delete: `js/views/conversation.js` (логіку відгуків і скарги перенесено)

**Interfaces:**
- Consumes: усе з Task 2–3, `openReport` з `js/views/report.js`, `formatLastMessage`/`unreadLabel` з `js/chats.js`.
- Produces: `render({ id }, root, store, session, userHistory, pilot)` для обох маршрутів.

- [ ] **Step 1:** Розмітка: `.chats-layout` з `.chats-list` і `.chats-thread`; класи `chats-has-thread` для телефону (показ лише розмови); список із пошуком, рядками чатів (аватар, ім'я, точка, прев'ю, час, бейдж), порожні стани; без входу — «Увійдіть, щоб бачити чати» з кнопкою входу.
- [ ] **Step 2:** Розмова: шапка (← на телефоні, аватар, ім'я, точка, дата/час слоту, статус, «друкує…», меню «⋮» з «Поскаржитися» і «Відкрити точку»), плашка дій із `bookingActions`, стрічка з `groupByDay(mergeMessages(...) + systemEvents)`, бульбашки з часом і галочками, картка відгуку для `completed` без власного відгуку (перенесено з `conversation.js`), кнопка «↓ Нові повідомлення», composer.
- [ ] **Step 3:** Життєвий цикл: при відкритті чату — завантаження повідомлень, `markBookingRead`, підписки (повідомлення, прочитаність, «друкує»), опитування 20 с; при зміні чату / виході з маршруту / зміні акаунта — відписка всього. Неіснуючий/чужий id → «Чат не знайдено» з кнопкою «До чатів». Оптимістична відправка з `crypto.randomUUID()`; збій → `failed` з «Повторити»; `WW429` → текст ліміту.
- [ ] **Step 4:** Навігація й інтеграція: маршрути `/chats`, `/chats/:id`; пункт «Чати» в шапці й вкладка 💬 з бейджем `pilot.totalUnread()` (перемальовка на `pilot.subscribe`); `pilot.openBooking(id)` → `location.hash = '#/chats/' + id`; кнопки «Чат»/«Відкрити чат» у кабінеті → посилання; видалити `conversation.js` та його імпорти.
- [ ] **Step 5:** Стилі (бульбашки своїх/чужих, роздільники, системні рядки, два стовпці ≥ 900 px, телефон — один стовпець, приховування `tabbar` у відкритій розмові, блекаут-тема); README — опис.
- [ ] **Step 6:** Повний набір тестів `PASS`; вручну в браузері з підробленим сервісом: два стовпці й мобільний вигляд (375 px), перемикання між чатами без дублювання повідомлень, Enter/Shift+Enter, збій відправки → «Повторити», «друкує…», ✓✓ після події прочитаності, `#/chats/невідомий` → «Чат не знайдено»; консоль без помилок.
- [ ] **Step 7:** Коміт `feat(chats): Telegram-style chats tab`.
