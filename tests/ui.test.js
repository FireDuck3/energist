import { test, eq } from './runner.js';
import { openModal } from '../js/ui.js';

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
