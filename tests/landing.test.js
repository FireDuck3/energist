import { test, eq } from './runner.js';
import { render } from '../js/views/landing.js';

test('головна: без калькулятора й історій Саші та Олега, секції по порядку', () => {
  const root = document.createElement('div');
  const cleanup = render({}, root);
  try {
    eq([...root.querySelectorAll('h1, .section-title, .cta-band h2')].map((x) => x.textContent),
      ['Енергетичний Airbnb для України', 'Як це працює', 'Маєш СЕС або батарею?']);
    eq(root.querySelectorAll('.story, .stories, .calc, input[type=range], a[href="#/calc"]').length, 0);
    eq(/калькулятор/i.test(root.textContent), false);
    eq(typeof cleanup, 'function');
  } finally { cleanup?.(); }
});
