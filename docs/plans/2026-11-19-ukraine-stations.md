# Станції по всій Україні (стислий файл) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Синхронізувати всі станції України й показувати їх на карті через компактний знімок без підвисань.

**Architecture:** Синхронізація: вся Україна, сітковий пошук дублів, посторінкове читання таблиці, побудова знімка `stations-v1.json` і завантаження в публічний бакет `public-data`. Сайт: читання знімка, лінива повна картка з таблиці, кластери з `chunkedLoading`, список із 50 найближчих.

**Tech Stack:** Node 20 (CI), Supabase Storage REST, Leaflet + markercluster, ES-модулі.

**Spec:** `docs/specs/2026-11-19-ukraine-stations-design.md`

## Global Constraints

- Тести: `py tests/serve.py 8420` у фоні, `bash tests/run-headless.sh`; база 226/226; `revealOnScroll` — відомий нестабільний тест.
- Знімок: шлях `public-data/stations-v1.json`, формат `{ v: 1, generated_at, count, rows: [[id, lat, lng, maxPowerKw|null, connMask, flags, priceUah|null, name]] }`; `connMask` type2=1, ccs2=2, chademo=4, gbt=8, інші=16; `flags` цілодобово=1, ціна перевірена=2; координати — 5 знаків після коми; `Cache-Control: max-age=3600`.
- Межі України для перевірки координат: `{ south: 44.3, west: 22.1, north: 52.4, east: 40.3 }`.
- Overpass: `area["ISO3166-1"="UA"][admin_level=2]->.ua; nwr["amenity"="charging_station"](area.ua); out center tags;`, `[timeout:180]`.
- OCM: `countrycode=UA&maxresults=20000`, без `boundingbox`.
- Список зліва: не більше 50 станцій; підпис «Показано 50 найближчих із N».
- Запасний шлях без знімка: читання таблиці посторінково, максимум 2000 станцій.
- Коміти з `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- Знімок недоступний (404/мережа) → сайт показує станції через запасний шлях і не падає (Task 3).
- Повна картка не завантажилась → коротка картка з даних знімка + «Прокласти маршрут» (Task 3).
- Сітковий пошук дублів дає той самий результат, що й старий, біля меж клітинок (Task 1).
- Порожній або збійний знімок не перезаписує попередній у сховищі (Task 2: не завантажувати, якщо 0 станцій).
- Перебудова маркерів не відбувається на кожне оновлення стану без зміни набору станцій (Task 3).

---

### Task 1: Синхронізація всієї України й сітковий пошук дублів

**Files:**
- Modify: `scripts/sync-stations/sync.js` (`BBOX` → межі України, OCM без boundingbox, Overpass по area), `scripts/sync-stations/dedupe.js` (сітка), `scripts/sync-stations/run.js` (посторінковий `listActive`)
- Test: `tests/stations-dedupe.test.js`, `tests/stations-sync.test.js`

**Interfaces:**
- Produces: `UKRAINE_BBOX`; `BBOX = UKRAINE_BBOX` (сумісність); `mergeStations(list)` — та сама сигнатура й поведінка; `fetchAllPages(fetchPage: (from, to) => Promise<row[]>, pageSize = 1000): Promise<row[]>` у новому `scripts/sync-stations/paging.js` (читає, доки сторінка повна).

- [ ] **Step 1:** Падаючі тести: запит OCM не містить `boundingbox` і містить `countrycode=UA`; запит Overpass містить `area["ISO3166-1"="UA"]`; `mergeStations` для двох станцій 30 м з однаковим оператором по різні боки межі клітинки зливає їх; 5 000 випадкових точок по Україні обробляються < 1000 мс і дають стільки ж груп, скільки повний перебір на 500 точках-підмножині (порівняння зі старим алгоритмом, скопійованим у тест); `fetchAllPages` зі сторінками 1000, 1000, 3 повертає 2003 рядки й робить 3 запити.
- [ ] **Step 2:** Запустити — падають. **Step 3:** Реалізувати; `run.js` → `listActive` через `fetchAllPages` з заголовком `Range: from-to`. **Step 4:** Проходять; коміт `feat(sync): all of Ukraine, grid dedupe, paged reads`.

### Task 2: Знімок станцій

**Files:**
- Create: `scripts/sync-stations/snapshot.js`, `supabase/migrations/202611190003_public_data_bucket.sql`
- Modify: `scripts/sync-stations/run.js` (після синхронізації: прочитати всі активні станції посторінково → `buildSnapshot` → завантажити), `README.md`
- Test: `tests/stations-snapshot.test.js` (додати в `tests/index.html`)

**Interfaces:**
- Produces: `CONNECTOR_BITS = { type2: 1, ccs2: 2, chademo: 4, gbt: 8, other: 16 }`; `buildSnapshot(rows, now): { v: 1, generated_at, count, rows }` (лише `is_active`); `expandSnapshot(snap): Station[]` з полями `{ id, lat, lng, max_power_kw, connectors: [{type}], opening_hours: 'Цілодобово'|null, price_verified, price_per_kwh, name, compact: true }`. Міграція: `insert into storage.buckets (id, name, public) values ('public-data','public-data', true) on conflict do nothing` (без політик на запис для клієнтів).

- [ ] **Step 1:** Падаючі тести: рядок з роз'ємами type2+ccs2+tesla дає `connMask = 1|2|16`; `opening_hours 'Цілодобово'` → біт 1; `price_verified` → біт 2 і ціна, без перевірки → ціна `null`; координати округлено до 5 знаків; неактивні рядки пропущено; `expandSnapshot(buildSnapshot(x))` повертає станції, на яких `matchStation` (з `js/map-filters.js`) дає ті самі результати для фільтрів роз'єм/потужність/цілодобово/ціна, що й на повних рядках.
- [ ] **Step 2:** Запустити — падають. **Step 3:** Реалізувати; у `run.js` завантаження `POST {SUPABASE_URL}/storage/v1/object/public-data/stations-v1.json` з `x-upsert: true`, `cache-control: max-age=3600`, `content-type: application/json`; якщо станцій 0 — не завантажувати. Міграція бакета; README — розділ «Знімок станцій». **Step 4:** Проходять; коміт `feat(sync): compact stations snapshot in public storage`.

### Task 3: Сайт читає знімок

**Files:**
- Modify: `js/stations.js`, `js/views/map.js`
- Test: `tests/stations-client.test.js`, `tests/map-filters.test.js`

**Interfaces:**
- Consumes: `expandSnapshot`, `CONNECTOR_BITS` (імпорт з `../scripts/sync-stations/snapshot.js`).
- Produces: `loadPublicStations({fetchImpl, config})` — спершу знімок `{url}/storage/v1/object/public/public-data/stations-v1.json`, при збої — таблиця посторінково до 2000; кеш у пам'яті модуля; `loadStationDetails(id, {fetchImpl, config}): Promise<row|null>`; у `map-filters.js` — `nearestN(items, point, n = 50): items[]`.

- [ ] **Step 1:** Падаючі тести: успішний знімок → станції розгорнуто, таблицю не чіпали; знімок 404 → запит до таблиці з `Range` і обрізання до 2000; `loadStationDetails` повертає рядок або `null` при помилці; `nearestN` повертає 50 найближчих до точки, відсортованих.
- [ ] **Step 2:** Запустити — падають. **Step 3:** Реалізувати `stations.js`; `map.js`: список станцій = `nearestN(відфільтровані, origin ?? центр карти, 50)` + підпис «Показано 50 найближчих із N» (коли N > 50), лічильник — по всіх відфільтрованих; перебудова кластерного шару лише коли змінився набір (ключ = фільтри + довжина + origin); `L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 50, disableClusteringAtZoom: 18 })`; popup і картка: якщо станція `compact`, показати коротку картку й довантажити `loadStationDetails`, після чого перемалювати; оновлення списку при `moveend` карти (без перезавантаження даних).
- [ ] **Step 4:** Повний набір `PASS`; вручну: з підробленим знімком на 8 000 станцій карта відкривається без підвисань (вимір часу першої відмальовки < 1,5 с у браузері), фільтри працюють, popup довантажує деталі; консоль без помилок. Коміт `feat(map): load stations from compact snapshot`.

### Task 4: Перший запуск і перевірка

- [ ] **Step 1:** Застосувати міграцію бакета в Supabase (з дозволу користувача), злити в `main`, запустити workflow вручну.
- [ ] **Step 2:** Перевірити: кількість станцій у таблиці, наявність і розмір знімка (`curl -sI … | content-length`, стиснутий розмір через `Accept-Encoding: gzip`), лог запуску (`fetched/inserted/skipped`, без помилок).
- [ ] **Step 3:** Після розгортання сайту колегою — перевірити карту на телефоні (375 px) і комп'ютері: час відкриття, кластери по всій Україні, фільтри, «Знайти найближчу».
