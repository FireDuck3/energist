import { test, eq } from './runner.js';
import { PHOTO_LIMITS, checkPhotos, photoPath, scaledSize } from '../js/photos.js';

const file = (type, size, name = 'a') => ({ type, size, name });

test('checkPhotos: формат, розмір і ліміт кількості', () => {
  const r1 = checkPhotos([file('text/plain', 10, 'note.txt')], 0);
  eq(r1.ok.length, 0); eq(/формат/i.test(r1.errors[0]), true);
  const r2 = checkPhotos([file('image/jpeg', 3 * 1024 * 1024, 'big.jpg')], 0);
  eq(r2.ok.length, 0); eq(r2.errors[0].includes('2 МБ'), true);
  const r3 = checkPhotos([file('image/png', 100, 'a.png'), file('image/webp', 100, 'b.webp')], 4);
  eq(r3.ok.length, 1); eq(r3.errors.length, 1); eq(r3.errors[0].includes('5'), true);
});

test('checkPhotos: великий файл до стискання допускається, якщо стиснення ще попереду', () => {
  eq(checkPhotos([file('image/jpeg', 8 * 1024 * 1024)], 0, { beforeResize: true }).ok.length, 1);
});

test('photoPath і scaledSize', () => {
  eq(photoPath('u1', 's1', 'image/webp', 'x'), 'u1/s1/x.webp');
  eq(photoPath('u1', 's1', 'image/jpeg', 'x'), 'u1/s1/x.jpg');
  eq(scaledSize(4000, 3000), { width: 1600, height: 1200 });
  eq(scaledSize(800, 600), { width: 800, height: 600 });
  eq(PHOTO_LIMITS.max, 5);
});
