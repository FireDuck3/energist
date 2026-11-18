# Пошук і фільтри на карті (Етап 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Геолокація за дозволом, радіус, сортування за відстанню, фільтри (роз'єм, потужність, ціна, цілодобово, блекаут), кластеризація, перемикач карта/список і «Знайти найближчу зарядку».

**Architecture:** Чисті функції в `js/map-filters.js` (без DOM) і `js/geolocate.js` (геолокація з ін'єкцією) тестуються в браузерному ранері; `js/views/map.js` лише малює. Нові поля фільтрів живуть у `DEFAULT_FILTERS` і зберігаються через наявний `store.setFilters`.

**Tech Stack:** HTML/CSS/JS (ES-модулі), Leaflet 1.9.4, leaflet.markercluster 1.5.3 (unpkg), браузерний Geolocation API.

**Spec:** `docs/specs/2026-11-18-map-search-design.md`

## Global Constraints

- Тести: сервер `py tests/serve.py 8420` (вже може працювати), `bash tests/run-headless.sh` → `PASS n/n`; нові тест-файли додавати в список у `tests/index.html`. Поточна база: 165/165.
- Місцеположення лише за кліком користувача; не зберігати (ні localStorage, ні Supabase) й нікуди не надсилати.
- Радіуси: `[1, 5, 10, 25, 50]` км. Потужність: до 22 / 22–50 / 50–150 / понад 150 кВт.
- Роз'єми у фільтрі: `type2`, `ccs2`, `chademo`, `gbt`, `other`; `socket220` і `usb` точок → `other`; `tesla` станцій → `other`.
- Публічні станції ховаються фільтром «Доступна під час блекауту» й глобальним блекаутом (автономність не підтверджена).
- Фільтр ціни для станцій діє лише при `maxPrice < 25`; без `price_verified` тоді станція не показується.
- leaflet.markercluster лише з `unpkg.com`, версія `1.5.3`; без бібліотеки — звичайні маркери без падіння.
- Не ламати наявні тести й сценарії (авторизація, чати, бронювання, відгуки). Тексти українською. Коміти малі, з рядком `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- Станція/точка без координат відстані (немає місцеположення) → сортування не падає, порядок стабільний (Task 1).
- Невідома потужність або відсутній роз'єм → не проходить відповідний фільтр, без винятку (Task 1).
- Користувач відмовив у геолокації / таймаут / API відсутній → зрозуміле повідомлення, карта працює (Task 2, 3).
- Усі точки відфільтровано → «Нічого не знайдено» зі «Скинути фільтри» (Task 3).
- Зі старим збереженим станом (без нових полів фільтрів) сторінка вантажиться з типовими значеннями (Task 1).

---

### Task 1: Чисті функції пошуку й фільтрів

**Files:**
- Create: `js/map-filters.js`
- Modify: `js/filters.js` (розширити `DEFAULT_FILTERS`)
- Test: `tests/map-filters.test.js` (додати `'map-filters'` у `tests/index.html`)

**Interfaces:**
- Produces: `RADII: number[]`; `POWER_BANDS: {id, label, test(kw: number): boolean}[]` з id `lt22|22-50|50-150|gt150`; `CONNECTOR_FILTERS: {id, label}[]` (Type 2, CCS2, CHAdeMO, GB/T, Інший); `distanceKm(a: {lat,lng}, b: {lat,lng}): number`; `spotConnector(spot): string`; `stationConnectors(st): string[]` (унікальні нормалізовані типи, `tesla`→`other`); `matchSpotExtra(spot, f, {origin}): boolean`; `matchStation(st, f, {origin, blackout}): boolean`; `sortByDistance<T extends {lat,lng}>(items: T[], origin|null): T[]` (стабільно, без origin повертає копію як є); `nearest<T>(items: T[], origin): T|null`. `DEFAULT_FILTERS` отримує `connectors: []`, `power: null`, `radiusKm: null`, `only24h: false`, `blackoutReady: false`.
- Consumes: фільтрові значення `f = { connectors, power, radiusKm, only24h, blackoutReady, maxPrice }`.

- [ ] **Step 1:** Написати падаючі тести: `distanceKm` Вінниця↔Київ ≈ 215±5; `spotConnector({connector:'socket220'})==='other'`, `'type2'→'type2'`; `stationConnectors` зі станції з `[type2, ccs2, tesla, type2]` дає `['type2','ccs2','other']`; `matchStation` — фільтр `connectors:['ccs2']` пропускає станцію з ccs2 і відсікає без; `power:'22-50'` пропускає `max_power_kw: 50`? ні — діапазони `lt22: <=22`, `22-50: >22 && <=50`, `50-150: >50 && <=150`, `gt150: >150` (50 кВт → `22-50`); невідома потужність (`null`) не проходить жоден фільтр потужності, але проходить без нього; `maxPrice:12` ховає станцію без `price_verified`, а при `maxPrice:25` показує; `only24h` пропускає `opening_hours:'Цілодобово'` і ховає `null`; `blackoutReady` і `blackout:true` ховають станцію; радіус 5 км з origin відсікає станцію за 8 км і не діє без origin; `matchSpotExtra` перевіряє роз'єм/потужність/24h (`schedule 00:00–24:00`)/`blackoutReady` (`source !== 'grid'`)/радіус; `sortByDistance` без origin не падає й зберігає порядок, з origin сортує за зростанням; `nearest` повертає найближчий або `null` для порожнього списку; `DEFAULT_FILTERS` містить нові ключі.
- [ ] **Step 2:** Запустити тести — мають падати (модуль відсутній).
- [ ] **Step 3:** Реалізувати; haversine; без побічних ефектів.
- [ ] **Step 4:** Тести проходять, повний набір зелений (існуючі тести `filters`/`store` не змінюються).
- [ ] **Step 5:** Коміт `feat(map): pure search and filter helpers`.

### Task 2: Геолокація

**Files:**
- Create: `js/geolocate.js`
- Test: `tests/geolocate.test.js` (додати в `tests/index.html`)

**Interfaces:**
- Produces: `locate({geolocation = globalThis.navigator?.geolocation, timeoutMs = 10000}): Promise<{lat: number, lng: number}>`; відхиляє `Error` з `code` ∈ `'unsupported' | 'denied' | 'unavailable' | 'timeout'`; `geoMessage(code): string` — українське повідомлення для кожного коду.

- [ ] **Step 1:** Тести з підробленим `geolocation`: успіх повертає `{lat,lng}`; `PERMISSION_DENIED (1)` → `code:'denied'`; `POSITION_UNAVAILABLE (2)` → `'unavailable'`; `TIMEOUT (3)` → `'timeout'`; `geolocation: undefined` → `'unsupported'`; `geoMessage` повертає непорожній рядок для всіх чотирьох кодів.
- [ ] **Step 2:** Запустити — падають.
- [ ] **Step 3:** Реалізувати через `getCurrentPosition(ok, err, {enableHighAccuracy:false, timeout: timeoutMs, maximumAge: 60000})`; нічого не зберігати.
- [ ] **Step 4:** Проходять; коміт `feat(map): geolocation helper`.

### Task 3: Карта — фільтри, радіус, «Моє місце», найближча, список/карта, кластери

**Files:**
- Modify: `js/views/map.js`, `index.html` (CSS+JS markercluster 1.5.3 з unpkg), `css/styles.css`, `README.md`
- Test: `tests/map-filters.test.js` (допомогти `describeResults`), повний набір

**Interfaces:**
- Consumes: усе з Task 1–2, `store.setFilters`, `loadPublicStations` (вже в `map.js`).
- Produces: у `map-filters.js` додатково `resultsLabel(spotCount: number, stationCount: number): string` — «Знайдено N точок · M публічних станцій» з правильним відмінюванням (1 станція / 2–4 станції / 5+ станцій; 1 точку / точки / точок); без станцій — лише частина про точки.

- [ ] **Step 1:** Написати падаючий тест `resultsLabel(3, 1)` = `'Знайдено 3 точки · 1 публічна станція'`, `(0, 5)` = `'Знайдено 0 точок · 5 публічних станцій'`, `(2, 0)` = `'Знайдено 2 точки'`; запустити — падає; реалізувати; запустити — проходить.
- [ ] **Step 2:** `index.html`: підключити `leaflet.markercluster@1.5.3` (CSS `MarkerCluster.css`, `MarkerCluster.Default.css`, JS `leaflet.markercluster.js`) з `unpkg.com`, з `crossorigin`.
- [ ] **Step 3:** `map.js` — ряди фільтрів: чипи роз'ємів (мультивибір з `CONNECTOR_FILTERS`), чипи потужності (`POWER_BANDS`, повторний клік знімає), чипи «🕒 Цілодобово» і «🔋 Блекаут-готові», чипи радіуса (`RADII`, вимкнені без origin з підказкою «Спершу визначте місцеположення»); лічильник активних фільтрів у кнопці «⚙️ Фільтри» враховує нові.
- [ ] **Step 4:** `map.js` — кнопка «📍 Моє місце» (виклик `locate` лише по кліку; успіх зберігає `origin` у змінній модуля-рендера, ставить маркер «Ви тут» і центрує карту; помилка показує `geoMessage` у рядку над фільтрами), сортування приватних/демо точок і станцій за відстанню при відомому origin, відстань («1,2 км») у картках; кнопка «Знайти найближчу зарядку» (без origin спершу викликає `locate`; далі `nearest` по відфільтрованих точках і станціях, центрує карту, відкриває popup/підсвічує картку; порожній результат — повідомлення).
- [ ] **Step 5:** `map.js` — станції проходять `matchStation` з `blackout` зі store; список станцій більше не обмежений 50 (рендерити до 200 відфільтрованих, далі «Показано перші 200 — уточніть фільтри»); приватні/демо точки проходять `filterSpots` і `matchSpotExtra`; «Нічого не знайдено» повертається, коли немає ні точок, ні станцій; `resultsLabel` у лічильнику; кластерний шар `L.markerClusterGroup` для станцій (якщо бібліотеки немає — `L.layerGroup`), перепідгін меж після зміни набору.
- [ ] **Step 6:** Перемикач «🗺️ Карта / 📋 Список»: клас `view-map` / `view-list` на `.map-layout`; CSS: `view-list` ховає `.map-pane`, `view-map` ховає список і лічильник на вузьких екранах; стилі нових чипів і рядка помилки.
- [ ] **Step 7:** README: розділ «Пошук і фільтри» (геолокація за дозволом, радіус, фільтри, правила щодо ціни/блекауту, кластеризація). Повний набір тестів `PASS`; вручну в браузері: відхилена геолокація показує повідомлення і не ламає карту, фільтри за роз'ємом і потужністю на тестових станціях у `sessionStorage`, перемикач списку/карти, відсутність помилок у консолі.
- [ ] **Step 8:** Коміт `feat(map): search radius, filters, clustering and nearest charger`.
