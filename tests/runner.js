// Мінімальний тест-ранер для браузера: test() реєструє, run() виконує і малює результат.
const cases = [];

export function test(name, fn) {
  cases.push({ name, fn });
}

export function eq(actual, expected, msg = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ? msg + ': ' : ''}очікувалось ${e}, отримано ${a}`);
}

export async function run() {
  const list = document.getElementById('results');
  let failed = 0;
  for (const { name, fn } of cases) {
    const li = document.createElement('li');
    try {
      await fn();
      li.textContent = `✓ ${name}`;
      li.className = 'pass';
    } catch (err) {
      failed++;
      li.textContent = `✗ ${name} — ${err.message}`;
      li.className = 'fail';
    }
    list.append(li);
  }
  const summary = `${failed ? 'FAIL' : 'PASS'} ${cases.length - failed}/${cases.length}`;
  document.title = summary;
  document.getElementById('summary').textContent = summary;
}
