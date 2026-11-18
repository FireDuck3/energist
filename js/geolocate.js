// Визначення місцеположення лише за дозволом користувача. Результат ніде не зберігається.
const MESSAGES = {
  unsupported: 'Цей браузер не вміє визначати місцеположення.',
  denied: 'Доступ до місцеположення заборонено. Дозвольте його в налаштуваннях браузера або шукайте за районом.',
  unavailable: 'Не вдалося визначити місцеположення. Спробуйте ще раз.',
  timeout: 'Місцеположення визначається занадто довго. Спробуйте ще раз.',
};

export const geoMessage = (code) => MESSAGES[code] ?? MESSAGES.unavailable;

const CODES = { 1: 'denied', 2: 'unavailable', 3: 'timeout' };

export function locate({ geolocation = globalThis.navigator?.geolocation, timeoutMs = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    const fail = (code) => reject(Object.assign(new Error(MESSAGES[code]), { code }));
    if (!geolocation) return fail('unsupported');
    geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => fail(CODES[err?.code] ?? 'unavailable'),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60000 });
  });
}
