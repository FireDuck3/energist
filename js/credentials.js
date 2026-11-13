// Shared validation before calling Supabase Auth. Server constraints remain authoritative.
export function validateCredentials({ email, password, firstName, lastName } = {}, { signup = false } = {}) {
  const value = { email: String(email ?? '').trim().toLowerCase(), password: String(password ?? '') };
  const errors = {};
  if (value.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) errors.email = 'Невірний формат email';
  if (!value.password) errors.password = 'Введіть пароль';
  else if (signup && (value.password.length < 8 || value.password.length > 128)) errors.password = 'Пароль має містити від 8 до 128 символів';
  if (signup) {
    for (const [key, raw] of Object.entries({ firstName, lastName })) {
      value[key] = String(raw ?? '').trim();
      if (!value[key] || value[key].length > 60 || /[\u0000-\u001f\u007f]/.test(value[key])) errors[key] = 'Вкажіть від 1 до 60 символів';
    }
  }
  return { ok: !Object.keys(errors).length, errors, value };
}
export function checkedCredentials(input, options) {
  const result = validateCredentials(input, options);
  if (!result.ok) throw Object.assign(new Error(Object.values(result.errors)[0]), { code: 'auth/invalid-input', local: Object.values(result.errors)[0], errors: result.errors });
  return result.value;
}
