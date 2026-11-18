# Календар, редагування точок і фото (Етап 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Господар редагує точку, задає графік, вихідні, паузу й фото; гість бронює приватну точку на будь-який із 30 днів і бачить лише вільний час.

**Architecture:** Нова міграція розширює `pilot_spots`, додає таблицю вихідних, RPC (редагування, пауза, вихідні, фото, доступність) і бакет Storage. Чисті модулі `js/calendar.js` і `js/photos.js` тестуються в браузерному ранері; `js/supabase.js` отримує нові методи сервісу, `js/pilot.js` — обгортки, `booking.js` і `host.js` — інтерфейс.

**Tech Stack:** HTML/CSS/JS (ES-модулі), Supabase (Postgres, RLS, RPC, Storage), Leaflet.

**Spec:** `docs/specs/2026-11-18-host-calendar-design.md`

## Global Constraints

- Тести: `bash tests/run-headless.sh` (сервер `py tests/serve.py 8420`), нові файли в `tests/index.html`; база 179/179. `ui.test` «revealOnScroll» — відомий нестабільний тест, при падінні лише його перезапустити.
- Календар гостя: 30 днів, починаючи з сьогодні за часом Києва (`Europe/Kyiv`). Вихідні господар задає на 60 днів уперед. Тривалість 1–6 год, початок на повну годину (як зараз).
- Дні тижня ISO: 1 = пн … 7 = нд.
- Фото: до 5, `image/jpeg|image/png|image/webp`, до 2 МБ після стискання, ширина до 1600 px; шлях у Storage `<owner_id>/<spot_id>/<uuid>.<ext>`; бакет `spot-photos` публічний на читання.
- Усі права перевіряються на сервері (security definer RPC з `auth.uid()` та `account_is_active()`, RLS); `service_role` у браузері заборонено.
- Зміна точки не змінює й не скасовує наявних бронювань; пауза теж (архівування поводиться як раніше).
- Демо-точки (не `pilot`) працюють як раніше: «Сьогодні / Завтра» і локальний стан.
- Тексти українською. Коміти малі з рядком `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- Перехід доби та «сьогодні» за Києвом, коли браузер в іншому поясі (Task 2).
- Слот, що торкається зайнятого інтервалу краєм (`[10:00,12:00)` і старт 12:00) — дозволений; перетин на годину — ні (Task 2).
- Точка на паузі, у вихідний або в неробочий день тижня — сервер відмовляє навіть при прямому виклику RPC (Task 1, ручний чекліст).
- Файл не-зображення, завеликий після стискання або шостий — відхиляється з українським повідомленням, нічого не завантажується (Task 3).
- Чужий користувач не може редагувати точку, ставити паузу, вихідні чи фото й не може писати в чужу теку Storage (Task 1, ручний чекліст).

---

### Task 1: Міграція

**Files:**
- Create: `supabase/migrations/202611180002_host_calendar.sql`
- Modify: `README.md` (розділ «Календар і фото: розгортання і перевірка» з ручним SQL-чеклістом)

**Interfaces:**
- Produces (SQL):
  - `pilot_spots.paused boolean not null default false`, `pilot_spots.closed_weekdays smallint[] not null default '{}'` (check: елементи 1–7), `pilot_spots.photos text[] not null default '{}'` (check: `cardinality(photos) <= 5`).
  - Політика читання `pilot_spots`: `(archived_at is null and not paused) or owner_id = auth.uid()`.
  - `pilot_spot_days_off(spot_id uuid references pilot_spots(id), day date, primary key (spot_id, day))`, RLS: select для всіх (лише для видимих точок через `exists` на `pilot_spots`), запис — лише через RPC.
  - `update_pilot_spot(point_id uuid, new_title text, new_district text, new_lat numeric, new_lng numeric, new_source text, new_connector text, new_power_kw numeric, new_price numeric, new_devices text[], new_opens time, new_closes time) returns void` — власник, активний акаунт, не архівована.
  - `set_pilot_spot_paused(point_id uuid, is_paused boolean) returns void`.
  - `set_pilot_spot_schedule(point_id uuid, weekdays smallint[], days date[]) returns void` — замінює `closed_weekdays` і вихідні від сьогодні (Київ) до +60 днів; дні поза вікном відхиляються.
  - `set_pilot_spot_photos(point_id uuid, paths text[]) returns void` — ≤5, кожен шлях починається з `<auth.uid()>/<point_id>/`.
  - `pilot_spot_availability(point_id uuid, from_day date, to_day date) returns table(starts timestamp, ends timestamp)` — лише `pending/confirmed`, `to_day - from_day <= 31`, доступно `anon, authenticated`.
  - Нова версія `request_pilot_booking` з тією ж сигнатурою: `requested_day <= today + 29`, відмова для `paused`, `extract(isodow from requested_day) = any(closed_weekdays)` і днів із `pilot_spot_days_off`.
  - Storage: `insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types) values ('spot-photos','spot-photos', true, 2097152, array['image/jpeg','image/png','image/webp']) on conflict do nothing`; політики `storage.objects` для `bucket_id = 'spot-photos'`: insert/delete лише коли `(storage.foldername(name))[1] = auth.uid()::text`.

- [ ] **Step 1:** Написати міграцію в стилі наявних (`begin; … commit;`, `security definer set search_path = ''`, `revoke all … from public, anon; grant execute … to authenticated`, помилки `42501`/`22023`). `request_pilot_booking` — `create or replace` з тими самими перевірками, що й зараз, плюс нові.
- [ ] **Step 2:** README: кроки застосування й ручний чекліст (8 запитів у SQL Editor від імені двох тестових акаунтів: чужий `update_pilot_spot` → 42501; бронювання на паузі / у вихідний / на +30 день → 22023; на +29 день → ок; `set_pilot_spot_photos` з чужим префіксом → 22023; `pilot_spot_availability` не повертає `guest_id`).
- [ ] **Step 3:** Перевірити: `grep -c "security definer" файл` ≥ 6, у файлі немає `grant insert`/`grant update` на `pilot_spot_days_off`.
- [ ] **Step 4:** Коміт `feat(db): host calendar, pause, days off and spot photos`.

### Task 2: Календар (чисті функції)

**Files:**
- Create: `js/calendar.js`
- Test: `tests/calendar.test.js` (додати в `tests/index.html`)

**Interfaces:**
- Produces:
  - `kyivNow(now: Date): {day: 'YYYY-MM-DD', minutes: number}` — через `Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/Kyiv', …})`.
  - `addDays(day: string, n: number): string`; `isoWeekday(day: string): 1..7`.
  - `calendarDays(now: Date, n = 30): string[]`.
  - `freeStarts(day: string, spot: {schedule:{from,to}}, busy: {starts: string, ends: string}[], now: Date, hours = 1): string[]` — `'HH:00'`; інтервал `[start, start+hours)` у межах графіка, без перетину з `busy` (рядки `'YYYY-MM-DDTHH:MM[:SS]'` за Києвом, напіввідкриті), не в минулому за Києвом.
  - `maxHoursFrom(day, start, spot, busy, cap = 6): number` — скільки годин поспіль вільно від `start` (≥1).
  - `dayStatus(day, spot: {paused, closedWeekdays, schedule}, {daysOff: string[], busy}, now): 'paused'|'closed'|'dayoff'|'full'|'open'`.
  - `DAY_STATUS_LABEL: Record<status, string>` — «На паузі», «Вихідний», «Вихідний», «Усе зайнято», «Є вільні години».

- [ ] **Step 1:** Падаючі тести: `kyivNow(new Date('2026-11-18T22:30:00Z'))` → `{day:'2026-11-19', minutes:30}` (UTC+2); `calendarDays` дає 30 днів від Київського «сьогодні», останній = +29; `isoWeekday('2026-11-23') === 1`; `freeStarts` з графіком 08–20 і `busy [10:00,12:00)` для дня в майбутньому не містить `'10:00','11:00'`, містить `'12:00'`, а з `hours=3` не містить `'08:00'` і `'09:00'`; сьогодні о 13:30 (Київ) перший старт `'14:00'`; `maxHoursFrom(day,'08:00',…)` = 2 при busy з 10:00, = 6 без busy, = 2 при закритті о 10:00; `dayStatus`: пауза → `'paused'`, неділя при `closedWeekdays:[7]` → `'closed'`, день у `daysOff` → `'dayoff'`, повністю зайнятий → `'full'`, інакше `'open'`.
- [ ] **Step 2:** Запустити — падають.
- [ ] **Step 3:** Реалізувати без залежностей від DOM.
- [ ] **Step 4:** Проходять; коміт `feat(booking): calendar availability helpers`.

### Task 3: Фото (чисті функції)

**Files:**
- Create: `js/photos.js`
- Test: `tests/photos.test.js` (додати в `tests/index.html`)

**Interfaces:**
- Produces: `PHOTO_LIMITS = { max: 5, bytes: 2 * 1024 * 1024, width: 1600, types: ['image/jpeg','image/png','image/webp'] }`; `checkPhotos(files: {type, size, name}[], existingCount: number): {ok: File[], errors: string[]}`; `photoPath(ownerId, spotId, type, id = crypto.randomUUID()): string` (`.jpg|.png|.webp`); `scaledSize(w, h, maxWidth = 1600): {width, height}`; `resizeImage(file, {maxWidth}): Promise<Blob>` (canvas → `image/jpeg` 0.85 для jpeg/webp-джерел, `image/png` для png; не тестується в ранері).

- [ ] **Step 1:** Падаючі тести: `checkPhotos` відкидає `text/plain` з повідомленням про формат, файл 3 МБ («до 2 МБ»), шостий при `existingCount=4` і двох файлах (одне прийнято, одна помилка «не більше 5»); `photoPath('u1','s1','image/webp','x')==='u1/s1/x.webp'`; `scaledSize(4000, 3000)` → `{1600, 1200}`, `scaledSize(800, 600)` без змін.
- [ ] **Step 2:** Запустити — падають.
- [ ] **Step 3:** Реалізувати; розмір перевіряти й після стискання у `resizeImage`-споживача (Task 5).
- [ ] **Step 4:** Проходять; коміт `feat(host): photo validation helpers`.

### Task 4: Сервіс і pilot

**Files:**
- Modify: `js/supabase.js`, `js/pilot.js`, `js/ui.js` (`spotCover`)
- Test: `tests/supabase.test.js` (або новий `tests/pilot-spot.test.js`, додати в `tests/index.html`)

**Interfaces:**
- Produces: у `js/supabase.js` експорт чистої `toPilotSpot(row, feedback, photoUrl: (path) => string)` → нинішня форма точки + `paused: boolean`, `closedWeekdays: number[]`, `photos: string[]` (публічні URL), `photoPaths: string[]`; методи сервісу: `updatePilotSpot(id, input)`, `setPilotSpotPaused(id, paused)`, `setPilotSpotSchedule(id, {weekdays, days})`, `listDaysOff(id): Promise<string[]>`, `pilotAvailability(id, from, to): Promise<{starts, ends}[]>`, `uploadSpotPhoto(path, blob)`, `removeSpotPhoto(path)`, `setPilotSpotPhotos(id, paths)`. У `pilot.js`: `update(id, input)`, `setPaused(id, on)`, `setSchedule(id, s)`, `availability(id, from, to)` (`{busy, daysOff}`), `setPhotos(id, paths)`, `uploadPhoto(spot, blob, type)` (повертає шлях), `removePhoto(path)`; кожен, що змінює, після успіху викликає `refresh()`. `ownSpots()` повертає й точки на паузі. `spotCover(spot)` повертає `spot.photos?.[0]`, якщо є.
- Consumes: SQL з Task 1; `photoPath` з Task 3.

- [ ] **Step 1:** Падаючі тести: `toPilotSpot` з рядком (`paused: true`, `closed_weekdays: [6,7]`, `photos: ['u/s/a.jpg']`) дає `paused:true`, `closedWeekdays:[6,7]`, `photos:['https://cdn/u/s/a.jpg']` (через переданий `photoUrl`), решта полів як раніше; `spotCover({photos:['x']})==='x'`, без фото — як було.
- [ ] **Step 2:** Запустити — падають.
- [ ] **Step 3:** Реалізувати; `listPilotSpots` використовує `toPilotSpot` з `client.storage.from('spot-photos').getPublicUrl(path).data.publicUrl`.
- [ ] **Step 4:** Проходять, повний набір зелений; коміт `feat(host): service methods for editing, schedule and photos`.

### Task 5: Інтерфейс — календар бронювання та кабінет господаря

**Files:**
- Modify: `js/views/booking.js`, `js/views/host.js`, `js/views/spot.js` (позначка «На паузі» для власника), `css/styles.css`, `README.md`

**Interfaces:**
- Consumes: усе з Task 2–4.

- [ ] **Step 1:** `booking.js` (лише `spot.pilot`): при відкритті завантажити `pilot.availability(spot.id, today, today+29)`; поки вантажиться — «Перевіряємо вільний час…»; помилка — повідомлення з кнопкою «Спробувати ще раз». Смуга з 30 днів (дата + день тижня, стан з `dayStatus`, недоступні — `disabled` з підписом `DAY_STATUS_LABEL`); слоти — `freeStarts`; вибір тривалості обмежує `maxHoursFrom`; у запит іде вибрана дата `YYYY-MM-DD`; помилка сервера `23P01` (перетин) — «Цей час щойно зайняли — оберіть інший» і перезавантаження доступності. Демо-точки — без змін.
- [ ] **Step 2:** `host.js`, для кожної `pilot.ownSpots()`: позначка «На паузі»; кнопки «Редагувати» (наявна форма `openAddSpot` у режимі редагування: початкові значення точки, заголовок «Редагувати точку», кнопка «Зберегти», `pilot.update`), «Графік» (модалка: чипи днів тижня пн–нд; календар на 60 днів для вихідних; «Зберегти» → `pilot.setSchedule`), «Поставити на паузу / Увімкнути» (`pilot.setPaused`), «Фото» (модалка: мініатюри з «Видалити» і «Зробити обкладинкою», вибір файлів → `checkPhotos` → `resizeImage` → повторна перевірка розміру → `pilot.uploadPhoto` → `pilot.setPhotos`; при збої `setPhotos` — видалити щойно завантажені файли); кожна дія блокує свою кнопку на час запиту й показує помилку у вікні.
- [ ] **Step 3:** Стилі смуги днів, станів, мініатюр фото; README: розділ про календар, графік, паузу, фото.
- [ ] **Step 4:** Повний набір тестів `PASS`; вручну в браузері (демо-сесія + підроблений `pilot`, бо міграції в Supabase ще немає): смуга на 30 днів з вимкненими днями, слоти без зайнятих годин, форма редагування заповнена значеннями точки, вікно фото відкидає текстовий файл; у консолі немає помилок.
- [ ] **Step 5:** Коміт `feat(host): 30-day booking calendar, spot editing, schedule, pause and photos`.
