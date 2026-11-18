// Service Worker WattWay: показує push-сповіщення і відкриває сайт по кліку.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || 'WattWay', {
    body: data.body || 'Нова подія в WattWay',
    tag: data.tag,
    data: { url: data.url || '#/profile' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(self.registration.scope + (event.notification.data?.url || ''));
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const open = windows.find((w) => w.url.startsWith(self.registration.scope));
    // navigate() недоступний для вкладок, відкритих до реєстрації SW, — тоді лише фокусуємо.
    if (open) return open.focus().then((w) => w.navigate?.(target.href)).catch(() => open.focus());
    return self.clients.openWindow(target.href);
  }));
});
