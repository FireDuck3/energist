import { test, eq } from './runner.js';
import { createComposer } from '../js/views/chat-composer.js';

const key = (el, k, shift = false) => {
  const e = new KeyboardEvent('keydown', { key: k, shiftKey: shift, bubbles: true, cancelable: true });
  el.dispatchEvent(e);
  return e;
};

test('composer: Enter надсилає й очищує, Shift+Enter — ні, пробіли не надсилаються', async () => {
  const sent = [];
  const c = createComposer({ onSend: async (t) => { sent.push(t); }, onTyping: () => {} });
  const ta = c.el.querySelector('textarea');
  ta.value = '  Привіт  ';
  key(ta, 'Enter');
  await Promise.resolve();
  eq([sent, ta.value], [['Привіт'], '']);
  ta.value = 'рядок';
  const e = key(ta, 'Enter', true);
  eq([sent.length, e.defaultPrevented], [1, false]);
  ta.value = '   ';
  key(ta, 'Enter');
  eq(sent.length, 1);
});

test('composer: сигнал «друкує» не частіше разу на 3 с', () => {
  let t = 0;
  let typed = 0;
  const c = createComposer({ onSend: async () => {}, onTyping: () => typed++, now: () => t });
  const ta = c.el.querySelector('textarea');
  for (const ms of [0, 300, 900]) { t = ms; ta.value += 'a'; ta.dispatchEvent(new Event('input')); }
  t = 3100; ta.value += 'a'; ta.dispatchEvent(new Event('input'));
  eq(typed, 2);
});
