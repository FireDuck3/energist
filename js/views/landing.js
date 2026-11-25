// Вхід: людина обирає, з чим прийшла, — «Я роздаю енергію» чи «Я шукаю енергію».
// Від вибору залежить увесь інтерфейс (js/mode.js); вибір запам'ятовується.
import { h, revealOnScroll } from '../ui.js';
import { MODES, chooseMode } from '../mode.js';
import { icon, withIcon } from '../icons.js';

const STEPS = {
  guest: [
    { icon: 'search', title: 'Пошук', text: 'Знаходиш точку на карті поруч — з ціною, графіком і типом конектора' },
    { icon: 'calendar', title: 'Запит', text: 'Обираєш час і чекаєш підтвердження господаря' },
    { icon: 'message-circle', title: 'Домовленість', text: 'У чаті уточнюєш адресу, паркування й оплату' },
    { icon: 'star', title: 'Відгук', text: 'Після зарядки завершуєш бронювання й оцінюєш господаря' },
  ],
  host: [
    { icon: 'map-pin', title: 'Точка', text: 'Додаєш СЕС: потужність, акумулятор, конектор, графік і ціну' },
    { icon: 'bell', title: 'Запити', text: 'Отримуєш запити на бронювання й підтверджуєш зручні' },
    { icon: 'message-circle', title: 'Зустріч', text: 'Домовляєшся з гостем у чаті про час і місце' },
    { icon: 'coins', title: 'Заробіток', text: 'Надлишок енергії не пропадає, а репутація росте з відгуками' },
  ],
};

// Рядок під картками: гостю — «Вже з нами? Увійти» (кнопка «Реєстрація» лише одна — у шапці),
// тому, хто вже увійшов, — вітання.
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
        h('a', { class: 'btn btn-secondary btn-sm', href: '#/login' }, 'Увійти'));
    }
  };
  draw();
  return { row, stop: session.subscribe(draw) };
}

// Дві кнопки вибору режиму з макета: «Знайти розетку» (гість) і «Здати свою енергію» (господар).
const CHOICES = {
  guest: { icon: 'plug', text: 'Знайти розетку', cls: 'btn-primary' },
  host: { icon: 'sun', text: 'Здати свою енергію', cls: 'btn-secondary' },
};

// Чіпи «Перевага» з макета — те, що дає WattWay.
export const PERKS = [
  'Точки й публічні станції на карті',
  'Бронювання часу за хвилину',
  'Чат із господарем',
  'Відгуки й перевірені точки',
  'Точки, що працюють у блекаут',
];

// Ілюстрація праворуч від заголовка (у макеті — «pic», 521×647).
const HERO_ART = 'assets/house-ses.jpg';

function choiceButton(mode, current, pick) {
  const c = CHOICES[mode];
  return h('button', { type: 'button', class: `btn btn-lg ${c.cls} choice-btn choice-btn-${mode}${current === mode ? ' current' : ''}`,
    title: MODES[mode].label, 'aria-describedby': `mode-${mode}-lead`, onclick: () => pick(mode) },
  icon(c.icon), h('span', { class: 'choice-btn-text' }, c.text));
}

// Опис режиму для екранних читачів — поза кнопкою, щоб не подовжувати її назву.
const choiceLead = (mode) => h('span', { class: 'sr-only', id: `mode-${mode}-lead` }, `${MODES[mode].label}. ${MODES[mode].lead}`);

export function render(_params, root, store, session) {
  const auth = session ? authRow(session) : null;
  const current = store?.getState().mode ?? null;
  const pick = (mode) => {
    location.hash = store ? chooseMode(mode, { store, session }) : MODES[mode].home;
  };
  root.append(
    h('section', { class: 'hero hero-landing' },
      h('div', { class: 'container hero-inner' },
        h('div', { class: 'hero-text' },
          h('h1', {}, 'Енергетичний Airbnb для України'),
          h('p', { class: 'lead' }, 'Знайдіть розетку чи зарядну станцію поруч — або заробляйте на надлишку своєї сонячної станції. Оберіть, з чим прийшли: змінити режим можна будь-коли у шапці сайту.'),
          h('div', { class: 'hero-cta' }, choiceButton('guest', current, pick), choiceButton('host', current, pick),
            choiceLead('guest'), choiceLead('host')),
          h('ul', { class: 'hero-chips', 'aria-label': 'Переваги WattWay' }, PERKS.map((p) => h('li', {}, p))),
          auth?.row),
        h('div', { class: 'hero-art' }, h('img', { src: HERO_ART, alt: 'Будинок із сонячною станцією, що ділиться енергією' })))),

    h('section', { class: 'section section-alt' },
      h('div', { class: 'container' },
        h('h2', { class: 'section-title' }, 'Як це працює'),
        h('div', { class: 'how-grid' }, ['host', 'guest'].map((mode) =>
          h('div', { class: 'how-col' },
            h('h3', { class: 'how-title' }, withIcon(MODES[mode].icon, MODES[mode].label, { size: 22 })),
            h('ol', { class: 'steps steps-compact' }, STEPS[mode].map((s, i) =>
              h('li', { class: 'step card', style: `--i: ${i}` },
                h('span', { class: 'step-icon' }, icon(s.icon, { size: 22 })),
                h('span', { class: 'step-num' }, `Крок ${i + 1}`),
                h('h3', {}, s.title),
                h('p', {}, s.text))))))))),
  );
  const stopReveal = revealOnScroll(root.querySelectorAll('.section'));
  return () => { stopReveal(); auth?.stop(); };
}
