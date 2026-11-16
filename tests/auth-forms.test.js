import { test, eq } from './runner.js';
import { validateLogin, validateSignup, displayName, homePath, failureAdvice } from '../js/auth-forms.js';

test('вхід: порожні поля — помилки під кожним полем', () => {
  const r = validateLogin({ email: '', password: '' });
  eq([r.ok, r.errors], [false, { email: 'Вкажіть email', password: 'Введіть пароль' }]);
});

test('вхід: кривий email; email обрізається й нормалізується до нижнього регістру', () => {
  eq(validateLogin({ email: 'abc', password: '123456' }).errors, { email: 'Невірний формат email' });
  eq(validateLogin({ email: 'a@b', password: '123456' }).errors.email, 'Невірний формат email');
  const ok = validateLogin({ email: '  A@B.ua ', password: '123456' });
  eq([ok.ok, ok.value.email], [true, 'a@b.ua']);
});

test('вхід: пароль не перевіряється на довжину (старий акаунт)', () => {
  eq(validateLogin({ email: 'a@b.ua', password: 'abc' }).ok, true);
});

test('реєстрація: усі поля обов\'язкові, помилки в порядку полів', () => {
  const r = validateSignup({});
  eq(Object.keys(r.errors), ['firstName', 'lastName', 'email', 'password', 'role']);
  eq(r.errors.email, 'Вкажіть email');
});

test('реєстрація: пароль 8–128 символів, підтвердження збігається', () => {
  const base = { firstName: 'Ірина', lastName: 'Коваль', email: 'i@b.ua', role: 'guest' };
  eq(validateSignup({ ...base, password: '1234567', confirm: '1234567' }).errors,
    { password: 'Пароль має містити від 8 до 128 символів' });
  eq(validateSignup({ ...base, password: 'x'.repeat(129), confirm: 'x'.repeat(129) }).errors.password,
    'Пароль має містити від 8 до 128 символів');
  eq(validateSignup({ ...base, password: '12345678', confirm: '1234567' }).errors, { confirm: 'Паролі не збігаються' });
  const ok = validateSignup({ ...base, email: ' I@B.ua ', password: '12345678', confirm: '12345678' });
  eq([ok.ok, ok.value], [true, { email: 'i@b.ua', password: '12345678', firstName: 'Ірина', lastName: 'Коваль', role: 'guest' }]);
});

test('реєстрація: ім\'я й прізвище 1–60 символів, роль — guest або host', () => {
  const base = { email: 'i@b.ua', password: '12345678', confirm: '12345678', role: 'guest' };
  eq(Object.keys(validateSignup({ ...base, firstName: ' ', lastName: 'я'.repeat(61) }).errors), ['firstName', 'lastName']);
  eq(validateSignup({ ...base, firstName: 'Ян', lastName: 'Ко', role: 'admin' }).errors, { role: 'Оберіть, для чого вам WattWay' });
});

test('ім\'я профілю: ім\'я + прізвище, до 60 символів', () => {
  eq(displayName({ firstName: 'Ірина', lastName: 'Коваль' }), 'Ірина Коваль');
  eq(displayName({ firstName: 'а'.repeat(60), lastName: 'б'.repeat(60) }).length, 60);
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
