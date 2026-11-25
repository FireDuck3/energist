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

test('реєстрація й вхід: є посилання на політику (зокрема для входу через Google)', () => {
  for (const page of [signupPage, loginPage]) {
    const root = document.createElement('div');
    const cleanup = page({}, root, null, signedOut());
    try {
      eq(root.querySelectorAll('a[href="#/privacy"]').length, 1, page.name);
      // Жодних прихованих «згоден з усім».
      eq(root.querySelectorAll('input[type="checkbox"]').length, 0, page.name);
    } finally { cleanup?.(); }
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
