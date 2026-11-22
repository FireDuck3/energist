import { test, eq } from './runner.js';
import { render } from '../js/views/landing.js';
import { createStore, memoryStorage } from '../js/store.js';

test('головна: екран вибору — «Я роздаю енергію» і «Я шукаю енергію», без калькулятора', () => {
  const root = document.createElement('div');
  const store = createStore(memoryStorage());
  const cleanup = render({}, root, store);
  try {
    eq([...root.querySelectorAll('h1, .section-title')].map((x) => x.textContent), ['Енергетичний Airbnb для України', 'Як це працює']);
    eq([...root.querySelectorAll('.mode-card-title')].map((x) => x.textContent), ['Я роздаю енергію', 'Я шукаю енергію']);
    eq(root.querySelectorAll('.story, .stories, .calc, input[type=range], a[href="#/calc"]').length, 0);
    eq(/калькулятор/i.test(root.textContent), false);
    eq(typeof cleanup, 'function');
  } finally { cleanup?.(); }
});

test("головна: вибір режиму запам'ятовується і веде на його головну", () => {
  const root = document.createElement('div');
  const store = createStore(memoryStorage());
  const before = location.hash;
  const cleanup = render({}, root, store);
  try {
    root.querySelector('.mode-card-host').click();
    eq([store.getState().mode, location.hash], ['host', '#/host']);
    root.querySelector('.mode-card-guest').click();
    eq([store.getState().mode, location.hash], ['guest', '#/map']);
  } finally { cleanup?.(); history.replaceState(null, '', before || location.pathname); }
});
