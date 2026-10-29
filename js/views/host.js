// Кабінет господаря — шлях Олега.
import { h, openModal, toast, formatDate, stars, spotCover, plural } from '../ui.js';
import { hostSummary, bookingHostAmount } from '../stats.js';
import { validateSpotInput } from '../validate.js';
import { formatUAH, formatKwh } from '../pricing.js';
import { DEMO_HOST_ID, DEVICES, SOURCES, CONNECTORS, VINNYTSIA_CENTER, SPOTS } from '../data.js';
import { spotRating } from '../filters.js';
import { TILES } from './map.js';
import { signInPrompt } from './auth-modal.js';

const STATUS = {
  pending: ['Очікує підтвердження', 'badge-warn'],
  held: ['Підтверджено', 'badge-info'],
  charging: ['Заряджається', 'badge-info'],
  paid: ['Оплачено', 'badge-ok'],
  reviewed: ['Оплачено · є відгук', 'badge-ok'],
  declined: ['Відхилено', 'badge-muted'],
};
const DISTRICTS = [...new Set(SPOTS.map((s) => s.district))].sort((a, b) => a.localeCompare(b, 'uk'));
const MONTH_NAMES = ['січень', 'лютий', 'березень', 'квітень', 'травень', 'червень', 'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень'];

function tile(label, value, note) {
  return h('div', { class: 'stat card' },
    h('span', { class: 'stat-label' }, label),
    h('b', { class: 'stat-value' }, value),
    note && h('span', { class: 'stat-note' }, note));
}

function chart(months) {
  const max = Math.max(...months.map((m) => m.earned), 1);
  return h('div', { class: 'bars' }, months.map((m, i) =>
    h('div', { class: `bar-col${i === months.length - 1 ? ' current' : ''}` },
      h('span', { class: 'bar-value' }, formatUAH(Math.round(m.earned))),
      h('div', { class: 'bar-track' },
        h('div', { class: 'bar', style: { height: `${Math.max(2, (m.earned / max) * 100)}%` } })),
      h('span', { class: 'bar-label' }, m.label))));
}

function bookingRow(b, spot, store) {
  const [label, cls] = STATUS[b.status];
  const device = DEVICES.find((d) => d.id === b.device)?.label;
  const done = b.status === 'paid' || b.status === 'reviewed';
  const amount = bookingHostAmount(b, spot);
  return h('li', { class: 'booking' },
    h('span', { class: 'avatar avatar-sm' }, b.guestName[0]),
    h('div', { class: 'booking-main' },
      h('div', {}, h('b', {}, b.guestName), h('span', { class: 'muted' }, ` · ${device}`)),
      h('div', { class: 'muted booking-meta' }, `${spot.title} · ${formatDate(b.date)}, ${b.start} · ${b.hours} год`),
      h('span', { class: `badge ${cls}` }, label)),
    h('div', { class: 'booking-side' },
      h('b', {}, amount == null ? '—' : done ? `+${formatUAH(amount)}` : `≈ ${formatUAH(amount)}`),
      h('span', { class: 'muted' }, formatKwh(done ? b.actualKwh : b.estimatedKwh)),
      b.status === 'pending' && h('div', { class: 'booking-actions' },
        h('button', { type: 'button', class: 'btn btn-ok btn-sm', onclick: () => {
          store.confirmBooking(b.id);
          toast(`Бронювання підтверджено — ${b.guestName}, ${formatDate(b.date)} о ${b.start}`);
        } }, 'Підтвердити'),
        h('button', { type: 'button', class: 'btn btn-danger-ghost btn-sm', onclick: () => store.declineBooking(b.id) }, 'Відхилити'))));
}

function ownSpotCard(spot) {
  return h('a', { class: 'own-spot card', href: `#/spot/${spot.id}` },
    h('img', { src: spotCover(spot), alt: '' }),
    h('div', { class: 'own-spot-body' },
      h('span', { class: `source-badge source-${spot.source}` }, `${SOURCES[spot.source].icon} ${SOURCES[spot.source].label}`),
      h('b', {}, spot.title),
      h('span', { class: 'muted' }, `${formatUAH(spot.pricePerKwh)} / кВт·год · `, stars(spotRating(spot), spot.reviews.length))));
}

// ---- Форма «Додати розетку» ----
function openAddSpot(store, hostName) {
  const input = {
    title: '', district: 'Вишенька', lat: null, lng: null, source: 'solar', connector: 'type2',
    powerKw: 7.4, pricePerKwh: 11, devices: ['ev', 'ecoflow', 'gadget'], schedule: { from: '08:00', to: '20:00' },
  };
  const errorEls = {};
  const err = (key) => (errorEls[key] = h('span', { class: 'field-error', hidden: true }));
  const field = (label, control, key, hint) =>
    h('label', { class: 'form-field' }, h('span', { class: 'field-label' }, label), control,
      hint && h('span', { class: 'hint' }, hint), key && err(key));

  const choiceGroup = (options, isActive, onPick) => {
    const box = h('div', { class: 'chips' });
    const draw = () => box.replaceChildren(...options.map(([value, label]) =>
      h('button', { type: 'button', class: `chip${isActive(value) ? ' active' : ''}`, onclick: () => { onPick(value); draw(); } }, label)));
    draw();
    return box;
  };

  const mapEl = h('div', { class: 'mini-map' });
  const coordsNote = h('span', { class: 'hint' }, 'Клікніть на карті, де знаходиться розетка');
  const num = (key, attrs) => h('input', { class: 'input', type: 'number', value: input[key], ...attrs,
    oninput: (e) => { input[key] = e.target.value === '' ? NaN : Number(e.target.value); } });
  const time = (key) => h('input', { class: 'input', type: 'time', step: 3600, value: input.schedule[key],
    oninput: (e) => { input.schedule = { ...input.schedule, [key]: e.target.value }; } });

  const form = h('form', { class: 'wizard add-form', novalidate: true, onsubmit: submit },
    h('p', { class: 'eyebrow' }, 'Кабінет господаря'),
    h('h2', {}, 'Додати розетку'),
    h('div', { class: 'form-field' }, h('span', { class: 'field-label' }, 'Де вона?'), mapEl, coordsNote, err('location')),
    h('div', { class: 'form-grid' },
      field('Назва', h('input', { class: 'input', type: 'text', placeholder: 'Напр.: Гараж з розеткою 220 В',
        oninput: (e) => { input.title = e.target.value; } }), 'title'),
      field('Район', h('select', { class: 'input', onchange: (e) => { input.district = e.target.value; } },
        DISTRICTS.map((d) => h('option', { value: d, selected: d === input.district }, d)))),
      field('Потужність, кВт', num('powerKw', { min: 0.5, max: 22, step: 0.1 }), 'powerKw'),
      field('Ціна, грн за кВт·год', num('pricePerKwh', { min: 5, max: 25, step: 0.5 }), 'pricePerKwh', '8–15 грн — середня ціна в місті'),
      field('Підключення', h('select', { class: 'input', onchange: (e) => { input.connector = e.target.value; } },
        Object.entries(CONNECTORS).map(([v, label]) => h('option', { value: v, selected: v === input.connector }, label))), 'connector'),
      h('div', { class: 'form-field' }, h('span', { class: 'field-label' }, 'Графік'),
        h('div', { class: 'time-row' }, time('from'), h('span', {}, '—'), time('to')), err('schedule'))),
    h('div', { class: 'form-field' }, h('span', { class: 'field-label' }, 'Джерело енергії'),
      choiceGroup(Object.entries(SOURCES).map(([v, s]) => [v, `${s.icon} ${s.label}`]), (v) => input.source === v, (v) => { input.source = v; }),
      err('source')),
    h('div', { class: 'form-field' }, h('span', { class: 'field-label' }, 'Які пристрої можна заряджати'),
      choiceGroup(DEVICES.map((d) => [d.id, d.label]), (v) => input.devices.includes(v), (v) => {
        input.devices = input.devices.includes(v) ? input.devices.filter((x) => x !== v) : [...input.devices, v];
      }),
      err('devices')),
    h('div', { class: 'wizard-actions' },
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => modal.close() }, 'Скасувати'),
      h('button', { type: 'submit', class: 'btn btn-primary btn-lg' }, 'Додати на карту')));

  let map = null;
  const modal = openModal(form, { className: 'modal-wide', onClose: () => map?.remove() });

  function setPoint(lat, lng) {
    input.lat = Math.round(lat * 10000) / 10000;
    input.lng = Math.round(lng * 10000) / 10000;
    coordsNote.textContent = `📍 ${input.lat}, ${input.lng}`;
    errorEls.location.hidden = true;
  }

  if (window.L) {
    map = L.map(mapEl).setView(VINNYTSIA_CENTER, 12);
    L.tileLayer(TILES.url, { attribution: TILES.attribution, maxZoom: 19 }).addTo(map);
    let marker = null;
    map.on('click', (e) => {
      setPoint(e.latlng.lat, e.latlng.lng);
      if (marker) marker.setLatLng(e.latlng);
      else marker = L.marker(e.latlng, { icon: L.divIcon({ className: 'pin-wrap', html: '<div class="pin pin-solar"><span class="pin-icon">📍</span>Тут</div>', iconSize: null }) }).addTo(map);
    });
    setTimeout(() => map.invalidateSize(), 50);
  } else {
    mapEl.replaceChildren(h('div', { class: 'map-fallback' },
      h('b', {}, 'Карта недоступна'),
      h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => setPoint(...VINNYTSIA_CENTER) }, 'Поставити в центр Вінниці')));
  }

  function submit(e) {
    e.preventDefault();
    const { ok, errors } = validateSpotInput(input);
    for (const [key, el] of Object.entries(errorEls)) {
      el.hidden = !errors[key];
      el.textContent = errors[key] ?? '';
    }
    if (!ok) {
      form.querySelector('.field-error:not([hidden])')?.closest('.form-field')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    store.addSpot({ ...input, title: input.title.trim(), hostName });
    modal.close();
    toast('Розетку додано — її вже видно на карті гостей');
  }
}

export function render(_params, root, store, session) {
  function update() {
    const { status } = session.getState();
    if (status === 'loading') {
      root.replaceChildren(h('div', { class: 'container gate muted' }, 'Завантаження…'));
      return;
    }
    if (status !== 'signedIn' && status !== 'demo') {
      root.replaceChildren(signInPrompt({
        title: 'Кабінет господаря доступний після входу',
        text: 'Увійдіть, щоб додавати свої розетки й бачити бронювання гостей.',
        reason: 'Увійдіть, щоб відкрити кабінет господаря',
      }, session));
      return;
    }
    const signedIn = status === 'signedIn';
    const addSpot = () => openAddSpot(store, signedIn ? session.currentName() : undefined);
    const state = store.getState();
    const host = state.hosts.find((x) => x.id === DEMO_HOST_ID);
    const now = new Date();
    const s = hostSummary(state, DEMO_HOST_ID, now);
    const spotById = Object.fromEntries(state.spots.map((sp) => [sp.id, sp]));
    const pending = s.bookings.filter((b) => b.status === 'pending').length;

    root.replaceChildren(h('div', { class: 'container host-page' },
      h('div', { class: 'host-head' },
        h('div', {},
          h('h1', {}, `Вітаємо, ${signedIn ? session.currentName() : host.vocative ?? host.name}! 👋`),
          h('p', { class: 'lead' }, 'Ваша сонячна станція заробляє, поки ви займаєтесь своїми справами.')),
        h('button', { type: 'button', class: 'btn btn-primary btn-lg', onclick: addSpot }, '+ Додати розетку')),
      signedIn && h('p', { class: 'demo-note' },
        '🧪 Демо-кабінет: статистика — приклад господаря Олега з Вишеньки. Розетки, які ви додасте, з\'являться тут.'),

      h('div', { class: 'stats' },
        tile(`Заробіток за ${MONTH_NAMES[now.getMonth()]}`, formatUAH(s.monthEarned), 'після комісії сервісу'),
        tile('Зарядок', String(s.charges), `${s.spots.length} ${plural(s.spots.length, ['точка', 'точки', 'точок'])} на карті`),
        tile('Рейтинг', `★ ${String(s.rating).replace('.', ',')}`, 'середній по відгуках'),
        tile('Продано енергії', formatKwh(s.kwhSold), 'замість віддати мережі задарма')),

      h('div', { class: 'host-grid' },
        h('section', { class: 'card panel' },
          h('h2', { class: 'panel-title' }, 'Заробіток за пів року'),
          chart(s.months),
          h('div', { class: 'payback' },
            h('div', { class: 'payback-head' }, h('span', {}, '☀️ Окупність СЕС'), h('b', {}, `${String(s.paybackPct).replace('.', ',')}%`)),
            h('div', { class: 'progress' }, h('div', { class: 'progress-fill', style: { width: `${Math.min(100, s.paybackPct)}%` } })),
            h('span', { class: 'hint' }, `з ${formatUAH(host.sesCost)} вкладених у станцію`))),
        h('section', { class: 'card panel' },
          h('h2', { class: 'panel-title' }, 'Бронювання',
            pending > 0 && h('span', { class: 'badge badge-warn' }, `${pending} ${plural(pending, ['новий запит', 'нові запити', 'нових запитів'])}`)),
          h('ul', { class: 'bookings' }, s.bookings.map((b) => bookingRow(b, spotById[b.spotId], store))))),

      h('h2', { class: 'own-title' }, 'Мої точки'),
      h('div', { class: 'own-spots' },
        s.spots.map(ownSpotCard),
        h('button', { type: 'button', class: 'own-spot add-card', onclick: addSpot },
          h('span', { class: 'add-plus' }, '+'), 'Додати розетку'))));
  }
  update();
  const offStore = store.subscribe(update);
  const offSession = session.subscribe(update);
  return () => { offStore(); offSession(); };
}
