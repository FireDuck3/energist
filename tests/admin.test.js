import { test, eq } from './runner.js';
import { render } from '../js/views/admin.js';
import { h } from '../js/ui.js';
import {
  adminTab, reasonLabel, spotState, filterSpots, overviewTiles, slotLabel, dateTime, validateNote, adminErrorText, fullName,
} from '../js/admin.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };
const ADMIN = { uid: 'a1', isAdmin: true };

// Підробка session.service.admin: записує виклики, віддає задані дані.
function fakeApi(data = {}) {
  const calls = [];
  const rec = (name, result) => (...args) => {
    calls.push([name, ...args]);
    return typeof result === 'function' ? result(...args) : Promise.resolve(result);
  };
  return {
    calls,
    api: {
      overview: rec('overview', data.overview ?? { open_reports: 0 }),
      listSyncRuns: rec('listSyncRuns', data.runs ?? []),
      listReports: rec('listReports', data.reports ?? []),
      resolveReport: rec('resolveReport', null),
      listSpots: rec('listSpots', data.spots ?? []),
      setSpotHidden: rec('setSpotHidden', null),
      setSpotVerified: rec('setSpotVerified', null),
      listUsers: rec('listUsers', data.users ?? []),
      setUserStatus: rec('setUserStatus', null),
      setHostVerified: rec('setHostVerified', null),
      listBookings: rec('listBookings', data.bookings ?? []),
      cancelBooking: rec('cancelBooking', null),
      listActions: rec('listActions', data.actions ?? []),
    },
  };
}

function mount(tab, status, user, api) {
  // У документі: форма поза документом не надсилається (requestSubmit нічого не робить).
  const root = document.body.appendChild(h('div', { hidden: true }));
  const session ={ getState: () => ({ status, user }), subscribe: () => () => {}, requireAuth() {}, service: { admin: api } };
  const cleanup = render(tab ? { tab } : {}, root, null, session);
  return {
    root,
    done() {
      cleanup();
      root.remove();
      document.querySelectorAll('.modal-overlay .modal-close').forEach((b) => b.click());
    },
  };
}

const button = (scope, text) => [...scope.querySelectorAll('button')].find((b) => b.textContent === text);
async function answer(text) {
  const form = document.querySelector('.admin-note-form');
  form.querySelector('textarea').value = text;
  form.requestSubmit();
  await settle();
  return form;
}

test('адмінка: вкладки, підписи причин, стан точки, імена', () => {
  eq([adminTab('users'), adminTab('nope'), adminTab(undefined)], ['users', 'overview', 'overview']);
  eq([reasonLabel('spot', 'wrong_address'), reasonLabel('user', 'no_show'), reasonLabel('user', 'x')],
    ['Неправильна адреса', "Не з'явився або не надав доступ", 'x']);
  eq(spotState({ archived_at: 'x', hidden_at: 'y' })[0], 'Видалена власником');
  eq(spotState({ hidden_at: 'y', paused: true, owner_status: 'suspended' })[0], 'Прихована модератором');
  eq(spotState({ owner_status: 'suspended' })[0], 'Господар заблокований');
  eq(spotState({ paused: true, owner_status: 'active' })[0], 'На паузі');
  eq(spotState({ owner_status: 'active' }), ['На карті', 'badge-ok']);
  eq([fullName(' Ана ', ''), fullName(null, null), fullName('Олег', 'Коваль')], ['Ана', 'Без імені', 'Олег Коваль']);
});

test('адмінка: фільтри точок і пошук', () => {
  const spots = [
    { id: 'a', title: 'Сонце', district: 'Поділля', owner_email: 'a@x.ua', verified_at: null, open_reports: 2 },
    { id: 'b', title: 'Вітер', district: 'Центр', owner_name: 'Олег', verified_at: 't', open_reports: 0 },
    { id: 'c', title: 'Хмара', district: 'Центр', hidden_at: 't', open_reports: '1' },
    { id: 'd', title: 'Старе', district: 'Центр', archived_at: 't', open_reports: 3 },
  ];
  const ids = (f, q = '') => filterSpots(spots, f, q).map((s) => s.id);
  eq([ids('all'), ids('unverified'), ids('reported'), ids('hidden'), ids('archived')],
    [['a', 'b', 'c', 'd'], ['a'], ['a', 'c'], ['c'], ['d']]);
  eq([ids('all', 'олег'), ids('all', 'A@X'), ids('reported', 'хмара')], [['b'], ['a'], ['c']]);
});

test('адмінка: плитки огляду, час, причина, тексти помилок', () => {
  const tiles = overviewTiles({ open_reports: 3, problem_bookings: 0, spots: 5, unverified_spots: 2, hidden_spots: 1, users: 9, hosts: 4, blocked_users: 1 });
  eq(tiles.slice(0, 2).map((t) => [t[0], t[2], t[4], t[5]]), [['open_reports', 3, 'reports', true], ['problem_bookings', 0, 'bookings', false]]);
  eq(tiles.find((t) => t[0] === 'spots')[3], '2 неперевірених · 1 прихованих');
  eq(overviewTiles(null).every((t) => t[2] === 0), true);
  eq([slotLabel('2026-11-23T14:00:00', '2026-11-23T16:00:00'), slotLabel('2026-11-23 09:00:00', null), slotLabel(null)],
    ['23 лис, 14:00–16:00', '23 лис, 09:00', '—']);
  eq([dateTime('2026-11-23T12:05:00Z'), dateTime(null), dateTime('сміття')], ['23 лис, 14:05', '—', '—']);
  const need = 'Вкажіть причину — хоча б кілька слів';
  eq([validateNote('', { required: true }), validateNote('ab', { required: true }), validateNote(''), validateNote('x'.repeat(501))],
    [need, need, null, 'Не більше 500 символів']);
  eq(adminErrorText({ code: 'auth/unknown', message: 'admin_only' }).startsWith('Немає прав адміністратора'), true);
  eq(adminErrorText({ code: '22023', message: 'bad_reason' }), 'Вкажіть причину — від 3 до 500 символів.');
  eq(adminErrorText({ code: '22023', message: 'self' }), 'Власний акаунт заблокувати не можна.');
  eq(adminErrorText({ code: 'auth/network-request-failed' }).startsWith('Немає з\'єднання'), true);
  eq(/202611240001_admin\.sql/.test(adminErrorText({ message: 'Could not find the function public.admin_overview without parameters' })), true);
  eq(adminErrorText({}), 'Не вдалося виконати дію. Спробуйте ще раз.');
});

test('адмінпанель: без прав, у демо чи без входу — жодного запиту до адмінських функцій', async () => {
  const { api, calls } = fakeApi();
  const cases = [
    ['signedIn', { uid: 'u1', isAdmin: false }, 'Немає доступу'],
    ['signedIn', { uid: 'u1' }, 'Немає доступу'],
    ['demo', null, 'Демо-режим'],
    ['signedOut', null, 'Адмінпанель доступна після входу'],
  ];
  for (const [status, user, title] of cases) {
    const m = mount('reports', status, user, api);
    try {
      await settle();
      eq(m.root.querySelector('h1').textContent, title);
    } finally { m.done(); }
  }
  eq(calls, []);
});

test('адмінпанель: огляд — плитки, лічильник скарг на вкладці, помилка синхронізації', async () => {
  const { api } = fakeApi({
    overview: { open_reports: 2, problem_bookings: 1, spots: 5, users: 7 },
    runs: [{ id: 'r1', started_at: '2026-11-23T03:00:00Z', finished_at: '2026-11-23T03:00:05Z', source: 'ocm', fetched: 0, inserted: 0, updated: 0, skipped: 0, error: 'HTTP 503' }],
  });
  const m = mount(null, 'signedIn', ADMIN, api);
  try {
    await settle();
    const tile = m.root.querySelector('[data-tile="open_reports"]');
    eq([tile.querySelector('.stat-value').textContent, tile.classList.contains('stat-attention'), tile.getAttribute('href')], ['2', true, '#/admin/reports']);
    eq(m.root.querySelector('.admin-tab[href="#/admin/reports"] .unread-badge').textContent, '2');
    eq(m.root.querySelector('.admin-tab.active').getAttribute('href'), '#/admin/overview');
    eq(m.root.querySelector('.admin-run-error .admin-run-text').textContent, 'Помилка: HTTP 503');
  } finally { m.done(); }
});

test('адмінпанель: сервер відмовив — зрозумілий текст і «Спробувати ще раз»', async () => {
  let fail = true;
  const { api, calls } = fakeApi({ overview: () => (fail ? Promise.reject({ code: 'auth/unknown', message: 'admin_only' }) : Promise.resolve({ users: 4 })) });
  const m = mount(null, 'signedIn', ADMIN, api);
  try {
    await settle();
    eq(m.root.querySelector('.admin-error .form-error').textContent.startsWith('Немає прав адміністратора'), true);
    fail = false;
    button(m.root, 'Спробувати ще раз').click();
    await settle();
    eq(m.root.querySelector('[data-tile="users"] .stat-value').textContent, '4');
    eq(calls.filter((c) => c[0] === 'overview').length >= 2, true);
  } finally { m.done(); }
});

const REPORT = {
  id: 'rep1', created_at: '2026-11-23T10:00:00Z', status: 'open', target_type: 'spot', target_id: 'spot1',
  target_label: 'Сонячна · Поділля', target_state: 'active', reason: 'wrong_address', details: 'Там паркан', booking_id: null,
  reporter_name: 'Ірина', reporter_email: 'i@x.ua', resolution: null, resolved_at: null, same_target_open: 2,
};

test('адмінпанель: скарга — «Вирішено» питає коментар і передає його серверу', async () => {
  const { api, calls } = fakeApi({ reports: [REPORT] });
  const m = mount('reports', 'signedIn', ADMIN, api);
  try {
    await settle();
    eq(calls.find((c) => c[0] === 'listReports'), ['listReports', false]);
    const card = m.root.querySelector('.admin-card[data-id="rep1"]');
    eq(card.querySelector('h3 a').getAttribute('href'), '#/spot/spot1');
    eq(/Неправильна адреса — Там паркан/.test(card.textContent), true);
    eq(/2 відкритих скарг на цей об'єкт/.test(card.textContent), true);
    button(card, 'Вирішено').click();
    await answer('Господар виправив адресу');
    eq(calls.filter((c) => c[0] === 'resolveReport'), [['resolveReport', 'rep1', 'resolved', 'Господар виправив адресу']]);
    eq(m.root.querySelector('.admin-flash').textContent, 'Скаргу позначено вирішеною');
    eq(document.querySelector('.admin-note-form'), null);
    // Список перечитано після дії.
    eq(calls.filter((c) => c[0] === 'listReports').length, 2);
  } finally { m.done(); }
});

test('адмінпанель: сховати точку за скаргою — лише з причиною, потім скарга вирішена', async () => {
  const { api, calls } = fakeApi({ reports: [REPORT] });
  const m = mount('reports', 'signedIn', ADMIN, api);
  try {
    await settle();
    button(m.root, 'Сховати точку').click();
    eq(document.querySelector('.admin-note-form textarea').value, 'Неправильна адреса');
    const form = await answer('  ');
    eq(form.querySelector('.field-error').hidden, false);
    eq(calls.some((c) => c[0] === 'setSpotHidden'), false);
    await answer('Адреси не існує');
    eq(calls.filter((c) => c[0] === 'setSpotHidden' || c[0] === 'resolveReport'),
      [['setSpotHidden', 'spot1', true, 'Адреси не існує'], ['resolveReport', 'rep1', 'resolved', 'Точку приховано: Адреси не існує']]);
    // Закрите вікно без відповіді — нічого не відбувається.
    button(m.root, 'Відхилити').click();
    document.querySelector('.admin-note-form').closest('.modal-overlay').querySelector('.modal-close').click();
    await settle();
    eq(calls.filter((c) => c[0] === 'resolveReport').length, 1);
  } finally { m.done(); }
});

test('адмінпанель: користувачі — себе й адміністраторів не заблокувати, блок лише з причиною', async () => {
  const base = { last_name: '', status: 'active', is_admin: false, spots: 0, guest_bookings: 0, open_reports: 0, registered_at: '2026-11-01T10:00:00Z', verified_at: null };
  const users = [
    { ...base, id: 'a1', first_name: 'Я', email: 'me@x.ua', is_admin: true },
    { ...base, id: 'a2', first_name: 'Інший', email: 'a2@x.ua', is_admin: true },
    { ...base, id: 'u3', first_name: 'Олег', last_name: 'Коваль', email: 'o@x.ua', spots: 2, open_reports: 1 },
    { ...base, id: 'u4', first_name: 'Блок', email: 'b@x.ua', status: 'suspended' },
  ];
  const { api, calls } = fakeApi({ users });
  const m = mount('users', 'signedIn', ADMIN, api);
  try {
    await settle();
    const card = (id) => m.root.querySelector(`.admin-card[data-id="${id}"]`);
    eq([button(card('a1'), 'Заблокувати'), button(card('a2'), 'Заблокувати')], [undefined, undefined]);
    eq(Boolean(button(card('u4'), 'Розблокувати')), true);
    eq(/це ви/.test(card('a1').textContent), true);
    button(card('u3'), 'Заблокувати').click();
    await answer('');
    eq(calls.some((c) => c[0] === 'setUserStatus'), false);
    await answer('Шахрайство з передоплатою');
    eq(calls.filter((c) => c[0] === 'setUserStatus'), [['setUserStatus', 'u3', 'suspended', 'Шахрайство з передоплатою']]);
    button(card('u3'), 'Позначити перевіреним господарем').click();
    await settle();
    eq(calls.filter((c) => c[0] === 'setHostVerified'), [['setHostVerified', 'u3', true]]);
    const search = m.root.querySelector('.admin-search-form');
    search.querySelector('input').value = ' олег ';
    search.requestSubmit();
    await settle();
    eq(calls.filter((c) => c[0] === 'listUsers').at(-1), ['listUsers', 'олег']);
  } finally { m.done(); }
});

test('адмінпанель: точки — перевірка, приховування, посилання на точне місце', async () => {
  const spots = [
    { id: 's1', title: 'Сонячна', district: 'Поділля', lat: '49.2237', lng: '28.4386', owner_name: 'Олег', owner_email: 'o@x.ua',
      owner_status: 'active', owner_verified: false, verified_at: null, hidden_at: null, archived_at: null, paused: false,
      open_reports: 1, completed_bookings: 3, active_bookings: 0 },
    { id: 's2', title: 'Схована', district: 'Центр', lat: 49.23, lng: 28.47, owner_status: 'active', hidden_at: '2026-11-23T10:00:00Z',
      hidden_reason: 'Фейк', archived_at: null, open_reports: 0, completed_bookings: 0, active_bookings: 0 },
  ];
  const { api, calls } = fakeApi({ spots });
  const m = mount('spots', 'signedIn', ADMIN, api);
  try {
    await settle();
    const card = (id) => m.root.querySelector(`.admin-card[data-id="${id}"]`);
    eq(card('s1').querySelector('a[target="_blank"]').getAttribute('href'), 'https://www.google.com/maps/search/?api=1&query=49.2237,28.4386');
    eq(card('s1').querySelector('h3 a').getAttribute('href'), '#/spot/s1');
    eq(card('s2').querySelector('h3 a'), null);
    eq(/Фейк/.test(card('s2').textContent), true);
    button(card('s1'), 'Позначити перевіреною').click();
    await settle();
    button(card('s2'), 'Повернути на карту').click();
    await settle();
    eq(calls.filter((c) => c[0].startsWith('setSpot')), [['setSpotVerified', 's1', true], ['setSpotHidden', 's2', false, '']]);
    button(m.root, 'Приховані · 1').click();
    eq([...m.root.querySelectorAll('.admin-card')].map((c) => c.dataset.id), ['s2']);
  } finally { m.done(); }
});

test('адмінпанель: проблемні бронювання — причина, слот, скасування з коментарем', async () => {
  const booking = {
    id: 'b1', created_at: '2026-11-18T10:00:00Z', status: 'pending', status_changed_at: null, starts_at: '2026-11-20T10:00:00',
    ends_at: '2026-11-20T12:00:00', device: 'ev', spot_id: 's1', spot_title: 'Сонячна', host_name: 'Олег', host_email: 'o@x.ua',
    guest_name: 'Ірина', guest_email: 'i@x.ua', problem: 'stale_pending', open_reports: 0, messages: 3,
  };
  const { api, calls } = fakeApi({ bookings: [booking] });
  const m = mount('bookings', 'signedIn', ADMIN, api);
  try {
    await settle();
    eq(calls.find((c) => c[0] === 'listBookings'), ['listBookings', true]);
    const card = m.root.querySelector('.admin-card[data-id="b1"]');
    eq([/Господар не відповів на запит/.test(card.textContent), /20 лис, 10:00–12:00/.test(card.textContent)], [true, true]);
    button(card, 'Скасувати бронювання').click();
    await answer('Господар не виходить на зв\'язок');
    eq(calls.filter((c) => c[0] === 'cancelBooking'), [['cancelBooking', 'b1', 'Господар не виходить на зв\'язок']]);
    button(m.root, 'Усі за 60 днів').click();
    await settle();
    eq(calls.filter((c) => c[0] === 'listBookings').at(-1), ['listBookings', false]);
  } finally { m.done(); }
});
