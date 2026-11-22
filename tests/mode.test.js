import { test, eq } from './runner.js';
import { MODES, navFor, homeFor, modeForPath, chooseMode } from '../js/mode.js';

test('режими: свої розділи для господаря й гостя', () => {
  eq(navFor('host').map(([href, , label]) => [href, label]),
    [['#/host', 'Мої точки'], ['#/host/bookings', 'Бронювання'], ['#/chats', 'Чати'], ['#/profile', 'Профіль']]);
  eq(navFor('guest').map(([href, , label]) => [href, label]),
    [['#/map', 'Карта'], ['#/bookings', 'Мої бронювання'], ['#/chats', 'Чати'], ['#/profile', 'Профіль']]);
  eq(navFor(null), navFor('guest'));
  eq([homeFor('host'), homeFor('guest'), homeFor(null)], ['#/host', '#/map', '#/']);
  eq([MODES.host.label, MODES.guest.label], ['Я роздаю енергію', 'Я шукаю енергію']);
});

test('режим за адресою: кабінет господаря — host, карта й бронювання гостя — guest, спільні сторінки — без зміни', () => {
  eq(['/host', '/host/bookings', '/map', '/bookings', '/spot/1', '/chats', '/profile', '/', '/hostile'].map(modeForPath),
    ['host', 'host', 'guest', 'guest', null, null, null, null, null]);
  const [, , , isActive] = navFor('host')[0];
  eq([isActive('/host'), isActive('/spot/x'), isActive('/host/bookings')], [true, true, false]);
});

test('chooseMode: зберігає режим і мовчки оновлює роль у профілі', async () => {
  let mode = null;
  const saved = [];
  const store = { setMode: (m) => { mode = m; } };
  const session = { getState: () => ({ status: 'signedIn', profile: { name: 'Олег', role: 'guest' } }),
    saveProfile: async (p) => { saved.push(p); } };
  eq(chooseMode('host', { store, session }), '#/host');
  eq([mode, saved], ['host', [{ name: 'Олег', role: 'host' }]]);
  eq(chooseMode('guest', { store, session: { getState: () => ({ status: 'signedIn', profile: { name: 'Олег', role: 'guest' } }) } }), '#/map');
  eq(saved.length, 1); // роль уже guest — не пишемо
  eq(chooseMode('guest', { store, session: { getState: () => ({ status: 'signedOut' }) } }), '#/map');
});
