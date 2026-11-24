// Вміст push-сповіщення з рядка booking_notifications. Спільний для Edge Function і тестів.
const MAX_BODY = 180;

export function buildPayload(record) {
  const text = String(record?.body ?? '');
  const body = text.length > MAX_BODY ? `${text.slice(0, MAX_BODY - 1)}…` : text;
  return { title: 'WattWay', body, url: record?.booking_id ? `#/chats/${record.booking_id}` : '#/chats', tag: `booking-${record?.booking_id ?? 'event'}` };
}

// Порівняння секрету вебхука за сталий час (не видає довжину збігу через таймінг).
export function secretMatches(given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string' || !expected) return false;
  let diff = given.length ^ expected.length;
  for (let i = 0; i < expected.length; i++) diff |= (given.charCodeAt(i) || 0) ^ expected.charCodeAt(i);
  return diff === 0;
}

// Адреса підписки — лише https-адреса справжнього push-сервісу браузера. Інакше будь-хто міг би зберегти
// свою адресу як «підписку», і функція слала б POST-запити туди, куди скаже зловмисник (SSRF).
// Chrome, Edge, Opera, Samsung — FCM; Firefox — Mozilla; Safari — Apple; Edge Legacy — WNS.
// Той самий список — у перевірці push_subscriptions (міграція 202611240007_push_endpoints.sql).
const PUSH_HOST = /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)$/;

export function isPushEndpoint(value) {
  if (typeof value !== 'string' || value.length > 1000) return false;
  let url;
  try { url = new URL(value); } catch { return false; }
  return url.protocol === 'https:' && !url.username && !url.password && url.port === '' && PUSH_HOST.test(url.hostname);
}
