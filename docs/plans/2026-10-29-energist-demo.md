# ЕнерГість — план реалізації демо

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Статичне клікабельне демо P2P-маркетплейсу електрики «ЕнерГість» для пітчу: карта Вінниці, бронювання із симуляцією зарядки, кабінет господаря, калькулятор, режим блекауту.

**Architecture:** Один `index.html` + ES-модулі без збірки. Чисті модулі (`pricing`, `filters`, `validate`, `data`) тестуються в браузерному тест-ранері; `store` тримає стан і зберігає його в `localStorage`; в'юшки рендерять DOM за хеш-маршрутом і перемальовуються за підпискою на store.

**Tech Stack:** HTML/CSS/JS (ES2022 modules), Leaflet 1.9.4 (unpkg), тайли CARTO Positron / Dark Matter, шрифт Inter (Google Fonts), `py -m http.server` для локального запуску.

**Spec:** `docs/specs/2026-10-29-energist-demo-design.md`

## Global Constraints

- Лише HTML/CSS/JS, без npm і кроку збірки; зовнішні залежності — тільки Leaflet 1.9.4 і Google Fonts Inter.
- Усі шляхи відносні (сайт живе за `/energist/` на GitHub Pages); маршрути — хеш (`#/`, `#/map`, `#/spot/:id`, `#/host`, `#/calc`).
- Інтерфейс лише українською; гроші — гривні, формат `360 грн`, `129,60 грн`; енергія — `кВт·год`.
- `COMMISSION = 0.10`, `HOME_TARIFF = 4.32`, `COMMERCIAL_PRICE = 35`, `COMMERCIAL_RANGE = [30, 40]`, ємність пристроїв `ev: 40`, `ecoflow: 1`, `gadget: 0.1`, `WEEKS_PER_MONTH = 4.33`.
- Ціни/константи живуть лише в `js/data.js`; гроші рахуються лише в `js/pricing.js`.
- Ключ `localStorage`: `energist-demo-v1`; кожен доступ у `try/catch`.
- Симуляція зарядки триває `SIM_DURATION_MS = 20000` реального часу.
- Кольори: фон `#F4F8FC`, небесний `#A7D2ED`/`#82B8DE`, індиго `#4950BC`, текст `#272525`, помаранчевий `#F28C38`, сонячний `#FFC94A`; блекаут: фон `#141833`, картки `#1F2547`, текст `#E8ECF8`.
- Без декоративних смуг, бордюрів з одного боку і градієнтних рамок.
- Коміт після кожного завдання; пуш — лише після згоди користувача.

## Review Focus

1. Пітч увечері після закриття графіка точки: на «сьогодні» немає слотів — модалка має сама обрати «завтра» або показати «Сьогодні вже зачинено», а не порожній список (тест `availableStarts` у Task 2).
2. «Завершити раніше» на нульовій секунді: 0 кВт·год → оплата 0 грн, уся заморожена сума повертається, без `NaN` (тест `sessionCost(0, 12)` у Task 1).
3. Комбінація фільтрів без результатів (блекаут + EcoFlow + макс. ціна 8): порожній стан з кнопкою «Скинути фільтри», а не пустий екран (тест `filterSpots` у Task 2 + ручна перевірка в Task 5).
4. Зіпсований або старий JSON у `localStorage` (після попередніх версій демо): store тихо стартує із засіяних даних (тест у Task 3).
5. Невалідна форма «Додати розетку» (без точки на карті, порожня назва, ціна 0 або 100): помилки біля полів, точка не додається (тест `validateSpotInput` у Task 2).

---

### Task 1: Тест-ранер і розрахунки

**Files:**
- Create: `tests/index.html`, `tests/runner.js`, `tests/pricing.test.js`
- Create: `js/data.js` (поки лише константи), `js/pricing.js`
- Modify: `C:/Users/Данило/.claude/launch.json` — додати конфіг `energist`

**Interfaces:**
- Produces (`tests/runner.js`): `test(name: string, fn: () => void)`, `eq(actual, expected, msg?)` (глибоке порівняння через `JSON.stringify`), `run(): void` — малює список ✓/✗ у `#results` і ставить `document.title` у `PASS n/n` або `FAIL k/n`.
- Produces (`js/data.js`): `COMMISSION`, `HOME_TARIFF`, `COMMERCIAL_PRICE`, `COMMERCIAL_RANGE`, `DEVICE_CAPACITY`, `WEEKS_PER_MONTH`, `SIM_DURATION_MS`, `DEVICES` (`[{ id: 'ev', label: 'Електромобіль' }, { id: 'ecoflow', label: 'EcoFlow' }, { id: 'gadget', label: 'Телефон / ноутбук' }]`).
- Produces (`js/pricing.js`): `round2(x): number`, `estimateKwh(powerKw, hours, device): number`, `holdAmount(kwh, price): number`, `sessionCost(kwh, price): { total, fee, hostPayout }`, `savingsVsCommercial(kwh, price): number`, `gridValue(kwh): number`, `monthlyGuestSavings(kwhPerWeek, price): number`, `monthlyHostEarnings(kwhPerMonth, price): number`, `formatUAH(x): string`, `formatKwh(x): string`.

- [ ] **Step 1: Додати конфіг прев'ю** `{ "name": "energist", "runtimeExecutable": "py", "runtimeArgs": ["-m", "http.server", "8420", "--directory", "C:/dev/energist"], "port": 8420 }` до наявного `launch.json` (не видаляючи `vysota` і `remesh-shop`).
- [ ] **Step 2: Написати ранер і `tests/index.html`**, який імпортує всі `tests/*.test.js` (поки лише `pricing.test.js`) і викликає `run()`.
- [ ] **Step 3: Написати тести `tests/pricing.test.js`**

```js
test('еталон 30 кВт·год × 12 грн', () => {
  eq(sessionCost(30, 12), { total: 360, fee: 36, hostPayout: 324 });
  eq(savingsVsCommercial(30, 12), 690);
  eq(gridValue(30), 129.6);
});
test('нуль кВт·год — нуль грошей', () => eq(sessionCost(0, 12), { total: 0, fee: 0, hostPayout: 0 }));
test('estimateKwh обрізає за ємністю', () => {
  eq(estimateKwh(3.6, 2, 'ev'), 7.2);
  eq(estimateKwh(11, 6, 'ev'), 40);
  eq(estimateKwh(3.6, 3, 'ecoflow'), 1);
  eq(estimateKwh(3.6, 1, 'gadget'), 0.1);
});
test('копійки округлюються', () => eq(sessionCost(1.333, 9), { total: 12, fee: 1.2, hostPayout: 10.8 }));
test('місячні розрахунки', () => {
  eq(monthlyGuestSavings(10, 12), 995.9);   // 43.3 × (35 − 12)
  eq(monthlyHostEarnings(100, 12), 1080);
});
test('форматування', () => {
  eq(formatUAH(360), '360 грн');
  eq(formatUAH(129.6), '129,60 грн');
  eq(formatKwh(7.2), '7,2 кВт·год');
});
```

- [ ] **Step 4: Запустити — має впасти.** `preview_start {name: "energist"}` → відкрити `/tests/` → `get_page_text`. Очікувано: помилка імпорту / `FAIL`.
- [ ] **Step 5: Реалізувати `js/data.js` (константи) і `js/pricing.js`.** Усі функції повертають значення через `round2` (у JS `3.6 * 3 = 10.799999…`). `sessionCost` рахує `fee` від неокругленого `total` і повертає все через `round2`; `formatUAH` показує копійки лише коли вони не нульові, з комою.
- [ ] **Step 6: Запустити — `PASS 6/6`.**
- [ ] **Step 7: Коміт** `feat: test runner and pricing module`.

### Task 2: Засіяні дані, фільтри, валідація

**Files:**
- Modify: `js/data.js` — додати `HOSTS`, `SPOTS`, `SEED_BOOKINGS`, `DEMO_HOST_ID`, `DEMO_GUEST_NAME`, `VINNYTSIA_CENTER`, `VINNYTSIA_BOUNDS`
- Create: `js/filters.js`, `js/validate.js`
- Create: `tests/data.test.js`, `tests/filters.test.js`, `tests/validate.test.js`; підключити в `tests/index.html`

**Interfaces:**
- Consumes: константи з Task 1.
- Produces (`js/data.js`): `VINNYTSIA_CENTER = [49.2331, 28.4682]`, `VINNYTSIA_BOUNDS = [[49.18, 28.36], [49.28, 28.56]]`, `DEMO_HOST_ID = 'oleh'`, `DEMO_GUEST_NAME = 'Саша'`, `HOSTS: Host[]`, `SPOTS: Spot[]`, `SEED_BOOKINGS: Booking[]` (форми з §6 спеку).
- Produces (`js/filters.js`): `spotRating(spot): number` (середнє зірок, 1 знак; 0 без відгуків), `isLiveInBlackout(spot): boolean`, `isOpenAt(spot, date: Date): boolean`, `filterSpots(spots, filters, { blackout: boolean, now: Date }): Spot[]` де `filters = { device: 'ev'|'ecoflow'|'gadget'|null, maxPrice: number, minRating: number, availableNow: boolean }`, `DEFAULT_FILTERS = { device: null, maxPrice: 15, minRating: 0, availableNow: false }`, `availableStarts(schedule, day: 'today'|'tomorrow', now: Date): string[]` (повні години `"HH:00"` від відкриття до `to − 1 год`; для `today` — лише ті, що пізніше `now`).
- Produces (`js/validate.js`): `validateSpotInput(input): { ok: boolean, errors: Record<string, string> }`; поля `title` (непорожнє), `lat`/`lng` (обидва задані й у `VINNYTSIA_BOUNDS`), `pricePerKwh` (5–25), `powerKw` (0.5–22), `source`, `connector`, `devices` (≥1), `schedule.from < schedule.to`.

Дані: 15 точок з §6 спеку — 7–8 `solar`, 4 `battery`, 3–4 `grid`; 2 точки Олега (`hostId: 'oleh'`, Вишенька, одна з них СЕС 10 кВт); `blackoutHours` 3–10 для `solar`/`battery`, 0 для `grid`; 2–4 відгуки на точку живою мовою (Саша, Ірина, Максим, Оксана…); 5 засіяних бронювань на точках Олега, 2 з них `pending`.

- [ ] **Step 1: Тести даних** — `ids унікальні`; `кожен hostId є в HOSTS`; `усі точки в VINNYTSIA_BOUNDS`; `ціни 8–15`; `2–4 відгуки`; `grid має blackoutHours 0, решта > 0`; `у Олега ≥ 2 точки і ≥ 2 pending бронювання`.
- [ ] **Step 2: Тести фільтрів**

```js
const s = (o) => ({ id: 'x', source: 'solar', devices: ['ev'], pricePerKwh: 10,
  schedule: { from: '08:00', to: '20:00' }, reviews: [{ stars: 5 }, { stars: 4 }], ...o });
test('spotRating', () => { eq(spotRating(s()), 4.5); eq(spotRating(s({ reviews: [] })), 0); });
test('блекаут ховає grid', () =>
  eq(filterSpots([s({ id: 'a' }), s({ id: 'b', source: 'grid' })], DEFAULT_FILTERS,
     { blackout: true, now: new Date(2026, 9, 29, 12) }).map(x => x.id), ['a']));
test('пристрій, ціна, рейтинг', () => {
  const list = [s({ id: 'a' }), s({ id: 'b', devices: ['gadget'] }), s({ id: 'c', pricePerKwh: 14 })];
  eq(filterSpots(list, { ...DEFAULT_FILTERS, device: 'ev', maxPrice: 12 }, { blackout: false, now: new Date() }).map(x => x.id), ['a']);
  eq(filterSpots(list, { ...DEFAULT_FILTERS, minRating: 4.8 }, { blackout: false, now: new Date() }), []);
});
test('availableNow', () => {
  const late = new Date(2026, 9, 29, 21);
  eq(filterSpots([s()], { ...DEFAULT_FILTERS, availableNow: true }, { blackout: false, now: late }), []);
});
test('слоти після закриття — порожньо сьогодні, повно завтра', () => {
  const late = new Date(2026, 9, 29, 21);
  eq(availableStarts({ from: '08:00', to: '20:00' }, 'today', late), []);
  eq(availableStarts({ from: '08:00', to: '11:00' }, 'tomorrow', late), ['08:00', '09:00', '10:00']);
  eq(availableStarts({ from: '08:00', to: '20:00' }, 'today', new Date(2026, 9, 29, 17, 30)), ['18:00', '19:00']);
});
```

- [ ] **Step 3: Тести валідації** — валідний ввід → `ok: true`; без `lat/lng` → `errors.location`; порожня назва → `errors.title`; ціна `0` і `100` → `errors.pricePerKwh`; `from: '20:00', to: '08:00'` → `errors.schedule`; точка за межами Вінниці → `errors.location`.
- [ ] **Step 4: Запустити — нові тести падають.**
- [ ] **Step 5: Реалізувати дані, `filters.js`, `validate.js`.**
- [ ] **Step 6: Запустити — усі `PASS`.**
- [ ] **Step 7: Коміт** `feat: seed data, filters and validation`.

### Task 3: Store

**Files:**
- Create: `js/store.js`, `tests/store.test.js`; підключити в `tests/index.html`

**Interfaces:**
- Consumes: `SPOTS`, `HOSTS`, `SEED_BOOKINGS`, `DEMO_GUEST_NAME` (Task 2), `sessionCost`, `holdAmount`, `estimateKwh` (Task 1), `DEFAULT_FILTERS` (Task 2).
- Produces: `seedState(): State` (`{ role: 'guest', blackout: false, filters: DEFAULT_FILTERS, spots, hosts, bookings }`, глибока копія), `memoryStorage(): Storage-like`, `safeLocalStorage(): Storage-like | null`, `createStore(storage): Store` з методами:
  `getState()`, `subscribe(fn): () => void`, `setRole(role)`, `setBlackout(on)`, `setFilters(partial)`, `resetFilters()`, `addSpot(input): Spot` (id `user-<timestamp>`, `hostId: DEMO_HOST_ID`, `reviews: []`), `createBooking({ spotId, device, day, start, hours }): Booking` (рахує `estimatedKwh`, `heldAmount`, статус `held`, `guestName: DEMO_GUEST_NAME`), `startCharging(id)`, `finishCharging(id, actualKwh)` (статус `paid`, пише `total/fee/hostPayout`), `addReview(bookingId, { stars, text })` (додає відгук у точку, статус `reviewed`), `confirmBooking(id)` (`pending → held`), `declineBooking(id)` (`→ declined`), `reset()`.
  Кожна зміна зберігає стан у `storage` під `energist-demo-v1` і викликає підписників.

- [ ] **Step 1: Тести** — `createStore(memoryStorage())` стартує із засіяних даних; `setBlackout(true)` → стан змінено і підписник викликаний один раз; новий store на тому ж storage бачить `blackout: true`; `createBooking` + `finishCharging(id, 30)` на точці з ціною 12 → `{ total: 360, fee: 36, hostPayout: 324 }`; `addReview` додає відгук і рейтинг точки змінюється; `reset()` повертає засіяні дані; storage з `"{garbage"` під ключем → засіяний стан без винятку; storage, що кидає в `setItem`, → store працює.
- [ ] **Step 2: Запустити — падають.**
- [ ] **Step 3: Реалізувати `js/store.js`.** Стан незмінний ззовні: методи замінюють `state` новим об'єктом; `getState()` повертає поточний.
- [ ] **Step 4: Запустити — усі `PASS`.**
- [ ] **Step 5: Коміт** `feat: app store with persistence`.

### Task 4: Каркас, шапка, головна

**Files:**
- Create: `index.html`, `css/styles.css`, `js/app.js`, `js/router.js`, `js/ui.js`, `js/views/landing.js`
- Create: `assets/hero-house.jpg`, `assets/phone-map.jpg` — з `ppt/media/image1.png` і `image11.png` презентації, стиснені до ширини ≤ 1200 px, ≤ 250 КБ (Pillow або ffmpeg)

**Interfaces:**
- Consumes: `createStore`, `safeLocalStorage`, `memoryStorage` (Task 3).
- Produces (`js/app.js`): `export const store` (singleton на `safeLocalStorage() ?? memoryStorage()`).
- Produces (`js/router.js`): `startRouter(routes: Record<string, (params, root: HTMLElement) => (() => void) | void>, root)` — патерни `'/'`, `'/map'`, `'/spot/:id'`, `'/host'`, `'/calc'`; невідомий маршрут → `#/map`; перед новим рендером викликає cleanup попередньої в'юшки.
- Produces (`js/ui.js`): `h(tag, attrs, ...children): HTMLElement`, `openModal(content: HTMLElement, { onClose }): { close() }`, `toast(text)`, `stars(rating): HTMLElement`.
- Кожна в'юшка: `export function render(params, root, store) → cleanup?`; `app.js` реєструє маршрути як `(params, root) => view.render(params, root, store)`.

- [ ] **Step 1: `index.html`** — Inter, Leaflet 1.9.4 CSS/JS з unpkg, `<header>`, `<main id="app">`, `<footer>` з «Скинути демо», `<script type="module" src="js/app.js">`.
- [ ] **Step 2: `css/styles.css`** — токени з Global Constraints на `:root`, тема блекауту на `body.blackout`, кнопки, картки, модалка, тост, сітка лендінгу; брейкпоінт 768 px.
- [ ] **Step 3: Шапка** — логотип → `#/`, сегмент-перемикач «Я шукаю зарядку» / «Я ділюсь енергією» (`setRole` + перехід на `#/map` / `#/host`), «Калькулятор» → `#/calc`, перемикач «⚡ Блекаут» (`setBlackout`; додає `body.blackout`). Активний стан читається зі store.
- [ ] **Step 4: Головна** — героїчний блок з `hero-house.jpg`, «Енергетичний Airbnb для України», дві CTA; блок «Проблема» з історіями Саші й Олега (цифри: 30–40 грн, 4,32 грн, «перекриває потреби на 200%+»); «Як це працює» з 4 кроками; місце під компактний калькулятор (`<div id="calc-compact">`, заповнюється в Task 8).
- [ ] **Step 5: Тимчасові заглушки** для `/map`, `/spot/:id`, `/host`, `/calc` (заголовок екрана), щоб роутер був перевірний.
- [ ] **Step 6: Перевірити** у прев'ю `/`: немає помилок у консолі; клік по CTA міняє маршрут; блекаут-перемикач змінює тему і переживає перезавантаження; «Скинути демо» повертає світлу тему; `/tests/` досі `PASS`. Скріншот головної.
- [ ] **Step 7: Коміт** `feat: app shell, header and landing`.

### Task 5: Карта і список (шлях Саші, частина 1)

**Files:**
- Create: `js/views/map.js`
- Modify: `css/styles.css` — розкладка список/карта, піни, банер блекауту, порожній стан

**Interfaces:**
- Consumes: `filterSpots`, `DEFAULT_FILTERS`, `spotRating`, `isLiveInBlackout` (Task 2); `store` (Task 4); `formatUAH` (Task 1); `DEVICES`, `VINNYTSIA_CENTER`.
- Produces: `spotPin(spot, { dimmed, selected }): L.DivIcon` (експортується — повторно використовується в Task 7).

- [ ] **Step 1: Розкладка** — ліва колонка (фільтри + «Знайдено N точок» + картки), права — карта на всю висоту під шапкою. На < 768 px карта зверху (45vh), список під нею.
- [ ] **Step 2: Фільтри** — чипи пристроїв, повзунок макс. ціни 8–15, чипи рейтингу (будь-який / 4.5+ / 4.8+), перемикач «Доступно зараз»; пишуть у `store.setFilters`.
- [ ] **Step 3: Картки** — фото/ілюстрація, назва, район, значок джерела, потужність, `pricePerKwh` грн/кВт·год, рейтинг і кількість відгуків; у блекауті — «протримається ще ~N год». Клік → `#/spot/:id`.
- [ ] **Step 4: Карта** — Leaflet, CARTO Positron `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png`, у блекауті Dark Matter `dark_all`, атрибуція OSM/CARTO; піни через `spotPin`; `grid` у блекауті — сірий, без кліку; синхронне підсвічування пін ↔ картка; `fitBounds` на видимі точки.
- [ ] **Step 5: Банер блекауту** «У вашому районі немає світла з 14:00 (демо)» над списком.
- [ ] **Step 6: Збої** — якщо `window.L` немає або тайли видали `tileerror` до першого `load`, замість карти плашка «Карта недоступна — перевірте інтернет»; порожній результат → ілюстрація + «Нічого не знайдено» + кнопка «Скинути фільтри» (`resetFilters`).
- [ ] **Step 7: Cleanup** — `map.remove()` і відписка від store при виході з маршруту.
- [ ] **Step 8: Перевірити** — 15 пінів; фільтр «Електромобіль» зменшує кількість і пінів, і карток однаково; блекаут: темні тайли, `grid` сірі, лічильник зменшився; Review Focus #3 (блекаут + EcoFlow + 8 грн) → порожній стан і кнопка працює; Leaflet-скрипт заблоковано в DevTools (або `delete window.L` перед рендером) → плашка, список живий. Скріншоти звичайного і блекаут-режиму.
- [ ] **Step 9: Коміт** `feat: map view with filters and blackout mode`.

### Task 6: Картка точки і бронювання (шлях Саші, частина 2)

**Files:**
- Create: `js/views/spot.js`, `js/views/booking.js`
- Modify: `css/styles.css` — картка точки, кроки модалки, анімація батареї, галочка

**Interfaces:**
- Consumes: `store` методи `createBooking`, `startCharging`, `finishCharging`, `addReview`; `availableStarts`, `spotRating`, `isLiveInBlackout`; `estimateKwh`, `holdAmount`, `sessionCost`, `savingsVsCommercial`, `formatUAH`, `formatKwh`; `SIM_DURATION_MS`, `COMMERCIAL_PRICE`, `DEVICES`; `openModal`, `stars`.
- Produces (`js/views/booking.js`): `openBooking(spot, store): void`.

- [ ] **Step 1: Картка точки** — усі поля з §3.3 спеку, відгуки, блок «Тут N грн/кВт·год · комерційна зарядка ~35 грн», господар. Невідомий `id` → `#/map`. `grid` у блекауті → плашка «Немає світла — бронювання недоступне», кнопка вимкнена.
- [ ] **Step 2: Крок 1 «Час»** — пристрій (лише з `spot.devices`), день, слоти з `availableStarts`; якщо на сьогодні порожньо — автоматично «завтра» і підпис «Сьогодні вже зачинено» (Review Focus #1); тривалість 1–6 год, обмежена закриттям; наживо `estimateKwh` і `holdAmount`.
- [ ] **Step 3: Крок 2 «Підтвердження»** — зведення, текст про безпечну угоду, кнопка «Підтвердити і заморозити N грн» → `createBooking`.
- [ ] **Step 4: Крок 3 «Зарядка»** — `startCharging`; `requestAnimationFrame`-цикл на `SIM_DURATION_MS`: батарея заповнюється, лічильники `formatKwh(estimatedKwh × p)` і `formatUAH(...)`, симульований час `h:mm / h:mm`; «Завершити раніше» і закриття модалки → `finishCharging(id, поточні кВт·год)`; цикл зупиняється при закритті.
- [ ] **Step 5: Крок 4 «Оплата»** — фактичні кВт·год, сума, «Господарю N грн», «Комісія ЕнерГість 10% — N грн», «Ви зекономили N грн порівняно з комерційною зарядкою», «Повернуто із заморожених: N грн», анімована галочка.
- [ ] **Step 6: Крок 5 «Відгук»** — 1–5 зірок + текст → `addReview` → тост «Дякуємо за відгук!», модалка закривається, картка точки показує новий відгук і рейтинг.
- [ ] **Step 7: Перевірити** — повний шлях на точці Олега до відгуку; Review Focus #2: «Завершити раніше» одразу → 0 грн, повернення = вся заморожена сума, без `NaN`; закриття модалки посеред зарядки → бронювання `paid`, анімація зупинена (немає помилок у консолі); пітч «увечері»: тимчасово підмінити `now` на 21:00 → крок 1 обирає завтра. Скріншоти кроків 3 і 4.
- [ ] **Step 8: Коміт** `feat: spot page and booking flow with charging simulation`.

### Task 7: Кабінет господаря (шлях Олега)

**Files:**
- Create: `js/views/host.js`
- Modify: `css/styles.css` — стат-плитки, стовпчиковий графік, список бронювань, форма

**Interfaces:**
- Consumes: `store` методи `addSpot`, `confirmBooking`, `declineBooking`; `validateSpotInput`; `spotPin` (Task 5); `formatUAH`, `formatKwh`; `DEMO_HOST_ID`, `HOSTS` (`sesCost`), `VINNYTSIA_CENTER`.

- [ ] **Step 1: Стат-плитки** — заробіток за місяць (сума `hostPayout` оплачених бронювань Олега + засіяна база), кількість зарядок, рейтинг (середній по його точках), продано кВт·год.
- [ ] **Step 2: Графік** — 6 стовпчиків (5 засіяних місяців + поточний з реальних даних store) на чистому CSS/SVG з підписами значень; прогрес-бар «Окупність СЕС: N%» = накопичений заробіток / `sesCost`.
- [ ] **Step 3: Бронювання** — список усіх бронювань на точках Олега, новіші зверху: гість, точка, дата/час, кВт·год, сума, статус-бейдж; для `pending` — «Підтвердити» / «Відхилити».
- [ ] **Step 4: Мої точки + «Додати розетку»** — форма в модалці з міні-картою (клік ставить пін), поля зі спеку §3.5, підказка «8–15 грн — середня ціна в місті»; помилки `validateSpotInput` під полями; успіх → `addSpot`, тост, точка в списку.
- [ ] **Step 5: Перевірити** — бронювання, зроблене в Task 6 на точці Олега, видно тут з правильною сумою; «Підтвердити» міняє бейдж; Review Focus #5: збереження порожньої форми / ціни 100 / без кліку по карті → помилки, точка не додана; валідна точка → перемкнути на «Я шукаю зарядку» → вона є на карті. Скріншот кабінету.
- [ ] **Step 6: Коміт** `feat: host dashboard with bookings and add-outlet form`.

### Task 8: Калькулятор вигоди

**Files:**
- Create: `js/views/calculator.js`
- Modify: `js/views/landing.js` — змонтувати компактну версію в `#calc-compact`; `css/styles.css`

**Interfaces:**
- Consumes: `monthlyGuestSavings`, `monthlyHostEarnings`, `sessionCost`, `gridValue`, `formatUAH`; `HOME_TARIFF`, `COMMERCIAL_RANGE`, `COMMISSION`, `WEEKS_PER_MONTH`.
- Produces: `render(params, root, store)` для `#/calc` і `mountCalculator(el, { compact: boolean })`.

- [ ] **Step 1: Повзунки** — «кВт·год на тиждень» (Саша, 5–150, за замовчуванням 30), «надлишок кВт·год на місяць» (Олег, 50–800, 300), «ціна ЕнерГостя» (8–15, 12). Компактна версія — лише перший і третій повзунки.
- [ ] **Step 2: Результати** — «Саша економить N грн/міс», «Олег заробляє N грн/міс», «ЕнерГість отримує N грн/міс»; підпис «замість N грн, якби віддав у мережу за 4,32».
- [ ] **Step 3: Шкала цін** — горизонтальна шкала 0–40 грн: маркер 4,32 (домашній тариф), маркер поточної ціни ЕнерГостя, діапазон 30–40 (комерційні зарядки).
- [ ] **Step 4: Перевірити** — при 30 кВт·год/тиждень і 12 грн економія = `formatUAH(monthlyGuestSavings(30, 12))` (2987,70 грн); при 300 кВт·год/міс Олег = 3240 грн; повзунки оновлюють цифри наживо; компактна версія на головній працює. Скріншот.
- [ ] **Step 5: Коміт** `feat: savings calculator`.

### Task 9: Шліфування, мобільна ширина, README

**Files:**
- Modify: `css/styles.css`, в'юшки за потреби
- Create: `README.md` — що це, як запустити локально (`py -m http.server 8420`), як задеплоїти на GitHub Pages, де міняти ціни (`js/data.js`)

- [ ] **Step 1: Прогін на 375 px** (`resize_window` mobile) — головна, карта, картка точки, модалка бронювання, кабінет, калькулятор: немає горизонтального скролу, кнопки ≥ 44 px, текст не обрізаний.
- [ ] **Step 2: Повний сценарій пітчу на десктопі** — головна → калькулятор → карта → блекаут → бронювання на точці Олега до відгуку → «Я ділюсь енергією» → бронювання видно → додати розетку → вона на карті → «Скинути демо». Консоль без помилок; `/tests/` — `PASS`.
- [ ] **Step 3: Виправити знайдене.**
- [ ] **Step 4: Коміт** `chore: responsive polish and README`.

Деплой (спек §12) — окремо після плану: користувач створює репозиторій, пуш лише з його згоди.
