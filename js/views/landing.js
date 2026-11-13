// Головна: що таке WattWay, як працює, скільки дає.
import { h, revealOnScroll } from '../ui.js';
import { mountCalculator } from './calculator.js';

const STEPS = [
  { icon: '🔍', title: 'Пошук', text: 'Знаходиш розетку на карті за кілька кліків' },
  { icon: '📅', title: 'Запит', text: 'Обираєш час і чекаєш підтвердження господаря у кабінеті' },
  { icon: '💬', title: 'Домовленість', text: 'У чаті уточнюєш адресу, підключення й умови оплати' },
  { icon: '⭐', title: 'Співпраця', text: 'Після зарядки завершуєш бронювання та залишаєш відгук' },
];

export function render(_params, root) {
  const calcBox = h('div', { id: 'calc-compact' });
  mountCalculator(calcBox, { compact: true });
  root.append(
    h('section', { class: 'hero' },
      h('div', { class: 'container hero-inner' },
        h('div', { class: 'hero-text' },
          h('p', { class: 'eyebrow' }, 'P2P-маркетплейс електрики'),
          h('h1', {}, 'Енергетичний ', h('span', { class: 'accent' }, 'Airbnb'), ' для України'),
          h('p', { class: 'lead' },
            'Знаходь розетку поруч за кілька кліків — або заробляй на надлишку своєї сонячної станції. ',
            'Ми поєднуємо тих, у кого енергія є, з тими, кому вона потрібна.'),
          h('div', { class: 'hero-cta' },
            h('a', { class: 'btn btn-primary btn-lg', href: '#/map' }, '🔌 Знайти розетку'),
            h('a', { class: 'btn btn-secondary btn-lg', href: '#/host' }, '☀️ Здати свою енергію')),
          h('ul', { class: 'hero-chips' },
            h('li', {}, h('b', {}, 'Прозорі умови'), ' — ціна та підключення в картці точки'),
            h('li', {}, h('b', {}, 'Взаємодопомога'), ' — знайди господаря з доступною енергією'),
            h('li', {}, h('b', {}, 'Прямий зв’язок'), ' — чат із господарем'))),
        h('div', { class: 'hero-art' },
          h('img', { src: 'assets/hero-phone.jpg', alt: 'Телефон з картою розеток і зарядна станція' })))),

    h('section', { class: 'section section-alt' },
      h('div', { class: 'container' },
        h('h2', { class: 'section-title' }, 'Як це працює'),
        h('ol', { class: 'steps' }, STEPS.map((s, i) =>
          h('li', { class: 'step card', style: `--i: ${i}` },
            h('span', { class: 'step-icon' }, s.icon),
            h('span', { class: 'step-num' }, `Крок ${i + 1}`),
            h('h3', {}, s.title),
            h('p', {}, s.text)))))),

    h('section', { class: 'section' },
      h('div', { class: 'container' },
        h('h2', { class: 'section-title' }, 'Скільки це дає'),
        calcBox,
        h('p', { class: 'calc-more' }, h('a', { href: '#/calc' }, 'Детальний калькулятор →')))),

    h('section', { class: 'section section-cta' },
      h('div', { class: 'container' },
        h('div', { class: 'cta-band' },
          h('div', {},
            h('h2', {}, 'Маєш СЕС або батарею?'),
            h('p', {}, 'Додай свою розетку за хвилину — і енергія, яка пропадала, почне заробляти.')),
          h('a', { class: 'btn btn-sun btn-lg', href: '#/host' }, 'Стати господарем')))),
  );
  return revealOnScroll(root.querySelectorAll('.section'));
}
