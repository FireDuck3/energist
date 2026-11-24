# Сторонні бібліотеки (власні копії)

Сайт не вантажить JavaScript і CSS з чужих CDN: якщо CDN зламають чи підмінять файл, чужий код отримав би
доступ до сесії користувача. Тому бібліотеки лежать тут, а `index.html` дозволяє скрипти лише з самого сайту
(Content-Security-Policy, `script-src 'self'`).

| Бібліотека | Версія | Файли | Ліцензія |
|---|---|---|---|
| [Leaflet](https://leafletjs.com) | 1.9.4 | `leaflet/leaflet.js`, `leaflet/leaflet.css`, `leaflet/images/*` (з `dist/`) | BSD-2-Clause |
| [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster) | 1.5.3 | `markercluster/*` (з `dist/`) | MIT |
| [supabase-js](https://github.com/supabase/supabase-js) | 2.45.4 | `supabase/supabase.js` (`dist/umd/supabase.js`, задає `window.supabase`) | MIT |

Кожен файл збігається байт у байт з файлом з пакета npm (цілісність архіву перевірено за `dist.integrity`
з registry.npmjs.org). SHA-256 Leaflet збігаються з опублікованими на leafletjs.com:
`leaflet.js` — `sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=`,
`leaflet.css` — `sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=`.

## Як оновити

1. Завантажте архів пакета з npm (`npm pack <назва>@<версія>`) і звірте його з `dist.integrity` у `https://registry.npmjs.org/<назва>/<версія>`.
2. Скопіюйте ті самі файли з `package/dist/` сюди, замініть `LICENSE`, оновіть таблицю вище.
3. supabase-js: перевірте, що UMD-збірка й далі задає `window.supabase.createClient` (`js/supabase.js` → `loadSdk`).
4. Прогоніть тести (`tests/`) і відкрийте карту й вхід — у консолі не має бути порушень CSP.
