// Кабінет господаря — шлях Олега.
import { h, openModal, formatDate, stars, spotCover, plural } from '../ui.js';
import { notify } from '../notifications.js';
import { hostSummary, bookingHostAmount } from '../stats.js';
import { validateSpotInput } from '../validate.js';
import { formatUAH, formatKwh } from '../pricing.js';
import { DEMO_HOST_ID, DEVICES, SOURCES, CONNECTORS, VINNYTSIA_CENTER, SPOTS } from '../data.js';
import { spotRating } from '../filters.js';
import { TILES } from './map.js';
import { signInPrompt } from './auth-modal.js';
import { kyivNow, addDays, isoWeekday } from '../calendar.js';
import { checkPhotos, resizeImage, PHOTO_LIMITS } from '../photos.js';

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
      h('span', { class: `source-badge source-${spot.source}` }, `${SOURCES[spot.source].icon} ${SOURCES[spot.source].label}`),
      h('b', {}, spot.title),
      h('span', { class: 'muted' }, `${formatUAH(spot.pricePerKwh)} / кВт·год · `, stars(spotRating(spot), spot.reviews.length))));
}

// ---- Форма «Додати розетку» ----
// existing — точка для редагування: форма заповнюється її значеннями, а publish зберігає зміни.
export function openAddSpot(store, hostName, publish, existing = null) {
  const input = existing
    ? { title: existing.title, district: existing.district, lat: existing.lat, lng: existing.lng, source: existing.source,
      connector: existing.connector, powerKw: existing.powerKw, pricePerKwh: existing.pricePerKwh,
      devices: [...existing.devices], schedule: { ...existing.schedule } }
    : {
      title: '', district: 'Вишенька', lat: null, lng: null, source: 'solar', connector: 'type2',
      powerKw: 7.4, pricePerKwh: 11, devices: ['ev', 'ecoflow', 'gadget'], schedule: { from: '08:00', to: '20:00' },
    };
  const districts = existing && !DISTRICTS.includes(existing.district) ? [existing.district, ...DISTRICTS] : DISTRICTS;
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
  // Помилка відправки — у самій формі: дзвіночок у шапці закритий модалкою.
  const submitError = h('p', { class: 'field-error form-error', role: 'alert', hidden: true });

  const form = h('form', { class: 'wizard add-form', novalidate: true, onsubmit: submit },
    h('p', { class: 'eyebrow' }, 'Кабінет господаря'),
    h('h2', {}, existing ? 'Редагувати точку' : 'Додати розетку'),
    publish && h('p', {}, existing
      ? 'Зміни побачать гості на карті. Уже створені бронювання не зміняться.'
      : 'Назва й координати точки будуть видимі на карті всім відвідувачам.'),
    h('div', { class: 'form-field' }, h('span', { class: 'field-label' }, 'Де вона?'), mapEl, coordsNote, err('location')),
    h('div', { class: 'form-grid' },
      field('Назва', h('input', { class: 'input', type: 'text', maxlength: 100, placeholder: 'Напр.: Гараж з розеткою 220 В', value: input.title,
        oninput: (e) => { input.title = e.target.value; } }), 'title'),
      field('Район', h('select', { class: 'input', onchange: (e) => { input.district = e.target.value; } },
        districts.map((d) => h('option', { value: d, selected: d === input.district }, d)))),
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
    submitError,
    h('div', { class: 'wizard-actions' },
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => modal.close() }, 'Скасувати'),
      h('button', { type: 'submit', class: 'btn btn-primary btn-lg' }, existing ? 'Зберегти' : 'Додати на карту')));

  let map = null;
  const modal = openModal(form, { className: 'modal-wide', onClose: () => map?.remove() });

  function setPoint(lat, lng) {
    input.lat = Math.round(lat * 10000) / 10000;
    input.lng = Math.round(lng * 10000) / 10000;
    coordsNote.textContent = `📍 ${input.lat}, ${input.lng}`;
    errorEls.location.hidden = true;
  }

  if (window.L) {
    map = L.map(mapEl).setView(existing ? [existing.lat, existing.lng] : VINNYTSIA_CENTER, existing ? 15 : 12);
    L.tileLayer(TILES.url, { attribution: TILES.attribution, maxZoom: 19 }).addTo(map);
    const pinIcon = () => L.divIcon({ className: 'pin-wrap', html: '<div class="pin pin-solar"><span class="pin-icon">📍</span>Тут</div>', iconSize: null });
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

  async function submit(e) {
    e.preventDefault();
    submitError.hidden = true;
    const { ok, errors } = validateSpotInput(input);
    for (const [key, el] of Object.entries(errorEls)) {
      el.hidden = !errors[key];
      el.textContent = errors[key] ?? '';
    }
    if (!ok) {
      form.querySelector('.field-error:not([hidden])')?.closest('.form-field')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const data = { ...input, title: input.title.trim(), hostName };
    if (publish) {
      const button = form.querySelector('[type=submit]');
      if (button.disabled) return;
      button.disabled = true;
      try { await publish(data); }
      catch {
        submitError.textContent = existing ? 'Не вдалося зберегти зміни. Спробуйте ще раз.' : 'Не вдалося опублікувати точку. Спробуйте ще раз.';
        submitError.hidden = false;
        return;
      }
      finally { button.disabled = false; }
    } else store.addSpot(data);
    modal.close();
    notify(existing ? 'Зміни збережено' : 'Розетку додано — її вже видно на карті гостей');
  }
  if (existing) coordsNote.textContent = `📍 ${input.lat}, ${input.lng}`;
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

  async function save(nextPaths, nextUrls, removed = []) {
    await pilot.setPhotos(spot.id, nextPaths);
    paths = nextPaths; urls = nextUrls;
    // Файли, прибрані зі списку, видаляємо зі сховища; збій тут не критичний.
    for (const p of removed) await pilot.removePhoto(p).catch(() => {});
  }

  const fileInput = h('input', { type: 'file', accept: PHOTO_LIMITS.types.join(','), multiple: true, hidden: true,
    async onchange(e) {
      error.hidden = true;
      const { ok, errors } = checkPhotos([...e.target.files], paths.length, { beforeResize: true });
      e.target.value = '';
      const uploaded = [];
      const messages = [...errors];
      draw(true);
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
      draw();
      if (messages.length) fail(messages.join(' '));
    } });

  function draw(loading = false) {
    body.replaceChildren(
      h('p', { class: 'muted' }, `JPEG, PNG або WebP, до ${PHOTO_LIMITS.max} фото. Перше фото — обкладинка на карті.`),
      h('div', { class: 'photo-grid' }, urls.map((url, i) => h('figure', { class: 'photo-item' },
        h('img', { src: url, alt: `Фото ${i + 1}` }),
        i === 0 ? h('span', { class: 'badge badge-info' }, 'Обкладинка') : h('button', { type: 'button', class: 'btn btn-ghost btn-sm',
          async onclick(e) {
            const order = [i, ...paths.keys()].filter((x, k, arr) => arr.indexOf(x) === k);
            await busy(e.currentTarget, error, () => save(order.map((k) => paths[k]), order.map((k) => urls[k])), 'Не вдалося змінити обкладинку.');
            draw();
          } }, 'Зробити обкладинкою'),
        h('button', { type: 'button', class: 'btn btn-danger-ghost btn-sm', async onclick(e) {
          await busy(e.currentTarget, error,
            () => save(paths.filter((_, k) => k !== i), urls.filter((_, k) => k !== i), [paths[i]]), 'Не вдалося видалити фото.');
          draw();
        } }, 'Видалити')))),
      loading && h('p', { class: 'muted' }, 'Завантажуємо…'),
      error,
      fileInput,
      h('div', { class: 'wizard-actions' },
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => modal.close() }, 'Готово'),
        h('button', { type: 'button', class: 'btn btn-primary', disabled: loading || paths.length >= PHOTO_LIMITS.max,
          onclick: () => fileInput.click() }, '+ Додати фото')));
  }
  draw();
}

export function render(_params, root, store, session, _history, pilot) {
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
    const addSpot = () => openAddSpot(store, undefined, signedIn ? pilot.publish : undefined);
    if (signedIn) {
      root.replaceChildren(h('div', { class: 'container host-page' },
        h('div', { class: 'host-head' },
          h('h1', {}, 'Кабінет господаря'),
          h('button', { type: 'button', class: 'btn btn-primary', onclick: addSpot }, '+ Додати розетку')),
        pilot.panel(true),
        h('h2', { class: 'own-title' }, 'Мої точки'),
        h('div', { class: 'own-spots' }, pilot.ownSpots().map(spot =>
          h('div', { class: 'own-spot-wrap' }, ownSpotCard(spot),
            spot.paused && h('span', { class: 'badge badge-warn' }, 'На паузі — гості не бачать точку'),
            h('div', { class: 'own-spot-actions' },
              h('button', { type: 'button', class: 'btn btn-secondary btn-sm',
                onclick: () => openAddSpot(store, undefined, (data) => pilot.update(spot.id, data), spot) }, 'Редагувати'),
              h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => openSchedule(spot, pilot) }, 'Графік'),
              h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => openPhotos(spot, pilot) }, 'Фото'),
              h('button', { type: 'button', class: 'btn btn-secondary btn-sm', async onclick(e) {
                const ok = await busy(e.currentTarget, null, () => pilot.setPaused(spot.id, !spot.paused), 'Не вдалося змінити стан точки. Спробуйте ще раз.');
                if (ok) notify(spot.paused ? 'Точку знову видно на карті' : 'Точку поставлено на паузу');
              } }, spot.paused ? 'Увімкнути' : 'На паузу')),
            h('button', { type: 'button', class: 'btn btn-danger-ghost btn-sm',
              'aria-label': `Видалити точку ${spot.title}`,
              async onclick(e) {
                if (!window.confirm(`Прибрати «${spot.title}» з карти? Активні бронювання буде скасовано.`)) return;
                const button = e.currentTarget;
                button.disabled = true;
                try { await pilot.archive(spot.id); notify('Точку прибрано з карти'); }
                catch { notify('Не вдалося видалити точку. Спробуйте ще раз.', { kind: 'error' }); }
                finally { button.disabled = false; }
              },
            }, 'Видалити точку'))))));
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
  const offPilot = pilot.subscribe(update);
  return () => { offStore(); offSession(); offPilot(); };
}
