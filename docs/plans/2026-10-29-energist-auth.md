# ЕнерГість — акаунти (Supabase) і Render: план реалізації

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Справжня реєстрація і вхід (email + пароль, код з пошти, скидання пароля кодом) з профілем у Supabase, вхід на діях, і хостинг сайту на Render замість GitHub Pages.

**Architecture:** Supabase ізольовано в одному адаптері `js/supabase.js` (supabase-js з jsDelivr). Уся логіка сесії — у `js/auth.js` без залежності від сервісу, тестується з підробленим сервісом. В'юшки отримують `session` четвертим аргументом; модалка входу — `js/views/auth-modal.js`.

**Tech Stack:** HTML/CSS/JS ES-модулі без збірки; `@supabase/supabase-js@2.45.4` (`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm`); Supabase Auth + Postgres (RLS); Render Static Site; GitHub Actions (keepalive).

**Spec:** `docs/specs/2026-10-29-energist-auth-design.md` (ред. 2) і базовий `docs/specs/2026-10-29-energist-demo-design.md`

## Global Constraints

- Без npm і збірки; supabase-js лише з `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm` через динамічний `import()`.
- Лише `js/supabase.js` імпортує supabase-js; решта коду працює з інтерфейсом `AuthService`.
- База: лише `public.profiles` з `schema.sql` спеку §5 (RLS: читати/додавати/змінювати лише свій рядок).
- Тексти помилок — точно як у §7 спеку; інтерфейс лише українською.
- `DEMO_GUEST_NAME` («Саша») — ім'я в демо-режимі і за замовчуванням; `DATA_VERSION` лишається 2.
- `detectSessionInUrl: false` — у листах лише коди, без посилань.
- Claude не створює акаунти, не вводить паролі/ключі і не входить на сайт сам; акаунт і проєкт Supabase, SMTP-дані і справжній вхід — користувач.
- Пуш у `main`, злиття і вимкнення Pages — лише з дозволу користувача.
- Роботу ведемо на гілці `auth`; коміт після кожного завдання.

## Review Focus

1. Сесія ще визначається (`loading`), а людина вже тисне «Забронювати»: дочекатися; увійдений → одразу бронювання, не увійдений → вікно входу (тести в Task 1 — готово).
2. Профіль не зберігся (мережа / RLS): лишаємось на кроці профілю з повідомленням, відкладена дія не виконується (тест у Task 1 — готово).
3. Код з пошти невірний/застарів, ліміт листів вичерпано або пошта не дозволена вбудованим SMTP: зрозуміле повідомлення, кнопки знову активні, можна надіслати код ще раз або перейти до входу паролем (тест `toAuthCode` у Task 4 + ручна перевірка в Task 5).
4. «Надіслати ще раз» натиснули кілька разів поспіль: не частіше ніж раз на 60 с, лічильник видно (ручна перевірка в Task 5).
5. Вихід з акаунта, коли відкрито `#/host` чи `#/profile`: сторінка одразу показує заглушку (ручна перевірка в Task 5).

---

### Task 1: Логіка сесії `js/auth.js` — ✅ виконано (коміт 9709205)

### Task 2: Ім'я користувача в demo-даних — ✅ виконано (коміт 98ea1b1)

### Task 3: Проєкт Supabase, сайт на Render, схема, конфіг

**Files:** Create `supabase/schema.sql` (SQL зі спеку §5), `js/supabase-config.js` (`export const supabaseConfig = { url, anonKey }`), `.github/workflows/keepalive.yml`

- [ ] **Step 1: Користувач** створює акаунт Supabase (сам) і проєкт `energist`, регіон Central EU (Frankfurt), пароль бази задає сам. Claude чекає.
- [ ] **Step 2: Render (Claude у Chrome)** — dashboard.render.com → New → Static Site → `FireDuck3/energist`, гілка `main`, Build Command порожня (якщо обов'язкова — `echo ok`), Publish Directory `.`, Auto-Deploy Yes. Не бачить репозиторій — зупинитись, попросити користувача дати доступ. Записати адресу.
- [ ] **Step 3: Supabase (Claude у Chrome)** — SQL Editor → вставити `supabase/schema.sql` → Run; Authentication → Providers → Email: Confirm email OFF, OTP length 6; Email Templates «Magic Link» → тема «Код входу в ЕнерГість», тіло «Ваш код: {{ .Token }}. Він діє 1 годину. Якщо ви не запитували код — просто ігноруйте цей лист.»; «Reset Password» → тема «Код для зміни пароля», тіло «Код для зміни пароля в ЕнерГості: {{ .Token }}. Діє 1 годину.»; URL Configuration → Site URL = адреса Render; Project Settings → API → URL і anon public key у `js/supabase-config.js`.
- [ ] **Step 4: keepalive** — workflow: `on: schedule: - cron: '17 6 * * *'` і `workflow_dispatch`; один крок `curl -fsS "$URL/rest/v1/profiles?select=id&limit=1" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"` з `URL`/`KEY` з `js/supabase-config.js` (anon-ключ публічний).
- [ ] **Step 5: Перевірити** — `curl -s -o /dev/null -w '%{http_code}' https://<render-домен>/` → `200`; `curl -s "$URL/rest/v1/profiles?select=id&limit=1" -H "apikey: $KEY"` → `[]` (RLS пускає запит, рядків не видно); у Table Editor видно `profiles` з RLS enabled.
- [ ] **Step 6: Коміт** `chore: supabase schema, config and keepalive`.

### Task 4: Адаптер Supabase, оновлення `auth.js`, сесія в застосунку, шапка

**Files:**
- Create: `js/supabase.js`, `tests/supabase.test.js`
- Modify: `js/auth.js`, `tests/auth.test.js`, `tests/index.html` (додати `supabase`), `js/app.js`, `css/styles.css`

**Interfaces:**
- Consumes: `createSession`, `authErrorMessage` (Task 1), `supabaseConfig` (Task 3).
- Produces:
  - `toAuthCode(error) → string` (чиста, експортована з `js/supabase.js`) — мапінг зі спеку §7: `error.code` Supabase → `auth/…`; `error.status === 0` або `TypeError` (fetch) → `auth/network-request-failed`; невідоме → `auth/unknown`.
  - `loadSupabase() → Promise<AuthService | null>`; `AuthService` (замінює Firebase-варіант з Task 1): `onUser(cb)`, `loadProfile(uid)`, `saveProfile(uid, {name, role}, {create})`, `signUpWithPassword(email, pw)`, `signInWithPassword(email, pw)`, `sendLoginCode(email)`, `verifyLoginCode(email, code)`, `sendResetCode(email)`, `resetPassword(email, code, newPassword)`, `signOut()`; кидає `{ code: 'auth/…' }`.
  - `app.js`: `export const session`; кожна в'юшка — `view.render(params, root, store, session)`.

- [ ] **Step 1: Тести `tests/supabase.test.js`**

```js
test('коди Supabase → коди сесії', () => {
  eq(toAuthCode({ code: 'invalid_credentials' }), 'auth/invalid-credential');
  eq(toAuthCode({ code: 'user_already_exists' }), 'auth/email-already-in-use');
  eq(toAuthCode({ code: 'email_exists' }), 'auth/email-already-in-use');
  eq(toAuthCode({ code: 'weak_password' }), 'auth/weak-password');
  eq(toAuthCode({ code: 'otp_expired' }), 'auth/invalid-code');
  eq(toAuthCode({ code: 'over_email_send_rate_limit' }), 'auth/email-rate-limit');
  eq(toAuthCode({ code: 'email_address_not_authorized' }), 'auth/email-not-allowed');
  eq(toAuthCode({ code: 'email_address_invalid' }), 'auth/invalid-email');
  eq(toAuthCode({ status: 0, message: 'Failed to fetch' }), 'auth/network-request-failed');
  eq(toAuthCode(new TypeError('Failed to fetch')), 'auth/network-request-failed');
  eq(toAuthCode({ code: 'щось_нове' }), 'auth/unknown');
});
```
І в `tests/auth.test.js`: `authErrorMessage('auth/invalid-code') === 'Код невірний або застарів — надішліть новий'`, `authErrorMessage('auth/email-rate-limit') === 'Забагато листів за годину. Спробуйте пізніше або увійдіть паролем'`, `authErrorMessage('auth/email-not-allowed') === 'Вхід кодом зараз недоступний для цієї пошти — увійдіть паролем'`; прибрати тести `popup-*`, `expired-action-code` і хелперів посилання.
- [ ] **Step 2: Запустити** — падають (немає `js/supabase.js`, нових повідомлень).
- [ ] **Step 3: Реалізувати** — `toAuthCode` і `loadSupabase` у `js/supabase.js` (клієнт з `detectSessionInUrl: false`; `onUser` — `onAuthStateChange`, подія `INITIAL_SESSION` дає перший стан; `user = { uid, email, name: null, photoURL: null, provider: 'email', emailVerified: true }`; `loadProfile` — `.from('profiles').select('name, role').eq('id', uid).maybeSingle()`; `saveProfile` — `.upsert({ id: uid, name, role })`; кожну `{ error }` → `throw { code: toAuthCode(error) }`). У `js/auth.js`: таблиця повідомлень — рівно рядки §7 спеку (прибрати Google/посилання), видалити `rememberLinkEmail`/`takeLinkEmail`.
- [ ] **Step 4: `app.js` і шапка** — `session = createSession(loadSupabase)`; `session.onNeedAuth(reason => openAuthModal(session, { reason }))` (до Task 5 — тимчасово `toast(reason)`); шапка підписана на store і session: `loading` — порожнє місце фіксованої ширини; `signedOut`/`unavailable` — «Увійти» (`session.requireAuth(() => {}, '')`); `signedIn`/`demo`/`needsProfile` — кружечок з першою літерою `currentName()` + ім'я, меню «Профіль» / «Вийти» (`session.service.signOut()`; у демо — `location.reload()`). Перевизначення бази бібліотеки для ручної перевірки: `window.__ENERGIST_SUPABASE_URL ?? '<jsDelivr URL>'`.
- [ ] **Step 5: Запустити тести** — усі `PASS`. **Перевірити в браузері (localhost)**: `session.getState().status === 'signedOut'`, у шапці «Увійти», консоль без помилок; з `window.__ENERGIST_SUPABASE_URL = 'https://invalid.invalid/x.js'` до завантаження → `unavailable`.
- [ ] **Step 6: Коміт** `feat: supabase adapter and session-aware header`.

### Task 5: Вікно входу, вхід на діях, профіль

**Files:**
- Create: `js/views/auth-modal.js`, `js/views/profile.js`
- Modify: `js/app.js` (маршрут `/profile`, справжня `openAuthModal`), `js/views/spot.js`, `js/views/booking.js`, `js/views/host.js`, `css/styles.css`

**Interfaces:**
- Consumes: `session` API (Task 1), `AuthService` (Task 4), `authErrorMessage`, `validateProfile`; `openModal` (`js/ui.js`); store API (Task 2).
- Produces: `openAuthModal(session, { reason?, mode? })`, `mode ∈ 'signin'|'signup'|'code'|'codeSent'|'reset'|'resetSent'|'profile'|'unavailable'`; за замовчуванням — `'profile'` для `needsProfile`, `'unavailable'` для `unavailable`, інакше `'signin'`.

- [ ] **Step 1: `auth-modal.js`** — режими зі спеку §3.1–3.2 і §3.7. Перевірка до запиту: порожній email → «Невірний формат email», порожній пароль → «Введіть пароль», код — рівно 6 цифр. Під час запиту кнопки `disabled`, головна — «Зачекайте…»; у `finally` стан відновлюється; помилка — `authErrorMessage(e.code)`. Для `auth/email-not-allowed` і `auth/email-rate-limit` — під помилкою кнопка «Увійти паролем» (→ режим `signin`). «Надіслати ще раз» — неактивна 60 с з лічильником «через N с». Підписка на `session`: `signedIn` → закрити; `needsProfile` → режим `profile`. Закриття без входу → `session.cancelPending()`. Після `resetPassword` людина увійдена — далі як після входу. `unavailable` — «Вхід недоступний без інтернету» + «Продовжити в демо-режимі» → `session.enterDemo()` і закрити.
- [ ] **Step 2: Перевірка входу на діях** — `spot.js`: «Забронювати» → `session.requireAuth(() => openBooking(spot, store, { session }), 'Увійдіть, щоб забронювати зарядку')`; господар — `spot.hostName ?? host.name`. `booking.js`: `guestName`/`author` з `session.currentName()`, «Господарю (…)» з `spot.hostName ?? host name`. `host.js`: без `signedIn`/`demo` — заглушка «Кабінет господаря доступний після входу» + «Увійти» (`requireAuth(() => {}, 'Увійдіть, щоб відкрити кабінет господаря')`); з входом — «Вітаємо, {ім'я}!», позначка демо-кабінету з §3.6; `addSpot({…, hostName: session.currentName()})`. Обидві сторінки підписані на `session` (Review Focus 5).
- [ ] **Step 3: `profile.js`** — §3.5 спеку; збереження через `session.saveProfile`; помилки `validateProfile` під полями.
- [ ] **Step 4: Перевірити в браузері (localhost, без справжнього входу)** — «Забронювати» без входу → модалка з причиною; закрити → бронювання не відкрилось; вкладки Вхід/Реєстрація, «Увійти без пароля», «Забули пароль?» перемикаються; порожні поля → повідомлення без запиту в мережу; `#/host` і `#/profile` без входу — заглушки; демо-режим → «Продовжити в демо-режимі» → «Забронювати» відкриває бронювання від «Саша»; Review Focus 3: у консолі підмінити `session.service.sendLoginCode = () => Promise.reject({ code: 'auth/email-not-allowed' })` → текст з §7, кнопка «Увійти паролем», кнопки активні; Review Focus 4: після успішного (підміненого) надсилання «Надіслати ще раз» неактивна з лічильником; ширина 375 px; консоль без помилок; `tests/` — `PASS`.
- [ ] **Step 5: Коміт** `feat: sign-in modal, gated actions and profile page`.

### Task 6: Викладка і справжня перевірка входу

**Files:** Modify `README.md` (розділ «Акаунти»: Supabase, де конфіг і схема, SMTP, keepalive; хостинг Render замість Pages)

- [ ] **Step 1: README.**
- [ ] **Step 2: Спитати дозволу** на злиття `auth` → `main` і пуш. Після «так»: `git checkout main && git merge auth && bash tests/run-headless.sh && git push origin main`; дочекатися деплою Render (`curl` адреси → `200`, `js/auth.js` → `200`).
- [ ] **Step 3: Перевірити живий сайт (Claude)** — сторінка відкривається, статус сесії `signedOut`, консоль без помилок; keepalive запущено вручну (`workflow_dispatch`) і він зелений.
- [ ] **Step 4: Чекліст користувача** (спек §9): реєстрація паролем → профіль; вихід/вхід, неправильний пароль; вхід кодом (на свою пошту учасника команди — поки немає SMTP); «Забули пароль?»; «Забронювати» без входу → бронювання; зміна імені. Після — Claude дивиться в Table Editor → `profiles`, що рядки є і містять лише `id`, `name`, `role`, `created_at`.
- [ ] **Step 5: Вимкнути GitHub Pages** (з дозволу) — Settings → Pages → Source: None; `curl https://fireduck3.github.io/energist/` → `404`.
- [ ] **Step 6: SMTP (за бажанням користувача)** — користувач створює акаунт поштового сервісу і сам вставляє SMTP-дані в Supabase; після цього вхід кодом працює для будь-якої пошти.
