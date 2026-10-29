import { test, eq } from './runner.js';
import { h, openModal, revealOnScroll, installRipple } from '../js/ui.js';

test('модалка не закривається, якщо натиснули всередині, а відпустили на фоні', () => {
  let closed = 0;
  const modal = openModal(document.createElement('div'), { onClose: () => closed++ });
  const overlay = document.querySelector('.modal-overlay');
  const dialog = overlay.querySelector('.modal');
  try {
    // Перетягування: pointerdown у вікні, click (спільний предок) — на фоні.
    dialog.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const stillOpen = Boolean(document.querySelector('.modal-overlay'));
    // Справжній клік по фону закриває.
    overlay.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    eq([stillOpen, closed, Boolean(document.querySelector('.modal-overlay'))], [true, 1, false]);
  } finally {
    modal.close();
  }
});

test('дві модалки: закриття першої не знімає блокування прокрутки з другої', () => {
  const a = openModal(document.createElement('div'));
  const b = openModal(document.createElement('div'));
  a.close();
  const locked = document.body.classList.contains('modal-open');
  b.close();
  eq([locked, document.body.classList.contains('modal-open')], [true, false]);
});

test('revealOnScroll: з «менше руху» нічого не ховає', () => {
  const el = document.createElement('div');
  const stop = revealOnScroll([el], { reduce: true });
  eq(el.classList.contains('reveal'), false);
  stop();
});

test("revealOnScroll: блок у полі зору з'являється", async () => {
  const el = h('div', { style: 'height: 20px' });
  document.body.prepend(el);
  const stop = revealOnScroll([el], { reduce: false });
  try {
    await new Promise((r) => setTimeout(r, 300));
    eq([el.classList.contains('reveal'), el.classList.contains('in')], [true, true]);
  } finally { stop(); el.remove(); }
});

test('installRipple: натискання на кнопку пускає хвилю, на вимкнену — ні', () => {
  const on = h('button', { class: 'btn' }, 'Так');
  const off = h('button', { class: 'btn', disabled: true }, 'Ні');
  const box = h('div', {}, on, off);
  document.body.append(box);
  const stop = installRipple(box, { reduce: false });
  try {
    on.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5 }));
    off.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    eq([on.querySelectorAll('.ripple').length, off.querySelectorAll('.ripple').length, on.textContent], [1, 0, 'Так']);
  } finally { stop(); box.remove(); }
});

test('installRipple: з «менше руху» хвилі немає', () => {
  const btn = h('button', { class: 'btn' }, 'Так');
  document.body.append(btn);
  const stop = installRipple(btn.parentNode, { reduce: true });
  try {
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    eq(btn.querySelectorAll('.ripple').length, 0);
  } finally { stop(); btn.remove(); }
});
