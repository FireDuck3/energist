# Публічні зарядні станції (Етап 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Щодня імпортувати реальні публічні станції Вінницької області з Open Charge Map і OSM у Supabase та показати їх на карті окремим типом маркера.

**Architecture:** Чисті ES-модулі в `scripts/sync-stations/` (нормалізація, дедуплікація, синхронізація з ін'єкцією `fetch`) тестуються у вже наявному браузерному ранері `tests/` (Node локально не встановлено). GitHub Actions запускає `run.js` на Node 20 із секретами. Фронтенд читає таблицю через PostgREST з anon-ключем (`js/stations.js`) і малює її в `js/views/map.js`.

**Tech Stack:** HTML/CSS/JS (ES-модулі), Leaflet 1.9.4, Supabase (Postgres + RLS), GitHub Actions, Node 20 (лише в CI).

**Spec:** `docs/specs/2026-11-18-public-stations-design.md`

## Global Constraints

- Тести: `py tests/serve.py 8420`, потім `bash tests/run-headless.sh`; нові файли додавати у список в `tests/index.html`. Вихід: `PASS n/n`.
- Жодних секретів у `js/` та репозиторії; `service_role` лише в GitHub Secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OCM_API_KEY`).
- Станція без офіційної інтеграції завжди має `status = 'unknown'`; UI показує «Статус невідомий».
- Ціну показувати лише за `price_verified = true`.
- Сторонні станції: жодної кнопки бронювання.
- Авторство: OCM — CC BY 4.0, OSM — «© OpenStreetMap contributors» (ODbL).
- Поріг дубліката: відстань < 60 м і схожа назва або однаковий оператор.
- Нормалізовані типи роз'ємів: `type2`, `ccs2`, `chademo`, `gbt`, `tesla`, `other`.
- Не ламати наявні тести, авторизацію, чати, бронювання, відгуки. Тексти інтерфейсу українською.
- Коміти малі; кожен закінчується рядком `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- OCM/OSM-запис без координат або з координатами поза областю → пропускається, не падає (Task 2, 4).
- Роз'єм невідомого типу або без потужності → тип `other`, потужність `null`, станція не губиться (Task 2).
- Одне джерело повністю недоступне → його станції не деактивуються, run позначається помилкою (Task 4).
- Дві сусідні, але різні станції різних операторів на одній парковці (>60 м або різний оператор і різна назва) не зливаються (Task 3).
- Порожня таблиця або мережева помилка Supabase на фронті → карта працює з приватними/демо-точками без винятку, кеш не затирається порожнім (Task 5).

---

### Task 1: Міграція БД

**Files:**
- Create: `supabase/migrations/202611180001_public_charging_stations.sql`

**Interfaces:**
- Produces: таблиця `public.public_charging_stations` (колонки зі spec: `id uuid pk default gen_random_uuid()`, `source text check in ('ocm','osm','merged')`, `external_id text`, `name`, `address`, `operator`, `lat/lng double precision not null`, `max_power_kw numeric`, `connectors jsonb default '[]'`, `price_per_kwh numeric`, `price_verified bool default false`, `opening_hours text`, `access text`, `operator_url text`, `status text default 'unknown' check = 'unknown'`, `sources jsonb default '[]'`, `source_updated_at timestamptz`, `updated_at timestamptz default now()`, `is_active bool default true`, `missed_runs int default 0`, `unique(source, external_id)`) і `public.station_sync_runs` (`id`, `started_at`, `finished_at`, `source`, `fetched`, `inserted`, `updated`, `skipped`, `error text`).

- [ ] **Step 1:** Написати SQL у `begin; … commit;` за стилем наявних міграцій: обидві таблиці, `enable row level security`, політика `select` на `public_charging_stations` для `anon, authenticated` з `using (is_active)`, жодних політик на запис; `station_sync_runs` — RLS увімкнено без політик. Індекс `(lat, lng)` btree + індекс `(is_active)`.
- [ ] **Step 2:** Перевірити очима, що `grep -c "enable row level security"` у файлі = 2 і немає політик `insert/update/delete`.
- [ ] **Step 3:** Коміт `feat(db): public_charging_stations and sync log tables`.

### Task 2: Нормалізація джерел

**Files:**
- Create: `scripts/sync-stations/normalize.js`, `tests/fixtures/stations.js`
- Test: `tests/stations-normalize.test.js` (додати `'stations-normalize'` у `tests/index.html`)

**Interfaces:**
- Produces: `normalizeConnector(raw: string): 'type2'|'ccs2'|'chademo'|'gbt'|'tesla'|'other'`; `normalizeOcm(poi: object): Station|null`; `normalizeOsm(el: object): Station|null`; `parseOpeningHours(raw: string|null): string|null` (повертає людський рядок, `'24/7'` лишає як «Цілодобово»). `Station` = форма рядка таблиці без `id/updated_at` (`source`, `external_id`, `name`, `address`, `operator`, `lat`, `lng`, `max_power_kw`, `connectors`, `price_per_kwh: null`, `price_verified: false`, `opening_hours`, `access`, `operator_url`, `sources: [{source, external_id, url, license}]`, `source_updated_at`).

- [ ] **Step 1:** Створити фікстури: по одному реальному за формою відповіді OCM-POI (`ID`, `AddressInfo{Title,AddressLine1,Town,Latitude,Longitude}`, `OperatorInfo{Title,WebsiteURL}`, `Connections[{ConnectionType{Title}, PowerKW, Quantity}]`, `UsageType`, `DateLastStatusUpdate`) та OSM-елемента (`type`, `id`, `lat/lon` або `center`, `tags{name, operator, 'socket:type2', 'socket:type2:output', opening_hours, access, website}`), плюс по одному без координат.
- [ ] **Step 2:** Написати падаючі тести: `normalizeConnector('IEC 62196-3 Configuration FF (CCS Type 2)') === 'ccs2'`, `'CHAdeMO'→chademo`, `'Type 2 (Socket Only)'→type2`, `'GB/T'→gbt`, `'невідомо'→other`; `normalizeOcm(фікстура)` дає `source:'ocm'`, `max_power_kw` = максимум з роз'ємів, `price_per_kwh:null`, `price_verified:false`, `sources[0].license` містить `CC BY`; `normalizeOsm` дає `source:'osm'`, `external_id:'node/123'`, license `ODbL`; обидві повертають `null` без координат; `parseOpeningHours('24/7') === 'Цілодобово'`.
- [ ] **Step 3:** Запустити тести — мають падати (модуль відсутній).
- [ ] **Step 4:** Реалізувати модуль; OSM-потужність парсити з `socket:*:output` («22 kW»), відсутню — `null`.
- [ ] **Step 5:** Тести проходять; коміт `feat(sync): normalize OCM and OSM stations`.

### Task 3: Дедуплікація й злиття

**Files:**
- Create: `scripts/sync-stations/dedupe.js`
- Test: `tests/stations-dedupe.test.js` (додати в `tests/index.html`)

**Interfaces:**
- Consumes: `Station` із Task 2.
- Produces: `distanceM(a: {lat,lng}, b: {lat,lng}): number` (гаверсинус); `isSameStation(a: Station, b: Station): boolean`; `mergeStations(list: Station[]): Station[]` — злиті записи мають `source:'merged'`, `external_id` = `ocm:<id>` або `osm:<id>` першого джерела, об'єднані `connectors` без повторів за типом+потужністю, `sources` з усіх джерел, пріоритет полів: OCM для оператора/адреси/роз'ємів, OSM для `opening_hours`/`access`, якщо в OCM порожні.

- [ ] **Step 1:** Написати падаючі тести: `distanceM` двох точок за ~111 м по широті ≈ 111±2; станції на 30 м з однаковим оператором зливаються (`mergeStations(...).length === 1`, `sources.length === 2`); 30 м, різні оператори й різні назви — не зливаються; 200 м однакова назва — не зливаються; злитий запис бере `opening_hours` з OSM, коли в OCM `null`; три записи ланцюжком не дають двох копій тієї ж станції.
- [ ] **Step 2:** Запустити — падають.
- [ ] **Step 3:** Реалізувати; схожість назви — порівняння після `toLowerCase`, вилучення не-літер/цифр; однаковий непорожній оператор також підтверджує збіг.
- [ ] **Step 4:** Тести проходять; коміт `feat(sync): deduplicate stations across sources`.

### Task 4: Синхронізація та CI

**Files:**
- Create: `scripts/sync-stations/sync.js`, `scripts/sync-stations/run.js`, `.github/workflows/sync-stations.yml`
- Test: `tests/stations-sync.test.js` (додати в `tests/index.html`)

**Interfaces:**
- Consumes: `normalizeOcm`, `normalizeOsm`, `mergeStations`.
- Produces: `BBOX = { south: 47.9, west: 27.2, north: 49.8, east: 30.2 }` (прямокутник Вінницької області); `fetchOcm({fetchImpl, apiKey, bbox}): Promise<object[]>`; `fetchOsm({fetchImpl, bbox}): Promise<object[]>` (Overpass-запит `amenity=charging_station`, три спроби з паузою, повторення лише для 429/5xx/мережевих збоїв); `syncStations({fetchImpl, supabase: {upsert(rows), listActive(source), deactivate(ids), logRun(run)}, apiKey, bbox, now}): Promise<{ok: boolean, results: Record<'ocm'|'osm', {fetched, inserted, updated, skipped, error?}>}>`. `run.js` читає env і будує `supabase` через REST `service_role` (`fetch`, `Prefer: resolution=merge-duplicates`), виходить з кодом 1, якщо `ok === false`.

- [ ] **Step 1:** Написати падаючі тести з підробленим `fetchImpl` і `supabase`: (а) успіх обох джерел → викликано `upsert` зі злитими без дублів станціями та один `logRun` на джерело; (б) OSM відповідає 503 тричі → `results.osm.error` заповнено, `ok === false`, OCM-станції записані, `deactivate` для OSM-записів НЕ викликано; (в) запис поза `BBOX` чи без координат рахується в `skipped`; (г) станція, відсутня в обох джерелах, збільшує `missed_runs`, і лише після 3 поспіль деактивується; (д) OCM-запит містить `key=` з переданого ключа і не логує його.
- [ ] **Step 2:** Запустити — падають.
- [ ] **Step 3:** Реалізувати `sync.js` (без Node-специфічних API, лише `fetch` у ін'єкції, щоб працював у браузерному ранері) і тонкий `run.js`.
- [ ] **Step 4:** Додати workflow: `on: schedule cron '43 3 * * *'` + `workflow_dispatch`; крок `actions/setup-node@v4` з Node 20; `run: node scripts/sync-stations/run.js` з env із трьох секретів; без вивантаження секретів у логи.
- [ ] **Step 5:** Тести проходять; коміт `feat(sync): daily station sync via GitHub Actions`.

### Task 5: Завантаження станцій на фронтенді

**Files:**
- Create: `js/stations.js`
- Test: `tests/stations-client.test.js` (додати в `tests/index.html`)

**Interfaces:**
- Produces: `loadPublicStations({fetchImpl = fetch, storage = sessionStorage, now = Date.now(), config}): Promise<PublicStation[]>` (GET `{url}/rest/v1/public_charging_stations?select=*&is_active=eq.true` з anon-ключем з `supabase-config.js`; кеш у `storage` під ключем `wattway-public-stations-v1` на 3 год; при помилці мережі повертає кеш або `[]`, ніколи не кидає, порожню відповідь у кеш не пише); `routeUrl(s: {lat,lng}): string` = `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>`; `statusLabel(s): 'Статус невідомий'` (за `status !== unknown` — не потрібно в Етапі 1, завжди «невідомий»); `attribution(s): string[]` — рядки авторства за `sources[].license`; `connectorLabel(type): string` (Type 2, CCS2, CHAdeMO, GB/T, Tesla, Інший).

- [ ] **Step 1:** Написати падаючі тести: успішне завантаження кладе кеш; друге завантаження в межах 3 год не викликає `fetchImpl`; `fetchImpl` кидає `TypeError` → повертається `[]` без винятку; кидає при наявному кеші → повертається кеш; відповідь `[]` не перезаписує непорожній кеш; `routeUrl({lat:49.23,lng:28.46})` дорівнює очікуваному URL; `attribution` для `merged` містить і CC BY 4.0, і ODbL.
- [ ] **Step 2:** Запустити — падають.
- [ ] **Step 3:** Реалізувати.
- [ ] **Step 4:** Проходять; коміт `feat(map): client for public stations`.

### Task 6: Карта — три види маркерів, картка, деморежим

**Files:**
- Modify: `js/views/map.js`, `js/store.js` (прапорець `demoMode`, `setDemoMode(on)`, зберігання в тому ж `localStorage`, за замовчуванням `false`), `css/styles.css` (`.pin-public`, `.pin-demo`, стилі картки станції), `README.md`
- Test: `tests/stations-client.test.js`, `tests/store.test.js`

**Interfaces:**
- Consumes: `loadPublicStations`, `routeUrl`, `statusLabel`, `attribution`, `connectorLabel`.
- Produces: `spotKind(spot): 'private'|'demo'` (`spot.pilot` → private, інакше demo) у `js/stations.js`; `store.getState().demoMode: boolean`; маркер публічної станції (окремий колір/іконка, підпис — потужність, а не ціна); popup і картка зі списку містять: назву, адресу, оператора, `max_power_kw`, роз'єми, `opening_hours`/`access` лише коли відомі, ціну лише за `price_verified`, «Статус невідомий», дату `updated_at`, авторство, «Прокласти маршрут», «Відкрити в застосунку оператора» лише за `operator_url`; жодних посилань на `#/spot/…/book` для публічних станцій.

- [ ] **Step 1:** Написати падаючі тести: `spotKind` для пілотної та сідової точок; `store.setDemoMode(true)` змінює стан і переживає створення нового store з тим самим сховищем; за замовчуванням `demoMode === false`; `filterSpots` не змінюється.
- [ ] **Step 2:** Запустити — падають.
- [ ] **Step 3:** Реалізувати `spotKind` і `demoMode` у store; у `map.js` додати перемикач-чіп «Демо-точки», фільтрувати сід-точки за `demoMode`, завантажувати публічні станції асинхронно (карта рендериться без очікування) і малювати їх окремим шаром маркерів; рядок авторства додати в `TILES.attribution`/контрол Leaflet; публічні станції видимі у блекаут-режимі як «невідомо» не затемнюються й не рахуються як автономні.
- [ ] **Step 4:** Додати стилі; оновити README: розділ «Публічні станції» (джерела, ліцензії, секрети Actions, застосування міграції, ручний запуск workflow, деморежим).
- [ ] **Step 5:** Запустити весь набір тестів (`bash tests/run-headless.sh`) → `PASS n/n`; вручну в браузері на `localhost:8420`: карта відкривається з увімкненим і вимкненим деморежимом, за порожньої таблиці немає помилок у консолі.
- [ ] **Step 6:** Коміт `feat(map): show public stations with distinct markers`.
