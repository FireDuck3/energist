# ЕнерГість — справжні акаунти (Firebase) і хостинг на Render

Дата: 2026-10-29
Базується на: `docs/specs/2026-10-29-energist-demo-design.md` (демо для пітчу)

## 1. Мета

Додати до демо справжню реєстрацію і вхід: людина (зокрема журі на пітчі) створює акаунт, і ЕнерГість звертається до неї на ім'я, бронювання й відгуки йдуть від її імені. Сайт переїжджає з GitHub Pages на Render.

Успіх: на живому сайті можна зареєструватися паролем, увійти через Google або посиланням з пошти, вийти і знову увійти. Профіль (ім'я, роль) зберігається між пристроями. Без інтернету пітч не ламається.

## 2. Що вирішено з користувачем

| Питання | Рішення |
|---|---|
| Тип авторизації | Справжні акаунти |
| Обсяг | Вхід + профіль (ім'я, роль). Точки, бронювання, відгуки лишаються демо-даними в браузері |
| Способи входу | Google; email + пароль; посилання на пошту (без пароля) |
| Коли просимо вхід | Лише на діях: «Забронювати», кабінет господаря (і «Додати розетку» в ньому) |
| Сервіс | Firebase Auth + Firestore |
| Хостинг | Render (Static Site) замість GitHub Pages |

Припущення: SMS-входу немає (платний); видалення акаунта з інтерфейсу немає (за потреби — у консолі Firebase); інтерфейс лише українською.

## 3. Екрани і сценарії

### 3.1 Вікно входу (модалка `auth-modal`)
- Кнопка **«Продовжити з Google»** (спливне вікно Google).
- Розділювач «або», вкладки **Вхід** / **Реєстрація**: email + пароль, кнопка «Увійти» / «Створити акаунт».
- Посилання **«Увійти без пароля»** → поле email → «Надіслати посилання» → екран «Ми надіслали посилання на {email}. Відкрийте лист і натисніть посилання».
- Посилання **«Забули пароль?»** (у вкладці «Вхід») → поле email → лист для скидання → «Перевірте пошту».
- Необов'язковий підзаголовок з причиною: «Увійдіть, щоб забронювати зарядку» / «Увійдіть, щоб відкрити кабінет господаря».
- Помилки — під формою, українською (див. §7). Під час запиту кнопки вимкнені, на головній кнопці — «Зачекайте…».
- Після реєстрації паролем Firebase надсилає лист підтвердження пошти; доступ не блокується.

### 3.2 Перший вхід (крок «Профіль» у тій самій модалці)
Показується, коли користувач увійшов, а документа профілю ще немає:
- «Як вас звати?» — поле імені (з Google підставляється `displayName`).
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
- Увійшов: аватар (фото Google або перша літера імені) + ім'я; клік відкриває меню «Профіль» (`#/profile`) / «Вийти».
- Поки Firebase визначає сесію — нейтральне місце-заглушка без мигання кнопки «Увійти».

### 3.5 Профіль `#/profile`
- Без входу — та сама заглушка з кнопкою «Увійти».
- Ім'я (редагується), email, спосіб входу (Google / пароль / посилання), роль (перемикач), «пошту підтверджено» / «пошту не підтверджено» + «Надіслати лист ще раз» (лише для пароля), «Зберегти», «Вийти».

### 3.6 Наявні екрани
- Бронювання й відгуки підписуються ім'ям з профілю (замість «Саша»).
- Кабінет господаря: «Вітаємо, {ім'я}!» + позначка «Демо-кабінет: статистика — приклад господаря Олега з Вишеньки. Розетки, які ви додасте, з'являться тут.» Статистика і бронювання — як зараз (демо-господар Олег).
- Розетка, додана увійденим користувачем, зберігає `hostName` = ім'я з профілю; картка точки й оплата показують `spot.hostName ?? host.name`.
- «Скинути демо» скидає демо-дані, але не виходить з акаунта.

### 3.7 Демо-режим без інтернету
Якщо SDK Firebase не завантажився або мережа недоступна: вікно входу показує «Вхід недоступний без інтернету» і кнопку **«Продовжити в демо-режимі»**. Демо-режим поводиться як увійдений користувач з ім'ям «Саша» (`DEMO_GUEST_NAME`), без профілю в хмарі, до перезавантаження сторінки.

## 4. Архітектура

```
js/firebase-config.js   публічний конфіг веб-застосунку Firebase
js/firebase.js          адаптер до Firebase SDK 10.14.1 (gstatic CDN, динамічний import)
js/auth.js              сесія і логіка входу без залежності від Firebase
js/views/auth-modal.js  вікно входу / реєстрації / посилання / скидання / першого профілю
js/views/profile.js     сторінка профілю
tests/auth.test.js      тести js/auth.js з підробленим сервісом
```

### 4.1 `js/firebase.js` — адаптер (єдиний модуль, що знає про Firebase)
`loadFirebase(): Promise<AuthService | null>` — `null`, якщо SDK не завантажився. `AuthService`:
- `onUser(cb)` — `cb(user | null)`, де `user = { uid, email, name, photoURL, provider: 'google'|'password'|'emailLink', emailVerified }`
- `signInWithGoogle()`, `signUpWithPassword(email, password)`, `signInWithPassword(email, password)`
- `sendSignInLink(email, continueUrl)`, `isSignInLink(url)`, `completeSignInLink(email, url)`
- `sendPasswordReset(email)`, `resendVerification()`, `signOut()`
- `loadProfile(uid): Promise<{ name, role } | null>`, `saveProfile(uid, { name, role })`
- Помилки прокидаються як `{ code }` з кодом Firebase (`auth/...`).
- Мова листів: `auth.languageCode = 'uk'`.

### 4.2 `js/auth.js` — сесія
`createSession(loadService)` повертає:
- `getState()` → `{ status, user, profile }`, `status ∈ 'loading' | 'unavailable' | 'signedOut' | 'needsProfile' | 'signedIn' | 'demo'`
- `subscribe(fn)` → відписка
- `requireAuth(action, reason)` — якщо `signedIn` або `demo`: виконує `action()` одразу; інакше запам'ятовує `{ action, reason }` і сповіщає «потрібен вхід» (UI відкриває модалку з `reason`)
- `cancelPending()` — скасувати відкладену дію (модалку закрили)
- `saveProfile({ name, role })` — валідує, зберігає, переходить у `signedIn`, виконує відкладену дію рівно один раз
- `enterDemo()` — лише зі стану `unavailable` → `demo`
- `currentName()` — ім'я з профілю; у `demo` або без профілю — `DEMO_GUEST_NAME`
- `service` — доступ до методів входу для модалки
Також чисті функції: `validateProfile({ name, role })`, `authErrorMessage(code)`, `rememberLinkEmail(email, returnTo)` / `takeLinkEmail()` (localStorage `energist-signin-email`, у `try/catch`).

Переходи: старт `loading` → сервіс `null` → `unavailable`; `onUser(null)` → `signedOut`; `onUser(user)` → читає профіль → `signedIn` або `needsProfile`. Після переходу в `signedIn` відкладена дія виконується, якщо вона є.

### 4.3 Посилання з пошти
- Перед надсиланням: `rememberLinkEmail(email, location.hash)`; `continueUrl` = адреса сайту без хешу.
- На старті `app.js`: якщо `isSignInLink(location.href)` — бере email з `takeLinkEmail()`; немає — модалка просить ввести email; завершує вхід; прибирає параметри з адреси `history.replaceState` і повертає збережений хеш.

## 5. Дані і правила доступу

Firebase Auth зберігає email, спосіб входу, фото, `emailVerified`. Firestore, колекція `users/{uid}`: `{ name: string (1–60), role: 'guest'|'host', createdAt: timestamp }`.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read: if request.auth != null && request.auth.uid == uid;
      allow create, update: if request.auth != null && request.auth.uid == uid
        && request.resource.data.keys().hasOnly(['name', 'role', 'createdAt'])
        && request.resource.data.name is string
        && request.resource.data.name.size() >= 1 && request.resource.data.name.size() <= 60
        && request.resource.data.role in ['guest', 'host'];
      allow delete: if false;
    }
  }
}
```
Усі інші шляхи закриті (за замовчуванням).

## 6. Зміни в наявному коді
- `js/store.js`: `createBooking({ …, guestName })` (за замовчуванням `DEMO_GUEST_NAME`), `addReview(bookingId, { stars, text, author })` (за замовчуванням `DEMO_GUEST_NAME`), `addSpot(input)` зберігає `input.hostName`, якщо передано. `DATA_VERSION` лишається 2.
- `js/app.js`: створює сесію, шапка за станом сесії, маршрут `/profile`, обробка посилання з пошти, відкриття модалки на «потрібен вхід».
- `js/views/spot.js`: «Забронювати» → `session.requireAuth(() => openBooking(…), 'Увійдіть, щоб забронювати зарядку')`; господар — `spot.hostName ?? host.name`.
- `js/views/booking.js`: ім'я гостя і автора відгуку — `session.currentName()`; «Господарю (…)» — `spot.hostName ?? host.name`.
- `js/views/host.js`: заглушка без входу; привітання на ім'я; позначка демо-кабінету; `hostName` для нових розеток.

## 7. Повідомлення про помилки (`authErrorMessage`)
| Код | Текст |
|---|---|
| `auth/invalid-email` | Невірний формат email |
| `auth/missing-password` | Введіть пароль |
| `auth/weak-password` | Пароль має бути щонайменше 6 символів |
| `auth/email-already-in-use` | Цей email уже зареєстровано — увійдіть |
| `auth/invalid-credential`, `auth/wrong-password`, `auth/user-not-found` | Невірний email або пароль |
| `auth/too-many-requests` | Забагато спроб. Спробуйте за кілька хвилин |
| `auth/popup-blocked` | Браузер заблокував вікно входу — дозвольте спливні вікна і спробуйте ще раз |
| `auth/popup-closed-by-user`, `auth/cancelled-popup-request` | (без повідомлення) |
| `auth/network-request-failed` | Немає з'єднання з інтернетом |
| `auth/unauthorized-domain` | Вхід з цієї адреси не дозволено |
| `auth/invalid-action-code`, `auth/expired-action-code` | Посилання застаріло або вже використане — надішліть нове |
| `auth/account-exists-with-different-credential` | Цей email уже використовується з іншим способом входу |
| `auth/operation-not-allowed` | Цей спосіб входу зараз вимкнено |
| інше | Щось пішло не так. Спробуйте ще раз |

## 8. Налаштування і хостинг

**Firebase (console.firebase.google.com):** проєкт `energist`; веб-застосунок → конфіг у `js/firebase-config.js`; Authentication → увімкнути Google, Email/Password, Email link (passwordless); Templates → мова українська; Settings → Authorized domains → домен Render (`localhost` уже є); Firestore → створити базу (`europe-central2`), опублікувати правила з §5. Умови Google/Firebase приймає користувач сам.

**Render (dashboard.render.com):** New → Static Site → репозиторій `FireDuck3/energist`, гілка `main`, Build Command порожня (або `echo ok`, якщо поле обов'язкове), Publish Directory `.`, Auto-Deploy увімкнено. Адреса — `energist.onrender.com` або з суфіксом від Render. Власний домен — Settings → Custom Domains (після купівлі).

**GitHub Pages:** вимкнути після того, як сайт на Render працює.

Пуш у `main` — лише з дозволу користувача.

## 9. Тестування

**Автотести (`tests/auth.test.js`, підроблений `AuthService`):**
- старт без сервісу → `unavailable`; `enterDemo` → `demo`, `currentName()` = «Саша»
- `onUser(null)` → `signedOut`; користувач без профілю → `needsProfile`; з профілем → `signedIn`
- `requireAuth` у `signedOut` не виконує дію і сповіщає з причиною; після входу і профілю дія виконується рівно один раз
- `requireAuth` у `signedIn` / `demo` виконує дію одразу
- `cancelPending` → після входу дія не виконується
- `validateProfile`: порожнє/пробільне ім'я, 61 символ, невідома роль → помилки; валідне — ок
- `authErrorMessage` для кодів з §7 і невідомого коду
- `rememberLinkEmail` / `takeLinkEmail` (повертає і стирає; зіпсоване сховище не ламає)
- `store`: `createBooking` з `guestName`, `addReview` з `author`, `addSpot` з `hostName`

**У браузері (Claude):** шапка в станах «не увійшов» / «завантаження»; заглушки кабінету й профілю; модалка: вкладки, «без пароля», «забули пароль», помилки валідації до запиту; демо-режим при заблокованому SDK; без помилок у консолі; ширина 375 px.

**Справжній вхід (користувач, на живому сайті, ~5 хв):** реєстрація паролем → крок профілю → лист підтвердження; вихід і вхід паролем, неправильний пароль; вхід через Google; вхід посиланням з пошти; «Забули пароль?»; «Забронювати» без входу → вхід → бронювання відкрилося; зміна імені в профілі → нове ім'я в шапці. Claude перевіряє в консолі Firebase, що профілі з'явилися. (Claude не реєструється і не входить через зовнішній сервіс сам.)

## 10. Поза рамками
SMS-вхід, видалення акаунта з інтерфейсу, спільні між користувачами точки/бронювання/відгуки, права доступу за роллю, зміна email чи пароля з профілю, вхід через Apple/Facebook.
