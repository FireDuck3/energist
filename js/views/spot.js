// Картка точки — шлях Саші, частина 2.
import { h, stars, spotCover, formatDate, plural } from '../ui.js';
import { withIcon } from '../icons.js';
import { hostRating, ratingLabel } from '../trust.js';
import { openReport } from './report.js';
import { spotRating, isLiveInBlackout, isOpenAt } from '../filters.js';
import { formatUAH, sessionCost } from '../pricing.js';
import { DEVICES, SOURCES, CONNECTORS, COMMERCIAL_PRICE, AREA_RADIUS_M } from '../data.js';
import { routeUrl, visibleSpots } from '../stations.js';
import { TILES, spotPin } from './map.js';
import { openBooking } from './booking.js';
import { hiddenNotice } from './hidden-notice.js';
import { hostContacts } from './host-contacts.js';
import { detailFacts, hostSince, sessionsLabel, channelLabels } from '../host-profile.js';

const EXAMPLE_KWH = 30;

function fact(label, value) {
  return h('div', { class: 'fact' }, h('span', { class: 'fact-label' }, label), h('span', { class: 'fact-value' }, value));
}

// Картка господаря реальної точки: верифікація, стаж, останні сесії, канали зв'язку й контакти
// (увійшлим — кнопкою «Показати контакти», див. host-contacts.js).
function hostCardLines(card, own, session, pilot, spotId) {
  if (!card) return [];
  return [
    card.verified && h('span', { class: 'verified-badge verified-host', title: 'WattWay перевірив особу господаря' }, '✓ Перевірений господар'),
    h('div', { class: 'muted' }, [hostSince(card.since), sessionsLabel(card.sessions, card.recentHours)].filter(Boolean).join(' · ')),
    hostContacts(card, {
      own,
      signedIn: session.getState().status === 'signedIn',
      reveal: pilot?.revealContacts ? () => pilot.revealContacts(spotId) : null,
      requireAuth: (reason) => session.requireAuth?.(() => {}, reason),
      // Сторінка перемальовується раз на хвилину: відкриті контакти тримаємо в самій картці.
      onRevealed: (contacts) => Object.assign(card, contacts),
    }),
    card.channels?.length ? h('div', { class: 'muted' }, `Зв'язок: ${channelLabels(card.channels).join(', ')}`) : null,
  ];
}

// Карта «Розташування». Створюється один раз і лише переставляється при перемальовуванні сторінки
// (опитування раз на хвилину не перезавантажує тайли). Гостю — коло зони, а не точна точка.
function createLocationMap() {
  const el = h('div', { class: 'spot-location-map card', role: 'region', 'aria-label': 'Розташування точки на карті' });
  let map = null;
  let layer = null;
  let lastKey = '';
  return {
    el,
    update(spot) {
      if (!window.L) {
        el.replaceChildren(h('div', { class: 'map-fallback' }, h('b', {}, 'Карта недоступна — перевірте інтернет')));
        return;
      }
      const zone = spot.pilot && !spot.exactLocation;
      if (!map) {
        map = L.map(el, { scrollWheelZoom: false });
        L.tileLayer(TILES.url, { attribution: TILES.attribution, maxZoom: 19 }).addTo(map);
        layer = L.layerGroup().addTo(map);
      }
      map.invalidateSize();
      const key = JSON.stringify([spot.lat, spot.lng, zone, spot.source, spot.pricePerKwh]);
      if (key === lastKey) return;
      lastKey = key;
      map.setView([spot.lat, spot.lng], zone ? 15 : 16, { animate: false });
      layer.clearLayers();
      if (zone) L.circle([spot.lat, spot.lng], { radius: AREA_RADIUS_M, className: 'spot-zone', interactive: false }).addTo(layer);
      else L.marker([spot.lat, spot.lng], { icon: spotPin(spot), keyboard: false, interactive: false }).addTo(layer);
    },
    destroy() { map?.remove(); map = null; },
  };
}

// Підпис під картою: що саме видно і коли відкриється точне місце.
function locationNote(spot, own) {
  if (!spot.pilot) return null;
  if (own) {
    return h('p', { class: 'hint' }, spot.exactLocation
      ? `Ви бачите точне місце. Гості до підтвердження бронювання бачать лише зону ~${AREA_RADIUS_M} м навколо нього.`
      : `Гості бачать зону ~${AREA_RADIUS_M} м. Точне місце гість побачить, коли ви підтвердите його бронювання.`);
  }
  if (spot.exactLocation) {
    return h('div', { class: 'location-exact' },
      h('p', { class: 'muted' }, 'Господар підтвердив ваше бронювання — показуємо точне місце.'),
      h('a', { class: 'btn btn-secondary btn-sm', href: routeUrl(spot), target: '_blank', rel: 'noopener' }, 'Прокласти маршрут'));
  }
  return h('p', { class: 'hint' },
    withIcon('lock', `Точне місце господар відкриє після підтвердження бронювання. Зараз показуємо зону ~${AREA_RADIUS_M} м, де розташована точка.`));
}

function renderSpot(spot, host, { blackout, spots }, store, session, userHistory, pilot, card, locationMap) {
  const hostName = card?.name ?? spot.hostName ?? host.name;
  const now = spot.pilot
    ? new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }))
    : new Date();
  const own = spot.pilot && spot.ownerId === session.getState().user?.uid;
  const rating = spotRating(spot);
  const dark = blackout && !isLiveInBlackout(spot);
  const book = () => session.requireAuth(() => openBooking(spot, store, { session, userHistory, pilot, now }), 'Увійдіть, щоб забронювати зарядку');
  const here = sessionCost(EXAMPLE_KWH, spot.pricePerKwh).total;
  const commercial = EXAMPLE_KWH * COMMERCIAL_PRICE;
  const deviceLabels = DEVICES.filter((d) => spot.devices.includes(d.id)).map((d) => d.label).join(', ');

  return h('div', { class: 'container spot-page' },
    own && spot.hiddenAt
      ? h('a', { class: 'back-link', href: '#/host' }, '← До моїх точок')
      : h('a', { class: 'back-link', href: '#/map' }, '← До карти'),
    own && spot.hiddenAt && hiddenNotice(spot, pilot),
    h('div', { class: 'spot-head' },
      h('div', {},
        h('h1', { class: 'spot-name' }, spot.title),
        spot.verified && h('span', { class: 'verified-badge', title: 'WattWay перевірив точку на місці' }, '✓ Перевірена точка'),
        h('p', { class: 'spot-sub' },
          spot.reviews.length || spot.reviewsUnavailable ? stars(rating, spot.reviews.length) : h('span', { class: 'new-badge' }, ratingLabel(null, 0, 'spot')), ' · ', spot.district, ' · ',
          h('span', { class: `source-badge source-${spot.source}` }, withIcon(SOURCES[spot.source].icon, SOURCES[spot.source].label, { size: 14 }))))),
    h('img', { class: 'spot-hero', src: spotCover(spot), alt: '' }),

    h('div', { class: 'spot-grid' },
      h('div', { class: 'spot-main' },
        h('div', { class: 'host-row' },
          card?.photo
            ? h('img', { class: 'avatar avatar-photo', src: card.photo, alt: `Фото господаря ${hostName}` })
            : h('span', { class: 'avatar' }, hostName[0].toUpperCase()),
          h('div', {},
            h('b', {}, `Господар — ${hostName}`),
            spot.pilot && !spot.reviewsUnavailable && h('div', { class: 'muted' }, (() => { const r = hostRating(spots, spot.ownerId); return `${ratingLabel(r.avg, r.count, 'host')}${r.count ? ' про господаря' : ''}`; })()),
            host && h('div', { class: 'muted' },
              `${host.chargesCount} ${plural(host.chargesCount, ['зарядка', 'зарядки', 'зарядок'])} · на WattWay з ${host.sinceYear} року`),
            ...hostCardLines(card, own, session, pilot, spot.id))),

        h('div', { class: 'facts' },
          fact('Джерело енергії', withIcon(SOURCES[spot.source].icon, SOURCES[spot.source].label, { size: 14 })),
          fact('Потужність', `${String(spot.powerKw).replace('.', ',')} кВт`),
          fact('Підключення', CONNECTORS[spot.connector]),
          fact('Пристрої', deviceLabels),
          fact('Графік', `щодня ${spot.schedule.from}–${spot.schedule.to}`),
          fact('Під час блекауту', spot.pilot ? 'Уточніть у господаря' : isLiveInBlackout(spot) ? `працює ще ~${spot.blackoutHours} год` : 'не працює без світла'),
          ...detailFacts(spot.details).map(([label, value]) => fact(label, value))),
        spot.details?.description && h('div', { class: 'spot-terms' }, h('h2', { class: 'reviews-title' }, 'Про станцію'), h('p', {}, spot.details.description)),
        spot.details?.terms && h('div', { class: 'spot-terms' }, h('h2', { class: 'reviews-title' }, 'Умови зарядки'), h('p', {}, spot.details.terms)),
        h('div', { class: 'spot-location' },
          h('h2', { class: 'reviews-title' }, 'Розташування'),
          h('p', { class: 'muted' }, spot.district),
          locationMap.el,
          locationNote(spot, own)),

        h('h2', { class: 'reviews-title' }, 'Відгуки'),
        spot.reviewsUnavailable && h('p', { role: 'status' }, 'Не вдалося завантажити відгуки. Повторна спроба відбудеться автоматично.'),
        !spot.reviewsUnavailable && !spot.reviews.length && h('p', { class: 'muted' }, 'Відгуків ще немає. Після завершення зарядки гість може залишити відгук у чаті бронювання.'),
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
          ? h('div', { class: 'alert alert-dark' }, h('b', {}, withIcon('zap', 'Немає світла')), h('span', {}, 'Ця точка живиться від мережі — бронювання недоступне під час блекауту.'))
          : h('p', { class: isOpenAt(spot, now) ? 'open-now' : 'muted' },
            isOpenAt(spot, now) ? `Відчинено до ${spot.schedule.to}` : `Зачинено · відкриється о ${spot.schedule.from}`),
        h('button', { type: 'button', class: 'btn btn-primary btn-lg btn-block', disabled: dark || own,
          onclick: book }, own ? 'Ваша точка' : 'Забронювати'),
        h('p', { class: 'book-note muted' }, spot.pilot
          ? 'Запит підтверджує господар. Онлайн-оплати поки немає — про оплату домовляєтеся з господарем у чаті.'
          : withIcon('flask', 'Демо-режим: оплата лише імітується, справжні гроші не списуються.')),
        spot.pilot && !own && h('button', { type: 'button', class: 'btn btn-ghost btn-sm report-link',
          onclick: () => openReport({ targetType: 'spot', targetId: spot.id, title: spot.title }, session) }, 'Повідомити про проблему'))),

    // На телефоні — закріплена над вкладками смужка замість картки бронювання.
    h('div', { class: 'book-bar' },
      h('div', { class: 'book-bar-price' },
        h('span', {}, h('b', {}, formatUAH(spot.pricePerKwh)), ' / кВт·год'),
        dark && h('span', { class: 'book-bar-note' }, withIcon('zap', 'Немає світла'))),
      h('button', { type: 'button', class: 'btn btn-primary', disabled: dark || own, onclick: book }, own ? 'Ваша точка' : 'Забронювати')));
}

export function render({ id }, root, store, session, userHistory, pilot) {
  let card = null;
  let gone = false;
  // Картку господаря тягнемо окремо: контакти залежать від того, хто дивиться (і чи є бронювання).
  async function loadCard() {
    if (!pilot?.hostCard || !/^[0-9a-f-]{36}$/i.test(id)) return;
    const next = await pilot.hostCard(id);
    if (gone) return;
    card = next;
    update();
  }
  const locationMap = createLocationMap();
  function update() {
    const state = store.getState();
    const { status } = session.getState();
    // Приховану модератором точку на карті не показуємо, але господар відкриває її сторінку з кабінету.
    const found = state.spots.find((s) => s.id === id) ?? pilot?.ownSpots?.().find((s) => s.id === id && s.hiddenAt);
    // Демо-точку (стару закладку чи посилання) відкриваємо лише в демо-режимі.
    const spot = found && visibleSpots([found], status).length ? found : null;
    if (!spot) {
      if ((/^[0-9a-f-]{36}$/i.test(id) && !state.pilotReady) || (found && status === 'loading')) {
        root.replaceChildren(h('p', { class: 'container muted' }, 'Завантаження точки…'));
        return;
      }
      location.replace('#/map');
      return;
    }
    const host = state.hosts.find((x) => x.id === spot.hostId);
    root.replaceChildren(renderSpot(spot, host, state, store, session, userHistory, pilot, card, locationMap));
    locationMap.update(spot);
  }
  update();
  void loadCard();
  if (visibleSpots(store.getState().spots, session.getState().status).some((s) => s.id === id)) userHistory?.recordSpot(id);
  const offStore = store.subscribe(update);
  // Власні приховані точки живуть лише в pilot (у store їх немає) — оновлюємо сторінку і з нього.
  // Лише коли точки немає в store: інакше зайві перемальовування щохвилини.
  const offPilot = pilot?.subscribe?.(() => { if (!store.getState().spots.some((s) => s.id === id)) update(); }) ?? (() => {});
  // Увійшли чи вийшли — контакти могли стати доступними або навпаки.
  let account = session.getState().user?.uid;
  const offSession = session.subscribe(() => {
    if (session.getState().user?.uid !== account) { account = session.getState().user?.uid; card = null; void loadCard(); }
    update();
  });
  return () => { gone = true; offStore(); offPilot(); offSession(); locationMap.destroy(); };
}

