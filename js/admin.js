// Адмінпанель: підписи, фільтри й тексти помилок. Чисті функції без DOM і мережі.
// Права перевіряє сервер (міграція 202611240001_admin.sql) — тут лише відображення.
import { REPORT_REASONS } from './trust.js';
import { formatDate } from './ui.js';

export const ADMIN_TABS = [
  ['overview', 'Огляд'],
  ['reports', 'Скарги'],
  ['spots', 'Точки'],
  ['users', 'Користувачі'],
  ['bookings', 'Бронювання'],
  ['log', 'Журнал'],
];

export const adminTab = (tab) => (ADMIN_TABS.some(([id]) => id === tab) ? tab : 'overview');

export const TARGET_LABEL = { spot: 'Точка', station: 'Публічна станція', user: 'Користувач', report: 'Скарга', booking: 'Бронювання' };

export const REPORT_STATUS = {
  open: ['Відкрита', 'badge-warn'],
  resolved: ['Вирішена', 'badge-ok'],
  rejected: ['Відхилена', 'badge-muted'],
};

export const BOOKING_STATUS = {
  pending: ['Очікує підтвердження', 'badge-warn'],
  confirmed: ['Підтверджено', 'badge-info'],
  declined: ['Відхилено', 'badge-muted'],
  cancelled: ['Скасовано', 'badge-muted'],
  completed: ['Завершено', 'badge-ok'],
};

export const BOOKING_PROBLEM = {
  reported: 'Є відкрита скарга',
  stale_pending: 'Господар не відповів на запит',
  not_completed: 'Підтверджено, але не завершено після зарядки',
};

export const USER_STATUS = {
  active: ['Активний', 'badge-ok'],
  suspended: ['Заблокований', 'badge-warn'],
  disabled: ['Вимкнений', 'badge-muted'],
};

export const ACTION_LABEL = {
  report_resolved: 'Скаргу вирішено',
  report_rejected: 'Скаргу відхилено',
  spot_hide: 'Точку приховано',
  spot_show: 'Точку повернуто на карту',
  spot_verify: 'Точку позначено перевіреною',
  spot_unverify: 'З точки знято перевірку',
  user_block: 'Користувача заблоковано',
  user_unblock: 'Користувача розблоковано',
  host_verify: 'Господаря позначено перевіреним',
  host_unverify: 'З господаря знято перевірку',
  booking_cancel: 'Бронювання скасовано',
};

export function reasonLabel(targetType, reason) {
  return (REPORT_REASONS[targetType] ?? []).find((r) => r.id === reason)?.label ?? reason;
}

export const fullName = (first, last) => [first, last].map((s) => (s ?? '').trim()).filter(Boolean).join(' ') || 'Без імені';

// Стан точки для адміністратора: що бачать гості.
export function spotState(spot) {
  if (spot.archived_at) return ['Видалена власником', 'badge-muted'];
  if (spot.hidden_at) return ['Прихована модератором', 'badge-warn'];
  if (spot.owner_status && spot.owner_status !== 'active') return ['Господар заблокований', 'badge-warn'];
  if (spot.paused) return ['На паузі', 'badge-muted'];
  return ['На карті', 'badge-ok'];
}

export const SPOT_FILTERS = [
  ['all', 'Усі'],
  ['unverified', 'Неперевірені'],
  ['reported', 'Зі скаргами'],
  ['hidden', 'Приховані'],
  ['archived', 'Видалені'],
];

export function filterSpots(spots, filter = 'all', query = '') {
  const q = query.trim().toLowerCase();
  return spots.filter((s) => {
    if (filter === 'unverified' && (s.verified_at || s.hidden_at || s.archived_at)) return false;
    if (filter === 'reported' && !(Number(s.open_reports) > 0)) return false;
    if (filter === 'hidden' && (!s.hidden_at || s.archived_at)) return false;
    if (filter === 'archived' && !s.archived_at) return false;
    if (filter !== 'archived' && filter !== 'all' && s.archived_at) return false;
    if (!q) return true;
    return [s.title, s.district, s.owner_name, s.owner_email].some((v) => String(v ?? '').toLowerCase().includes(q));
  });
}

// Плитки огляду: [ключ, підпис, значення, примітка, вкладка, чи потребує уваги].
export function overviewTiles(o) {
  const n = (k) => Number(o?.[k] ?? 0);
  return [
    ['open_reports', 'Відкриті скарги', n('open_reports'), n('open_reports') ? 'Розглянути →' : 'Усі розглянуто', 'reports', n('open_reports') > 0],
    ['problem_bookings', 'Проблемні бронювання', n('problem_bookings'), 'за 60 днів', 'bookings', n('problem_bookings') > 0],
    ['spots', 'Точки', n('spots'), `${n('unverified_spots')} неперевірених · ${n('hidden_spots')} прихованих`, 'spots', false],
    ['users', 'Користувачі', n('users'), `${n('hosts')} господарів · ${n('blocked_users')} заблокованих`, 'users', false],
    ['bookings_30d', 'Бронювання за 30 днів', n('bookings_30d'), `${n('completed_30d')} завершено`, 'bookings', false],
    ['sync_errors_7d', 'Помилки синхронізації', n('sync_errors_7d'), 'публічні станції, 7 днів', 'overview', n('sync_errors_7d') > 0],
  ];
}

const TIME = new Intl.DateTimeFormat('uk-UA', { timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit' });
const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' });

// Мітка часу з бази (timestamptz) → '23 лис, 14:05' за київським часом.
export function dateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${formatDate(DAY.format(d))}, ${TIME.format(d)}`;
}

// Слот бронювання — київський час без поясу: '2026-11-23T14:00:00' + '…T16:00:00' → '23 лис, 14:00–16:00'.
export function slotLabel(start, end) {
  if (!start) return '—';
  const [day, time = ''] = String(start).split(/[T ]/);
  const until = end ? String(end).split(/[T ]/)[1]?.slice(0, 5) : '';
  return `${formatDate(day)}, ${time.slice(0, 5)}${until ? `–${until}` : ''}`;
}

export const mapsLink = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${Number(lat)},${Number(lng)}`;

// Причина для блокування чи приховування — від 3 до 500 символів (так само перевіряє сервер).
export function validateNote(text, { required = false } = {}) {
  const value = String(text ?? '').trim();
  if (required && value.length < 3) return 'Вкажіть причину — хоча б кілька слів';
  if (value.length > 500) return 'Не більше 500 символів';
  return null;
}

const ERRORS = {
  admin_only: 'Немає прав адміністратора. Увійдіть акаунтом адміністратора.',
  bad_reason: 'Вкажіть причину — від 3 до 500 символів.',
  bad_input: 'Перевірте введені дані.',
  bad_target: 'Об\'єкт не знайдено — можливо, його вже видалили.',
  not_open: 'Цю скаргу вже розглянули. Оновіть список.',
  not_active: 'Бронювання вже не активне. Оновіть список.',
  self: 'Власний акаунт заблокувати не можна.',
  admin_target: 'Адміністратора заблокувати не можна — спершу заберіть права в SQL Editor.',
};

export function adminErrorText(err) {
  const message = String(err?.message ?? '');
  const key = Object.keys(ERRORS).find((k) => message.includes(k));
  if (key) return ERRORS[key];
  if (err?.code === 'auth/network-request-failed') return 'Немає з\'єднання. Перевірте інтернет і спробуйте ще раз.';
  if (/function .* does not exist|Could not find the function/i.test(message)) {
    return 'На сервері ще немає функцій адмінпанелі — виконайте міграцію 202611240001_admin.sql.';
  }
  return 'Не вдалося виконати дію. Спробуйте ще раз.';
}
