// Push-сповіщення на пристрої: підписка лише після кліку користувача й дозволу браузера.
// env — для тестів (за замовчуванням справжній браузер).

export function urlBase64ToUint8Array(s) {
  const base64 = (s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

export const pushSupported = (env = globalThis) =>
  Boolean(env.navigator?.serviceWorker && env.PushManager && env.Notification);

const fail = (code) => Object.assign(new Error(code), { code });

async function currentSubscription(env) {
  const registration = await env.navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

export async function pushState({ env = globalThis, vapidKey } = {}) {
  if (!pushSupported(env)) return 'unsupported';
  if (!vapidKey) return 'unconfigured';
  if (env.Notification.permission === 'denied') return 'denied';
  const subscription = await currentSubscription(env);
  return subscription && env.Notification.permission === 'granted' ? 'on' : 'off';
}

export async function enablePush({ service, vapidKey, env = globalThis }) {
  if (!pushSupported(env)) throw fail('unsupported');
  if (!vapidKey) throw fail('unconfigured');
  const permission = await env.Notification.requestPermission();
  if (permission !== 'granted') throw fail('denied');
  await env.navigator.serviceWorker.register('sw.js');
  const registration = await env.navigator.serviceWorker.ready;
  const subscription = (await registration.pushManager.getSubscription())
    ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) });
  await service.savePushSubscription(subscription.toJSON());
}

// Спершу відписуємо пристрій (далі сервер однаково прибере мертвий endpoint), потім видаляємо рядок.
export async function disablePush({ service, env = globalThis }) {
  if (!pushSupported(env)) return;
  const subscription = await currentSubscription(env);
  if (!subscription) return;
  const { endpoint } = subscription;
  await subscription.unsubscribe();
  await service.deletePushSubscription(endpoint);
}

export const PUSH_STATE_TEXT = {
  unsupported: 'Цей браузер не підтримує сповіщення на пристрої. На iPhone спершу додайте WattWay на головний екран.',
  unconfigured: 'Сповіщення на пристрої ще не налаштовані на сервері.',
  denied: 'Сповіщення заблоковані в налаштуваннях браузера. Дозвольте їх для цього сайту, щоб увімкнути.',
  on: 'Увімкнено: нові запити, рішення, повідомлення й нагадування прийдуть, навіть коли сайт закритий.',
  off: 'Вимкнено. Події видно лише під дзвіночком на сайті.',
};
