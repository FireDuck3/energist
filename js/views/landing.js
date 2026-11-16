// Головна: що таке WattWay і як це працює.
import { h, revealOnScroll } from '../ui.js';

const STEPS = [
  { icon: '🔍', title: 'Пошук', text: 'Знаходиш розетку на карті за кілька кліків' },
  { icon: '📅', title: 'Запит', text: 'Обираєш час і чекаєш підтвердження господаря у кабінеті' },
  { icon: '💬', title: 'Домовленість', text: 'У чаті уточнюєш адресу, підключення й умови оплати' },
  { icon: '⭐', title: 'Співпраця', text: 'Після зарядки завершуєш бронювання та залишаєш відгук' },
];

// Рядок під головними кнопками: гостю — «Увійти» й «Реєстрація», тому, хто вже увійшов, — вітання.
function authRow(session) {
  const row = h('div', { class: 'hero-auth' });
  const draw = () => {
    const { status } = session.getState();
    if (status === 'signedIn' || status === 'demo') {
      row.replaceChildren(h('span', { class: 'muted' }, `Привіт, ${session.currentName()}!`),
        h('a', { class: 'btn btn-secondary btn-sm', href: '#/profile' }, 'Мій профіль'));
    } else if (status === 'loading') {
      row.replaceChildren();
    } else {
      row.replaceChildren(h('span', { class: 'muted' }, 'Вже з нами?'),
        h('a', { class: 'btn btn-secondary btn-sm', href: '#/login' }, 'Увійти'),
        h('a', { class: 'btn btn-primary btn-sm', href: '#/signup' }, 'Реєстрація'));
    }
  };
  draw();
  return { row, stop: session.subscribe(draw) };
}

export function render(_params, root, _store, session) {
  const auth = session ? authRow(session) : null;
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
          auth?.row,
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

    h('section', { class: 'section section-cta' },
      h('div', { class: 'container' },
        h('div', { class: 'cta-band' },
          h('div', {},
            h('h2', {}, 'Маєш СЕС або батарею?'),
            h('p', {}, 'Додай свою розетку за хвилину — і енергія, яка пропадала, почне заробляти.')),
          h('a', { class: 'btn btn-sun btn-lg', href: '#/host' }, 'Стати господарем')))),
  );
  const stopReveal = revealOnScroll(root.querySelectorAll('.section'));
  return () => { stopReveal(); auth?.stop(); };
}
