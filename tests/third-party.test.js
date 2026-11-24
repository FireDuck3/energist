import { test, eq } from './runner.js';
import { loadSdk, loadSupabase, SDK_SRC } from '../js/supabase.js';

// Фальшиве оточення: append() «завантажує» скрипт — кладе бібліотеку у window або кидає onerror.
function fakeEnv({ lib = { createClient() {} }, fail = false, online = true } = {}) {
  const appended = [];
  const env = {
    navigator: { onLine: online },
    document: {
      createElement: () => ({}),
      head: { append(el) { appended.push(el.src); setTimeout(() => { if (fail) el.onerror(); else { env.supabase = lib; el.onload(); } }, 0); } },
    },
  };
  return { env, appended };
}

test('supabase-js: береться з власної копії сайту, не з CDN', async () => {
  eq(SDK_SRC, 'vendor/supabase/supabase.js');
  const { env, appended } = fakeEnv();
  const lib = await loadSdk(env);
  eq(appended, ['vendor/supabase/supabase.js']);
  eq(typeof lib.createClient, 'function');
  // Повторний виклик не додає другий <script>.
  await loadSdk(env);
  eq(appended.length, 1);
});

test('supabase-js: збій завантаження — помилка, без мережі — демо (loadSupabase → null)', async () => {
  let failed = false;
  try { await loadSdk(fakeEnv({ fail: true }).env); } catch { failed = true; }
  eq(failed, true);
  const offline = fakeEnv({ online: false });
  eq(await loadSupabase({ env: offline.env }), null);
  eq(offline.appended, [], 'офлайн бібліотеку навіть не вантажимо');
});

test('index.html: жодного стороннього JS чи CSS, крім шрифтів; є Content-Security-Policy', async () => {
  const html = await (await fetch('../index.html', { cache: 'no-store' })).text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const external = (url) => /^(https?:)?\/\//.test(url ?? '');
  eq([...doc.querySelectorAll('script[src]')].map((s) => s.getAttribute('src')).filter(external), []);
  eq([...doc.querySelectorAll('script:not([src])')].length, 0, 'вбудованих скриптів немає — CSP без unsafe-inline');
  eq([...doc.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute('href')).filter(external)
    .filter((u) => !u.startsWith('https://fonts.googleapis.com/')), []);
  const csp = doc.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? '';
  eq(/script-src 'self'(;|$)/.test(csp), true, `script-src лише 'self': ${csp}`);
  eq(/object-src 'none'/.test(csp), true);
  eq(/base-uri 'self'/.test(csp), true);
});
