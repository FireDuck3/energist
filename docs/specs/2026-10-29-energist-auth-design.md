# ЕнерГість — справжні акаунти (Supabase) і хостинг на Render

Дата: 2026-10-29 (ред. 2: Firebase → Supabase, без входу через Google)
Базується на: `docs/specs/2026-10-29-energist-demo-design.md` (демо для пітчу)

## 1. Мета

Додати до демо справжню реєстрацію і вхід: людина (зокрема журі на пітчі) створює акаунт, і ЕнерГість звертається до неї на ім'я, бронювання й відгуки йдуть від її імені. Сайт переїжджає з GitHub Pages на Render.

Успіх: на живому сайті можна зареєструватися паролем, увійти паролем або кодом з пошти, скинути пароль кодом, вийти і знову увійти. Профіль (ім'я, роль) зберігається між пристроями. Без інтернету пітч не ламається.

## 2. Що вирішено з користувачем

| Питання | Рішення |
|---|---|
| Тип авторизації | Справжні акаунти |
| Обсяг | Вхід + профіль (ім'я, роль). Точки, бронювання, відгуки лишаються демо-даними в браузері |
| Способи входу | Email + пароль; код з пошти (без пароля). **Без Google** — Google вимагає двоетапну перевірку для своїх консолей, користувач її не вмикає |
| Коли просимо вхід | Лише на діях: «Забронювати», кабінет господаря (і «Додати розетку» в ньому) |
| Сервіс | Supabase (Auth + Postgres) — Firebase відпав через обов'язкову 2SV |
| Хостинг | Render (Static Site) замість GitHub Pages |

Припущення: реєстрація паролем без підтвердження пошти (миттєвий доступ, без листів); вхід і скидання пароля — 6-значним кодом з листа, без посилань, для всіх — лише після підключення власного SMTP (§8); SMS-входу немає; видалення акаунта з інтерфейсу немає (за потреби — у панелі Supabase); інтерфейс лише українською.

## 3. Екрани і сценарії

### 3.1 Вікно входу (модалка `auth-modal`)
- Вкладки **Вхід** / **Реєстрація**: email + пароль, кнопка «Увійти» / «Створити акаунт».
- Посилання **«Увійти без пароля»** → поле email → «Надіслати код» → поле для 6-значного коду → «Увійти». Текст: «Ми надіслали код на {email}. Він діє 1 годину». Кнопка «Надіслати ще раз» (не частіше ніж раз на 60 с).
- Посилання **«Забули пароль?»** (у вкладці «Вхід») → поле email → «Надіслати код» → код + новий пароль → «Змінити пароль» → людина увійдена.
- Необов'язковий підзаголовок з причиною: «Увійдіть, щоб забронювати зарядку» / «Увійдіть, щоб відкрити кабінет господаря».
- Помилки — під формою, українською (див. §7). Під час запиту кнопки вимкнені, на головній кнопці — «Зачекайте…»; після помилки кнопки знову активні.

### 3.2 Перший вхід (крок «Профіль» у тій самій модалці)
Показується, коли користувач увійшов, а рядка профілю ще немає:
- «Як вас звати?» — поле імені.
- «Для чого вам ЕнерГість?» — вибір: 🔌 *Шукаю зарядку* (`guest`) / ☀️ *Маю енергію для продажу* (`host`).
- «Продовжити» → профіль зберігається → виконується відкладена дія (якщо була), інакше перехід: `guest` → `#/map`, `host` → `#/host`.
- Закриття модалки на цьому кроці лишає користувача увійденим без профілю; наступна дія, що вимагає входу, знову покаже цей крок.

### 3.3 Де просимо вхід
| Дія | Без входу | Після входу |
|---|---|---|
| «Забронювати» на картці точки | Вікно входу з причиною | Одразу відкривається модалка бронювання цієї точки |
| `#/host` | Заглушка «Кабінет господаря доступний після входу» + кнопка «Увійти» | Кабінет |
| Головна, карта, картка точки, калькулятор | Доступні | Доступні |

Якщо вікно входу закрили без входу — відкладена дія скасовується.

### 3.4 Шапка
- Не увійшов: кнопка «Увійти».
- Увійшов: кружечок з першою літерою імені + ім'я; клік відкриває меню «Профіль» (`#/profile`) / «Вийти».
- Поки сесія визначається — нейтральне місце-заглушка без мигання кнопки «Увійти».

### 3.5 Профіль `#/profile`
- Без входу — та сама заглушка з кнопкою «Увійти».
- Ім'я (редагується), email, роль (перемикач), «Зберегти», «Вийти».

### 3.6 Наявні екрани
- Бронювання й відгуки підписуються ім'ям з профілю (замість «Саша»).
- Кабінет господаря: «Вітаємо, {ім'я}!» + позначка «Демо-кабінет: статистика — приклад господаря Олега з Вишеньки. Розетки, які ви додасте, з'являться тут.» Статистика і бронювання — як зараз (демо-господар Олег).
- Розетка, додана увійденим користувачем, зберігає `hostName` = ім'я з профілю; картка точки й оплата показують `spot.hostName ?? host.name`.
- «Скинути демо» скидає демо-дані, але не виходить з акаунта.

### 3.7 Демо-режим без інтернету
Якщо бібліотека Supabase не завантажилась: вікно входу показує «Вхід недоступний без інтернету» і кнопку **«Продовжити в демо-режимі»**. Демо-режим поводиться як увійдений користувач з ім'ям «Саша» (`DEMO_GUEST_NAME`), без профілю в хмарі, до перезавантаження сторінки.

## 4. Архітектура

```
js/supabase-config.js   публічні URL проєкту і anon-ключ Supabase
js/supabase.js          адаптер до supabase-js 2.45.4 (jsDelivr ESM, динамічний import)
js/auth.js              сесія і логіка входу без залежності від сервісу (готово, тести є)
js/views/auth-modal.js  вікно входу / реєстрації / коду / скидання пароля / першого профілю
js/views/profile.js     сторінка профілю
supabase/schema.sql     таблиця profiles + правила RLS (виконується в SQL Editor Supabase)
.github/workflows/keepalive.yml  щоденний запит, щоб безкоштовний проєкт не засинав
```

### 4.1 `js/supabase.js` — адаптер (єдиний модуль, що знає про Supabase)
`loadSupabase(): Promise<AuthService | null>` — `null`, якщо бібліотека не завантажилась. Клієнт: `createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } })`. `AuthService`:
- `onUser(cb)` — через `onAuthStateChange`; `cb(user | null)`, `user = { uid, email, name: null, photoURL: null, provider: 'email', emailVerified: true }`
- `signUpWithPassword(email, password)`, `signInWithPassword(email, password)`
- `sendLoginCode(email)` — `signInWithOtp({ email, options: { shouldCreateUser: true } })`; `verifyLoginCode(email, code)` — `verifyOtp({ email, token: code, type: 'email' })`
- `sendResetCode(email)` — `resetPasswordForEmail(email)`; `resetPassword(email, code, newPassword)` — `verifyOtp({ email, token: code, type: 'recovery' })`, потім `updateUser({ password: newPassword })`
- `signOut()`
- `loadProfile(uid)` — `select name, role from profiles where id = uid` → `{ name, role } | null`; `saveProfile(uid, { name, role }, { create })` — `upsert({ id: uid, name, role })`
- Помилки перекладаються в коди §7 (`{ code: 'auth/…' }`).

### 4.2 `js/auth.js` — сесія
Як зроблено в Task 1 плану: `createSession(loadService)` зі станами `loading | unavailable | signedOut | needsProfile | signedIn | demo`, `requireAuth`, `onNeedAuth`, `cancelPending`, `saveProfile`, `enterDemo`, `currentName`; чисті `validateProfile`, `authErrorMessage`. Хелпери посилання з пошти (`rememberLinkEmail` / `takeLinkEmail`) прибираються — посилань більше немає.

## 5. Дані і правила доступу

Supabase Auth зберігає email і пароль. Таблиця `public.profiles`:

```sql
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  role text not null check (role in ('guest', 'host')),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "own profile: read"   on public.profiles for select using (auth.uid() = id);
create policy "own profile: insert" on public.profiles for insert with check (auth.uid() = id);
create policy "own profile: update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
```
Видалення з клієнта заборонене (немає політики delete). Інших таблиць немає.

## 6. Зміни в наявному коді
- `js/store.js`: `createBooking({ …, guestName })`, `addReview(bookingId, { …, author })`, `addSpot` з `hostName` (готово, Task 2).
- `js/app.js`: створює сесію, шапка за станом сесії, маршрут `/profile`, відкриття модалки на «потрібен вхід».
- `js/views/spot.js`: «Забронювати» → `session.requireAuth(() => openBooking(…), 'Увійдіть, щоб забронювати зарядку')`; господар — `spot.hostName ?? host.name`.
- `js/views/booking.js`: ім'я гостя і автора відгуку — `session.currentName()`; «Господарю (…)» — `spot.hostName ?? host.name`.
- `js/views/host.js`: заглушка без входу; привітання на ім'я; позначка демо-кабінету; `hostName` для нових розеток.

## 7. Повідомлення про помилки (`authErrorMessage`)
| Код (адаптер) | Помилка Supabase | Текст |
|---|---|---|
| `auth/invalid-email` | `email_address_invalid`, `validation_failed` | Невірний формат email |
| `auth/missing-password` | — (перевірка до запиту) | Введіть пароль |
| `auth/weak-password` | `weak_password` | Пароль має бути щонайменше 6 символів |
| `auth/email-already-in-use` | `user_already_exists`, `email_exists` | Цей email уже зареєстровано — увійдіть |
| `auth/invalid-credential` | `invalid_credentials` | Невірний email або пароль |
| `auth/invalid-code` | `otp_expired` | Код невірний або застарів — надішліть новий |
| `auth/email-rate-limit` | `over_email_send_rate_limit` | Забагато листів за годину. Спробуйте пізніше або увійдіть паролем |
| `auth/email-not-allowed` | `email_address_not_authorized` | Вхід кодом зараз недоступний для цієї пошти — увійдіть паролем |
| `auth/too-many-requests` | `over_request_rate_limit` | Забагато спроб. Спробуйте за кілька хвилин |
| `auth/network-request-failed` | збій мережі (status 0) | Немає з'єднання з інтернетом |
| `auth/operation-not-allowed` | `signup_disabled`, `email_provider_disabled` | Цей спосіб входу зараз вимкнено |
| інше | | Щось пішло не так. Спробуйте ще раз |

## 8. Налаштування і хостинг

**Supabase:** акаунт і проєкт `energist` (регіон Central EU / Frankfurt) створює користувач сам — разом із паролем бази даних. Далі Claude: SQL Editor → виконати `supabase/schema.sql`; Authentication → Providers → Email: увімкнено, **Confirm email вимкнено**, довжина коду 6; Email Templates «Magic Link» і «Reset Password» → український текст з `{{ .Token }}` і без посилань; URL Configuration → Site URL = адреса Render; Project Settings → API → URL і anon-ключ у `js/supabase-config.js`.

**Пошта:** реєстрація і вхід паролем листів не потребують і працюють для всіх одразу. Вхід кодом і скидання пароля шлють лист. Вбудована пошта Supabase доставляє листи **лише адресам учасників команди проєкту** і лише кілька на годину — для решти людей ці два способи запрацюють після підключення власного SMTP: користувач створює безкоштовний акаунт поштового сервісу (напр., Brevo, 300 листів/день) і сам вставляє SMTP-дані в Authentication → SMTP Settings (Claude не вводить ключі й паролі). До того вікно входу на помилку `email_address_not_authorized` радить увійти паролем.

**Проти засинання:** `.github/workflows/keepalive.yml` — щодня `curl` до `{url}/rest/v1/profiles?select=id&limit=1` з anon-ключем (запит без даних, але це активність проєкту). GitHub вимикає розклад у репозиторії без комітів 60 днів — тоді увімкнути вручну.

**Render (dashboard.render.com):** New → Static Site → репозиторій `FireDuck3/energist`, гілка `main`, Build Command порожня (або `echo ok`, якщо поле обов'язкове), Publish Directory `.`, Auto-Deploy увімкнено. Адреса — `energist.onrender.com` або з суфіксом від Render. Власний домен — Settings → Custom Domains (після купівлі).

**GitHub Pages:** вимкнути після того, як сайт на Render працює.

Пуш у `main` — лише з дозволу користувача. Claude не створює акаунти й паролі і не входить на сайт сам.

## 9. Тестування

**Автотести:** `tests/auth.test.js` (готово; оновити таблицю помилок і прибрати тести хелперів посилання), `tests/store.test.js` (готово), `tests/supabase.test.js` — переклад помилок Supabase у коди §7 (чиста функція адаптера `toAuthCode(error)`).

**У браузері (Claude):** шапка в станах «не увійшов» / «завантаження»; заглушки кабінету й профілю; модалка: вкладки, «без пароля», «забули пароль», помилки валідації до запиту; демо-режим при заблокованій бібліотеці; без помилок у консолі; ширина 375 px.

**Справжній вхід (користувач, на живому сайті, ~5 хв):** реєстрація паролем → крок профілю; вихід і вхід паролем, неправильний пароль; вхід кодом з пошти; «Забули пароль?» кодом; «Забронювати» без входу → вхід → бронювання відкрилося; зміна імені в профілі → нове ім'я в шапці. Claude перевіряє в Supabase (Table Editor → profiles), що рядки з'явилися.

## 10. Поза рамками
Вхід через Google/Apple/Facebook, SMS, підтвердження пошти при реєстрації, видалення акаунта з інтерфейсу, спільні між користувачами точки/бронювання/відгуки, права доступу за роллю, зміна email чи пароля з профілю.
