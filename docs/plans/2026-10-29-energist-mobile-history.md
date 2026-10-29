# ЕнерГість — мобільна адаптація, футер, пошук та історія: план реалізації

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Мобільний вигляд як у застосунку (шапка в рядок, вкладки знизу, смужка бронювання), футер без «демо для пітчу», пошук точок з історією і «Мої зарядки» в акаунті Supabase.

**Architecture:** Пошук — частина фільтрів (`filters.query`, чисті функції в `js/filters.js`). Історія: чисті функції відбору в `js/history.js`, стан поточного користувача в `js/user-history.js` (працює з `session` і `AuthService`), запис/читання — нові методи адаптера `js/supabase.js` і дві таблиці з RLS. Мобільний вигляд — CSS на ≤ 768 px плюс нижня панель вкладок у `js/app.js`.

**Tech Stack:** HTML/CSS/JS ES-модулі без збірки; supabase-js 2.45.4; Supabase Postgres (RLS); браузерні тести `tests/`.

**Spec:** `docs/specs/2026-10-29-energist-mobile-history-design.md`

## Global Constraints

- Мобільний вигляд — `@media (max-width: 768px)`; на ширших екранах змінюється лише футер.
- Мобільна шапка ≤ 60 px; нижня панель 64 px + `env(safe-area-inset-bottom)`; кнопки й чипи на мобільному ≥ 40 px.
- Вкладки: 🔌 Зарядка `#/map` (активна і для `#/spot/…`), ☀️ Господар `#/host`, 🧮 Калькулятор `#/calc`, 👤 Профіль `#/profile`.
- Футер: «ЕнерГість · Вінниця, 2026»; «Скинути демо-дані» — лише в профілі.
- Пошук: плейсхолдер «Район або назва точки»; збіг — входження в назву або район після `normalizeQuery`.
- Історія: по 5 останніх у підказках; запит до 80 символів (довше — обрізати); `search_history.kind ∈ ('query','spot')`.
- Тексти: «Нещодавні пошуки», «Нещодавно переглянуті», «Очистити», «Увійдіть, щоб зберігати історію пошуку», «Мої зарядки», «Ви ще не заряджались», «Знайти розетку», «Забронювати знову», «Не вдалося завантажити історію», «Спробувати ще раз», «Очистити історію пошуку», «Скинути демо-дані», «Профіль і зарядки», «Фільтри».
- Claude не входить на сайт і не реєструється; справжня перевірка історії — користувач.
- Роботу ведемо на гілці `history`; коміт після кожного завдання; злиття і пуш — лише з дозволу.

## Review Focus

1. На спільному ноутбуці пітчу людина виходить з акаунта — історія попереднього користувача миттєво зникає з підказок і профілю (тест у Task 3).
2. Той самий запит різним регістром чи з іншим апострофом — один запис у «Нещодавніх», найсвіжіший (тест у Task 2).
3. Дуже довгий запит (> 80 символів) — обрізається, а не відкидається базою (тест у Task 3).
4. Історія не завантажилась — «Не вдалося завантажити історію» + «Спробувати ще раз», яке справді перезавантажує (тест у Task 3 + перевірка в Task 6).
5. Підказки на телефоні: не ховаються під нижньою панеллю; Esc і клік поза полем закривають (перевірка в Task 7).

---

### Task 1: Пошук у фільтрах

**Files:** Modify `js/filters.js`, `tests/filters.test.js`, `tests/store.test.js`

**Interfaces:**
- Produces: `normalizeQuery(s: string) → string` (нижній регістр, `’`/`ʼ`/`` ` `` → `'`, обрізання й стискання пробілів); `matchSpots(spots, query) → Spot[]` (порожній запит — усі); `DEFAULT_FILTERS.query = ''`; `filterSpots` додатково фільтрує через `matchSpots(…, filters.query)`.

- [ ] **Step 1: Тести** — `normalizeQuery('  П’ЯТНИЧАНИ  ')` → `"п'ятничани"`; `normalizeQuery('a   b')` → `'a b'`; `matchSpots(SPOTS, 'вишенька').map(s => s.id)` містить `'oleh-ses'`, `'oleh-garage'`, `'vyshenka-private'` і лише точки з районом/назвою «Вишенька»; `matchSpots(SPOTS, 'п’ятничани')` знаходить `'piatnychany-battery'`; `matchSpots(SPOTS, 'гараж')` — точки з «Гараж» у назві; `matchSpots(SPOTS, '')` — усі 15; `filterSpots(SPOTS, { ...DEFAULT_FILTERS, query: 'вишенька', device: 'ev' }, { blackout: false, now })` — перетин; у `store.test.js`: `setFilters({ query: 'x' })` → `resetFilters()` → `filters.query === ''`.
- [ ] **Step 2: Запустити** `bash tests/run-headless.sh` — нові падають.
- [ ] **Step 3: Реалізувати.**
- [ ] **Step 4: Запустити** — усі `PASS`.
- [ ] **Step 5: Коміт** `feat: search spots by name or district`.

### Task 2: Відбір нещодавнього `js/history.js`

**Files:** Create `js/history.js`, `tests/history.test.js`; Modify `tests/index.html` (додати `history`)

**Interfaces:**
- Consumes: `normalizeQuery` (Task 1).
- Produces: `recentQueries(rows, limit = 5) → string[]` — рядки `{ kind, value, created_at }`, лише `kind === 'query'`, новіші першими, без повторів за `normalizeQuery` (лишається найсвіжіше написання); `recentSpots(rows, spots, limit = 5) → Spot[]` — лише `kind === 'spot'`, новіші першими, без повторів за `value`, пропускає id, яких немає в `spots`.

- [ ] **Step 1: Тести** — `recentQueries` на 7 запитах з повтором «Вишенька»/«вишенька» → 5 значень, перший — найсвіжіший, «вишенька» один раз у найсвіжішому написанні (Review Focus 2); рядки `kind: 'spot'` ігноруються; `recentSpots` з повтором і неіснуючим id → без повтору, без неіснуючого, ліміт.
- [ ] **Step 2: Запустити** — падають.
- [ ] **Step 3: Реалізувати** (сортування копії за `created_at` спаданням).
- [ ] **Step 4: Запустити** — `PASS`.
- [ ] **Step 5: Коміт** `feat: recent searches and viewed spots`.

### Task 3: Історія поточного користувача `js/user-history.js`

**Files:** Create `js/user-history.js`, `tests/user-history.test.js`; Modify `tests/index.html`

**Interfaces:**
- Consumes: `session` (`getState`, `subscribe`, `service`) з `js/auth.js`.
- Produces: `createUserHistory(session, { now = () => new Date().toISOString() } = {})` → `{ getState() → { status, searches, charges }, subscribe(fn) → unsub, recordQuery(q), recordSpot(spotId), recordCharge({ spot_id, spot_title, district, kwh, total }), removeQuery(q), clearQueries(), retry() }`; `status ∈ 'off'|'loading'|'ready'|'error'|'local'`. Сервісні методи (контракт для Task 4): `loadHistory(uid)`, `addSearch(uid, { kind, value })`, `removeSearch(uid, { kind, value })`, `clearSearches(uid)`, `addCharge(uid, entry)`.

- [ ] **Step 1: Тести** (фейкова сесія з `emit(state)` і фейковий сервіс, що записує виклики й може кидати):
  - `signedOut` → `off`, `recordQuery('x')` нічого не пише і не кличе сервіс;
  - `signedIn` → `loading` → `ready` з `searches`/`charges` від `loadHistory`;
  - `recordQuery('Вишенька')` одразу з'являється в `searches` (з `created_at` від `now`) і кличе `addSearch(uid, { kind: 'query', value: 'Вишенька' })`;
  - `addSearch` кидає — локальний запис лишається;
  - `recordQuery('   ')` — нічого; `recordQuery('а'.repeat(100))` — значення довжиною 80 (Review Focus 3);
  - `recordSpot('oleh-ses')` → `{ kind: 'spot', value: 'oleh-ses' }`; `recordCharge(e)` → у `charges` першим і `addCharge(uid, e)`;
  - `removeQuery('вишенька')` прибирає локально всі рядки цього запиту (за `normalizeQuery`) і кличе `removeSearch`; `clearQueries()` прибирає всі `query` (рядки `spot` лишаються) і кличе `clearSearches`;
  - вихід (`emit` → `signedOut`) — одразу `off`, `searches` і `charges` порожні (Review Focus 1); інший `uid` — нове завантаження;
  - `demo` → `local`, записи лише локально, сервіс не кличеться;
  - `loadHistory` кидає → `error`; `retry()` → `ready` (Review Focus 4).
- [ ] **Step 2: Запустити** — падають.
- [ ] **Step 3: Реалізувати.** Відповідь `loadHistory`, що прийшла для старого `uid`, ігнорується.
- [ ] **Step 4: Запустити** — `PASS`.
- [ ] **Step 5: Коміт** `feat: per-user search and charge history`.

### Task 4: Таблиці Supabase і методи адаптера

**Files:** Modify `supabase/schema.sql` (дописати SQL зі спеку §6), `js/supabase.js`

**Interfaces:**
- Produces (у `AuthService` з `loadSupabase`): `loadHistory(uid) → { searches, charges }` (по 50, новіші першими: `search_history` `select kind, value, created_at order by created_at desc limit 50`; `charge_history` `select spot_id, spot_title, district, kwh, total, charged_at order by charged_at desc limit 50`; `kwh`/`total` — числа), `addSearch(uid, { kind, value })`, `removeSearch(uid, { kind, value })`, `clearSearches(uid)` (`delete … where kind = 'query'`), `addCharge(uid, entry)`; помилки через наявний `call()`.

- [ ] **Step 1: SQL** — дописати в `supabase/schema.sql`; виконати в Supabase SQL Editor (Chrome, проєкт `yxbpobiipcdazwnshime`) → «Success».
- [ ] **Step 2: Перевірити правила без входу** — `curl -s "$URL/rest/v1/search_history?select=id" -H "apikey: $KEY"` → `[]`; `curl -s -X POST "$URL/rest/v1/search_history" -H "apikey: $KEY" -H "Content-Type: application/json" -d '{"kind":"query","value":"x"}'` → помилка RLS (код `42501` або 401); те саме для `charge_history`.
- [ ] **Step 3: Методи адаптера.** `uid` передається явно і пишеться в `user_id` (insert) та фільтр `eq('user_id', uid)` (select/delete).
- [ ] **Step 4: Перевірити** — `bash tests/run-headless.sh` → `PASS`; у браузері на localhost `await session.service.loadHistory('00000000-0000-0000-0000-000000000000')` → `{ searches: [], charges: [] }` без помилки.
- [ ] **Step 5: Коміт** `feat: history tables and adapter methods`.

### Task 5: Пошук і підказки на карті, запис переглядів і зарядок

**Files:** Modify `js/app.js` (створити `history = createUserHistory(session)`, передавати в'юшкам п'ятим аргументом), `js/views/map.js`, `js/views/spot.js`, `js/views/booking.js`, `css/styles.css`

**Interfaces:**
- Consumes: `matchSpots`/`filters.query` (Task 1), `recentQueries`, `recentSpots` (Task 2), `createUserHistory` (Task 3).
- Produces: `view.render(params, root, store, session, history)`; `openBooking(spot, store, { now, session, history })`.

- [ ] **Step 1: Поле пошуку** над фільтрами: `type="search"`, плейсхолдер з Global Constraints, × очищає (`setFilters({ query: '' })`); введення одразу оновлює `filters.query`; Enter → `history.recordQuery(query)` і закрити підказки.
- [ ] **Step 2: Підказки** під полем при фокусі: «Нещодавні пошуки» (`recentQueries(history.getState().searches)`, клік → `setFilters({ query })` + `recordQuery`, × → `removeQuery`, «Очистити» → `clearQueries`), «Нещодавно переглянуті» (`recentSpots(…, store.getState().spots)`, клік → `#/spot/:id`); для `off` — «Увійдіть, щоб зберігати історію пошуку»; порожні розділи не показуються; Esc і клік поза полем закривають; підписка на `history`.
- [ ] **Step 3: Перегляд точки** — `spot.js` кличе `history.recordSpot(id)` один раз при відкритті маршруту (не на кожне перемальовування).
- [ ] **Step 4: Зарядка** — `booking.js` після `finishCharging`, якщо `actualKwh > 0`: `history.recordCharge({ spot_id, spot_title: spot.title, district: spot.district, kwh: actualKwh, total })`.
- [ ] **Step 5: Перевірити в браузері (localhost)** з підробленою історією (`ready` з даними, `off`, `local`): підказки, видалення, очистка, Enter, перехід на точку; пошук «вишенька» звужує і список, і піни; консоль без помилок; `tests/` — `PASS`.
- [ ] **Step 6: Коміт** `feat: map search with recent history`.

### Task 6: Профіль — «Мої зарядки», футер, «Скинути демо-дані»

**Files:** Modify `js/views/profile.js`, `index.html` (футер), `js/app.js` (прибрати обробник кнопки футера, «Профіль і зарядки» в меню), `css/styles.css`

- [ ] **Step 1: Футер** — «ЕнерГість · Вінниця, 2026», без кнопки.
- [ ] **Step 2: «Мої зарядки»** у профілі увійденого (нижче форми): список `history.getState().charges` (точка, район, дата й час `formatDate` + `HH:MM`, `formatKwh`, `formatUAH`, «Забронювати знову» → `#/spot/:spot_id`); `loading` — «Завантаження…»; `error` — «Не вдалося завантажити історію» + «Спробувати ще раз» (`history.retry()`); порожньо — «Ви ще не заряджались» + «Знайти розетку».
- [ ] **Step 3: «Очистити історію пошуку»** (лише якщо є запити) → `history.clearQueries()` + тост.
- [ ] **Step 4: «Скинути демо-дані»** — дрібне посилання внизу профілю в усіх станах (увійшов, заглушка, демо) → `store.reset()`, `location.hash = '#/'`, тост як раніше.
- [ ] **Step 5: Перевірити** — з підробленою історією: список, порожній стан, помилка + «Спробувати ще раз», очистка; футер на всіх екранах без «демо для пітчу»; `tests/` — `PASS`.
- [ ] **Step 6: Коміт** `feat: my charges in profile, footer without demo label`.

### Task 7: Мобільна адаптація

**Files:** Modify `js/app.js` (нижня панель вкладок), `js/views/landing.js` (порядок на мобільному — через CSS `order`), `js/views/map.js` (кнопка «Фільтри · N»), `js/views/spot.js` (мобільна смужка), `css/styles.css`

- [ ] **Step 1: Шапка ≤ 768 px** — один рядок: логотип, перемикач блекауту без підпису, «Увійти»/аватар без імені; `.segmented` і посилання «Калькулятор» приховані; висота ≤ 60 px.
- [ ] **Step 2: Нижня панель** — `<nav class="tabbar">` у `app.js`, перемальовується з маршрутом; активна вкладка за правилом Global Constraints; на > 768 px `display: none`; `main` має `padding-bottom` = висота панелі.
- [ ] **Step 3: Головна** — на мобільному текст перед ілюстрацією, ілюстрація ≤ 220 px.
- [ ] **Step 4: Карта** — на мобільному фільтри сховані за кнопкою «Фільтри» (лічильник активних: пристрій, ціна < 15, рейтинг > 0, «відчинено зараз»); пошук видно завжди; підказки над панеллю вкладок (Review Focus 5).
- [ ] **Step 5: Картка точки** — на мобільному `.book-card` прихована, закріплена над панеллю смужка «{ціна} / кВт·год» + «Забронювати» з тією самою дією і `disabled` у блекауті для мережевих точок.
- [ ] **Step 6: Розміри і накладання** — чипи/кнопки ≥ 40 px на мобільному; `.map-pane` / `.mini-map` — `isolation: isolate`, щоб елементи Leaflet не перекривали шапку і панель.
- [ ] **Step 7: Перевірити** — 360 / 375 / 414 / 768 / 1280 px, усі маршрути: `scrollWidth === innerWidth`, висота шапки ≤ 60 на ≤ 768, вкладки клікаються й підсвічуються, смужка бронювання видима на `#/spot/oleh-ses` без прокрутки, кнопка «Фільтри» розгортає фільтри, на 1280 px вигляд як раніше (крім футера); скріншоти 375 і 1280; консоль без помилок; `tests/` — `PASS`.
- [ ] **Step 8: Коміт** `feat: mobile layout with bottom tabs`.

### Task 8: README

**Files:** Modify `README.md` (пошук та історія, таблиці `search_history` / `charge_history`, мобільні вкладки, «Скинути демо-дані» тепер у профілі)

- [ ] **Step 1: Оновити README.**
- [ ] **Step 2: Коміт** `docs: search, history and mobile notes`.
