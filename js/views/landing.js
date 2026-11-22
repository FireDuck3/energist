// Вхід: людина обирає, з чим прийшла, — «Я роздаю енергію» чи «Я шукаю енергію».
// Від вибору залежить увесь інтерфейс (js/mode.js); вибір запам'ятовується.
import { h, revealOnScroll } from '../ui.js';
import { MODES, chooseMode } from '../mode.js';

const STEPS = {
  guest: [
    { icon: '🔍', title: 'Пошук', text: 'Знаходиш точку на карті поруч — з ціною, графіком і типом конектора' },
    { icon: '📅', title: 'Запит', text: 'Обираєш час і чекаєш підтвердження господаря' },
    { icon: '💬', title: 'Домовленість', text: 'У чаті уточнюєш адресу, паркування й оплату' },
    { icon: '⭐', title: 'Відгук', text: 'Після зарядки завершуєш бронювання й оцінюєш господаря' },
  ],
  host: [
    { icon: '📍', title: 'Точка', text: 'Додаєш СЕС: потужність, акумулятор, конектор, графік і ціну' },
    { icon: '🔔', title: 'Запити', text: 'Отримуєш запити на бронювання й підтверджуєш зручні' },
    { icon: '💬', title: 'Зустріч', text: 'Домовляєшся з гостем у чаті про час і місце' },
    { icon: '💰', title: 'Заробіток', text: 'Надлишок енергії не пропадає, а репутація росте з відгуками' },
  ],
};

// Рядок під картками: гостю — «Увійти» й «Реєстрація», тому, хто вже увійшов, — вітання.
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

function choiceCard(mode, current, pick) {
  const m = MODES[mode];
  return h('button', { type: 'button', class: `mode-card mode-card-${mode}${current === mode ? ' current' : ''}`,
    'aria-describedby': `mode-${mode}-lead`, onclick: () => pick(mode) },
  h('span', { class: 'mode-card-icon', 'aria-hidden': 'true' }, m.icon),
  h('span', { class: 'mode-card-title' }, m.label),
  h('span', { class: 'mode-card-lead', id: `mode-${mode}-lead` }, m.lead),
  h('ul', { class: 'mode-card-perks' }, m.perks.map((p) => h('li', {}, p))),
  h('span', { class: 'mode-card-cta' }, current === mode ? 'Продовжити →' : `${m.cta} →`));
}

export function render(_params, root, store, session) {
  const auth = session ? authRow(session) : null;
  const current = store?.getState().mode ?? null;
  const pick = (mode) => {
    location.hash = store ? chooseMode(mode, { store, session }) : MODES[mode].home;
  };
  root.append(
    h('section', { class: 'hero hero-choice' },
      h('div', { class: 'container choice-inner' },
        h('p', { class: 'eyebrow' }, 'P2P-маркетплейс електрики'),
        h('h1', {}, 'Енергетичний ', h('span', { class: 'accent' }, 'Airbnb'), ' для України'),
        h('p', { class: 'lead' }, 'З чим ви прийшли? Від вибору залежить, що ви побачите далі. Змінити режим можна будь-коли у шапці сайту.'),
        h('div', { class: 'mode-cards' }, choiceCard('host', current, pick), choiceCard('guest', current, pick)),
        auth?.row)),

    h('section', { class: 'section section-alt' },
      h('div', { class: 'container' },
        h('h2', { class: 'section-title' }, 'Як це працює'),
        h('div', { class: 'how-grid' }, ['host', 'guest'].map((mode) =>
          h('div', { class: 'how-col' },
            h('h3', { class: 'how-title' }, `${MODES[mode].icon} ${MODES[mode].label}`),
            h('ol', { class: 'steps steps-compact' }, STEPS[mode].map((s, i) =>
              h('li', { class: 'step card', style: `--i: ${i}` },
                h('span', { class: 'step-icon' }, s.icon),
                h('span', { class: 'step-num' }, `Крок ${i + 1}`),
                h('h3', {}, s.title),
                h('p', {}, s.text))))))))),
  );
  const stopReveal = revealOnScroll(root.querySelectorAll('.section'));
  return () => { stopReveal(); auth?.stop(); };
}
