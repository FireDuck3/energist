// Вміст push-сповіщення з рядка booking_notifications. Спільний для Edge Function і тестів.
const MAX_BODY = 180;

export function buildPayload(record) {
  const text = String(record?.body ?? '');
  const body = text.length > MAX_BODY ? `${text.slice(0, MAX_BODY - 1)}…` : text;
  return { title: 'WattWay', body, url: '#/profile', tag: `booking-${record?.booking_id ?? 'event'}` };
}

// Порівняння секрету вебхука за сталий час (не видає довжину збігу через таймінг).
export function secretMatches(given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string' || !expected) return false;
  let diff = given.length ^ expected.length;
  for (let i = 0; i < expected.length; i++) diff |= (given.charCodeAt(i) || 0) ^ expected.charCodeAt(i);
  return diff === 0;
}
