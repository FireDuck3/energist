// Карта і список точок — шлях Саші, частина 1.
import { h, stars, spotCover, plural } from '../ui.js';
import { icon, iconSvg, withIcon } from '../icons.js';
import { filterSpots, spotRating, isLiveInBlackout, isOpenAt, normalizeQuery } from '../filters.js';
import { RADII, POWER_BANDS, CONNECTOR_FILTERS, distanceKm, matchSpotExtra, matchStation, sortByDistance, nearest, nearestN, resultsLabel } from '../map-filters.js';
import { locate, geoMessage } from '../geolocate.js';
import { openReport } from './report.js';
import { availabilityLabel, channelLabels, hostSince } from '../host-profile.js';
import { formatUAH } from '../pricing.js';
import { DEVICES, SOURCES, CONNECTORS, VINNYTSIA_CENTER, AREA_RADIUS_M } from '../data.js';
import { searchBox } from './search-box.js';
import { hostContacts } from './host-contacts.js';
import { loadPublicStations, loadStationDetails, loadStationsDetails, routeUrl, statusLabel, attribution, connectorLabel, spotKind, safeUrl, visibleSpots } from '../stations.js';

// Тайли OpenStreetMap; світлу й темну (блекаут) тему дає CSS-фільтр на .leaflet-tile-pane.
export const TILES = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
};

// Пін-«пігулка» кольору джерела з ціною, як на Airbnb.
export function spotPin(spot, { dimmed = false, selected = false } = {}) {
  const cls = ['pin', `pin-${spot.source}`, spotKind(spot) === 'demo' && 'pin-demo', dimmed && 'pin-dimmed', selected && 'pin-selected'].filter(Boolean).join(' ');
  const label = dimmed ? 'немає світла' : `${spot.pricePerKwh} грн`;
  return L.divIcon({
    className: 'pin-wrap',
    html: `<div class="${cls}"><span class="pin-icon">${iconSvg(SOURCES[spot.source].icon, { size: 14 })}</span>${label}</div>`,
    iconSize: null,
    iconAnchor: [0, 0],
  });
}

function openingLine(spot, now) {
  return isOpenAt(spot, now)
    ? h('span', { class: 'open-now' }, `Відчинено до ${spot.schedule.to}`)
    : h('span', { class: 'muted' }, `Зачинено · відкриється о ${spot.schedule.from}`);
}

const fmtKm = (km) => (km < 10 ? km.toFixed(1).replace('.', ',') : String(Math.round(km))) + ' км';
const distanceLabel = (item, origin) => (origin ? ` · ${fmtKm(distanceKm(origin, item))}` : '');

function spotCard(spot, { blackout, now, origin }) {
  return h('a', { class: 'spot-card card', href: `#/spot/${spot.id}`, dataset: { id: spot.id } },
    h('img', { class: 'spot-thumb', src: spotCover(spot), alt: '', loading: 'lazy' }),
    h('div', { class: 'spot-info' },
      h('div', { class: 'spot-top' },
        h('span', { class: `source-badge source-${spot.source}` }, withIcon(SOURCES[spot.source].icon, SOURCES[spot.source].label, { size: 14 })),
        stars(spotRating(spot), spot.reviews.length)),
      h('h3', { class: 'spot-title' }, spot.title,
        spot.verified ? h('span', { class: 'verified-badge verified-sm', title: 'WattWay перевірив точку на місці' }, '✓') : ''),
      h('p', { class: 'spot-meta' }, `${spot.district} · ${String(spot.powerKw).replace('.', ',')} кВт · ${CONNECTORS[spot.connector]}${distanceLabel(spot, origin)}`),
      h('div', { class: 'spot-bottom' },
        h('span', { class: 'spot-price' }, h('b', {}, formatUAH(spot.pricePerKwh)), ' / кВт·год'),
        blackout && isLiveInBlackout(spot)
          ? h('span', { class: 'live-badge' }, spot.pilot ? 'Уточніть у господаря' : withIcon('battery', `ще ~${spot.blackoutHours} год`, { size: 14 }))
          : openingLine(spot, now))));
}

// Головне про господаря у вікні точки: ім'я, перевірка, стаж, статус, канали зв'язку й контакти
// (увійшлим — кнопкою «Показати контакти», див. host-contacts.js).
function hostBlock(spot, card, signedIn, { session, pilot, onRevealed } = {}) {
  const status = availabilityLabel(spot, new Date());
  return h('div', { class: 'popup-host' },
    h('div', {}, 'Господар — ', h('b', {}, card.name)),
    card.verified ? h('span', { class: 'verified-badge verified-sm', title: 'WattWay перевірив особу господаря' }, '✓ Перевірений господар') : '',
    h('div', { class: 'muted' }, hostSince(card.since) ?? ''),
    h('div', { class: `popup-status status-${status.state}` }, status.text),
    hostContacts(card, {
      own: spot.ownerId != null && spot.ownerId === session?.getState?.().user?.uid,
      signedIn,
      reveal: pilot?.revealContacts ? () => pilot.revealContacts(spot.id) : null,
      requireAuth: (reason) => session?.requireAuth?.(() => {}, reason),
      onRevealed,
    }) ?? '',
    card.channels.length ? h('div', { class: 'muted' }, `Зв'язок: ${channelLabels(card.channels).join(', ')}`) : '');
}

function popupContent(spot, host) {
  return h('div', { class: 'popup' },
    h('img', { src: spotCover(spot), alt: '' }),
    h('div', { class: 'popup-body' },
      h('b', {}, spot.title),
      h('div', { class: 'muted' }, `${spot.district} · `, stars(spotRating(spot))),
      spot.pilot && !spot.exactLocation && h('div', { class: 'muted popup-area' }, withIcon('map-pin', `Приблизне місце, ±${AREA_RADIUS_M} м`, { size: 14 })),
      h('div', {}, h('b', {}, formatUAH(spot.pricePerKwh)), ' / кВт·год'),
      host ?? '',
      h('a', { class: 'btn btn-primary btn-sm', href: `#/spot/${spot.id}` }, 'Детальніше')));
}

// Пін публічної станції: інший колір і підпис — потужність, бо ціна невідома.
export function stationPin(station) {
  const kw = station.max_power_kw != null ? `${String(station.max_power_kw).replace('.', ',')} кВт` : 'EV';
  return L.divIcon({
    className: 'pin-wrap',
    html: `<div class="pin pin-public"><span class="pin-icon">${iconSvg('plug', { size: 14 })}</span>${kw}</div>`,
    iconSize: null, iconAnchor: [0, 0],
  });
}

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('uk-UA') : 'невідомо');

// Деталі станції для popup і списку: показуємо лише те, що справді відомо.
function stationDetails(st) {
  const connectors = (st.connectors ?? []).map((c) =>
    `${connectorLabel(c.type)}${c.power_kw != null ? ` ${String(c.power_kw).replace('.', ',')} кВт` : ''}${c.count > 1 ? ` ×${c.count}` : ''}`);
  const row = (label, value) => h('div', { class: 'st-row' }, h('span', { class: 'muted' }, `${label}: `), value);
  return [
    st.address && row('Адреса', st.address),
    st.operator && row('Оператор', st.operator),
    connectors.length ? row("Роз'єми", connectors.join(', ')) : null,
    st.opening_hours && row('Графік', st.opening_hours),
    st.access && row('Доступ', st.access),
    st.price_verified && st.price_per_kwh != null && row('Ціна', `${formatUAH(st.price_per_kwh)} / кВт·год`),
    row('Статус', statusLabel(st)),
    row('Оновлено', fmtDate(st.updated_at)),
    h('div', { class: 'muted st-attr' }, 'Дані: ', attribution(st).join(' · ') || 'публічні джерела'),
  ].filter(Boolean);
}

// Дії станції всередині картки-кнопки: клік і Enter не повинні доходити до самої картки.
const stopInside = (e) => e.stopPropagation();
const stationActions = (st, session) => h('div', { class: 'st-actions', onclick: stopInside, onkeydown: stopInside },
  h('a', { class: 'btn btn-primary btn-sm', href: routeUrl(st), target: '_blank', rel: 'noopener' }, 'Прокласти маршрут'),
  safeUrl(st.operator_url) && h('a', { class: 'btn btn-secondary btn-sm', href: safeUrl(st.operator_url), target: '_blank', rel: 'noopener' }, 'Відкрити в застосунку оператора'),
  session && h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => {
    openReport({ targetType: 'station', targetId: st.id, title: st.name ?? st.operator ?? 'Зарядна станція' }, session); } }, 'Повідомити про проблему'));

function stationPopup(st, session) {
  return h('div', { class: 'popup station-popup' },
    h('div', { class: 'popup-body' },
      h('span', { class: 'source-badge source-public' }, withIcon('plug', 'Публічна станція', { size: 14 })),
      h('b', {}, st.name ?? st.operator ?? 'Зарядна станція'),
      ...stationDetails(st), stationActions(st, session)));
}

function stationCard(st, onShow, origin, session) {
  return h('div', { class: 'spot-card card station-card', role: 'button', tabindex: '0', onclick: onShow,
    onkeydown: (e) => { if (e.key === 'Enter') onShow(); } },
    h('div', { class: 'spot-info' },
      h('span', { class: 'source-badge source-public' }, withIcon('plug', 'Публічна станція', { size: 14 })),
      h('h3', { class: 'spot-title' }, st.name ?? st.operator ?? 'Зарядна станція', distanceLabel(st, origin)),
      ...stationDetails(st), stationActions(st, session)));
}

const ZONE_MIN_ZOOM = 14;

const chip = (label, active, onclick) =>
  h('button', { type: 'button', class: `chip${active ? ' active' : ''}`, 'aria-pressed': String(active), onclick }, label);

export function render(_params, root, store, session, userHistory, pilot) {
  const search = searchBox(store, userHistory, session);
  const list = h('div', { class: 'spot-list' });
  const count = h('p', { class: 'result-count' });
  const banner = h('div', { class: 'blackout-banner', hidden: true },
    h('b', {}, withIcon('zap', 'Режим блекауту.')), h('span', {}, ' Показуємо точки з СЕС і акумуляторами — вони працюють і без світла.'));
  const filtersBox = h('div', { class: 'filters' });
  // На телефоні фільтри згорнуті під цією кнопкою (на десктопі її не видно).
  const filtersToggle = h('button', { type: 'button', class: 'btn btn-secondary btn-sm filters-toggle', 'aria-expanded': 'false',
    onclick: () => { const open = filtersBox.classList.toggle('open'); filtersToggle.setAttribute('aria-expanded', String(open)); } });
  const mapEl = h('div', { class: 'map', id: 'map' });
  const fallback = h('div', { class: 'map-fallback', hidden: true },
    h('span', { class: 'map-fallback-icon' }, icon('map', { size: 40 })),
    h('b', {}, 'Карта недоступна — перевірте інтернет'),
    h('span', { class: 'muted' }, 'Список точок і бронювання працюють і без неї.'));

  let origin = null;          // місцеположення лише в пам'яті сторінки
  let originMarker = null;
  let current = { spots: [], stations: [] };
  let lastDemo = null; // чи був демо-режим (сервер недоступний) при попередньому малюванні
  const geoNote = h('p', { class: 'geo-note muted', role: 'status', hidden: true });
  const setNote = (text) => { geoNote.textContent = text; geoNote.hidden = !text; };
  const viewBtn = h('button', { type: 'button', class: 'btn btn-secondary btn-sm', 'aria-pressed': 'false' });
  const locateBtn = h('button', { type: 'button', class: 'btn btn-secondary btn-sm' }, withIcon('map-pin', 'Моє місце'));
  const nearestBtn = h('button', { type: 'button', class: 'btn btn-primary btn-sm' }, 'Знайти найближчу зарядку');
  const actions = h('div', { class: 'map-actions' }, nearestBtn, locateBtn, viewBtn);

  root.append(h('div', { class: 'map-layout view-map' },
    h('aside', { class: 'map-sidebar' },
      h('h1', { class: 'map-title' }, 'Карта зарядних точок'),
      search.el, actions, geoNote, banner, filtersToggle, filtersBox, count, list),
    h('div', { class: 'map-pane' }, mapEl, fallback)));
  const layout = root.querySelector('.map-layout');

  // ---- Фільтри: будуються один раз, щоб повзунок не губив фокус ----
  const priceLabel = h('span', { class: 'filter-value' });
  const priceInput = h('input', { type: 'range', min: 8, max: 25, step: 1, class: 'range',
    'aria-label': 'Максимальна ціна', oninput: (e) => store.setFilters({ maxPrice: Number(e.target.value) }) });
  const deviceChips = h('div', { class: 'chips' });
  const ratingChips = h('div', { class: 'chips' });
  const nowChip = h('div', { class: 'chips' });
  const connectorChips = h('div', { class: 'chips' });
  const powerChips = h('div', { class: 'chips' });
  const extraChips = h('div', { class: 'chips' });
  const radiusChips = h('div', { class: 'chips' });
  filtersBox.append(
    h('div', { class: 'filter-row' }, h('span', { class: 'filter-label' }, 'Пристрій'), deviceChips),
    h('div', { class: 'filter-row' }, h('span', { class: 'filter-label' }, 'Ціна'), priceInput, priceLabel),
    h('div', { class: 'filter-row' }, h('span', { class: 'filter-label' }, 'Рейтинг'), ratingChips, nowChip),
    h('div', { class: 'filter-row' }, h('span', { class: 'filter-label' }, 'Роз\'єм'), connectorChips),
    h('div', { class: 'filter-row' }, h('span', { class: 'filter-label' }, 'Потужність'), powerChips),
    h('div', { class: 'filter-row' }, h('span', { class: 'filter-label' }, 'Радіус'), radiusChips),
    h('div', { class: 'filter-row' }, h('span', { class: 'filter-label' }, 'Додатково'), extraChips));

  function renderFilters(f) {
    deviceChips.replaceChildren(
      chip('Усі', !f.device, () => store.setFilters({ device: null })),
      ...DEVICES.map((d) => chip(d.label, f.device === d.id, () => store.setFilters({ device: f.device === d.id ? null : d.id }))));
    ratingChips.replaceChildren(
      ...[[0, 'Будь-який'], [4.5, '4,5+'], [4.8, '4,8+']].map(([v, label]) =>
        chip(label, f.minRating === v, () => store.setFilters({ minRating: v }))));
    nowChip.replaceChildren(chip(withIcon('clock', 'Відчинено зараз', { size: 14 }), f.availableNow, () => store.setFilters({ availableNow: !f.availableNow })));
    connectorChips.replaceChildren(...CONNECTOR_FILTERS.map((c) => {
      const on = f.connectors.includes(c.id);
      return chip(c.label, on, () => store.setFilters({ connectors: on ? f.connectors.filter((x) => x !== c.id) : [...f.connectors, c.id] }));
    }));
    powerChips.replaceChildren(...POWER_BANDS.map((b) =>
      chip(b.label, f.power === b.id, () => store.setFilters({ power: f.power === b.id ? null : b.id }))));
    radiusChips.replaceChildren(...RADII.map((km) => {
      const c = chip(`${km} км`, f.radiusKm === km, () => store.setFilters({ radiusKm: f.radiusKm === km ? null : km }));
      c.disabled = !origin;
      c.title = origin ? '' : 'Спершу визначте місцеположення';
      return c;
    }));
    extraChips.replaceChildren(
      chip(withIcon('clock', 'Цілодобово', { size: 14 }), f.only24h, () => store.setFilters({ only24h: !f.only24h })),
      chip(withIcon('battery', 'Доступна під час блекауту', { size: 14 }), f.blackoutReady, () => store.setFilters({ blackoutReady: !f.blackoutReady })));
    if (Number(priceInput.value) !== f.maxPrice) priceInput.value = f.maxPrice;
    priceLabel.textContent = `до ${f.maxPrice} грн`;
    const active = [f.device, f.maxPrice < 25, f.minRating > 0, f.availableNow, f.connectors.length, f.power, f.radiusKm, f.only24h, f.blackoutReady].filter(Boolean).length;
    filtersToggle.replaceChildren(withIcon('sliders', active ? `Фільтри · ${active}` : 'Фільтри'));
  }

  // ---- Карта ----
  let map = null;
  function fitPopup(popup) {
    if (!map) return;
    popup.options.maxHeight = Math.max(160, map.getSize().y - 60);
    popup.update();
    // Зсуваємо карту рівно настільки, наскільки popup вилазить за її край (з відступом 10 px).
    const el = popup.getElement();
    if (!el) return;
    const p = el.getBoundingClientRect();
    const m = map.getContainer().getBoundingClientRect();
    const pad = 10;
    const shift = (start, end, min, max) => (start < min + pad ? start - min - pad : end > max - pad ? end - max + pad : 0);
    const dx = shift(p.left, p.right, m.left, m.right);
    const dy = shift(p.top, p.bottom, m.top, m.bottom);
    if (dx || dy) map.panBy([dx, dy], { animate: false });
  }
  let stationLayer = null;
  let fitAll = () => {};
  let resizeObserver = null;
  let markers = [];
  let zoneLayer = null; // кола приблизних зон — видно лише зблизька, щоб не захаращувати місто
  let tilesLoaded = false;

  if (window.L) {
    map = L.map(mapEl, { zoomControl: true, scrollWheelZoom: true, maxZoom: 19 }).setView(VINNYTSIA_CENTER, 13);
    stationLayer = (L.markerClusterGroup ? L.markerClusterGroup({ maxClusterRadius: 50, disableClusteringAtZoom: 18, chunkedLoading: true }) : L.layerGroup()).addTo(map);
    // На телефоні карта низька: popup не вищий за карту (довгий текст прокручується всередині),
    // і карта зсувається так, щоб popup було видно повністю. Інакше, щоб дочитати текст, людина
    // тягла карту — і popup виїжджав за її край, ніби закривався.
    map.on('popupopen', (e) => fitPopup(e.popup));
    const tiles = L.tileLayer(TILES.url, { attribution: TILES.attribution, maxZoom: 19 }).addTo(map);
    zoneLayer = L.layerGroup();
    const syncZones = () => { if (map.getZoom() >= ZONE_MIN_ZOOM) zoneLayer.addTo(map); else zoneLayer.remove(); };
    map.on('zoomend', syncZones);
    syncZones();
    tiles.on('load', () => { tilesLoaded = true; fallback.hidden = true; });
    tiles.on('tileerror', () => { if (!tilesLoaded) fallback.hidden = false; });
    // Без анімації: якщо піти з карти посеред анімації масштабу, Leaflet падає на вже прибраній карті.
    fitAll = () => {
      const pts = visibleSpots(store.getState().spots, session.getState().status).map((s) => [s.lat, s.lng]);
      if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [28, 28], animate: false });
      else map.setView(VINNYTSIA_CENTER, 12, { animate: false });
    };
    fitAll();
    // Контейнер змінює розмір після верстки й при повороті телефону — Leaflet треба про це сказати.
    // Перший виклик приходить, коли розмір уже справжній, — тоді й підганяємо масштаб.
    let fitted = false;
    resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
      if (!fitted) { fitted = true; fitAll(); }
    });
    resizeObserver.observe(mapEl);
  } else {
    fallback.hidden = false;
    mapEl.hidden = true;
  }

  const highlight = (id, on) => {
    list.querySelector(`[data-id="${id}"]`)?.classList.toggle('highlight', on);
    const m = markers.find((x) => x.spot.id === id && !x.dimmed);
    if (!m) return;
    m.marker.setIcon(spotPin(m.spot, { selected: on }));
    m.marker.setZIndexOffset(on ? 1000 : 0);
  };

  // Картка господаря довантажується при відкритті вікна (кеш + один запит на точку).
  const hostCards = new Map();
  const hostLoads = new Map();
  function privatePopup(spot) {
    const signedIn = session?.getState?.().status === 'signedIn';
    if (!spot.pilot || !pilot?.hostCard) return popupContent(spot);
    const key = `${spot.id}:${signedIn}`; // після входу картка інша — з контактами
    const refit = () => {
      const popup = markers.find((m) => m.spot.id === spot.id && !m.dimmed)?.marker.getPopup();
      if (popup?.isOpen()) fitPopup(popup);
    };
    // Відкриті контакти запам'ятовуємо в кеші картки: повторне відкриття вікна не питає сервер знову.
    const block = (card) => card && hostBlock(spot, card, signedIn, { session, pilot,
      onRevealed: (contacts) => { Object.assign(card, contacts); refit(); } });
    const cached = hostCards.get(key);
    if (cached !== undefined) return popupContent(spot, block(cached));
    const box = h('div', {}, popupContent(spot, h('div', { class: 'popup-host muted' }, 'Завантаження…')));
    if (!hostLoads.has(key)) hostLoads.set(key, pilot.hostCard(spot.id).catch(() => null).finally(() => hostLoads.delete(key)));
    hostLoads.get(key).then((card) => {
      if (destroyed) return;
      if (card) hostCards.set(key, card); // збій не кешуємо — наступне відкриття спробує ще раз
      box.replaceChildren(popupContent(spot, block(card)));
      refit();
    });
    return box;
  }

  function renderMarkers(visible, blackout, spots) {
    if (!map) return;
    markers.forEach((m) => m.marker.remove());
    // Гостю — не точна адреса, а зона: пін стоїть у її центрі, справжня точка десь у колі.
    zoneLayer.clearLayers();
    visible.filter((s) => s.pilot && !s.exactLocation).forEach((s) =>
      L.circle([s.lat, s.lng], { radius: AREA_RADIUS_M, className: 'spot-zone', interactive: false }).addTo(zoneLayer));
    markers = visible.map((spot) => {
      const marker = L.marker([spot.lat, spot.lng], { icon: spotPin(spot), riseOnHover: true })
        .bindPopup(() => privatePopup(spot), { closeButton: false, minWidth: 220 })
        .on('mouseover', () => highlight(spot.id, true))
        .on('mouseout', () => highlight(spot.id, false))
        .addTo(map);
      return { spot, marker };
    });
    if (blackout) {
      spots.filter((s) => !isLiveInBlackout(s)).forEach((spot) => {
        const marker = L.marker([spot.lat, spot.lng], {
          icon: spotPin(spot, { dimmed: true }), interactive: false, keyboard: false, zIndexOffset: -1000,
        }).addTo(map);
        markers.push({ spot, marker, dimmed: true });
      });
    }
  }

  // ---- Публічні станції: окремий шар, не змішується з приватними й демо-точками ----
  let publicStations = [];
  let publicMarkers = [];
  let destroyed = false;
  const showStation = (st) => {
    const m = publicMarkers.find((x) => x.st === st);
    if (!map || !m) return;
    if (view !== 'map') { view = 'map'; paintView(); }
    map.setView([st.lat, st.lng], 18, { animate: false }); // на цьому масштабі кластери вже розгорнуті
    m.marker.openPopup();
  };
  // Знімок містить лише коротке; повну картку (адреса, оператор, джерела) довантажуємо при відкритті.
  const details = new Map();
  const inflight = new Map(); // id → Promise, щоб повторні відкриття не робили зайвих запитів
  function lazyPopup(st, marker) {
    const box = h('div', {}, stationPopup(details.get(st.id) ?? st, session));
    if (st.compact && !details.has(st.id)) {
      box.append(h('p', { class: 'muted st-loading' }, 'Завантаження…'));
      if (!inflight.has(st.id)) inflight.set(st.id, loadStationDetails(st.id).finally(() => inflight.delete(st.id)));
      inflight.get(st.id).then((full) => {
        if (destroyed) return;
        if (full) { details.set(st.id, full); box.replaceChildren(stationPopup(full, session)); }
        else box.querySelector('.st-loading')?.remove(); // лишається коротка картка з маршрутом
        const popup = marker?.getPopup();
        if (popup?.isOpen()) fitPopup(popup); // картка виросла — знову вписуємо її в карту
      });
    }
    return box;
  }
  let markersKey = null;
  function renderPublicMarkers(stations, key) {
    if (!map || key === markersKey) return; // перебудовуємо кластери лише коли змінився набір
    markersKey = key;
    stationLayer.clearLayers();
    publicMarkers = stations.map((st) => {
      const marker = L.marker([st.lat, st.lng], { icon: stationPin(st), zIndexOffset: -100 });
      marker.bindPopup(() => lazyPopup(st, marker), { closeButton: false, minWidth: 240 });
      return { st, marker };
    });
    stationLayer.addLayers ? stationLayer.addLayers(publicMarkers.map((m) => m.marker)) : publicMarkers.forEach((m) => stationLayer.addLayer(m.marker));
  }
  const MAX_STATION_CARDS = 50;

  // ---- Місцеположення й «найближча зарядка» ----
  async function requestLocation() {
    locateBtn.disabled = true;
    nearestBtn.disabled = true;
    let found;
    try {
      found = await locate();
    } catch (e) {
      if (!destroyed) setNote(geoMessage(e.code));
      return false;
    } finally {
      locateBtn.disabled = false;
      nearestBtn.disabled = false;
    }
    if (destroyed) return false;
    {
      origin = found;
      originMarker?.remove();
      if (map) {
        originMarker = L.circleMarker([origin.lat, origin.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 })
          .bindTooltip('Ви тут').addTo(map);
        map.setView([origin.lat, origin.lng], 13, { animate: false });
      }
      setNote('');
    }
    update();
    return true;
  }
  locateBtn.addEventListener('click', requestLocation);

  nearestBtn.addEventListener('click', async () => {
    if (!origin && !(await requestLocation())) return;
    if (destroyed) return;
    const best = nearest([
      ...current.spots.map((spot) => ({ lat: spot.lat, lng: spot.lng, spot })),
      ...current.stations.map((station) => ({ lat: station.lat, lng: station.lng, station }))], origin);
    if (!best) { setNote('Поруч нічого не знайдено — змініть фільтри.'); return; }
    setNote('');
    if (best.station) { showStation(best.station); return; }
    const m = markers.find((x) => x.spot === best.spot && !x.dimmed);
    map?.setView([best.spot.lat, best.spot.lng], 15, { animate: false });
    m?.marker.openPopup();
    list.querySelector(`[data-id="${best.spot.id}"]`)?.scrollIntoView?.({ block: 'nearest' });
  });

  // ---- Перемикач «Карта / Список» ----
  let view = 'map';
  const paintView = () => {
    layout.classList.toggle('view-list', view === 'list');
    layout.classList.toggle('view-map', view === 'map');
    viewBtn.replaceChildren(view === 'map' ? withIcon('list', 'Список') : withIcon('map', 'Карта'));
    viewBtn.setAttribute('aria-pressed', String(view === 'list'));
    if (view === 'map') map?.invalidateSize();
  };
  viewBtn.addEventListener('click', () => { view = view === 'map' ? 'list' : 'map'; paintView(); });
  paintView();

  function update() {
    const { spots: allSpots, filters, blackout } = store.getState();
    // Вигадані демо-точки з імітацією оплати — лише в демо-режимі (сервер недоступний), не поруч зі справжніми.
    const demoMode = session.getState().status === 'demo';
    const spots = visibleSpots(allSpots, session.getState().status);
    const now = new Date();
    const visible = sortByDistance(filterSpots(spots, filters, { blackout, now })
      .filter((s) => matchSpotExtra(s, filters, { origin })), origin);
    const q = normalizeQuery(filters.query);
    const stations = publicStations.filter((st) => matchStation(st, filters, { origin, blackout })
      && (!q || normalizeQuery([st.name, st.address, st.operator].filter(Boolean).join(' ')).includes(q)));
    current = { spots: visible, stations };

    renderFilters(filters);
    search.update(filters);
    banner.hidden = !blackout;
    count.textContent = resultsLabel(visible.length, stations.length);

    lastList = { visible, stations, blackout, now };
    renderList();

    renderMarkers(visible, blackout, spots);
    renderPublicMarkers(stations, `${publicStations.length}|${stations.length}|${JSON.stringify(filters)}|${blackout}|${origin?.lat},${origin?.lng}`);
    if (lastDemo !== null && lastDemo !== demoMode) fitAll();
    lastDemo = demoMode;
  }

  // Список зліва окремо від маркерів: при переміщенні карти змінюються лише «50 найближчих»,
  // а маркери приватних точок не перестворюються (інакше закривався б відкритий popup).
  let lastList = null;
  function renderList() {
    if (!lastList) return;
    const { visible, stations, blackout, now } = lastList;
    // У списку — до 50 найближчих до мого місця або до центру карти (по всій Україні їх тисячі).
    const center = origin ?? (map ? map.getCenter() : null);
    const shown = nearestN(stations, center && { lat: center.lat, lng: center.lng }, MAX_STATION_CARDS);
    const stationCards = shown.map((st) => stationCard(details.get(st.id) ?? st, () => showStation(st), origin, session));
    if (stations.length > MAX_STATION_CARDS) stationCards.push(h('p', { class: 'muted' }, `Показано ${MAX_STATION_CARDS} найближчих із ${stations.length}.`));
    loadListDetails(shown);
    list.replaceChildren(...(visible.length || stationCards.length
      ? [...visible.map((spot) => {
        const card = spotCard(spot, { blackout, now, origin });
        card.addEventListener('mouseenter', () => highlight(spot.id, true));
        card.addEventListener('mouseleave', () => highlight(spot.id, false));
        return card;
      }), ...stationCards]
      : [h('div', { class: 'empty card' },
        h('img', { src: 'assets/phone-map.jpg', alt: '', class: 'empty-img' }),
        h('h3', {}, 'Нічого не знайдено'),
        h('p', { class: 'muted' }, 'Спробуйте змінити фільтри — поруч точно є розетка.'),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => store.resetFilters() }, 'Скинути фільтри'))]));
  }

  // Повні картки для видимих у списку станцій — одним запитом; потім список перемальовується.
  let listDetailsKey = '';
  function loadListDetails(shown) {
    const missing = shown.filter((st) => st.compact && !details.has(st.id)).map((st) => st.id);
    const key = missing.join(',');
    if (!missing.length || key === listDetailsKey) return;
    listDetailsKey = key;
    loadStationsDetails(missing).then((found) => {
      if (destroyed || !found.size) return;
      found.forEach((row, id) => details.set(id, row));
      renderList();
    });
  }

  if (store.getState().filters.radiusKm) store.setFilters({ radiusKm: null }); // без місцеположення радіус не діє
  update();
  loadPublicStations().then((rows) => {
    if (destroyed || !rows.length) return;
    publicStations = rows;
    map?.attributionControl.addAttribution('Станції: © Open Charge Map (CC BY 4.0), © OpenStreetMap contributors (ODbL)');
    update();
  });
  const unsubscribe = store.subscribe(update);
  // Перейшли в демо-режим чи увійшли (з'явилися точні місця своїх точок) — перемальовуємо.
  const offSession = session.subscribe(update);
  // Список найближчих станцій іде за центром карти; маркери при цьому не перебудовуються.
  let moveTimer = null;
  map?.on('moveend', () => { clearTimeout(moveTimer); moveTimer = setTimeout(() => { if (!destroyed && !origin) renderList(); }, 250); });
  return () => {
    clearTimeout(moveTimer);
    destroyed = true;
    unsubscribe();
    offSession();
    search.destroy();
    resizeObserver?.disconnect();
    map?.remove();
  };
}
