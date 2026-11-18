import { test, eq } from './runner.js';
import { locate, geoMessage } from '../js/geolocate.js';

const geo = (result) => ({ getCurrentPosition: (ok, err) => (result.coords ? ok(result) : err(result)) });
const code = async (g) => { try { await locate({ geolocation: g }); return 'ok'; } catch (e) { return e.code; } };

test('locate: успіх повертає координати', async () => {
  eq(await locate({ geolocation: geo({ coords: { latitude: 49.2, longitude: 28.4 } }) }), { lat: 49.2, lng: 28.4 });
});

test('locate: відмова, недоступність, таймаут, відсутність API', async () => {
  eq(await code(geo({ code: 1 })), 'denied');
  eq(await code(geo({ code: 2 })), 'unavailable');
  eq(await code(geo({ code: 3 })), 'timeout');
  eq(await code(null), 'unsupported');
});

test('geoMessage: український текст для кожного коду', () => {
  for (const c of ['unsupported', 'denied', 'unavailable', 'timeout']) eq(geoMessage(c).length > 10, true, c);
});
