# ЕнерГість — акаунти (Firebase) і Render: план реалізації

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Справжня реєстрація і вхід (Google, email + пароль, посилання на пошту) з профілем у Firestore, вхід на діях, і хостинг сайту на Render замість GitHub Pages.

**Architecture:** Firebase ізольовано в одному адаптері `js/firebase.js` (SDK з CDN). Уся логіка сесії — у `js/auth.js` без залежності від Firebase, тестується з підробленим сервісом. В'юшки отримують `session` четвертим аргументом і питають у нього стан і ім'я; модалка входу — `js/views/auth-modal.js`.

**Tech Stack:** HTML/CSS/JS ES-модулі без збірки; Firebase JS SDK 10.14.1 (`https://www.gstatic.com/firebasejs/10.14.1/…`): Auth + Firestore; Render Static Site.

**Spec:** `docs/specs/2026-10-29-energist-auth-design.md` (і базовий `docs/specs/2026-10-29-energist-demo-design.md`)

## Global Constraints

- Без npm і збірки; Firebase лише з `https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js`, `…/firebase-auth.js`, `…/firebase-firestore.js` через динамічний `import()`.
- Лише `js/firebase.js` імпортує Firebase; решта коду працює з інтерфейсом `AuthService`.
- Firestore: лише `users/{uid}` з полями `name` (1–60), `role` (`guest`|`host`), `createdAt`; правила — точно як у §5 спеку.
- Тексти помилок — точно як у §7 спеку; інтерфейс лише українською.
- `DEMO_GUEST_NAME` («Саша») — ім'я в демо-режимі і за замовчуванням; `DATA_VERSION` лишається 2.
- localStorage: ключ посилання з пошти `energist-signin-email`; кожен доступ у `try/catch`.
- Вхід через Google — лише `signInWithPopup` (redirect не використовувати).
- Claude не реєструється і не входить через Firebase сам; справжній вхід перевіряє користувач (Task 6).
- Умови Google/Firebase/Render приймає користувач; пуш у `main`, злиття і вимкнення Pages — лише з його дозволу.
- Роботу ведемо на гілці `auth`; коміт після кожного завдання.

## Review Focus

1. Сесія ще визначається (`loading`), а людина вже тисне «Забронювати»: не показувати вікно входу передчасно — дочекатися; увійдений → одразу бронювання, не увійдений → вікно входу (тести в Task 1).
2. Профіль не зберігся (мережа / правила Firestore): лишаємось на кроці профілю з повідомленням, відкладена дія не виконується (тест у Task 1).
3. Вхід через Google: спливне вікно заблоковане або закрите — кнопки не «зависають» у «Зачекайте…», можна повторити (ручна перевірка з підробленим сервісом у Task 5).
4. Посилання з пошти відкрили в іншому браузері (email не збережено): попросити email, а не впасти; помилкове/застаріле посилання — зрозуміле повідомлення (тест `takeLinkEmail` у Task 1 + ручна перевірка в Task 5).
5. Вихід з акаунта, коли відкрито `#/host` чи `#/profile`: сторінка одразу показує заглушку, а не дані попереднього користувача (ручна перевірка в Task 5).

---

### Task 1: Логіка сесії `js/auth.js`

**Files:**
- Create: `js/auth.js`, `tests/auth.test.js`
- Modify: `tests/runner.js` (підтримка async-тестів), `tests/index.html` (додати `auth`, `await run()`)

**Interfaces:**
- Consumes: `DEMO_GUEST_NAME` (`js/data.js`), `memoryStorage` (`js/store.js`, лише в тестах).
- Produces:
  - `AuthService` (контракт для Task 3): `onUser(cb)`, `loadProfile(uid) → Promise<{name, role} | null>`, `saveProfile(uid, {name, role}, {create: boolean}) → Promise<void>`, плюс методи входу, які сесія не викликає сама: `signInWithGoogle()`, `signUpWithPassword(email, pw)`, `signInWithPassword(email, pw)`, `sendSignInLink(email, continueUrl)`, `isSignInLink(url)`, `completeSignInLink(email, url)`, `sendPasswordReset(email)`, `resendVerification()`, `signOut()`. `user = { uid, email, name, photoURL, provider: 'google' | 'email', emailVerified }` (спек §4.1 називає три способи, але після входу Firebase не розрізняє пароль і посилання — тому два значення; у профілі «Google» або «Email»).
  - `createSession(loadService: () => Promise<AuthService | null>)` → `{ getState() → {status, user, profile}, subscribe(fn) → unsub, onNeedAuth(fn(reason)) → unsub, requireAuth(action, reason), cancelPending(), saveProfile({name, role}) → Promise<void>, enterDemo(), currentName() → string, service: AuthService | null, ready: Promise<void> }`; `status ∈ 'loading'|'unavailable'|'signedOut'|'needsProfile'|'signedIn'|'demo'`.
  - `validateProfile({name, role}) → { ok, errors: {name?, role?}, value: {name (trimmed), role} }`
  - `authErrorMessage(code) → string` (`''` для «без повідомлення»)
  - `rememberLinkEmail(email, returnTo, storage?)`, `takeLinkEmail(storage?) → {email, returnTo} | null` (читає і стирає; `storage` за замовчуванням — localStorage або нічого)

- [ ] **Step 1: Async у ранері** — `test(name, fn)` приймає async `fn`; `run()` стає `async` і чекає кожен тест; `tests/index.html` викликає `await run()`. Наявні 53 тести мають лишитися `PASS`.
- [ ] **Step 2: Тести `tests/auth.test.js`** (фейковий сервіс: `onUser` запам'ятовує колбек, `emit(user)` його викликає, `loadProfile` повертає задане, `saveProfile` записує або кидає `{code}`)

```js
const user = { uid: 'u1', email: 'a@b.ua', name: 'Ірина', photoURL: null, provider: 'google', emailVerified: true };
test('без сервісу → unavailable, enterDemo → demo, ім\'я Саша', async () => {
  const s = createSession(async () => null); await s.ready;
  eq(s.getState().status, 'unavailable'); s.enterDemo();
  eq([s.getState().status, s.currentName()], ['demo', 'Саша']);
});
test('onUser(null) → signedOut', …);                 // status 'signedOut'
test('без профілю → needsProfile', …);               // loadProfile → null
test('з профілем → signedIn і currentName', …);      // {name:'Ірина', role:'guest'} → 'Ірина'
test('requireAuth у signedOut: дія чекає, onNeedAuth отримав причину', …);
test('після входу і профілю дія виконується рівно один раз', …); // emit(user) → needsProfile → saveProfile → calls === 1; ще один emit(user) → 1
test('requireAuth у signedIn і demo — одразу', …);
test('cancelPending — після входу дія не виконується', …);
test('loading: дія чекає без вікна входу; signedIn → виконується', …);   // Review Focus 1
test('loading → signedOut: onNeedAuth викликається тоді', …);            // Review Focus 1
test('saveProfile впав — needsProfile, дія не виконана, помилка проброшена', …); // Review Focus 2
test('saveProfile з порожнім ім\'ям — сервіс не викликано', …);
test('validateProfile', () => {
  eq(validateProfile({ name: '  Ірина ', role: 'host' }), { ok: true, errors: {}, value: { name: 'Ірина', role: 'host' } });
  eq(validateProfile({ name: '   ', role: 'guest' }).ok, false);
  eq(validateProfile({ name: 'а'.repeat(61), role: 'guest' }).ok, false);
  eq(validateProfile({ name: 'Ірина', role: 'admin' }).ok, false);
});
test('authErrorMessage', () => {
  eq(authErrorMessage('auth/invalid-credential'), 'Невірний email або пароль');
  eq(authErrorMessage('auth/wrong-password'), 'Невірний email або пароль');
  eq(authErrorMessage('auth/popup-closed-by-user'), '');
  eq(authErrorMessage('auth/expired-action-code'), 'Посилання застаріло або вже використане — надішліть нове');
  eq(authErrorMessage('щось/нове'), 'Щось пішло не так. Спробуйте ще раз');
});
test('посилання з пошти: email запам\'ятовується, видається один раз', () => {
  const st = memoryStorage();
  rememberLinkEmail('a@b.ua', '#/spot/oleh-ses', st);
  eq(takeLinkEmail(st), { email: 'a@b.ua', returnTo: '#/spot/oleh-ses' });
  eq(takeLinkEmail(st), null);                       // Review Focus 4: інший браузер = нічого не збережено
  st.setItem('energist-signin-email', '{bad'); eq(takeLinkEmail(st), null);
});
```
Усі тексти `authErrorMessage` — повна таблиця з §7 спеку; у тесті достатньо кодів вище.
- [ ] **Step 3: Запустити** `bash tests/run-headless.sh` — очікувано `FAIL load` (немає `js/auth.js`).
- [ ] **Step 4: Реалізувати `js/auth.js`.** Відкладена дія — одна (нова замінює стару); виконується при переході в `signedIn` і обнуляється до виклику. `onNeedAuth` кличеться в `requireAuth` для `signedOut`/`needsProfile`/`unavailable` одразу, для `loading` — після переходу в `signedOut`/`needsProfile`/`unavailable`. `saveProfile` передає `{create: status === 'needsProfile'}`.
- [ ] **Step 5: Запустити** — `PASS` (53 + нові).
- [ ] **Step 6: Коміт** `feat: auth session logic`.

### Task 2: Ім'я користувача в demo-даних (`js/store.js`)

**Files:** Modify `js/store.js`, `tests/store.test.js`

**Interfaces:**
- Produces: `createBooking({ spotId, device, day, start, hours, guestName = DEMO_GUEST_NAME })`, `addReview(bookingId, { stars, text, author = DEMO_GUEST_NAME })`, `addSpot(input)` зберігає `input.hostName`, якщо є.

- [ ] **Step 1: Тести** — `createBooking({…, guestName: 'Ірина'})` → `guestName === 'Ірина'`; без поля → `'Саша'`; `addReview(id, {stars: 5, text: 'ок', author: 'Ірина'})` → перший відгук точки має `author === 'Ірина'`; `addSpot({…, hostName: 'Ірина'})` → `spot.hostName === 'Ірина'`.
- [ ] **Step 2: Запустити** — нові тести падають.
- [ ] **Step 3: Реалізувати.**
- [ ] **Step 4: Запустити** — усі `PASS`.
- [ ] **Step 5: Коміт** `feat: store takes the signed-in name`.

### Task 3: Проєкт Firebase, сайт на Render, конфіг

**Files:** Create `js/firebase-config.js` (`export const firebaseConfig = { apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId }`), `firestore.rules` (текст правил з §5 спеку — для історії; публікується в консолі)

Робиться в Chrome користувача (Claude in Chrome). На кроках з прийняттям умов — зупинитись і попросити користувача натиснути самому.

- [ ] **Step 1: Firebase** — console.firebase.google.com → проєкт `energist` (Google Analytics вимкнено) → веб-застосунок `energist-web` → скопіювати конфіг у `js/firebase-config.js`.
- [ ] **Step 2: Authentication** — Get started → увімкнути Google (support email — пошта власника), Email/Password + Email link (passwordless); Templates → мова «Українська».
- [ ] **Step 3: Firestore** — створити базу, production mode, `europe-central2`; Rules → вставити `firestore.rules` → Publish.
- [ ] **Step 4: Render** — dashboard.render.com → New → Static Site → `FireDuck3/energist`, гілка `main`, Build Command порожня (якщо обов'язкова — `echo ok`), Publish Directory `.`, Auto-Deploy Yes. Якщо Render не бачить репозиторій — зупинитись і попросити користувача надати доступ GitHub-застосунку Render до `energist`. Записати адресу сайту.
- [ ] **Step 5: Authorized domains** — Firebase → Authentication → Settings → Authorized domains → додати домен Render.
- [ ] **Step 6: Перевірити** — `curl -s -o /dev/null -w '%{http_code}' https://<render-домен>/` → `200`; у консолі Firebase видно 3 увімкнені способи входу, домен Render серед дозволених, правила опубліковані.
- [ ] **Step 7: Коміт** `chore: firebase config and firestore rules`.

### Task 4: Адаптер Firebase, сесія в застосунку, шапка, демо-режим

**Files:**
- Create: `js/firebase.js`
- Modify: `js/app.js`, `css/styles.css`

**Interfaces:**
- Consumes: `createSession`, `AuthService` (Task 1), `firebaseConfig` (Task 3).
- Produces: `loadFirebase() → Promise<AuthService | null>` (у `js/firebase.js`); у `app.js` — `export const session`; кожна в'юшка викликається як `view.render(params, root, store, session)`.

- [ ] **Step 1: `js/firebase.js`** — динамічно імпортує три модулі SDK 10.14.1 з бази `window.__ENERGIST_SDK_BASE ?? 'https://www.gstatic.com/firebasejs/10.14.1/'` (перевизначення — лише для ручної перевірки демо-режиму); будь-яка помилка імпорту чи ініціалізації → `null`. `auth.languageCode = 'uk'`. Мапінг користувача: `provider = providerData.some(p => p.providerId === 'google.com') ? 'google' : 'email'`. `signUpWithPassword` після створення шле `sendEmailVerification`. `sendSignInLink(email, continueUrl)` — `{ url: continueUrl, handleCodeInApp: true }`. `saveProfile(uid, {name, role}, {create})` — `setDoc(doc(db,'users',uid), create ? {name, role, createdAt: serverTimestamp()} : {name, role}, {merge: true})`. Помилки прокидати як є (`{code}`).
- [ ] **Step 2: `app.js`** — `session = createSession(loadFirebase)`; `session.onNeedAuth(reason => openAuthModal(session, { reason }))` (модалка — Task 5; до того — тимчасово `toast(reason)`); шапка підписана і на store, і на session: `loading` — порожнє місце фіксованої ширини; `signedOut`/`unavailable` — кнопка «Увійти» (`session.requireAuth(() => {}, '')`); `signedIn`/`demo`/`needsProfile` — аватар (`user.photoURL` або перша літера `currentName()`) + ім'я, меню «Профіль» → `#/profile`, «Вийти» → `session.service.signOut()` (у демо — перезавантаження сторінки). В'юшки отримують `session`.
- [ ] **Step 3: Перевірити в браузері (localhost)** — після завантаження `session.getState().status === 'signedOut'`, у шапці «Увійти», консоль без помилок; із заблокованим `www.gstatic.com` (підмінити URL SDK у консолі через `window.__ENERGIST_SDK_BASE = 'https://invalid.invalid/'`, який адаптер читає перед імпортом) → `unavailable`, і «Увійти» веде до демо-режиму (після Task 5); `tests/` — `PASS`.
- [ ] **Step 4: Коміт** `feat: firebase adapter and session-aware header`.

### Task 5: Вікно входу, перевірка входу на діях, профіль

**Files:**
- Create: `js/views/auth-modal.js`, `js/views/profile.js`
- Modify: `js/app.js` (маршрут `/profile`, обробка посилання з пошти, справжня `openAuthModal`), `js/views/spot.js`, `js/views/booking.js`, `js/views/host.js`, `css/styles.css`

**Interfaces:**
- Consumes: `session` API і `AuthService` (Task 1), `authErrorMessage`, `validateProfile`, `rememberLinkEmail`, `takeLinkEmail`; `openModal` (`js/ui.js`); store API з Task 2.
- Produces: `openAuthModal(session, { reason?, mode? })`, `mode ∈ 'signin'|'signup'|'link'|'linkSent'|'reset'|'resetSent'|'profile'|'linkEmail'|'unavailable'`; за замовчуванням — `'profile'` для `needsProfile`, `'unavailable'` для `unavailable`, інакше `'signin'`.

- [ ] **Step 1: `auth-modal.js`** — режими з §3.1–3.2 і §3.7 спеку; підписка на `session`: `signedIn` → закрити модалку; `needsProfile` → режим `profile` (ім'я з `user.name`). Під час запиту кнопки `disabled`, текст головної — «Зачекайте…»; у `catch` і `finally` стан кнопок відновлюється, помилка — `authErrorMessage(e.code)` (порожній рядок — нічого не показувати). Закриття без входу → `session.cancelPending()`. «Надіслати посилання»: `rememberLinkEmail(email, location.hash)`, `continueUrl = location.origin + location.pathname`. У режимі `unavailable` — «Вхід недоступний без інтернету» + «Продовжити в демо-режимі» → `session.enterDemo()` і закрити.
- [ ] **Step 2: Посилання з пошти в `app.js`** — після `session.ready`: якщо `session.service?.isSignInLink(location.href)` → `takeLinkEmail()`; є → `completeSignInLink`; немає → `openAuthModal(session, { mode: 'linkEmail' })`; після успіху `history.replaceState(null, '', location.pathname + (returnTo || '#/'))`; помилка → модалка `signin` з текстом помилки.
- [ ] **Step 3: Перевірка входу на діях** — `spot.js`: «Забронювати» → `session.requireAuth(() => openBooking(spot, store, { session }), 'Увійдіть, щоб забронювати зарядку')`; господар — `spot.hostName ?? host.name`. `booking.js`: `guestName`/`author` з `session.currentName()`, «Господарю (…)» з `spot.hostName ?? host name`. `host.js`: без `signedIn`/`demo` — заглушка «Кабінет господаря доступний після входу» + «Увійти» (`requireAuth(() => {}, 'Увійдіть, щоб відкрити кабінет господаря')`); з входом — «Вітаємо, {ім'я}!» (ім'я з профілю як є), позначка демо-кабінету з §3.6; `addSpot({…, hostName: session.currentName()})`. Обидві сторінки підписані на `session` (Review Focus 5).
- [ ] **Step 4: `profile.js`** — §3.5 спеку; збереження через `session.saveProfile`; помилки під полями; «Надіслати лист ще раз» лише для `provider === 'email'` і `!emailVerified`.
- [ ] **Step 5: Перевірити в браузері (localhost, без справжнього входу)** — «Забронювати» без входу → модалка з причиною; закрити → бронювання не відкрилось; вкладки Вхід/Реєстрація, «Увійти без пароля», «Забули пароль?» перемикаються; порожній email/пароль → повідомлення без запиту в мережу; `#/host` і `#/profile` без входу — заглушки; демо-режим (SDK заблоковано) → «Продовжити в демо-режимі» → «Забронювати» відкриває бронювання від «Саша»; Review Focus 3: у консолі підмінити `session.service.signInWithGoogle = () => Promise.reject({ code: 'auth/popup-blocked' })` → текст з §7, кнопки знову активні; Review Focus 4: відкрити `/?mode=signIn&oobCode=x&apiKey=…` без збереженого email → режим `linkEmail`; ширина 375 px; консоль без помилок; `tests/` — `PASS`.
- [ ] **Step 6: Коміт** `feat: sign-in modal, gated actions and profile page`.

### Task 6: Викладка і справжня перевірка входу

**Files:** Modify `README.md` (розділ «Акаунти»: Firebase, де конфіг, як додати домен; хостинг Render замість Pages)

- [ ] **Step 1: README.**
- [ ] **Step 2: Спитати дозволу** на злиття `auth` → `main` і пуш. Після «так»: `git checkout main && git merge auth && bash tests/run-headless.sh && git push origin main`; дочекатися деплою Render (`curl` адреси → `200`, у відповіді `js/auth.js` → `200`).
- [ ] **Step 3: Перевірити живий сайт (Claude)** — сторінка відкривається, статус сесії `signedOut`, консоль без помилок, домен дозволений (немає `auth/unauthorized-domain` при відкритті модалки).
- [ ] **Step 4: Чекліст користувача** (з §9 спеку): реєстрація паролем → профіль → лист підтвердження; вихід/вхід, неправильний пароль; Google; посилання з пошти; «Забули пароль?»; «Забронювати» без входу → бронювання; зміна імені в профілі. Після — Claude дивиться в Firebase → Authentication → Users і Firestore → `users`, що записи є і містять лише `name`, `role`, `createdAt`.
- [ ] **Step 5: Вимкнути GitHub Pages** (з дозволу) — Settings → Pages → Source: None; `curl https://fireduck3.github.io/energist/` → `404`.
- [ ] **Step 6: Коміт** README (якщо ще не в `main`), видалити гілку `auth`.
