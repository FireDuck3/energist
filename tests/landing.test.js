import { test, eq } from './runner.js';
import { render } from '../js/views/landing.js';
import { mountCalculator } from '../js/views/calculator.js';

test('головна: без блоку історій Саші й Олега, секції по порядку', () => {
  const root = document.createElement('div');
  const cleanup = render({}, root);
  try {
    eq([...root.querySelectorAll('h1, .section-title, .cta-band h2')].map((x) => x.textContent),
      ['Енергетичний Airbnb для України', 'Як це працює', 'Скільки це дає', 'Маєш СЕС або батарею?']);
    eq(root.querySelectorAll('.story, .stories').length, 0);
    eq(typeof cleanup, 'function');
  } finally { cleanup?.(); }
});

test('калькулятор називає сервіс WattWay, старої назви ніде немає', () => {
  for (const compact of [true, false]) {
    const box = document.createElement('div');
    mountCalculator(box, { compact });
    eq([box.textContent.includes('WattWay'), /ЕнерГ/.test(box.textContent)], [true, false]);
  }
});
