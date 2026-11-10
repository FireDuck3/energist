import { test, eq } from './runner.js';
import { validateLogin, validateSignup, homePath, failureAdvice } from '../js/auth-forms.js';

test('вхід: порожні поля — помилки під кожним полем', () => {
  const r = validateLogin({ email: '', password: '' });
  eq([r.ok, r.errors], [false, { email: 'Вкажіть email', password: 'Введіть пароль' }]);
});

test('вхід: кривий email і короткий пароль; пробіли навколо email обрізаються', () => {
  eq(validateLogin({ email: 'abc', password: '123456' }).errors, { email: 'Невірний формат email' });
  eq(validateLogin({ email: 'a@b', password: '123456' }).errors.email, 'Невірний формат email');
  const ok = validateLogin({ email: '  a@b.ua ', password: '123456' });
  eq([ok.ok, ok.value.email], [true, 'a@b.ua']);
});

test('вхід: пароль не обрізається і не перевіряється на довжину (старий акаунт)', () => {
  eq(validateLogin({ email: 'a@b.ua', password: 'abc' }).ok, true);
});

test('реєстрація: усі поля обов\'язкові', () => {
  const r = validateSignup({});
  eq(Object.keys(r.errors), ['name', 'email', 'password', 'role']);
});

test('реєстрація: пароль від 6 символів, підтвердження збігається', () => {
  const base = { name: 'Ірина', email: 'i@b.ua', role: 'guest' };
  eq(validateSignup({ ...base, password: '123', confirm: '123' }).errors,
    { password: 'Пароль має бути щонайменше 6 символів' });
  eq(validateSignup({ ...base, password: '123456', confirm: '12345' }).errors,
    { confirm: 'Паролі не збігаються' });
  const ok = validateSignup({ ...base, password: '123456', confirm: '123456' });
  eq([ok.ok, ok.value], [true, { name: 'Ірина', email: 'i@b.ua', password: '123456', role: 'guest' }]);
});

test('реєстрація: ім\'я до 60 символів і непорожнє, роль — guest або host', () => {
  const base = { email: 'i@b.ua', password: '123456', confirm: '123456' };
  eq(validateSignup({ ...base, name: ' ', role: 'guest' }).errors, { name: 'Вкажіть ім\'я' });
  eq(validateSignup({ ...base, name: 'я'.repeat(61), role: 'guest' }).errors, { name: 'Ім\'я — до 60 символів' });
  eq(validateSignup({ ...base, name: 'Ян', role: 'admin' }).errors, { role: 'Оберіть, для чого вам WattWay' });
});

test('після входу: господаря ведемо в кабінет, гостя — на карту', () => {
  eq([homePath('host'), homePath('guest'), homePath(undefined)], ['#/host', '#/map', '#/map']);
});

test('альтернативні сценарії: підказка після помилки', () => {
  eq(failureAdvice('auth/invalid-credential', 'signin').link, { label: 'Немає акаунта? Зареєструватися', to: '#/signup' });
  eq(failureAdvice('auth/email-already-in-use', 'signup').link, { label: 'Цей email уже є — увійти', to: '#/login' });
  eq(failureAdvice('auth/network-request-failed', 'signin').demo, true);
  eq(failureAdvice('auth/weak-password', 'signup'), {});
});
