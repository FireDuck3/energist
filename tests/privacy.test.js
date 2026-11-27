import { test, eq } from './runner.js';
import { render, privacyNote } from '../js/views/privacy.js';
import { SECTIONS, OPERATOR, STATUS, EDITION, isPublishable, policyText } from '../js/privacy-policy.js';
import { signupPage, loginPage } from '../js/views/auth-page.js';
import { openAuthModal } from '../js/views/auth-modal.js';
import { render as profileRender } from '../js/views/profile.js';

// Сесія без входу: сторінка політики не має її потребувати.
const signedOut = (service = { signInWithGoogle() {} }) => ({
  getState: () => ({ status: 'signedOut', user: null, profile: null }),
  subscribe: () => () => {},
  requireAuth() {}, cancelPending() {}, service,
});

test('політика: відкривається без входу — заголовок, дата редакції, зміст із посиланнями на всі розділи', () => {
  const root = document.createElement('div');
  const cleanup = render({}, root);
  try {
    eq(root.querySelector('h1').textContent, 'Політика конфіденційності');
    eq(Boolean(root.querySelector('time[datetime]')), true);
    eq(root.querySelector('time').getAttribute('datetime'), EDITION);
    const toc = root.querySelector('nav[aria-label="Зміст"]');
    const links = [...toc.querySelectorAll('a')];
    eq(links.length, SECTIONS.length);
    const headings = [...root.querySelectorAll('section > h2')];
    eq(headings.map((x) => x.textContent), SECTIONS.map((s) => s.title));
    // Кожен пункт змісту веде на наявний розділ, а сам маршрут лишається #/privacy (хеш-роутер).
    for (const a of links) {
      eq(a.getAttribute('href'), '#/privacy');
      eq(Boolean(root.querySelector(`#${a.dataset.target}`)), true, a.textContent);
    }
  } finally { cleanup?.(); }
});

test('політика: пункт змісту переводить фокус на розділ і не змінює адресу', () => {
  const root = document.createElement('div');
  document.body.append(root);
  const before = location.hash;
  const cleanup = render({}, root);
  try {
    const link = root.querySelectorAll('nav[aria-label="Зміст"] a')[2];
    link.click();
    const heading = document.getElementById(link.dataset.target);
    eq(document.activeElement, heading);
    eq(heading.getAttribute('tabindex'), '-1');
    eq(location.hash, before);
  } finally { cleanup?.(); root.remove(); }
});

test('політика: поки немає даних володільця — це чернетка з помітною позначкою', () => {
  eq(isPublishable({ status: 'draft', operator: { name: 'X', address: 'Y', email: 'z@x.ua' } }), false);
  eq(isPublishable({ status: 'published', operator: { name: 'X', address: null, email: 'z@x.ua' } }), false);
  eq(isPublishable({ status: 'published', operator: { name: 'X', address: 'Y', email: 'z@x.ua' } }), true);
  const root = document.createElement('div');
  render({}, root);
  const draft = !isPublishable({ status: STATUS, operator: OPERATOR });
  eq(Boolean(root.querySelector('.policy-draft[role="note"]')), draft);
  if (draft) eq(/Чернетка/.test(root.querySelector('.policy-edition').textContent), true);
});

test('політика: опублікована редакція не містить незаповнених місць', () => {
  if (!isPublishable({ status: STATUS, operator: OPERATOR })) return;
  eq(/буде вказано|уточнюється|\bTODO\b|\[\s*\]/i.test(policyText()), false);
});

test('політика: не обіцяє того, чого немає в коді', () => {
  const text = policyText().toLowerCase();
  // Немає наскрізного шифрування, абсолютної безпеки, «жодних сховищ браузера», аналітики чи еквайрингу.
  for (const bad of ['100%', 'повністю захищ', 'не використовуємо cookies', 'не використовуємо сховищ', 'не обробляємо пароль',
    'google analytics', 'наскрізно зашифрован', 'видаляється через 14', 'видаляємо через 14']) {
    eq(text.includes(bad), false, bad);
  }
  // А те, що є, названо прямо.
  for (const good of ['наскрізного шифрування немає', 'localstorage', 'sessionstorage', 'supabase', 'tile.openstreetmap.org',
    'fonts.googleapis.com', 'host_contact_reveals', '14 днів', 'незалежно від обраних каналів', 'публічн']) {
    eq(text.includes(good), true, good);
  }
});

test('політика: посилання-примітка відкривається в новій вкладці, щоб не губити заповнену форму', () => {
  const note = privacyNote();
  const a = note.querySelector('a');
  eq([a.getAttribute('href'), a.getAttribute('target'), a.getAttribute('rel')], ['#/privacy', '_blank', 'noopener']);
});

// Чекбокс згоди: не відмічений заздалегідь, підписаний, з посиланням на політику в новій вкладці.
function consentBox(root, where) {
  const boxes = root.querySelectorAll('input[type="checkbox"]');
  eq(boxes.length, 1, where);
  const box = boxes[0];
  eq(box.checked, false, where);
  const label = root.querySelector(`label[for="${box.id}"]`) ?? box.closest('label');
  eq(/погоджуюся/i.test(label.textContent), true, where);
  eq(label.querySelector('a[href="#/privacy"]')?.getAttribute('target'), '_blank', where);
  return box;
}

test('реєстрація й вхід: є посилання на політику (зокрема для входу через Google)', () => {
  for (const page of [signupPage, loginPage]) {
    const root = document.createElement('div');
    const cleanup = page({}, root, null, signedOut());
    try {
      eq(root.querySelectorAll('a[href="#/privacy"]').length, 1, page.name);
      eq(/\b(false|null|undefined)\b/.test(root.textContent), false, page.name);
    } finally { cleanup?.(); }
  }
});

test('сторінка реєстрації: без згоди акаунт не створюється, зі згодою — створюється', async () => {
  const calls = [];
  const service = { signInWithGoogle() {}, async signUpWithPassword(...a) { calls.push(a); } };
  const root = document.createElement('div');
  document.body.append(root); // форма поза документом не надсилається
  const cleanup = signupPage({}, root, null, { ...signedOut(service), waitForSignIn: async () => false });
  const fill = (id, v) => { const el = root.querySelector(`#auth-signup-${id}`); el.value = v; el.dispatchEvent(new Event('input')); };
  try {
    consentBox(root, 'signup');
    fill('firstName', 'Ірина'); fill('lastName', 'Коваль'); fill('email', 'i@b.ua'); fill('password', '12345678');
    root.querySelector('.role-choice button').click();
    root.querySelector('form').requestSubmit();
    await Promise.resolve();
    eq(calls.length, 0);
    const err = root.querySelector('#auth-signup-consent-err');
    eq(err.textContent, 'Щоб створити акаунт, погодьтеся з Політикою конфіденційності');
    eq(root.querySelector('input[type="checkbox"]').getAttribute('aria-describedby'), err.id);
    eq(root.querySelector('input[type="checkbox"]').getAttribute('aria-invalid'), 'true');
    root.querySelector('input[type="checkbox"]').click();
    root.querySelector('form').requestSubmit();
    await new Promise((r) => setTimeout(r));
    eq(calls.length, 1);
  } finally { cleanup?.(); root.remove(); }
});

test('сторінка входу й вкладка входу у вікні: чекбокса згоди немає', () => {
  const root = document.createElement('div');
  const cleanup = loginPage({}, root, null, signedOut());
  try { eq(root.querySelectorAll('input[type="checkbox"]').length, 0); } finally { cleanup?.(); }
  openAuthModal(signedOut(), { mode: 'signin' });
  const modal = document.querySelector('.modal-auth');
  try { eq(modal.querySelectorAll('input[type="checkbox"]').length, 0); } finally { modal.querySelector('.modal-close').click(); }
});

test('вікно входу: реєстрація й крок профілю (новий акаунт через Google чи код) вимагають згоди', async () => {
  const calls = [];
  const service = { signInWithGoogle() {}, async signUpWithPassword(...a) { calls.push(['signup', a]); } };
  const session = { ...signedOut(service), waitForSignIn: async () => false, async saveProfile(p) { calls.push(['profile', p]); } };
  for (const mode of ['signup', 'profile']) {
    openAuthModal(session, { mode, reason: 'тест' });
    const modal = document.querySelector('.modal-auth');
    const set = (sel, v) => { const el = modal.querySelector(sel); el.value = v; el.dispatchEvent(new Event('input')); };
    try {
      consentBox(modal, mode);
      if (mode === 'signup') {
        set('input[autocomplete="given-name"]', 'Ірина'); set('input[autocomplete="family-name"]', 'Коваль');
        set('input[type="email"]', 'i@b.ua'); set('input[type="password"]', '12345678');
      } else {
        set('input[autocomplete="given-name"]', 'Ірина');
        modal.querySelector('.role-choice button').click();
      }
      modal.querySelector('form').requestSubmit();
      await new Promise((r) => setTimeout(r));
      eq(calls.length, 0, mode);
      eq(modal.querySelector('[role="alert"]')?.textContent, 'Щоб створити акаунт, погодьтеся з Політикою конфіденційності', mode);
      modal.querySelector('input[type="checkbox"]').click();
      modal.querySelector('form').requestSubmit();
      await new Promise((r) => setTimeout(r));
      eq(calls.map((c) => c[0]), [mode], mode);
      calls.length = 0;
    } finally { modal.querySelector('.modal-close')?.click(); }
  }
});

test('підвал сайту: посилання на політику', async () => {
  const html = await (await fetch('../index.html')).text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  eq(doc.querySelectorAll('footer a[href="#/privacy"]').length, 1);
});

test('профіль: посилання на політику', () => {
  const root = document.createElement('div');
  const store = { reset() {} };
  const session = {
    getState: () => ({ status: 'signedIn', user: { uid: 'u1', email: 'a@b.ua' }, profile: { name: 'Оля', role: 'guest' } }),
    subscribe: () => () => {}, service: {},
  };
  const userHistory = { getState: () => ({ status: 'ready', searches: [], charges: [] }), subscribe: () => () => {} };
  const pilot = { panel: () => document.createElement('div'), chatsPanel: () => document.createElement('div'), subscribe: () => () => {} };
  const cleanup = profileRender({}, root, store, session, userHistory, pilot);
  try {
    eq(root.querySelectorAll('a[href="#/privacy"]').length, 1);
  } finally { cleanup?.(); }
});

test('вікно входу: посилання на політику у вкладках входу, реєстрації й кроці профілю', () => {
  for (const mode of ['signin', 'signup', 'profile']) {
    openAuthModal(signedOut(), { mode });
    const modal = document.querySelector('.modal-auth');
    try {
      eq(modal.querySelectorAll('a[href="#/privacy"]').length, 1, mode);
    } finally { modal.querySelector('.modal-close').click(); }
  }
});
