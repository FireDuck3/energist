// Режим роботи: «Я шукаю енергію» (гість) або «Я роздаю енергію» (господар).
// Від режиму залежать головна сторінка, пункти шапки й нижні вкладки. Чисті функції без DOM.

export const MODES = {
  guest: {
    icon: '🔌', label: 'Я шукаю енергію', short: 'Шукаю енергію', home: '#/map',
    lead: 'Потрібно зарядити електромобіль, EcoFlow чи телефон — знайдіть точку поруч і забронюйте час.',
    perks: ['Карта точок і публічних станцій поруч', 'Бронювання часу й підтвердження від господаря', 'Чат із господарем і відгуки'],
    cta: 'Знайти енергію',
  },
  host: {
    icon: '☀️', label: 'Я роздаю енергію', short: 'Роздаю енергію', home: '#/host',
    lead: 'Маєте сонячну станцію чи акумулятор — додайте свою точку й заробляйте на надлишку енергії.',
    perks: ['Карта й список ваших точок', 'Запити на бронювання в одному місці', 'Графік, фото й умови зарядки'],
    cta: 'Роздавати енергію',
  },
};

const isMode = (m) => m === 'guest' || m === 'host';

// Пункти навігації режиму: [href, іконка, підпис, чи активний для шляху].
const NAV = {
  guest: [
    ['#/map', '🗺️', 'Карта', (p) => p.startsWith('/map') || p.startsWith('/spot')],
    ['#/bookings', '📅', 'Мої бронювання', (p) => p.startsWith('/bookings')],
    ['#/chats', '💬', 'Чати', (p) => p.startsWith('/chats')],
    ['#/profile', '👤', 'Профіль', (p) => p.startsWith('/profile')],
  ],
  host: [
    ['#/host', '📍', 'Мої точки', (p) => p === '/host' || p.startsWith('/spot')],
    ['#/host/bookings', '📅', 'Бронювання', (p) => p.startsWith('/host/bookings')],
    ['#/chats', '💬', 'Чати', (p) => p.startsWith('/chats')],
    ['#/profile', '👤', 'Профіль', (p) => p.startsWith('/profile')],
  ],
};

export function navFor(mode) {
  return NAV[isMode(mode) ? mode : 'guest'];
}

export function homeFor(mode) {
  return isMode(mode) ? MODES[mode].home : '#/';
}

// Сторінки, що однозначно належать режиму, перемикають на нього (напр., посилання на кабінет господаря).
// Картка точки й чати спільні: господар дивиться свою точку, не стаючи гостем.
export function modeForPath(path) {
  if (path === '/host' || path.startsWith('/host/')) return 'host';
  if (path.startsWith('/map') || path.startsWith('/bookings')) return 'guest';
  return null;
}

// Обрати режим: зберегти його, мовчки оновити роль у профілі (якщо увійшли) і повернути адресу головної.
export function chooseMode(mode, { store, session }) {
  store.setMode(mode);
  const { status, profile } = session?.getState() ?? {};
  if (status === 'signedIn' && profile?.name && profile.role !== mode) {
    session.saveProfile({ name: profile.name, role: mode }).catch(() => {});
  }
  return homeFor(mode);
}
