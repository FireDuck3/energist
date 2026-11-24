import { test, eq } from './runner.js';
import { BOOKING_LIMITS, bookingRequestError } from '../js/booking-errors.js';

const err = (code, message) => Object.assign(new Error(message), { code });

test('ліміти бронювань: числа збігаються з міграцією 202611240005', () => {
  eq(BOOKING_LIMITS, { pending: 3, perDay: 10 });
});

test('помилка запиту бронювання: ліміти сервера — зрозумілим текстом', () => {
  eq(/3 запити, що чекають відповіді/.test(bookingRequestError(err('WW429', 'pending_limit'))), true);
  eq(/скасуйте один із них/.test(bookingRequestError(err('WW429', 'pending_limit'))), true);
  eq(/10 запитів на бронювання за добу/.test(bookingRequestError(err('WW429', 'daily_limit'))), true);
});

test('помилка запиту бронювання: інше — загальний текст, без деталей сервера', () => {
  const generic = 'Не вдалося надіслати запит. Перевірте час і спробуйте ще раз.';
  eq(bookingRequestError(err('22023', 'Invalid slot or device')), generic);
  eq(bookingRequestError(err('WW429', 'something else')), generic);
  eq(bookingRequestError(undefined), generic);
});
