// Поле вводу повідомлення: Enter — надіслати, Shift+Enter — новий рядок, авторозмір до 5 рядків.
import { h } from '../ui.js';
import { icon } from '../icons.js';

const MAX_ROWS = 5;
const TYPING_EVERY_MS = 3000;

// onSend отримує вже обрізаний текст; поле очищується одразу (повідомлення показується оптимістично).
export function createComposer({ onSend, onTyping, now = () => Date.now() }) {
  let lastTyping = -Infinity;
  const textarea = h('textarea', { class: 'composer-input', rows: 1, maxlength: 2000, placeholder: 'Повідомлення…', 'aria-label': 'Повідомлення' });
  const button = h('button', { type: 'submit', class: 'composer-send', 'aria-label': 'Надіслати' }, icon('send', { size: 18 }));

  const resize = () => {
    textarea.style.height = 'auto';
    const line = parseFloat(getComputedStyle(textarea).lineHeight) || 20;
    textarea.style.height = `${Math.min(textarea.scrollHeight, line * MAX_ROWS + 16)}px`;
  };

  function send() {
    const text = textarea.value.trim();
    if (!text || textarea.disabled) return;
    textarea.value = '';
    resize();
    void onSend(text);
  }

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); send(); }
  });
  textarea.addEventListener('input', () => {
    resize();
    const t = now();
    if (textarea.value.trim() && t - lastTyping >= TYPING_EVERY_MS) { lastTyping = t; onTyping?.(); }
  });

  const el = h('form', { class: 'composer', onsubmit: (e) => { e.preventDefault(); send(); textarea.focus(); } }, textarea, button);
  return {
    el,
    focus: () => textarea.focus({ preventScroll: true }),
    // Закритий чат: поле неактивне й пояснює чому.
    setDisabled(on) { textarea.disabled = on; button.disabled = on; textarea.placeholder = on ? 'Чат закрито' : 'Повідомлення…'; },
  };
}
