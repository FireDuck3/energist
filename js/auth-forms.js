// Перевірка форм входу й реєстрації на боці клієнта, без DOM. Сервер перевіряє все ще раз:
// ці повідомлення лише рятують від зайвого запиту. Правила email, пароля й імен — у credentials.js.
import { validateProfile } from './auth.js';
import { validateCredentials } from './credentials.js';

export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 128;

// Порядок ключів = порядок полів у формі.
const ORDER = ['firstName', 'lastName', 'email', 'password', 'confirm', 'role'];
const inOrder = (errors) => Object.fromEntries(ORDER.filter((k) => errors[k]).map((k) => [k, errors[k]]));

// Пароль при вході не обмежуємо за довжиною: акаунт міг бути створений за старими правилами.
export function validateLogin({ email, password } = {}) {
  const errors = {};
  const value = { email: String(email ?? '').trim().toLowerCase(), password: String(password ?? '') };
  if (!value.email) errors.email = 'Вкажіть email';
  else if (validateCredentials({ email: value.email, password: 'x' }).errors.email) errors.email = 'Невірний формат email';
  if (!value.password) errors.password = 'Введіть пароль';
  return { ok: Object.keys(errors).length === 0, errors, value };
}

export function validateSignup({ firstName, lastName, email, password, confirm, role } = {}) {
  const base = validateCredentials({ firstName, lastName, email, password }, { signup: true });
  const errors = { ...base.errors };
  if (!String(email ?? '').trim()) errors.email = 'Вкажіть email';
  const value = { ...base.value, role };
  if (!errors.password && value.password !== String(confirm ?? '')) errors.confirm = 'Паролі не збігаються';
  const profile = validateProfile({ name: 'x', role });
  if (profile.errors.role) errors.role = profile.errors.role;
  const ordered = inOrder(errors);
  return { ok: Object.keys(ordered).length === 0, errors: ordered, value };
}

// Ім'я в профілі (до 60 символів) складається з імені й прізвища.
export const displayName = ({ firstName, lastName }) => `${firstName} ${lastName}`.trim().slice(0, 60);

// Куди ведемо після успішного входу.
export const homePath = (role) => (role === 'host' ? '#/host' : '#/map');

// Що запропонувати користувачу після помилки сервера (альтернативні сценарії User Flow).
export function failureAdvice(code, mode) {
  if (code === 'auth/invalid-credential' && mode === 'signin') {
    return { link: { label: 'Немає акаунта? Зареєструватися', to: '#/signup' } };
  }
  if (code === 'auth/email-already-in-use') {
    return { link: { label: 'Цей email уже є — увійти', to: '#/login' } };
  }
  if (code === 'auth/network-request-failed') return { demo: true };
  return {};
}
