// Картка точки — шлях Саші, частина 2.
import { h, stars, spotCover, formatDate, plural } from '../ui.js';
import { spotRating, isLiveInBlackout, isOpenAt } from '../filters.js';
import { formatUAH, sessionCost } from '../pricing.js';
import { DEVICES, SOURCES, CONNECTORS, COMMERCIAL_PRICE } from '../data.js';
import { openBooking } from './booking.js';

const EXAMPLE_KWH = 30;

function fact(label, value) {
  return h('div', { class: 'fact' }, h('span', { class: 'fact-label' }, label), h('span', { class: 'fact-value' }, value));
}

function renderSpot(spot, host, { blackout }, store, session, userHistory) {
  const hostName = spot.hostName ?? host.name;
  const now = new Date();
  const rating = spotRating(spot);
  const dark = blackout && !isLiveInBlackout(spot);
  const book = () => session.requireAuth(() => openBooking(spot, store, { session, userHistory }), 'Увійдіть, щоб забронювати зарядку');
  const here = sessionCost(EXAMPLE_KWH, spot.pricePerKwh).total;
  const commercial = EXAMPLE_KWH * COMMERCIAL_PRICE;
  const deviceLabels = DEVICES.filter((d) => spot.devices.includes(d.id)).map((d) => d.label).join(', ');

  return h('div', { class: 'container spot-page' },
    h('a', { class: 'back-link', href: '#/map' }, '← До карти'),
    h('div', { class: 'spot-head' },
      h('div', {},
        h('h1', { class: 'spot-name' }, spot.title),
        h('p', { class: 'spot-sub' },
          stars(rating, spot.reviews.length), ' · ', spot.district, ' · ',
          h('span', { class: `source-badge source-${spot.source}` }, `${SOURCES[spot.source].icon} ${SOURCES[spot.source].label}`)))),
    h('img', { class: 'spot-hero', src: spotCover(spot), alt: '' }),

    h('div', { class: 'spot-grid' },
      h('div', { class: 'spot-main' },
        h('div', { class: 'host-row' },
          h('span', { class: 'avatar' }, hostName[0].toUpperCase()),
          h('div', {},
            h('b', {}, `Господар — ${hostName}`),
            h('div', { class: 'muted' },
              `${host.chargesCount} ${plural(host.chargesCount, ['зарядка', 'зарядки', 'зарядок'])} · на WattWay з ${host.sinceYear} року`))),

        h('div', { class: 'facts' },
          fact('Джерело енергії', `${SOURCES[spot.source].icon} ${SOURCES[spot.source].label}`),
          fact('Потужність', `${String(spot.powerKw).replace('.', ',')} кВт`),
          fact('Підключення', CONNECTORS[spot.connector]),
          fact('Пристрої', deviceLabels),
          fact('Графік', `щодня ${spot.schedule.from}–${spot.schedule.to}`),
          fact('Під час блекауту', isLiveInBlackout(spot) ? `працює ще ~${spot.blackoutHours} год` : 'не працює без світла')),

        h('h2', { class: 'reviews-title' }, 'Відгуки'),
        h('div', { class: 'reviews' }, spot.reviews.map((r) =>
          h('div', { class: 'review' },
            h('div', { class: 'review-head' },
              h('span', { class: 'avatar avatar-sm' }, r.author[0]),
              h('b', {}, r.author),
              h('span', { class: 'review-stars', 'aria-label': `${r.stars} з 5` }, '★'.repeat(r.stars) + '☆'.repeat(5 - r.stars)),
              h('span', { class: 'muted' }, formatDate(r.date))),
            h('p', {}, r.text))))),

      h('aside', { class: 'book-card card' },
        h('div', { class: 'book-price' }, h('b', {}, formatUAH(spot.pricePerKwh)), ' / кВт·год'),
        h('div', { class: 'compare' },
          h('div', { class: 'compare-row' }, h('span', {}, `${EXAMPLE_KWH} кВт·год тут`), h('b', {}, formatUAH(here))),
          h('div', { class: 'compare-row muted' }, h('span', {}, `на комерційній (~${COMMERCIAL_PRICE} грн)`), h('s', {}, formatUAH(commercial))),
          h('div', { class: 'compare-save' }, `Економія ${formatUAH(commercial - here)}`)),
        dark
          ? h('div', { class: 'alert alert-dark' }, h('b', {}, '⚡ Немає світла'), h('span', {}, 'Ця точка живиться від мережі — бронювання недоступне під час блекауту.'))
          : h('p', { class: isOpenAt(spot, now) ? 'open-now' : 'muted' },
            isOpenAt(spot, now) ? `Відчинено до ${spot.schedule.to}` : `Зачинено · відкриється о ${spot.schedule.from}`),
        h('button', { type: 'button', class: 'btn btn-primary btn-lg btn-block', disabled: dark,
          onclick: book }, 'Забронювати'),
        h('p', { class: 'book-note muted' }, '🔒 Гроші заморожуються і списуються лише за фактично отриману енергію'))),

    // На телефоні — закріплена над вкладками смужка замість картки бронювання.
    h('div', { class: 'book-bar' },
      h('div', { class: 'book-bar-price' },
        h('span', {}, h('b', {}, formatUAH(spot.pricePerKwh)), ' / кВт·год'),
        dark && h('span', { class: 'book-bar-note' }, '⚡ Немає світла')),
      h('button', { type: 'button', class: 'btn btn-primary', disabled: dark, onclick: book }, 'Забронювати')));
}

export function render({ id }, root, store, session, userHistory) {
  function update() {
    const state = store.getState();
    const spot = state.spots.find((s) => s.id === id);
    if (!spot) {
      location.replace('#/map');
      return;
    }
    const host = state.hosts.find((x) => x.id === spot.hostId);
    root.replaceChildren(renderSpot(spot, host, state, store, session, userHistory));
  }
  update();
  if (store.getState().spots.some((s) => s.id === id)) userHistory?.recordSpot(id);
  return store.subscribe(update);
}
