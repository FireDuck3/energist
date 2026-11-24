import { test, eq } from './runner.js';
import { hostContacts } from '../js/views/host-contacts.js';
import { toHostCard, CONTACT_REVEALS_PER_DAY } from '../js/host-profile.js';
import { createPilot } from '../js/pilot.js';

const card = (extra = {}) => ({ name: 'Олег', phone: null, email: null, hasContacts: true, channels: ['phone'], ...extra });
const tick = () => new Promise((r) => setTimeout(r, 0));
const text = (node) => node?.textContent ?? '';

test('контакти господаря: картка з бази знає, чи господар ділиться телефоном або email', () => {
  eq(toHostCard({ host_name: 'Олег', has_contacts: true }).hasContacts, true);
  eq(toHostCard({ host_name: 'Олег' }).hasContacts, false);
  eq(CONTACT_REVEALS_PER_DAY, 20);
});

test('контакти господаря: уже відомі (гість з бронюванням) — одразу посилання tel: і mailto:', () => {
  const el = hostContacts(card({ phone: '+380671234567', email: 'oleg@ex.ua' }), { signedIn: true });
  eq(el.querySelector('a[href="tel:+380671234567"]').textContent, '+380671234567');
  eq(el.querySelector('a[href="mailto:oleg@ex.ua"]').textContent, 'oleg@ex.ua');
  eq(el.querySelector('button'), null);
});

test('контакти господаря: господар не ділиться телефоном чи email — нічого не показуємо і не просимо входу', () => {
  eq(hostContacts(card({ hasContacts: false, channels: ['chat'] }), { signedIn: false }), null);
  eq(hostContacts(card({ hasContacts: false }), { signedIn: true }), null);
  eq(hostContacts(null, { signedIn: true }), null);
});

test('контакти господаря: аноніму — пропозиція увійти, без запиту контактів', () => {
  const asked = [];
  let revealed = 0;
  const el = hostContacts(card(), { signedIn: false, requireAuth: (reason) => asked.push(reason), reveal: async () => { revealed++; } });
  eq(/Увійдіть, щоб побачити телефон і email/.test(text(el)), true);
  el.querySelector('button').click();
  eq(asked.length, 1);
  eq(revealed, 0);
});

test('контакти господаря: увійшлий бачить їх лише після натискання «Показати контакти»', async () => {
  const calls = [];
  const shown = [];
  const el = hostContacts(card(), { signedIn: true,
    reveal: async () => { calls.push(1); return { phone: '+380671234567', email: null, limited: false }; },
    onRevealed: (c) => shown.push(c) });
  eq(calls.length, 0, 'без кліку запиту немає');
  const button = el.querySelector('button');
  eq(button.textContent, 'Показати контакти');
  button.click();
  await tick();
  eq(calls.length, 1);
  eq(el.querySelector('a[href="tel:+380671234567"]').textContent, '+380671234567');
  eq(el.querySelector('button'), null);
  eq(shown, [{ phone: '+380671234567', email: null }]);
});

test('контакти господаря: денний ліміт і збій показуються, при збої можна спробувати ще раз', async () => {
  const limited = hostContacts(card(), { signedIn: true, reveal: async () => ({ phone: null, email: null, limited: true }) });
  limited.querySelector('button').click();
  await tick();
  eq(new RegExp(`${CONTACT_REVEALS_PER_DAY} господарів на добу`).test(text(limited)), true);
  eq(limited.querySelector('a'), null);

  let fail = true;
  const flaky = hostContacts(card(), { signedIn: true,
    reveal: async () => { if (fail) throw new Error('net'); return { phone: '+380501112233', email: null, limited: false }; } });
  flaky.querySelector('button').click();
  await tick();
  eq(/Не вдалося завантажити контакти/.test(text(flaky)), true);
  fail = false;
  flaky.querySelector('button').click();
  await tick();
  eq(flaky.querySelector('a[href="tel:+380501112233"]') !== null, true);
});

test('контакти господаря: власник без обраних каналів бачить підказку, як відкрити контакти гостям', () => {
  const el = hostContacts(card({ hasContacts: false, channels: [] }), { own: true, signedIn: true });
  eq(/Гості не бачать ваших телефону й email/.test(text(el)), true);
  const mine = hostContacts(card({ phone: '+380671234567' }), { own: true, signedIn: true });
  eq(/Ваші контакти для гостей/.test(text(mine)), true);
});

test('pilot.revealContacts: чекає Supabase і передає відповідь сервера', async () => {
  let ready;
  const session = { service: null, ready: new Promise((r) => { ready = r; }), getState: () => ({ status: 'signedIn', user: { uid: 'u' } }), subscribe: () => () => {} };
  const pilot = createPilot(session, { getState: () => ({ pilotReady: true }), setPilotSpots() {} });
  const pending = pilot.revealContacts('p1');
  session.service = { revealHostContacts: async (id) => ({ phone: '+380671234567', email: null, limited: false, id }) };
  ready();
  eq(await pending, { phone: '+380671234567', email: null, limited: false, id: 'p1' });
});
