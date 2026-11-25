// Кабінет господаря — шлях Олега.
import { h, openModal, formatDate, stars, spotCover, plural } from '../ui.js';
import { notify } from '../notifications.js';
import { hostSummary, bookingHostAmount } from '../stats.js';
import { validateSpotForm, validatePhone } from '../validate.js';
import { formatUAH, formatKwh } from '../pricing.js';
import { DEMO_HOST_ID, DEVICES, SOURCES, CONNECTORS, VINNYTSIA_CENTER, SPOTS, VOLTAGES, TERRITORIES,
  SES_TYPES, PARKING_TYPES, EVSE_CONNECTORS, SOCKET_CONNECTORS } from '../data.js';
import { spotRating } from '../filters.js';
import { TILES, spotPin } from './map.js';
import { hostRating, ratingLabel } from '../trust.js';
import { signInPrompt } from './auth-modal.js';
import { kyivNow, addDays, isoWeekday } from '../calendar.js';
import { checkPhotos, resizeImage, PHOTO_LIMITS } from '../photos.js';
import { hiddenNotice } from './hidden-notice.js';
import { icon, iconSvg, withIcon } from '../icons.js';
import { CONTACT_CHANNELS } from '../host-profile.js';

const WEEKDAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

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
          notify(`Бронювання підтверджено — ${b.guestName}, ${formatDate(b.date)} о ${b.start}`);
        } }, 'Підтвердити'),
        h('button', { type: 'button', class: 'btn btn-danger-ghost btn-sm', onclick: () => store.declineBooking(b.id) }, 'Відхилити'))));
}

function ownSpotCard(spot) {
  return h('a', { class: 'own-spot card', href: `#/spot/${spot.id}` },
    h('img', { src: spotCover(spot), alt: '' }),
    h('div', { class: 'own-spot-body' },
      h('span', { class: `source-badge source-${spot.source}` }, withIcon(SOURCES[spot.source].icon, SOURCES[spot.source].label, { size: 14 })),
      h('b', {}, spot.title),
      h('span', { class: 'muted' }, `${formatUAH(spot.pricePerKwh)} / кВт·год · `, stars(spotRating(spot), spot.reviews.length))));
}

// ---- Анкета точки «Додати точку» / «Редагувати точку» (15 полів, docs/host-data.md) ----
// existing — точка для редагування. publish зберігає (для нової точки повертає її id).
// pilot і session — лише для реального акаунта: контакти й фото господаря, фото об'єкта, робочі дні.
let savedContact = null; // збережені контакти: сесія тримає їх старими до наступного входу (лише для того ж акаунта — uid)

export function openAddSpot(store, hostName, publish, existing = null, { pilot = null, session = null } = {}) {
  const live = Boolean(publish && pilot && session);
  const creating = !existing;
  const ed = existing?.details ?? {};
  const input = existing
    ? { title: existing.title, district: existing.district, lat: existing.lat, lng: existing.lng, source: existing.source,
      connector: existing.connector, powerKw: existing.powerKw, pricePerKwh: existing.pricePerKwh,
      devices: [...existing.devices], schedule: { ...existing.schedule }, details: { ...ed } }
    : {
      title: '', district: '', lat: null, lng: null, source: 'solar', connector: null,
      powerKw: NaN, pricePerKwh: 11, devices: ['ev', 'ecoflow', 'gadget'], schedule: { from: '08:00', to: '20:00' },
      details: {},
    };
  input.hasBattery = ed.storageKwh > 0 ? true : ed.storageKwh === 0 ? false : null;
  let closed = []; // неробочі дні тижня (1 — пн … 7 — нд); лише для нової точки, далі — кнопка «Графік»
  let photoFiles = [];

  // ---- Господар ----
  const { user, profile } = session?.getState() ?? {};
  const initialContact = (savedContact?.uid === user?.uid ? savedContact : null) ?? {
    firstName: user?.firstName ?? '', lastName: user?.lastName ?? '',
    phone: profile?.phone ?? '', avatarPath: profile?.avatar_path ?? null,
    channels: [...(profile?.contact_channels ?? [])],
  };
  const contact = { ...initialContact };
  let avatarBlob = null;

  const errorEls = {};
  const err = (key) => (errorEls[key] = h('span', { class: 'field-error', hidden: true }));
  const req = (label) => [label, h('span', { class: 'req', 'aria-hidden': 'true' }, ' *')];
  const field = (label, control, key, hint) =>
    h('label', { class: 'form-field' }, h('span', { class: 'field-label' }, label), control,
      hint && h('span', { class: 'hint' }, hint), key && err(key));
  const group = (label, control, key, hint) =>
    h('div', { class: 'form-field' }, h('span', { class: 'field-label' }, label), control,
      hint && h('span', { class: 'hint' }, hint), key && err(key));

  // Чипи з перемальовуванням: варіанти можуть залежати від інших полів (напр., конектори від EVSE).
  const chips = (options, isActive, onPick) => {
    const box = h('div', { class: 'chips' });
    const draw = () => box.replaceChildren(...options().map(([value, label]) =>
      h('button', { type: 'button', class: `chip${isActive(value) ? ' active' : ''}`, 'aria-pressed': String(isActive(value)),
        onclick: () => { onPick(value); draw(); } }, label)));
    draw();
    return { el: box, draw };
  };
  const setDetail = (key, value) => { input.details = { ...input.details, [key]: value }; };
  const d = input.details;
  const numInput = (value, onValue, attrs) => h('input', { class: 'input', type: 'number', value: value ?? '', ...attrs,
    oninput: (e) => onValue(e.target.value === '' ? NaN : Number(e.target.value)) });
  const textInput = (value, onValue, attrs) => h('input', { class: 'input', type: 'text', value: value ?? '', ...attrs,
    oninput: (e) => onValue(e.target.value) });
  const textArea = (value, onValue, attrs) => h('textarea', { class: 'input', rows: 3, ...attrs,
    oninput: (e) => onValue(e.target.value) }, value ?? '');
  const yesNo = (get, set) => chips(() => [[true, 'Є'], [false, 'Немає']], (v) => get() === v, set);

  // 1. Про вас: ім'я, прізвище, телефон, фото
  const avatarImg = h('img', { class: 'avatar-preview', alt: 'Ваше фото', hidden: !contact.avatarPath });
  if (contact.avatarPath) avatarImg.src = pilot.photoUrl(contact.avatarPath);
  const avatarInput = h('input', { type: 'file', accept: PHOTO_LIMITS.types.join(','), hidden: true,
    async onchange(e) {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      const { ok, errors } = checkPhotos([file], 0, { beforeResize: true });
      errorEls.avatar.hidden = Boolean(ok.length);
      errorEls.avatar.textContent = errors.join(' ');
      if (!ok.length) return;
      try {
        avatarBlob = await resizeImage(file);
        avatarImg.src = URL.createObjectURL(avatarBlob);
        avatarImg.hidden = false;
      } catch {
        errorEls.avatar.textContent = 'Не вдалося прочитати фото. Спробуйте інше.';
        errorEls.avatar.hidden = false;
      }
    } });
  const aboutYou = live && h('fieldset', { class: 'form-section' },
    h('legend', {}, '1. Про вас'),
    h('p', { class: 'hint' }, "Ім'я, фото й бажані канали зв'язку бачать гості в картці точки. Телефон і email — усі, хто увійшов на сайт."),
    h('div', { class: 'avatar-row' }, avatarImg,
      group(req('Ваше фото'), h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => avatarInput.click() },
        contact.avatarPath ? 'Змінити фото' : 'Вибрати фото'), 'avatar', 'JPEG, PNG або WebP'),
      avatarInput),
    h('div', { class: 'form-grid' },
      field(req("Ім'я"), textInput(contact.firstName, (v) => { contact.firstName = v; }, { maxlength: 60, autocomplete: 'given-name' }), 'firstName'),
      field(req('Прізвище'), textInput(contact.lastName, (v) => { contact.lastName = v; }, { maxlength: 60, autocomplete: 'family-name' }), 'lastName'),
      field(req('Телефон'), h('input', { class: 'input', type: 'tel', autocomplete: 'tel', maxlength: 25, value: contact.phone ?? '',
        placeholder: '+380 67 123 45 67', oninput: (e) => { contact.phone = e.target.value; } }), 'phone')),
    group('Бажані канали зв\'язку', chips(() => CONTACT_CHANNELS.map((c) => [c.id, c.label]),
      (id) => (contact.channels ?? []).includes(id),
      (id) => { const set = new Set(contact.channels ?? []); set.has(id) ? set.delete(id) : set.add(id); contact.channels = [...set]; }).el,
      'channels', 'Як гостям зручніше з вами зв\'язатися — показується у вікні точки на карті'));

  // 2. Станція
  const mapEl = h('div', { class: 'mini-map' });
  const coordsNote = h('span', { class: 'hint' }, 'Клікніть на карті, де знаходиться станція');
  const capacityField = field(req('Ємність акумулятора, кВт·год'),
    numInput(d.storageKwh > 0 ? d.storageKwh : null, (v) => setDetail('storageKwh', v), { min: 0.1, max: 500, step: 0.1 }), 'storageKwh');
  capacityField.hidden = input.hasBattery !== true;
  const battery = yesNo(() => input.hasBattery, (v) => {
    input.hasBattery = v;
    capacityField.hidden = !v;
    if (!v) setDetail('storageKwh', 0);
    else if (!(input.details.storageKwh > 0)) setDetail('storageKwh', NaN);
  });
  const station = h('fieldset', { class: 'form-section' },
    h('legend', {}, live ? '2. Станція' : 'Станція'),
    h('div', { class: 'form-grid' },
      field(req('Назва'), textInput(input.title, (v) => { input.title = v; }, { maxlength: 100, placeholder: 'Напр.: Сонячний дах на Вишеньці' }), 'title'),
      field(req('Населений пункт'), textInput(input.district, (v) => { input.district = v; },
        { maxlength: 60, list: 'district-list', placeholder: 'Напр.: Вінниця, Вишенька' }), 'district'),
      h('datalist', { id: 'district-list' }, DISTRICTS.map((x) => h('option', { value: x })))),
    field(req('Короткий опис СЕС'), textArea(d.description, (v) => setDetail('description', v),
      { maxlength: 500, placeholder: 'Напр.: панелі на даху приватного будинку, працює з 2023 року' }), 'description'),
    group(req('Координати'), [mapEl, coordsNote], 'location'),
    group(req('Тип СЕС'), chips(() => Object.entries(SES_TYPES), (v) => input.details.sesType === v, (v) => setDetail('sesType', v)).el, 'sesType'),
    h('div', { class: 'form-grid' },
      field(req('Встановлена потужність СЕС, кВт'), numInput(d.sesPowerKw, (v) => setDetail('sesPowerKw', v), { min: 0.1, max: 1000, step: 0.1, placeholder: 'Напр.: 10' }), 'sesPowerKw'),
      field('Виробник і потужність інвертора', textInput(d.inverter, (v) => setDetail('inverter', v),
        { maxlength: 100, placeholder: 'Напр.: Huawei SUN2000, 10 кВт' }), 'inverter', 'Бажано')),
    group(req('Акумулятор'), battery.el, 'hasBattery'),
    capacityField);

  // 3. Заряджання
  const connectorOptions = () => {
    const keys = input.details.hasEvse === true ? EVSE_CONNECTORS : input.details.hasEvse === false ? SOCKET_CONNECTORS : [];
    return keys.map((k) => [k, CONNECTORS[k]]);
  };
  const connectorChips = chips(connectorOptions, (v) => input.connector === v, (v) => { input.connector = v; });
  const connectorHint = h('span', { class: 'hint' }, 'Спершу вкажіть, чи є зарядна станція');
  const syncConnector = () => {
    if (!connectorOptions().some(([k]) => k === input.connector)) input.connector = null;
    connectorHint.hidden = input.details.hasEvse != null;
    connectorChips.draw();
  };
  const evse = yesNo(() => input.details.hasEvse, (v) => { setDetail('hasEvse', v); syncConnector(); });
  const time = (key) => h('input', { class: 'input', type: 'time', step: 3600, value: input.schedule[key],
    oninput: (e) => { input.schedule = { ...input.schedule, [key]: e.target.value }; } });
  const workdays = chips(() => WEEKDAY_NAMES.map((n, i) => [i + 1, n]), (v) => !closed.includes(v),
    (v) => { closed = closed.includes(v) ? closed.filter((x) => x !== v) : [...closed, v].sort(); });
  const charging = h('fieldset', { class: 'form-section' },
    h('legend', {}, live ? '3. Заряджання' : 'Заряджання'),
    group(req('Зарядна станція (EVSE)'), evse.el, 'hasEvse', 'Немає — гість заряджається від звичайної розетки або USB'),
    group(req('Тип конектора'), [connectorChips.el, connectorHint], 'connector'),
    h('div', { class: 'form-grid' },
      field(req('Максимальна потужність заряджання, кВт'), numInput(input.powerKw, (v) => { input.powerKw = v; },
        { min: 0.5, max: 150, step: 0.1, placeholder: 'Напр.: 7,4' }), 'powerKw', 'Розетка — до 22 кВт, зарядна станція — до 150 кВт'),
      field(req('Вартість, грн за кВт·год'), numInput(input.pricePerKwh, (v) => { input.pricePerKwh = v; }, { min: 5, max: 25, step: 0.5 }),
        'pricePerKwh', '8–15 грн — середня ціна в місті')),
    group(req('Тип паркування'), chips(() => Object.entries(PARKING_TYPES), (v) => input.details.parkingType === v, (v) => setDetail('parkingType', v)).el, 'parkingType'),
    group(req('Графік доступності'), [h('div', { class: 'time-row' }, time('from'), h('span', {}, '—'), time('to')),
      live && creating && h('div', { class: 'workdays' }, h('span', { class: 'hint' }, 'Робочі дні'), workdays.el)],
    'schedule', live && !creating ? 'Робочі дні й вихідні — кнопка «Графік» на картці точки' : null),
    live && creating && err('workdays'),
    group(req('Які пристрої можна заряджати'), chips(() => DEVICES.map((x) => [x.id, x.label]), (v) => input.devices.includes(v), (v) => {
      input.devices = input.devices.includes(v) ? input.devices.filter((x) => x !== v) : [...input.devices, v];
    }).el, 'devices'));
  syncConnector();

  // 4. Фото й умови
  const photoList = h('div', { class: 'photo-names hint' });
  const photoInput = h('input', { type: 'file', accept: PHOTO_LIMITS.types.join(','), multiple: true, hidden: true,
    onchange: (e) => {
      const { ok, errors } = checkPhotos([...e.target.files], 0, { beforeResize: true });
      e.target.value = '';
      photoFiles = ok.slice(0, PHOTO_LIMITS.max);
      photoList.textContent = photoFiles.length ? `Обрано: ${photoFiles.map((f) => f.name).join(', ')}` : '';
      errorEls.photos.textContent = errors.join(' ');
      errorEls.photos.hidden = !errors.length;
    } });
  const photosAndTerms = h('fieldset', { class: 'form-section' },
    h('legend', {}, live ? '4. Фото й умови' : 'Умови'),
    live && (creating
      ? group("Фотографії об'єкта", [h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => photoInput.click() }, '+ Вибрати фото'), photoList, photoInput],
        'photos', `Бажано. До ${PHOTO_LIMITS.max} фото, перше — обкладинка на карті.`)
      : h('p', { class: 'hint' }, "Фото об'єкта — кнопка «Фото» на картці точки.")),
    field('Короткий опис умов', textArea(d.terms, (v) => setDetail('terms', v),
      { maxlength: 500, placeholder: 'Напр.: оплата готівкою або на картку; кабель є; заїзд через ворота з вулиці' }), 'terms', 'Бажано'));

  // Додатково — поля з попереднього спринту, необов'язкові
  const select = (key, options, parse = (v) => v) => h('select', { class: 'input',
    onchange: (e) => setDetail(key, e.target.value === '' ? null : parse(e.target.value)) },
  h('option', { value: '' }, 'Не вказано'),
  Object.entries(options).map(([v, label]) => h('option', { value: v, selected: String(d[key]) === v }, label)));
  const yesNoOptions = { true: 'Так', false: 'Ні' };
  const more = h('details', { class: 'form-section form-more' },
    h('summary', {}, "Додатково (необов'язково)"),
    h('div', { class: 'form-grid' },
      field('Рік встановлення СЕС', numInput(d.installYear, (v) => setDetail('installYear', v), { min: 1990, max: new Date().getFullYear(), step: 1 }), 'installYear'),
      field('Напруга', select('voltageV', VOLTAGES, Number), 'voltageV'),
      field('Wi-Fi для гостей', select('wifi', yesNoOptions, (v) => v === 'true')),
      field('Територія', select('territory', TERRITORIES), 'territory'),
      field('Можна залишити авто на час зарядки', select('canLeaveCar', yesNoOptions, (v) => v === 'true'))));

  // Помилка відправки — у самій формі: дзвіночок у шапці закритий модалкою.
  const submitError = h('p', { class: 'field-error form-error', role: 'alert', hidden: true });
  const form = h('form', { class: 'wizard add-form', novalidate: true, onsubmit: submit },
    h('p', { class: 'eyebrow' }, 'Кабінет господаря'),
    h('h2', {}, existing ? 'Редагувати точку' : 'Додати точку'),
    h('p', { class: 'muted' }, 'Поля з ', h('span', { class: 'req' }, '*'), " — обов'язкові. ",
      existing ? 'Уже створені бронювання не зміняться.' : 'Назву й координати точки побачать усі на карті.'),
    aboutYou, station, charging, photosAndTerms, more,
    submitError,
    h('div', { class: 'wizard-actions' },
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => modal.close() }, 'Скасувати'),
      h('button', { type: 'submit', class: 'btn btn-primary btn-lg' }, existing ? 'Зберегти' : 'Додати на карту')));

  let map = null;
  const modal = openModal(form, { className: 'modal-wide', onClose: () => map?.remove() });

  // Точне місце власної точки не завантажилось (видно лише центр зони) — поки господар не клікнув
  // на карті, координат не надсилаємо, і сервер лишає справжні (див. update_pilot_spot).
  let moved = false;
  function setPoint(lat, lng) {
    moved = true;
    input.lat = Math.round(lat * 10000) / 10000;
    input.lng = Math.round(lng * 10000) / 10000;
    coordsNote.replaceChildren(withIcon('map-pin', `${input.lat}, ${input.lng}`, { size: 14 }));
    errorEls.location.hidden = true;
  }

  if (window.L) {
    map = L.map(mapEl).setView(existing ? [existing.lat, existing.lng] : VINNYTSIA_CENTER, existing ? 15 : 12);
    L.tileLayer(TILES.url, { attribution: TILES.attribution, maxZoom: 19 }).addTo(map);
    const pinIcon = () => L.divIcon({ className: 'pin-wrap', html: `<div class="pin pin-solar"><span class="pin-icon">${iconSvg('map-pin', { size: 14 })}</span>Тут</div>`, iconSize: null });
    let marker = existing ? L.marker([existing.lat, existing.lng], { icon: pinIcon() }).addTo(map) : null;
    map.on('click', (e) => {
      setPoint(e.latlng.lat, e.latlng.lng);
      if (marker) marker.setLatLng(e.latlng);
      else marker = L.marker(e.latlng, { icon: pinIcon() }).addTo(map);
    });
    setTimeout(() => map.invalidateSize(), 50);
  } else {
    mapEl.replaceChildren(h('div', { class: 'map-fallback' },
      h('b', {}, 'Карта недоступна'),
      h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => setPoint(...VINNYTSIA_CENTER) }, 'Поставити в центр Вінниці')));
  }

  function showErrors(errors) {
    for (const [key, el] of Object.entries(errorEls)) {
      // Помилки вибору файлів показуються одразу при виборі — не стираємо їх тут.
      if ((key === 'photos' || key === 'avatar') && !errors[key]) continue;
      el.hidden = !errors[key];
      el.textContent = errors[key] ?? '';
    }
    const first = form.querySelector('.field-error:not([hidden])');
    first?.closest('details')?.setAttribute('open', '');
    first?.closest('.form-field')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function submit(e) {
    e.preventDefault();
    submitError.hidden = true;
    // Джерело для карти й фільтра блекауту: з акумулятором точка працює і без світла.
    input.source = input.hasBattery ? 'battery' : existing && !input.details.sesType ? existing.source : 'solar';
    const check = validateSpotForm({ ...input, contact: { ...contact, hasPhoto: Boolean(avatarBlob || contact.avatarPath) } },
      { needContact: live });
    const errors = { ...check.errors };
    if (live && creating && closed.length >= 7) errors.workdays = 'Залиште хоча б один робочий день';
    if (Object.keys(errors).length) { showErrors(errors); return; }
    showErrors({});

    const data = { ...input, title: input.title.trim(), district: input.district.trim(), hostName };
    if (existing?.pilot && !existing.exactLocation && !moved) Object.assign(data, { lat: null, lng: null });
    if (!publish) {
      store.addSpot(data);
      modal.close();
      notify('Точку додано — її вже видно на карті гостей');
      return;
    }
    const button = form.querySelector('[type=submit]');
    if (button.disabled) return;
    button.disabled = true;
    const warnings = [];
    try {
      if (live) {
        const phone = validatePhone(contact.phone).phone;
        const changed = avatarBlob || ['firstName', 'lastName'].some((k) => (contact[k] ?? '').trim() !== (initialContact[k] ?? '').trim())
          || phone !== validatePhone(initialContact.phone).phone;
        if (changed) {
          try {
            const avatarPath = await pilot.saveHostContact({ firstName: contact.firstName.trim(), lastName: contact.lastName.trim(),
              phone, avatarPath: contact.avatarPath }, avatarBlob);
            savedContact = { uid: user?.uid, firstName: contact.firstName.trim(), lastName: contact.lastName.trim(), phone: contact.phone, avatarPath,
              channels: [...(initialContact.channels ?? [])] };
            Object.assign(initialContact, savedContact);
            contact.avatarPath = avatarPath;
            avatarBlob = null;
          } catch {
            submitError.textContent = 'Не вдалося зберегти ваші контакти й фото. Спробуйте ще раз.';
            submitError.hidden = false;
            return;
          }
        }
      }
      // Канали зв'язку — окремим запитом; збій не зупиняє збереження точки.
      if (live && [...(contact.channels ?? [])].sort().join() !== [...(initialContact.channels ?? [])].sort().join()) {
        try {
          await pilot.saveContactChannels(contact.channels ?? []);
          initialContact.channels = [...(contact.channels ?? [])];
          savedContact = { ...initialContact, uid: user?.uid, channels: initialContact.channels };
        } catch { warnings.push('канали зв\'язку не збереглися — спробуйте ще раз'); }
      }
      let id;
      try { id = await publish(data); }
      catch {
        submitError.textContent = existing ? 'Не вдалося зберегти зміни. Спробуйте ще раз.' : 'Не вдалося опублікувати точку. Спробуйте ще раз.';
        submitError.hidden = false;
        return;
      }
      // Точка вже на карті; фото й робочі дні — окремими кроками, їхні збої не скасовують точку.
      if (live && creating && id) {
        if (photoFiles.length) {
          const paths = [];
          for (const file of photoFiles) {
            try {
              const blob = await resizeImage(file);
              if (blob.size > PHOTO_LIMITS.bytes) continue;
              paths.push(await pilot.uploadPhoto({ id }, blob, blob.type));
            } catch { /* решта фото все одно збережеться */ }
          }
          try { if (paths.length) await pilot.setPhotos(id, paths); } catch { paths.length = 0; }
          if (paths.length < photoFiles.length) warnings.push('не всі фото вдалося завантажити — додайте їх кнопкою «Фото»');
        }
        if (closed.length) {
          try { await pilot.setSchedule(id, { weekdays: closed, days: [] }); }
          catch { warnings.push('робочі дні не збереглися — налаштуйте їх кнопкою «Графік»'); }
        }
      }
    } finally { button.disabled = false; }
    modal.close();
    notify(existing ? 'Зміни збережено' : 'Точку додано — її вже видно на карті гостей');
    if (warnings.length) notify(`Точку збережено, але ${warnings.join('; ')}.`, { kind: 'error' });
  }
  if (existing) coordsNote.replaceChildren(withIcon('map-pin', `${input.lat}, ${input.lng}`, { size: 14 }));
}

// Кнопка, що блокується на час запиту; помилка показується в переданому елементі.
async function busy(button, errorEl, action, failText) {
  if (button.disabled) return false;
  button.disabled = true;
  if (errorEl) errorEl.hidden = true;
  try { await action(); return true; }
  catch {
    if (errorEl) { errorEl.textContent = failText; errorEl.hidden = false; }
    else notify(failText, { kind: 'error' });
    return false;
  } finally { button.disabled = false; }
}

// ---- Графік: неробочі дні тижня та вихідні на 60 днів ----
export async function openSchedule(spot, pilot) {
  const today = kyivNow(new Date()).day;
  const days = Array.from({ length: 61 }, (_, i) => addDays(today, i));
  const weekdays = new Set(spot.closedWeekdays ?? []);
  let daysOff = new Set();
  const error = h('p', { class: 'field-error form-error', role: 'alert', hidden: true });
  const body = h('div', { class: 'wizard-body' }, h('p', { class: 'muted' }, 'Завантажуємо вихідні…'));
  const modal = openModal(h('div', { class: 'wizard' },
    h('p', { class: 'eyebrow' }, spot.title), h('h2', {}, 'Графік роботи'), body), { className: 'modal-wide' });
  try {
    daysOff = new Set((await pilot.listDaysOff(spot.id)).filter((d) => d >= today));
  } catch {
    body.replaceChildren(h('p', { class: 'field-error' }, 'Не вдалося завантажити вихідні. Закрийте вікно й спробуйте ще раз.'));
    return;
  }
  const draw = () => body.replaceChildren(
    h('p', { class: 'muted' }, `Години роботи: ${spot.schedule.from}–${spot.schedule.to} (змінюються в «Редагувати»).`),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Неробочі дні тижня'),
      h('div', { class: 'chips' }, WEEKDAY_NAMES.map((name, i) => {
        const wd = i + 1;
        return h('button', { type: 'button', class: `chip${weekdays.has(wd) ? ' active' : ''}`, 'aria-pressed': String(weekdays.has(wd)),
          disabled: !weekdays.has(wd) && weekdays.size >= 6,
          onclick: () => { weekdays.has(wd) ? weekdays.delete(wd) : weekdays.add(wd); draw(); } }, name);
      }))),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Вихідні дати (60 днів)'),
      h('div', { class: 'day-strip day-strip-wrap' }, days.map((d) => {
        const off = daysOff.has(d);
        const closed = weekdays.has(isoWeekday(d));
        return h('button', { type: 'button', class: `day-cell${off ? ' active' : ''}${closed ? ' day-closed' : ''}`,
          'aria-pressed': String(off), title: closed ? 'Неробочий день тижня' : '',
          onclick: () => { off ? daysOff.delete(d) : daysOff.add(d); draw(); } },
          h('span', { class: 'day-wd' }, WEEKDAY_NAMES[isoWeekday(d) - 1]),
          h('b', {}, String(Number(d.slice(8, 10)))),
          h('span', { class: 'day-state' }, off ? 'Вихідний' : ''));
      }))),
    error,
    h('div', { class: 'wizard-actions' },
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => modal.close() }, 'Скасувати'),
      h('button', { type: 'button', class: 'btn btn-primary btn-lg', async onclick(e) {
        const ok = await busy(e.currentTarget, error,
          () => pilot.setSchedule(spot.id, { weekdays: [...weekdays].sort(), days: [...daysOff].sort() }),
          'Не вдалося зберегти графік. Спробуйте ще раз.');
        if (ok) { modal.close(); notify('Графік збережено'); }
      } }, 'Зберегти')));
  draw();
}

// ---- Фото точки: до 5, перше — обкладинка ----
export function openPhotos(spot, pilot) {
  let paths = [...(spot.photoPaths ?? [])];
  let urls = [...(spot.photos ?? [])];
  const error = h('p', { class: 'field-error form-error', role: 'alert', hidden: true });
  const body = h('div', { class: 'wizard-body' });
  const modal = openModal(h('div', { class: 'wizard' },
    h('p', { class: 'eyebrow' }, spot.title), h('h2', {}, 'Фото точки'), body), { className: 'modal-wide' });
  const fail = (text) => { error.textContent = text; error.hidden = false; };
  // Одна операція за раз: паралельні збереження перезаписували б список фото одне одного.
  let loading = false;
  async function exclusive(action) {
    if (loading) return;
    loading = true;
    error.hidden = true;
    draw();
    try { await action(); } finally { loading = false; draw(); }
  }

  async function save(nextPaths, nextUrls, removed = []) {
    await pilot.setPhotos(spot.id, nextPaths);
    paths = nextPaths; urls = nextUrls;
    // Файли, прибрані зі списку, видаляємо зі сховища; збій тут не критичний.
    for (const p of removed) await pilot.removePhoto(p).catch(() => {});
  }

  const fileInput = h('input', { type: 'file', accept: PHOTO_LIMITS.types.join(','), multiple: true, hidden: true,
    onchange: (e) => exclusive(async () => {
      const { ok, errors } = checkPhotos([...e.target.files], paths.length, { beforeResize: true });
      e.target.value = '';
      const uploaded = [];
      const messages = [...errors];
      for (const file of ok) {
        try {
          const blob = await resizeImage(file);
          if (blob.size > PHOTO_LIMITS.bytes) { messages.push(`«${file.name}»: навіть після стискання більше 2 МБ.`); continue; }
          uploaded.push({ path: await pilot.uploadPhoto(spot, blob, blob.type), url: URL.createObjectURL(blob) });
        } catch { messages.push(`«${file.name}»: не вдалося завантажити.`); }
      }
      if (uploaded.length) {
        try { await save([...paths, ...uploaded.map((u) => u.path)], [...urls, ...uploaded.map((u) => u.url)]); }
        catch {
          for (const u of uploaded) await pilot.removePhoto(u.path).catch(() => {});
          messages.push('Не вдалося зберегти фото. Спробуйте ще раз.');
        }
      }
      if (messages.length) queueMicrotask(() => fail(messages.join(' ')));
    }) });

  function draw() {
    body.replaceChildren(
      h('p', { class: 'muted' }, `JPEG, PNG або WebP, до ${PHOTO_LIMITS.max} фото. Перше фото — обкладинка на карті.`),
      h('div', { class: 'photo-grid' }, urls.map((url, i) => h('figure', { class: 'photo-item' },
        h('img', { src: url, alt: `Фото ${i + 1}` }),
        i === 0 ? h('span', { class: 'badge badge-info' }, 'Обкладинка') : h('button', { type: 'button', class: 'btn btn-ghost btn-sm',
          disabled: loading, onclick: () => exclusive(async () => {
            const order = [i, ...paths.keys()].filter((x, k, arr) => arr.indexOf(x) === k);
            try { await save(order.map((k) => paths[k]), order.map((k) => urls[k])); }
            catch { queueMicrotask(() => fail('Не вдалося змінити обкладинку.')); }
          }) }, 'Зробити обкладинкою'),
        h('button', { type: 'button', class: 'btn btn-danger-ghost btn-sm', disabled: loading, onclick: () => exclusive(async () => {
          try { await save(paths.filter((_, k) => k !== i), urls.filter((_, k) => k !== i), [paths[i]]); }
          catch { queueMicrotask(() => fail('Не вдалося видалити фото.')); }
        }) }, 'Видалити')))),
      loading ? h('p', { class: 'muted' }, 'Зачекайте…') : '',
      error,
      fileInput,
      h('div', { class: 'wizard-actions' },
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => modal.close() }, 'Готово'),
        h('button', { type: 'button', class: 'btn btn-primary', disabled: loading || paths.length >= PHOTO_LIMITS.max,
          onclick: () => fileInput.click() }, '+ Додати фото')));
  }
  draw();
}

// Карта точок господаря. Створюється один раз і лише переставляється при перемальовуванні сторінки,
// щоб опитування бронювань кожні 20 с не перезавантажувало тайли.
function createSpotsMap() {
  const el = h('div', { class: 'host-map card', role: 'region', 'aria-label': 'Мої точки на карті' });
  let map = null;
  let layer = null;
  let lastKey = '';
  return {
    el,
    update(spots) {
      if (!window.L) {
        el.replaceChildren(h('div', { class: 'map-fallback' }, h('b', {}, 'Карта недоступна — перевірте інтернет')));
        return;
      }
      if (!map) {
        map = L.map(el, { scrollWheelZoom: false }).setView(VINNYTSIA_CENTER, 12);
        L.tileLayer(TILES.url, { attribution: TILES.attribution, maxZoom: 19 }).addTo(map);
        layer = L.layerGroup().addTo(map);
      }
      map.invalidateSize();
      const key = JSON.stringify(spots.map((s) => [s.id, s.lat, s.lng, s.pricePerKwh, s.source]));
      if (key === lastKey) return;
      lastKey = key;
      layer.clearLayers();
      for (const spot of spots) {
        L.marker([spot.lat, spot.lng], { icon: spotPin(spot), title: spot.title })
          .on('click', () => { location.hash = `#/spot/${spot.id}`; })
          .addTo(layer);
      }
      if (spots.length) map.fitBounds(L.latLngBounds(spots.map((s) => [s.lat, s.lng])), { padding: [36, 36], maxZoom: 15, animate: false });
    },
    destroy() { map?.remove(); map = null; },
  };
}

export function render(_params, root, store, session, _history, pilot) {
  const spotsMap = createSpotsMap();
  let grown = false; // стовпчики «виростають» лише при першому показі, не після кожної дії
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
    const addSpot = () => openAddSpot(store, undefined, signedIn ? pilot.publish : undefined, null, signedIn ? { pilot, session } : {});
    if (signedIn) {
      const own = pilot.ownSpots();
      const paused = own.filter((sp) => sp.paused && !sp.hiddenAt).length;
      const hidden = own.filter((sp) => sp.hiddenAt).length;
      const stats = pilot.hostStats();
      // Власні точки разом із прихованими: на карті (у store) прихованих немає, а їхні відгуки теж рахуються.
      const rating = hostRating(own, session.getState().user?.uid);
      const visible = own.length - paused - hidden;
      // Картка точки з макета «Кабінет господаря»: фото, чіп підвиду, назва, опис, «Призупинити» й олівець.
      const ownSpotTile = (spot) => {
        const edit = () => openAddSpot(store, undefined, (data) => pilot.update(spot.id, data), spot, { pilot, session });
        return h('article', { class: 'own-card card', dataset: { id: spot.id } },
          h('a', { class: 'own-card-photo', href: `#/spot/${spot.id}`, tabindex: '-1', 'aria-hidden': 'true' },
            h('img', { src: spotCover(spot), alt: '' })),
          h('div', { class: 'own-card-body' },
            h('span', { class: 'own-card-chip' }, withIcon(SOURCES[spot.source].icon, SOURCES[spot.source].label, { size: 14 })),
            h('a', { class: 'own-card-title', href: `#/spot/${spot.id}` }, spot.title),
            h('span', { class: 'own-card-meta' }, `${spot.district} · ${formatUAH(spot.pricePerKwh)} / кВт·год · `,
              stars(spotRating(spot), spot.reviews.length)),
            h('p', { class: 'own-card-desc' }, spot.details?.description || spot.details?.terms || 'Опис з\'явиться, коли ви додасте його в «Редагувати».'),
            spot.hiddenAt && hiddenNotice(spot, pilot),
            spot.paused && h('span', { class: 'badge badge-warn' }, 'На паузі — гості не бачать точку'),
            h('div', { class: 'own-card-tools' },
              h('button', { type: 'button', class: 'link-action', onclick: () => openSchedule(spot, pilot) }, 'Графік'),
              h('button', { type: 'button', class: 'link-action', onclick: () => openPhotos(spot, pilot) }, 'Фото'),
              h('button', { type: 'button', class: 'link-action link-danger', 'aria-label': `Видалити точку ${spot.title}`,
                async onclick(e) {
                  if (!window.confirm(`Прибрати «${spot.title}» з карти? Активні бронювання буде скасовано.`)) return;
                  const button = e.currentTarget;
                  button.disabled = true;
                  try { await pilot.archive(spot.id); notify('Точку прибрано з карти'); }
                  catch { notify('Не вдалося видалити точку. Спробуйте ще раз.', { kind: 'error' }); }
                  finally { button.disabled = false; }
                } }, 'Видалити')),
            h('div', { class: 'own-card-foot' },
              h('button', { type: 'button', class: 'link-action own-card-pause', async onclick(e) {
                const ok = await busy(e.currentTarget, null, () => pilot.setPaused(spot.id, !spot.paused), 'Не вдалося змінити стан точки. Спробуйте ще раз.');
                if (ok) notify(spot.paused ? 'Точку знову видно на карті' : 'Точку поставлено на паузу');
              } }, spot.paused ? 'Увімкнути' : 'Призупинити'),
              h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Редагувати «${spot.title}»`, title: 'Редагувати', onclick: edit },
                icon('pencil', { size: 18 })))));
      };
      const requests = stats.pending
        ? `${stats.pending} ${plural(stats.pending, ['запит чекає', 'запити чекають', 'запитів чекають'])} на вашу відповідь.`
        : stats.confirmed ? 'Нових запитів немає.' : 'Бронювань ще немає.';
      root.replaceChildren(h('div', { class: 'container host-page host-cabinet' },
        h('h1', { class: 'host-title' }, 'Кабінет господаря'),
        h('section', { class: `card requests-panel${stats.pending ? ' requests-attention' : ''}` },
          h('h2', { class: 'panel-title' }, 'Запити гостей'),
          h('p', { class: 'requests-text' }, requests),
          h('p', { class: 'requests-meta' },
            `Підтверджено: ${stats.confirmed} · На карті: ${visible} з ${own.length}`,
            [paused && ` · ${paused} на паузі`, hidden && ` · ${hidden} приховано модератором`].filter(Boolean).join(''),
            ` · ${rating.count ? `★ ${rating.avg.toFixed(1).replace('.', ',')}` : ratingLabel(rating.avg, rating.count, 'host')}`),
          h('a', { class: 'btn btn-primary', href: '#/host/bookings' }, stats.pending ? 'Переглянути запити' : 'Усі бронювання')),
        h('div', { class: 'own-head' },
          h('h2', { class: 'own-title' }, 'Мої точки'),
          // Одна кнопка «Додати»: поки точок немає — велика в порожній картці, далі — плюс біля заголовка, як у макеті.
          own.length > 0 && h('button', { type: 'button', class: 'icon-btn icon-btn-add', 'aria-label': 'Додати точку', title: 'Додати точку', onclick: addSpot },
            icon('plus', { size: 22 }))),
        own.length
          ? h('div', { class: 'own-grid' }, own.map(ownSpotTile))
          : h('div', { class: 'card host-empty' },
            h('span', { class: 'gate-icon' }, icon('map-pin', { size: 40 })),
            h('h2', {}, 'У вас ще немає точок'),
            h('p', { class: 'muted' }, 'Додайте свою СЕС: потужність, акумулятор, конектор, графік і ціну. Після цього її побачать гості на карті.'),
            h('button', { type: 'button', class: 'btn btn-primary btn-lg', onclick: addSpot }, withIcon('plus', 'Додати першу точку', { size: 20 }))),
        own.length > 0 && h('section', { class: 'host-map-section' },
          h('h2', { class: 'own-title' }, 'Мої точки на карті'), spotsMap.el)));
      if (own.length) spotsMap.update(own);
      return;
    }
    const state = store.getState();
    const host = state.hosts.find((x) => x.id === DEMO_HOST_ID);
    const now = new Date();
    const s = hostSummary(state, DEMO_HOST_ID, now);
    const spotById = Object.fromEntries(state.spots.map((sp) => [sp.id, sp]));
    const pending = s.bookings.filter((b) => b.status === 'pending').length;

    const enter = !grown;
    grown = true;
    root.replaceChildren(h('div', { class: `container host-page${enter ? ' host-enter' : ''}` },
      h('div', { class: 'host-head' },
        h('div', {},
          h('h1', {}, `Вітаємо, ${signedIn ? session.currentName() : host.vocative ?? host.name}!`),
          h('p', { class: 'lead' }, 'Ваша сонячна станція заробляє, поки ви займаєтесь своїми справами.')),
        h('button', { type: 'button', class: 'btn btn-primary btn-lg', onclick: addSpot }, withIcon('plus', 'Додати розетку', { size: 20 }))),
      signedIn && h('p', { class: 'demo-note' },
        withIcon('flask', 'Демо-кабінет: статистика — приклад господаря Олега з Вишеньки. Розетки, які ви додасте, з\'являться тут.')),

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
            h('div', { class: 'payback-head' }, withIcon('sun', 'Окупність СЕС'), h('b', {}, `${String(s.paybackPct).replace('.', ',')}%`)),
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
  const offPilot = pilot.subscribe(update);
  return () => { offStore(); offSession(); offPilot(); spotsMap.destroy(); };
}
