// Вміст push-сповіщення з рядка booking_notifications. Спільний для Edge Function і тестів.
const MAX_BODY = 180;

export function buildPayload(record) {
  const text = String(record?.body ?? '');
  const body = text.length > MAX_BODY ? `${text.slice(0, MAX_BODY - 1)}…` : text;
  return { title: 'WattWay', body, url: '#/profile', tag: `booking-${record?.booking_id ?? 'event'}` };
}
