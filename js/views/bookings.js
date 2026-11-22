// Бронювання: «Мої бронювання» (гість, #/bookings) і «Бронювання гостей» (господар, #/host/bookings).
import { h } from '../ui.js';
import { signInPrompt } from './auth-modal.js';

function page({ host }, root, session, pilot) {
  function update() {
    const { status } = session.getState();
    if (status === 'loading') {
      root.replaceChildren(h('div', { class: 'container gate muted' }, 'Завантаження…'));
      return;
    }
    if (status === 'demo') {
      root.replaceChildren(h('div', { class: 'container gate' }, h('div', { class: 'gate-card card' },
        h('span', { class: 'gate-icon' }, '🧪'), h('h1', {}, 'Демо-режим'),
        h('p', { class: 'muted' }, host
          ? 'Приклад бронювань господаря — у кабінеті «Мої точки».'
          : 'У демо-режимі бронювання проходять одразу на картці точки.'),
        h('a', { class: 'btn btn-primary', href: host ? '#/host' : '#/map' }, host ? 'До моїх точок' : 'До карти'))));
      return;
    }
    if (status !== 'signedIn') {
      root.replaceChildren(signInPrompt(host ? {
        title: 'Бронювання гостей доступні після входу',
        text: 'Увійдіть, щоб підтверджувати запити на зарядку ваших точок.',
        reason: 'Увійдіть, щоб побачити бронювання гостей',
      } : {
        title: 'Ваші бронювання доступні після входу',
        text: 'Увійдіть, щоб бачити запити на зарядку та їхній статус.',
        reason: 'Увійдіть, щоб побачити свої бронювання',
      }, session));
      return;
    }
    root.replaceChildren(h('div', { class: 'container bookings-page' },
      h('div', { class: 'page-head' },
        h('div', {},
          h('h1', {}, host ? 'Бронювання гостей' : 'Мої бронювання'),
          h('p', { class: 'muted' }, host
            ? 'Підтверджуйте або відхиляйте запити, домовляйтесь у чаті й завершуйте співпрацю після зарядки.'
            : 'Статус ваших запитів на зарядку. Деталі зустрічі — у чаті з господарем.')),
        h('a', { class: 'btn btn-secondary', href: host ? '#/host' : '#/map' }, host ? 'Мої точки' : 'Знайти точку')),
      pilot.panel(host)));
  }
  update();
  const offSession = session.subscribe(update);
  const offPilot = pilot.subscribe(update);
  return () => { offSession(); offPilot(); };
}

export function render(_params, root, _store, session, _history, pilot) {
  return page({ host: false }, root, session, pilot);
}

export function renderHost(_params, root, _store, session, _history, pilot) {
  return page({ host: true }, root, session, pilot);
}
