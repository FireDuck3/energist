# Головне про господаря у вікні точки на карті — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** У popup приватної точки показати ім'я, телефон і email (увійшлим), позначку перевірки, статус доступності, дату реєстрації та бажані канали зв'язку господаря.

**Architecture:** Міграція додає `profiles.contact_channels` і RPC для його збереження та перевизначає `pilot_spot_host_card` (контакти — будь-якому увійшлому). Чисті функції в `js/host-profile.js`; карта довантажує картку господаря при відкритті popup; кабінет господаря отримує вибір каналів; сторінка точки показує те саме.

**Tech Stack:** HTML/CSS/JS (ES-модулі), Leaflet, Supabase (Postgres, RLS, RPC).

**Spec:** `docs/specs/2026-11-24-map-host-popup-design.md`

## Global Constraints

- Гілка `feat/map-host-popup` від `main`; коміти лише в ній; у `main` — тільки за словом користувача.
- Тести: `py tests/serve.py 8420` у фоні, `bash tests/run-headless.sh`; база 244/244; `revealOnScroll` — відомий нестабільний тест.
- Канали (id → підпис): `chat` «Чат WattWay», `phone` «Дзвінок», `telegram` «Telegram», `viber` «Viber», `whatsapp` «WhatsApp», `email` «Email».
- Статуси: «Відчинено до HH:MM», «Зачинено · відкриється о HH:MM», «Сьогодні вихідний», «На паузі» — за часом Києва.
- Без входу замість контактів: «Увійдіть, щоб побачити телефон і email».
- Фото господаря у popup не показуємо.
- Коміти з `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- Аноніму сервер не віддає телефон і email навіть прямим викликом RPC (Task 1, SQL-чекліст).
- Картку господаря не вдалося завантажити → popup показує звичайні дані точки без помилок (Task 3).
- Господар без каналів / без телефону → відповідні рядки не показуються (Task 2).
- Межа часу закриття (о 20:00 рівно — уже «Зачинено») і неробочий день тижня за Києвом (Task 2).
- Повторне відкриття того самого popup не робить зайвих запитів (Task 3, кеш).

---

### Task 1: Міграція

**Files:**
- Create: `supabase/migrations/202611240003_host_contact_channels.sql`
- Modify: `README.md`

**Interfaces:**
- Produces: `profiles.contact_channels text[] not null default '{}'` (check: `contact_channels <@ array['chat','phone','telegram','viber','whatsapp','email']` і `cardinality ≤ 6`); `set_my_contact_channels(channels text[]) returns void` (security definer, власник, активний акаунт, дублікати прибираються); `drop` + `create` `pilot_spot_host_card(point_id uuid)` з тими самими колонками плюс `contact_channels text[]`, де `phone`/`email` повертаються, коли `auth.uid() is not null and u.status = 'active'` (без умови бронювання).

- [ ] **Step 1:** Написати міграцію за стилем попередніх (тіло `pilot_spot_host_card` — з 202611220001, змінено лише `access` і додано колонку). Grant: `set_my_contact_channels` — `authenticated`; `pilot_spot_host_card` — `anon, authenticated`.
- [ ] **Step 2:** README: розділ «Картка господаря на карті» — застосування й чекліст (анонім → `phone`/`email` = null; увійшлий → є; `set_my_contact_channels('{fax}')` → помилка; канали повертаються в картці).
- [ ] **Step 3:** Коміт `feat(db): host contact channels; contacts for signed-in users`.

### Task 2: Чисті функції

**Files:**
- Modify: `js/host-profile.js`
- Test: `tests/host-profile.test.js` (є від колеги — дописати)

**Interfaces:**
- Produces: `CONTACT_CHANNELS: {id, label}[]`; `channelLabels(ids: string[]): string[]` (невідомі відкидаються, порядок як у `CONTACT_CHANNELS`); `toHostCard(row)` додає `channels: string[]`; `availabilityLabel(spot: {paused, closedWeekdays, schedule:{from,to}}, now: Date): {state: 'open'|'closed'|'dayoff'|'paused', text: string}`.

- [ ] **Step 1:** Падаючі тести: `channelLabels(['telegram','fax','chat'])` → `['Чат WattWay','Telegram']`; `toHostCard({..., contact_channels: ['phone']}).channels` → `['phone']`, без поля → `[]`; `availabilityLabel` для 10:00 Києва з графіком 08–20 → `{state:'open', text:'Відчинено до 20:00'}`; о 20:00 → `closed`, «Зачинено · відкриється о 08:00»; о 06:00 → `closed`; неділя при `closedWeekdays:[7]` → `dayoff`, «Сьогодні вихідний»; `paused:true` → «На паузі».
- [ ] **Step 2:** Запустити — падають. **Step 3:** Реалізувати (`kyivNow`, `isoWeekday` з `js/calendar.js`). **Step 4:** Проходять; коміт `feat(host): contact channels and availability helpers`.

### Task 3: Popup на карті, кабінет, сторінка точки

**Files:**
- Modify: `js/views/map.js` (popup приватної точки), `js/views/host.js` (вибір каналів), `js/pilot.js` (`saveContactChannels`), `js/supabase.js` (`setMyContactChannels`, читання `contact_channels` у профілі господаря), `js/views/spot.js` (канали й нове правило контактів), `css/styles.css`, `README.md`

**Interfaces:**
- Consumes: Task 1 RPC; Task 2 функції; наявні `pilot.hostCard(id)`, `fitPopup(popup)` у `map.js`.
- Produces: `service.setMyContactChannels(ids)`; `pilot.saveContactChannels(ids)`.

- [ ] **Step 1:** `map.js`: popup приватної (`spot.pilot`) точки — блок господаря, що довантажується через `pilot.hostCard(spot.id)` з кешем `Map` і дедуплікацією запитів; поки вантажиться — «Завантаження…»; після — ім'я, «✓ Перевірений господар», `hostSince`, `availabilityLabel(spot, new Date()).text`, контакти (`tel:`-посилання й email) або для анонімів «Увійдіть, щоб побачити телефон і email» з кнопкою входу (`session.requireAuth`), «Зв'язок: …» з `channelLabels`; після оновлення — `fitPopup`. Збій картки — блок прибирається.
- [ ] **Step 2:** Кабінет: у формі контактів — чипи `CONTACT_CHANNELS` з мультивибором, початкові значення з профілю, збереження разом із контактами (`pilot.saveContactChannels`).
- [ ] **Step 3:** Сторінка точки: рядок «Зв'язок: …», підказку «з'являться після підтвердження бронювання» замінити на «Увійдіть, щоб побачити…» для анонімів.
- [ ] **Step 4:** Стилі блоку господаря в popup; README — опис для користувача.
- [ ] **Step 5:** Повний набір тестів `PASS`; вручну в браузері (локально, жива база після міграції або з підробленим сервісом): popup без входу й з входом, статуси, канали, вписування в карту на 375 px; консоль без помилок.
- [ ] **Step 6:** Коміт `feat(map): host summary in the spot popup`; пуш гілки.
