import { test, eq } from './runner.js';
import { validateCredentials, checkedCredentials } from '../js/credentials.js';
const valid = { email: '  Name@Example.com ', password: 'password8', firstName: ' Олена ', lastName: ' Коваль ' };
test('signup normalizes identity without modifying password', () => {
  const r = validateCredentials(valid, { signup: true });
  eq(r.ok, true);
  eq(r.value, { email: 'name@example.com', password: 'password8', firstName: 'Олена', lastName: 'Коваль' });
});
test('signup rejects missing names, control characters and password boundaries', () => {
  for (const patch of [{ firstName: '' }, { lastName: '' }, { firstName: 'a'.repeat(61) }, { lastName: 'a\nb' }, { password: '1234567' }, { password: 'a'.repeat(129) }, { email: 'invalid' }]) {
    eq(validateCredentials({ ...valid, ...patch }, { signup: true }).ok, false);
  }
});
test('login accepts legacy passwords; validation fails before transport', () => {
  eq(validateCredentials({ email: 'a@b.ua', password: 'legacy' }).ok, true);
  let error;
  try { checkedCredentials({ email: 'bad', password: '' }); } catch (e) { error = e; }
  eq(error.code, 'auth/invalid-input');
});
