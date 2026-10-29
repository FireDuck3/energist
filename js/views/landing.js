// Головна: що таке ЕнерГість, для кого, як працює.
import { h } from '../ui.js';
import { HOME_TARIFF, COMMERCIAL_RANGE } from '../data.js';

const STEPS = [
  { icon: '🔍', title: 'Пошук', text: 'Знаходиш розетку на карті за кілька кліків' },
  { icon: '📅', title: 'Бронювання', text: 'Обираєш час, гроші заморожуються до кінця зарядки' },
  { icon: '🔌', title: 'Зарядка', text: 'Підключаєшся в обраній точці, лічильник видно наживо' },
  { icon: '💳', title: 'Оплата', text: 'Платиш лише за фактично використані кВт·год' },
];

function story({ img, alt, who, quote, facts, punchline, cta, href }) {
  return h('article', { class: 'story card' },
    h('img', { class: 'story-img', src: img, alt, loading: 'lazy' }),
    h('div', { class: 'story-body' },
      h('p', { class: 'eyebrow' }, who),
      h('blockquote', { class: 'story-quote' }, `«${quote}»`),
      h('ul', { class: 'story-facts' }, facts.map((f) => h('li', {}, f))),
      h('p', { class: 'story-punch' }, punchline),
      h('a', { class: 'btn btn-secondary', href }, cta)));
}

export function render(_params, root) {
  const [lo, hi] = COMMERCIAL_RANGE;
  root.append(
    h('section', { class: 'hero' },
      h('div', { class: 'container hero-inner' },
        h('div', { class: 'hero-text' },
          h('p', { class: 'eyebrow' }, 'P2P-маркетплейс електрики · Вінниця'),
          h('h1', {}, 'Енергетичний ', h('span', { class: 'accent' }, 'Airbnb'), ' для України'),
          h('p', { class: 'lead' },
            'Знаходь розетку поруч за кілька кліків — або заробляй на надлишку своєї сонячної станції. ',
            'Ми поєднуємо тих, у кого енергія є, з тими, кому вона потрібна.'),
          h('div', { class: 'hero-cta' },
            h('a', { class: 'btn btn-primary btn-lg', href: '#/map' }, '🔌 Знайти розетку'),
            h('a', { class: 'btn btn-secondary btn-lg', href: '#/host' }, '☀️ Здати свою енергію')),
          h('ul', { class: 'hero-chips' },
            h('li', {}, h('b', {}, '8–15 грн'), ` замість ${lo}–${hi} грн за кВт·год`),
            h('li', {}, h('b', {}, 'Працює в блекаут'), ' — СЕС і батареї'),
            h('li', {}, h('b', {}, 'Безпечна угода'), ' — оплата після зарядки'))),
        h('div', { class: 'hero-art' },
          h('img', { src: 'assets/hero-phone.jpg', alt: 'Телефон з картою розеток і зарядна станція' })))),

    h('section', { class: 'section' },
      h('div', { class: 'container' },
        h('h2', { class: 'section-title' }, 'Попит є. Пропозиція є. Ринку — немає.'),
        h('p', { class: 'section-lead' },
          'Блекаути можуть тривати роками, люди масово ставлять СЕС та інвертори, електромобілів стає дедалі більше. ',
          'А інфраструктура не встигає.'),
        h('div', { class: 'stories' },
          story({
            img: 'assets/apartment.jpg', alt: 'Багатоповерхівка', who: 'Саша · живе в багатоповерхівці',
            quote: 'Було б круто за кілька кліків знайти доступну розетку',
            facts: [
              'Має електромобіль, але не скине подовжувач з 5-го поверху',
              `Комерційні зарядки — ${lo}–${hi} грн/кВт·год, швидкі шкодять батареї`,
              'У під\'їзді ще 4 «Саші» і 10 власників EcoFlow',
            ],
            punchline: 'Попит є. Рішення — немає.', cta: 'Шлях Саші →', href: '#/map',
          }),
          story({
            img: 'assets/house-ses.jpg', alt: 'Будинок із сонячними панелями', who: 'Олег · власник приватного будинку',
            quote: 'Було б круто знайти 2–3 постійних клієнти й окупити свою СЕС',
            facts: [
              'Сонячна станція покриває його потреби на 200%+',
              `Домашній тариф — ${String(HOME_TARIFF).replace('.', ',')} грн/кВт·год, зеленого тарифу немає`,
              'Надлишок улітку просто пропадає',
            ],
            punchline: 'Пропозиція є. Ринку — немає.', cta: 'Шлях Олега →', href: '#/host',
          })))),

    h('section', { class: 'section section-alt' },
      h('div', { class: 'container' },
        h('h2', { class: 'section-title' }, 'Як це працює'),
        h('ol', { class: 'steps' }, STEPS.map((s, i) =>
          h('li', { class: 'step card' },
            h('span', { class: 'step-icon' }, s.icon),
            h('span', { class: 'step-num' }, `Крок ${i + 1}`),
            h('h3', {}, s.title),
            h('p', {}, s.text)))))),

    h('section', { class: 'section' },
      h('div', { class: 'container' },
        h('h2', { class: 'section-title' }, 'Скільки це дає'),
        h('div', { id: 'calc-compact' }))),

    h('section', { class: 'section' },
      h('div', { class: 'container' },
        h('div', { class: 'cta-band' },
          h('div', {},
            h('h2', {}, 'Маєш СЕС або батарею?'),
            h('p', {}, 'Додай свою розетку за хвилину — і енергія, яка пропадала, почне заробляти.')),
          h('a', { class: 'btn btn-sun btn-lg', href: '#/host' }, 'Стати господарем')))),
  );
}
