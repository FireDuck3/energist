// Перевірка форм входу й реєстрації на боці клієнта, без DOM. Сервер перевіряє все ще раз:
// ці повідомлення лише рятують від зайвого запиту.
import { validateProfile } from './auth.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD = 6;

function checkEmail(raw, errors) {
  const email = String(raw ?? '').trim();
  if (!email) errors.email = 'Вкажіть email';
  else if (!EMAIL_RE.test(email)) errors.email = 'Невірний формат email';
  return email;
}

// Пароль при вході не обмежуємо за довжиною: акаунт міг бути створений за іншими правилами.
export function validateLogin({ email, password } = {}) {
  const errors = {};
  const value = { email: checkEmail(email, errors), password: String(password ?? '') };
  if (!value.password) errors.password = 'Введіть пароль';
  return { ok: Object.keys(errors).length === 0, errors, value };
}

export function validateSignup({ name, email, password, confirm, role } = {}) {
  const errors = {};
  const profile = validateProfile({ name, role });
  if (profile.errors.name) errors.name = profile.errors.name;
  const value = { name: profile.value.name, email: checkEmail(email, errors), password: String(password ?? ''), role };
  if (profile.errors.role) errors.role = profile.errors.role;
  // Порядок ключів = порядок полів у формі.
  const ordered = {};
  for (const key of ['name', 'email']) if (errors[key]) ordered[key] = errors[key];
  if (!value.password) ordered.password = 'Введіть пароль';
  else if (value.password.length < MIN_PASSWORD) ordered.password = `Пароль має бути щонайменше ${MIN_PASSWORD} символів`;
  else if (value.password !== String(confirm ?? '')) ordered.confirm = 'Паролі не збігаються';
  if (errors.role) ordered.role = errors.role;
  return { ok: Object.keys(ordered).length === 0, errors: ordered, value };
}

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
