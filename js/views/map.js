// Карта і список точок — шлях Саші, частина 1.
import { h, stars, spotCover, plural } from '../ui.js';
import { filterSpots, spotRating, isLiveInBlackout, isOpenAt, normalizeQuery } from '../filters.js';
import { RADII, POWER_BANDS, CONNECTOR_FILTERS, distanceKm, matchSpotExtra, matchStation, sortByDistance, nearest, resultsLabel } from '../map-filters.js';
import { locate, geoMessage } from '../geolocate.js';
import { formatUAH } from '../pricing.js';
import { DEVICES, SOURCES, CONNECTORS, VINNYTSIA_CENTER } from '../data.js';
import { searchBox } from './search-box.js';
import { loadPublicStations, routeUrl, statusLabel, attribution, connectorLabel, spotKind, safeUrl } from '../stations.js';

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
    html: `<div class="${cls}"><span class="pin-icon">${SOURCES[spot.source].icon}</span>${label}</div>`,
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
        h('span', { class: `source-badge source-${spot.source}` }, `${SOURCES[spot.source].icon} ${SOURCES[spot.source].label}`),
        stars(spotRating(spot), spot.reviews.length)),
      h('h3', { class: 'spot-title' }, spot.title, spot.pilot ? ' · Пілот' : ''),
      h('p', { class: 'spot-meta' }, `${spot.district} · ${String(spot.powerKw).replace('.', ',')} кВт · ${CONNECTORS[spot.connector]}${distanceLabel(spot, origin)}`),
      h('div', { class: 'spot-bottom' },
        h('span', { class: 'spot-price' }, h('b', {}, formatUAH(spot.pricePerKwh)), ' / кВт·год'),
        blackout && isLiveInBlackout(spot)
          ? h('span', { class: 'live-badge' }, spot.pilot ? 'Уточніть у господаря' : `🔋 ще ~${spot.blackoutHours} год`)
          : openingLine(spot, now))));
}

function popupContent(spot) {
  return h('div', { class: 'popup' },
    h('img', { src: spotCover(spot), alt: '' }),
    h('div', { class: 'popup-body' },
      h('b', {}, spot.title, spot.pilot ? ' · Пілот' : ''),
      h('div', { class: 'muted' }, `${spot.district} · `, stars(spotRating(spot))),
      h('div', {}, h('b', {}, formatUAH(spot.pricePerKwh)), ' / кВт·год'),
      h('a', { class: 'btn btn-primary btn-sm', href: `#/spot/${spot.id}` }, 'Детальніше')));
}

// Пін публічної станції: інший колір і підпис — потужність, бо ціна невідома.
export function stationPin(station) {
  const kw = station.max_power_kw != null ? `${String(station.max_power_kw).replace('.', ',')} кВт` : 'EV';
  return L.divIcon({
    className: 'pin-wrap',
    html: `<div class="pin pin-public"><span class="pin-icon">🔌</span>${kw}</div>`,
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

const stationActions = (st) => h('div', { class: 'st-actions' },
  h('a', { class: 'btn btn-primary btn-sm', href: routeUrl(st), target: '_blank', rel: 'noopener' }, 'Прокласти маршрут'),
  safeUrl(st.operator_url) && h('a', { class: 'btn btn-secondary btn-sm', href: safeUrl(st.operator_url), target: '_blank', rel: 'noopener' }, 'Відкрити в застосунку оператора'));

function stationPopup(st) {
  return h('div', { class: 'popup station-popup' },
    h('div', { class: 'popup-body' },
      h('span', { class: 'source-badge source-public' }, '🔌 Публічна станція'),
      h('b', {}, st.name ?? st.operator ?? 'Зарядна станція'),
      ...stationDetails(st), stationActions(st)));
}

function stationCard(st, onShow, origin) {
  return h('div', { class: 'spot-card card station-card', role: 'button', tabindex: '0', onclick: onShow,
    onkeydown: (e) => { if (e.key === 'Enter') onShow(); } },
    h('div', { class: 'spot-info' },
      h('span', { class: 'source-badge source-public' }, '🔌 Публічна станція'),
      h('h3', { class: 'spot-title' }, st.name ?? st.operator ?? 'Зарядна станція', distanceLabel(st, origin)),
      ...stationDetails(st)));
}

const chip = (label, active, onclick) =>
  h('button', { type: 'button', class: `chip${active ? ' active' : ''}`, 'aria-pressed': String(active), onclick }, label);

export function render(_params, root, store, _session, userHistory) {
  const search = searchBox(store, userHistory);
  const list = h('div', { class: 'spot-list' });
  const count = h('p', { class: 'result-count' });
  const banner = h('div', { class: 'blackout-banner', hidden: true },
    h('b', {}, '⚡ У вашому районі немає світла з 14:00'), h('span', {}, ' (демо). Показуємо точки з СЕС і батареями — вони працюють і зараз.'));
  const filtersBox = h('div', { class: 'filters' });
  // На телефоні фільтри згорнуті під цією кнопкою (на десктопі її не видно).
  const filtersToggle = h('button', { type: 'button', class: 'btn btn-secondary btn-sm filters-toggle', 'aria-expanded': 'false',
    onclick: () => { const open = filtersBox.classList.toggle('open'); filtersToggle.setAttribute('aria-expanded', String(open)); } });
  const mapEl = h('div', { class: 'map', id: 'map' });
  const fallback = h('div', { class: 'map-fallback', hidden: true },
    h('span', { class: 'map-fallback-icon' }, '🗺️'),
    h('b', {}, 'Карта недоступна — перевірте інтернет'),
    h('span', { class: 'muted' }, 'Список точок і бронювання працюють і без неї.'));

  let origin = null;          // місцеположення лише в пам'яті сторінки
  let originMarker = null;
  let current = { spots: [], stations: [] };
  let lastDemo = null;
  const geoNote = h('p', { class: 'geo-note muted', role: 'status', hidden: true });
  const setNote = (text) => { geoNote.textContent = text; geoNote.hidden = !text; };
  const viewBtn = h('button', { type: 'button', class: 'btn btn-secondary btn-sm', 'aria-pressed': 'false' });
  const locateBtn = h('button', { type: 'button', class: 'btn btn-secondary btn-sm' }, '📍 Моє місце');
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
  const demoChip = h('div', { class: 'chips' });
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
    h('div', { class: 'filter-row' }, h('span', { class: 'filter-label' }, 'Додатково'), extraChips),
    h('div', { class: 'filter-row' }, h('span', { class: 'filter-label' }, 'Точки'), demoChip));

  function renderFilters(f, demoMode) {
    demoChip.replaceChildren(chip('🧪 Демо-точки', demoMode, () => store.setDemoMode(!demoMode)));
    deviceChips.replaceChildren(
      chip('Усі', !f.device, () => store.setFilters({ device: null })),
      ...DEVICES.map((d) => chip(d.label, f.device === d.id, () => store.setFilters({ device: f.device === d.id ? null : d.id }))));
    ratingChips.replaceChildren(
      ...[[0, 'Будь-який'], [4.5, '4,5+'], [4.8, '4,8+']].map(([v, label]) =>
        chip(label, f.minRating === v, () => store.setFilters({ minRating: v }))));
    nowChip.replaceChildren(chip('🕒 Відчинено зараз', f.availableNow, () => store.setFilters({ availableNow: !f.availableNow })));
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
      chip('🕐 Цілодобово', f.only24h, () => store.setFilters({ only24h: !f.only24h })),
      chip('🔋 Доступна під час блекауту', f.blackoutReady, () => store.setFilters({ blackoutReady: !f.blackoutReady })));
    if (Number(priceInput.value) !== f.maxPrice) priceInput.value = f.maxPrice;
    priceLabel.textContent = `до ${f.maxPrice} грн`;
    const active = [f.device, f.maxPrice < 25, f.minRating > 0, f.availableNow, f.connectors.length, f.power, f.radiusKm, f.only24h, f.blackoutReady].filter(Boolean).length;
    filtersToggle.textContent = active ? `⚙️ Фільтри · ${active}` : '⚙️ Фільтри';
  }

  // ---- Карта ----
  let map = null;
  let stationLayer = null;
  let fitAll = () => {};
  let resizeObserver = null;
  let markers = [];
  let tilesLoaded = false;

  if (window.L) {
    map = L.map(mapEl, { zoomControl: true, scrollWheelZoom: true, maxZoom: 19 }).setView(VINNYTSIA_CENTER, 13);
    stationLayer = (L.markerClusterGroup ? L.markerClusterGroup({ maxClusterRadius: 50 }) : L.layerGroup()).addTo(map);
    const tiles = L.tileLayer(TILES.url, { attribution: TILES.attribution, maxZoom: 19 }).addTo(map);
    tiles.on('load', () => { tilesLoaded = true; fallback.hidden = true; });
    tiles.on('tileerror', () => { if (!tilesLoaded) fallback.hidden = false; });
    // Без анімації: якщо піти з карти посеред анімації масштабу, Leaflet падає на вже прибраній карті.
    fitAll = () => {
      const { spots, demoMode } = store.getState();
      const pts = (demoMode ? spots : spots.filter((s) => spotKind(s) === 'private')).map((s) => [s.lat, s.lng]);
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

  function renderMarkers(visible, blackout, spots) {
    if (!map) return;
    markers.forEach((m) => m.marker.remove());
    markers = visible.map((spot) => {
      const marker = L.marker([spot.lat, spot.lng], { icon: spotPin(spot), riseOnHover: true })
        .bindPopup(() => popupContent(spot), { closeButton: false, minWidth: 220 })
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
    if (stationLayer.zoomToShowLayer) stationLayer.zoomToShowLayer(m.marker, () => m.marker.openPopup());
    else { map.setView([st.lat, st.lng], Math.max(map.getZoom(), 15), { animate: false }); m.marker.openPopup(); }
  };
  function renderPublicMarkers(stations) {
    if (!map) return;
    stationLayer.clearLayers();
    publicMarkers = stations.map((st) => ({ st, marker: L.marker([st.lat, st.lng], { icon: stationPin(st), zIndexOffset: -100 })
      .bindPopup(() => stationPopup(st), { closeButton: false, minWidth: 240 }) }));
    stationLayer.addLayers ? stationLayer.addLayers(publicMarkers.map((m) => m.marker)) : publicMarkers.forEach((m) => stationLayer.addLayer(m.marker));
  }
  const MAX_STATION_CARDS = 200;

  // ---- Місцеположення й «найближча зарядка» ----
  async function requestLocation() {
    locateBtn.disabled = true;
    try {
      origin = await locate();
      originMarker?.remove();
      if (map) {
        originMarker = L.circleMarker([origin.lat, origin.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 })
          .bindTooltip('Ви тут').addTo(map);
        map.setView([origin.lat, origin.lng], 13, { animate: false });
      }
      setNote('');
      update();
      return true;
    } catch (e) {
      setNote(geoMessage(e.code));
      return false;
    } finally {
      locateBtn.disabled = false;
    }
  }
  locateBtn.addEventListener('click', requestLocation);

  nearestBtn.addEventListener('click', async () => {
    if (!origin && !(await requestLocation())) return;
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
    viewBtn.textContent = view === 'map' ? '📋 Список' : '🗺️ Карта';
    viewBtn.setAttribute('aria-pressed', String(view === 'list'));
    if (view === 'map') map?.invalidateSize();
  };
  viewBtn.addEventListener('click', () => { view = view === 'map' ? 'list' : 'map'; paintView(); });
  paintView();

  function update() {
    const { spots: allSpots, filters, blackout, demoMode } = store.getState();
    const spots = demoMode ? allSpots : allSpots.filter((s) => spotKind(s) === 'private');
    const now = new Date();
    const visible = sortByDistance(filterSpots(spots, filters, { blackout, now })
      .filter((s) => matchSpotExtra(s, filters, { origin })), origin);
    const q = normalizeQuery(filters.query);
    const stations = sortByDistance(publicStations.filter((st) => matchStation(st, filters, { origin, blackout })
      && (!q || normalizeQuery(`${st.name} ${st.address} ${st.operator}`).includes(q))), origin);
    current = { spots: visible, stations };

    renderFilters(filters, demoMode);
    search.update(filters);
    banner.hidden = !blackout;
    count.textContent = resultsLabel(visible.length, stations.length);

    const stationCards = stations.slice(0, MAX_STATION_CARDS).map((st) => stationCard(st, () => showStation(st), origin));
    if (stations.length > MAX_STATION_CARDS) stationCards.push(h('p', { class: 'muted' }, `Показано перші ${MAX_STATION_CARDS} — уточніть фільтри.`));
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

    renderMarkers(visible, blackout, spots);
    renderPublicMarkers(stations);
    if (lastDemo !== null && lastDemo !== demoMode) fitAll();
    lastDemo = demoMode;
  }

  update();
  loadPublicStations().then((rows) => {
    if (destroyed || !rows.length) return;
    publicStations = rows;
    map?.attributionControl.addAttribution('Станції: © Open Charge Map (CC BY 4.0), © OpenStreetMap contributors (ODbL)');
    update();
  });
  const unsubscribe = store.subscribe(update);
  return () => {
    destroyed = true;
    unsubscribe();
    search.destroy();
    resizeObserver?.disconnect();
    map?.remove();
  };
}
