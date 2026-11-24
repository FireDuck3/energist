import { test, eq } from './runner.js';
import { urlBase64ToUint8Array, pushSupported, pushState, enablePush, disablePush, pushErrorText } from '../js/push.js';

// Підроблене середовище браузера з керованим дозволом і підпискою.
const FCM = 'https://fcm.googleapis.com/fcm/send/new';
function fakeEnv({ permission = 'default', subscription = null, grant = 'granted', newEndpoint = FCM } = {}) {
  const state = { subscription, unsubscribed: false };
  const sub = (endpoint) => ({
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: 'P', auth: 'A' } }),
    unsubscribe: async () => { state.unsubscribed = true; state.subscription = null; return true; },
  });
  if (subscription) state.subscription = sub(subscription);
  const registration = {
    pushManager: {
      getSubscription: async () => state.subscription,
      subscribe: async (opts) => { state.opts = opts; state.subscription = sub(newEndpoint); return state.subscription; },
    },
  };
  const env = {
    PushManager: function PushManager() {},
    Notification: { permission, requestPermission: async () => { env.Notification.permission = grant; return grant; } },
    navigator: { serviceWorker: { register: async () => registration, getRegistration: async () => registration, ready: Promise.resolve(registration) } },
  };
  return { env, state };
}

test('urlBase64ToUint8Array: base64url з - і _', () => {
  eq([...urlBase64ToUint8Array('AQID')], [1, 2, 3]);
  eq([...urlBase64ToUint8Array('-_8')], [251, 255]);
});

test('pushSupported', () => {
  eq(pushSupported({}), false);
  eq(pushSupported(fakeEnv().env), true);
});

test('pushState: усі стани', async () => {
  eq(await pushState({ env: {}, vapidKey: 'K' }), 'unsupported');
  eq(await pushState({ env: fakeEnv().env, vapidKey: '' }), 'unconfigured');
  eq(await pushState({ env: fakeEnv({ permission: 'denied' }).env, vapidKey: 'K' }), 'denied');
  eq(await pushState({ env: fakeEnv({ permission: 'granted', subscription: 'https://push.example/1' }).env, vapidKey: 'K' }), 'on');
  eq(await pushState({ env: fakeEnv().env, vapidKey: 'K' }), 'off');
});

test('enablePush: підписує й зберігає підписку на сервері', async () => {
  const { env, state } = fakeEnv();
  const saved = [];
  await enablePush({ service: { savePushSubscription: async (s) => saved.push(s) }, vapidKey: 'AQID', env });
  eq(saved, [{ endpoint: FCM, keys: { p256dh: 'P', auth: 'A' } }]);
  eq(state.opts.userVisibleOnly, true);
});

test('enablePush: відмова в дозволі → code denied, нічого не збережено', async () => {
  const { env } = fakeEnv({ grant: 'denied' });
  const saved = [];
  let code = null;
  try { await enablePush({ service: { savePushSubscription: async (s) => saved.push(s) }, vapidKey: 'AQID', env }); }
  catch (e) { code = e.code; }
  eq([code, saved.length], ['denied', 0]);
});

test('disablePush: відписує й видаляє з сервера', async () => {
  const { env, state } = fakeEnv({ permission: 'granted', subscription: 'https://push.example/1' });
  const deleted = [];
  await disablePush({ service: { deletePushSubscription: async (e) => deleted.push(e) }, env });
  eq([deleted, state.unsubscribed], [['https://push.example/1'], true]);
});

test('pushState: підписка цього браузера належить іншому акаунту → off', async () => {
  const { env } = fakeEnv({ permission: 'granted', subscription: 'https://push.example/1' });
  const service = { ownsPushSubscription: async (endpoint) => endpoint === 'https://push.example/other' };
  eq(await pushState({ env, vapidKey: 'K', service }), 'off');
  eq(await pushState({ env, vapidKey: 'K', service: { ownsPushSubscription: async () => true } }), 'on');
});

test('enablePush: невідомий push-сервіс → code unsupported-service, підписку знято, нічого не збережено', async () => {
  const { env, state } = fakeEnv({ newEndpoint: 'https://evil.example/collect' });
  const saved = [];
  let code = null;
  try { await enablePush({ service: { savePushSubscription: async (s) => saved.push(s) }, vapidKey: 'AQID', env }); }
  catch (e) { code = e.code; }
  eq([code, saved.length, state.unsubscribed], ['unsupported-service', 0, true]);
});

test('pushErrorText: зрозумілі тексти для відмови й невідомого сервісу', () => {
  eq(/заблоковані/.test(pushErrorText('denied')), true);
  eq(/не підтримує/.test(pushErrorText('unsupported-service')), true);
  eq(pushErrorText('whatever'), 'Не вдалося змінити налаштування. Спробуйте ще раз.');
});
