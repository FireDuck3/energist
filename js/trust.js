// Довіра: рейтинг господаря, підписи рейтингів, причини скарг і тексти помилок. Чисті функції.
import { plural } from './ui.js';

export const REPORT_REASONS = {
  spot: [
    { id: 'wrong_address', label: 'Неправильна адреса' },
    { id: 'wrong_equipment', label: 'Неправильне обладнання' },
    { id: 'not_working', label: 'Не працює' },
    { id: 'unsafe', label: 'Небезпечно' },
    { id: 'fraud', label: 'Шахрайство' },
    { id: 'other', label: 'Інше' },
  ],
  station: [
    { id: 'wrong_address', label: 'Неправильна адреса' },
    { id: 'wrong_equipment', label: 'Неправильне обладнання' },
    { id: 'not_working', label: 'Не працює або закрита' },
    { id: 'other', label: 'Інше' },
  ],
  user: [
    { id: 'fraud', label: 'Шахрайство' },
    { id: 'abuse', label: 'Образи' },
    { id: 'spam', label: 'Спам' },
    { id: 'no_show', label: "Не з'явився або не надав доступ" },
    { id: 'other', label: 'Інше' },
  ],
};

export const MAX_DETAILS = 1000;
const MIN_OTHER_DETAILS = 10;

export function hostRating(spots, ownerId) {
  const stars = spots.filter((s) => s.ownerId === ownerId).flatMap((s) => (s.reviews ?? []).map((r) => r.stars));
  if (!stars.length) return { avg: null, count: 0 };
  return { avg: Math.round((stars.reduce((a, b) => a + b, 0) / stars.length) * 10) / 10, count: stars.length };
}

export function ratingLabel(avg, count, kind) {
  if (!count || avg == null) return kind === 'host' ? 'Новий господар' : 'Нова точка';
  return `★ ${avg.toFixed(1).replace('.', ',')} · ${count} ${plural(count, ['відгук', 'відгуки', 'відгуків'])}`;
}

export function validateReport({ reason, details = '' }, type) {
  const errors = {};
  const text = details.trim();
  if (!(REPORT_REASONS[type] ?? []).some((r) => r.id === reason)) errors.reason = 'Оберіть причину';
  if (reason === 'other' && text.length < MIN_OTHER_DETAILS) errors.details = 'Опишіть проблему (хоча б кілька слів)';
  if (text.length > MAX_DETAILS) errors.details = `Не більше ${MAX_DETAILS} символів`;
  return { ok: !Object.keys(errors).length, errors };
}

const TEXTS = {
  duplicate: 'Ви вже надіслали скаргу на це — ми її розглядаємо.',
  daily_limit: 'За добу можна надіслати не більше 10 скарг. Спробуйте завтра.',
  own_spot: 'На власну точку скаржитися не можна.',
  bad_target: 'Цю скаргу не можна надіслати: об\'єкт недоступний або ви не пов\'язані бронюванням.',
  bad_reason: 'Перевірте причину й опис скарги.',
};

export function reportErrorText(code, message = '') {
  const key = Object.keys(TEXTS).find((k) => String(message).includes(k));
  if (key) return TEXTS[key];
  if (code === '23505') return TEXTS.duplicate;
  if (code === 'WW429') return TEXTS.daily_limit;
  if (code === 'auth/network-request-failed') return 'Немає з\'єднання. Перевірте інтернет і спробуйте ще раз.';
  return 'Не вдалося надіслати скаргу. Спробуйте ще раз.';
}
