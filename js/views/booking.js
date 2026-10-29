// Модалка бронювання: час → підтвердження → зарядка (симуляція) → оплата → відгук.
import { h, openModal, toast, formatDate } from '../ui.js';
import { availableStarts } from '../filters.js';
import { estimateKwh, holdAmount, sessionCost, savingsVsCommercial, formatUAH, formatKwh, round2 } from '../pricing.js';
import { DEVICES, SIM_DURATION_MS, COMMERCIAL_PRICE, COMMISSION, isoDay } from '../data.js';

const STEPS = ['Час', 'Підтвердження', 'Зарядка', 'Оплата', 'Відгук'];
const MAX_HOURS = 6;

const hourOf = (hhmm) => Number(hhmm.split(':')[0]);
const pad = (n) => String(n).padStart(2, '0');
const endTime = (start, hours) => `${pad(hourOf(start) + hours)}:00`;
const dayLabel = (day) => (day === 'today' ? 'Сьогодні' : 'Завтра');
const simClock = (minutes) => `${Math.floor(minutes / 60)}:${pad(Math.floor(minutes % 60))}`;

function progress(active) {
  return h('ol', { class: 'wizard-steps' }, STEPS.map((label, i) =>
    h('li', { class: i < active ? 'done' : i === active ? 'active' : '' }, h('span', {}, i + 1), label)));
}

function row(label, value, cls = '') {
  return h('div', { class: `sum-row ${cls}` }, h('span', {}, label), h('b', {}, value));
}

export function openBooking(spot, store, { now = new Date(), session, userHistory } = {}) {
  const todayStarts = availableStarts(spot.schedule, 'today', now);
  const sel = {
    device: spot.devices[0],
    day: todayStarts.length ? 'today' : 'tomorrow',
    start: null,
    hours: 2,
  };
  const hostName = spot.hostName ?? store.getState().hosts.find((x) => x.id === spot.hostId)?.name ?? 'господар';
  const userName = session?.currentName();
  let booking = null;
  let step = 0;
  let shownStep = -1;
  let rafId = null;
  let currentKwh = 0;

  const modal = openModal(h('div'), {
    className: 'modal-wide',
    onClose() {
      if (step === 2) finishCharging(); // закрили посеред зарядки — платимо за вже отримане
      cancelAnimationFrame(rafId);
    },
  });

  const starts = () => availableStarts(spot.schedule, sel.day, now);
  const maxHours = () => Math.max(1, Math.min(MAX_HOURS, hourOf(spot.schedule.to) - hourOf(sel.start)));

  function show(content) {
    // Анімуємо лише перехід на новий крок, а не кожен клік усередині кроку.
    const entering = step !== shownStep;
    shownStep = step;
    modal.setContent(h('div', { class: `wizard${entering ? ' wizard-enter' : ''}` },
      h('p', { class: 'eyebrow' }, spot.title),
      progress(step),
      content));
  }

  // ---- Крок 1: час ----
  function stepTime() {
    step = 0;
    const list = starts();
    if (!list.length) {
      show(h('div', { class: 'wizard-body' },
        h('h2', {}, 'Немає вільного часу'),
        h('p', {}, `Господар приймає з ${spot.schedule.from} до ${spot.schedule.to} — у цей проміжок не вміщується жодна година зарядки.`),
        h('div', { class: 'wizard-actions' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: () => modal.close() }, 'Зрозуміло'))));
      return;
    }
    if (!list.includes(sel.start)) sel.start = list[0];
    sel.hours = Math.min(sel.hours, maxHours());
    const kwh = estimateKwh(spot.powerKw, sel.hours, sel.device);
    const choice = (label, active, onclick, disabled = false) =>
      h('button', { type: 'button', class: `chip${active ? ' active' : ''}`, onclick, disabled }, label);

    show(h('div', { class: 'wizard-body' },
      h('h2', {}, 'Коли заряджаємось?'),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Пристрій'),
        h('div', { class: 'chips' }, DEVICES.filter((d) => spot.devices.includes(d.id)).map((d) =>
          choice(d.label, sel.device === d.id, () => { sel.device = d.id; stepTime(); })))),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'День'),
        h('div', { class: 'chips' },
          choice(`Сьогодні, ${formatDate(isoDay(0, now))}`, sel.day === 'today', () => { sel.day = 'today'; stepTime(); }, !todayStarts.length),
          choice(`Завтра, ${formatDate(isoDay(1, now))}`, sel.day === 'tomorrow', () => { sel.day = 'tomorrow'; stepTime(); })),
        !todayStarts.length && h('p', { class: 'hint' }, `На сьогодні вільних слотів уже немає (працює ${spot.schedule.from}–${spot.schedule.to}) — бронюємо на завтра.`)),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Початок'),
        h('div', { class: 'chips slots' }, list.map((t) =>
          choice(t, sel.start === t, () => { sel.start = t; stepTime(); })))),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Тривалість'),
        h('div', { class: 'stepper' },
          h('button', { type: 'button', class: 'stepper-btn', 'aria-label': 'Менше', disabled: sel.hours <= 1,
            onclick: () => { sel.hours--; stepTime(); } }, '−'),
          h('span', { class: 'stepper-value' }, `${sel.hours} год · до ${endTime(sel.start, sel.hours)}`),
          h('button', { type: 'button', class: 'stepper-btn', 'aria-label': 'Більше', disabled: sel.hours >= maxHours(),
            onclick: () => { sel.hours++; stepTime(); } }, '+'))),
      h('div', { class: 'estimate' },
        h('span', {}, `≈ ${formatKwh(kwh)} за ${String(spot.powerKw).replace('.', ',')} кВт`),
        h('b', {}, `до ${formatUAH(holdAmount(kwh, spot.pricePerKwh))}`)),
      h('div', { class: 'wizard-actions' },
        h('button', { type: 'button', class: 'btn btn-primary btn-lg', onclick: stepConfirm }, 'Далі'))));
  }

  // ---- Крок 2: підтвердження ----
  function stepConfirm() {
    step = 1;
    const kwh = estimateKwh(spot.powerKw, sel.hours, sel.device);
    const hold = holdAmount(kwh, spot.pricePerKwh);
    show(h('div', { class: 'wizard-body' },
      h('h2', {}, 'Перевірте бронювання'),
      h('div', { class: 'summary' },
        row('Точка', `${spot.title}, ${spot.district}`),
        row('Пристрій', DEVICES.find((d) => d.id === sel.device).label),
        row('Коли', `${dayLabel(sel.day)}, ${sel.start}–${endTime(sel.start, sel.hours)}`),
        row('Очікувано', formatKwh(kwh)),
        row('Ціна', `${formatUAH(spot.pricePerKwh)} / кВт·год`)),
      h('div', { class: 'secure' },
        h('span', { class: 'secure-icon' }, '🔒'),
        h('div', {},
          h('b', {}, 'Безпечна угода'),
          h('p', {}, `${formatUAH(hold)} буде заморожено на картці. Спишемо лише за фактично отриману енергію, різницю повернемо одразу після зарядки.`))),
      h('div', { class: 'wizard-actions' },
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: stepTime }, '← Назад'),
        h('button', { type: 'button', class: 'btn btn-primary btn-lg', onclick: () => {
          booking = store.createBooking({ spotId: spot.id, ...sel, guestName: userName });
          stepCharging();
        } }, `Підтвердити і заморозити ${formatUAH(hold)}`))));
  }

  // ---- Крок 3: зарядка ----
  function stepCharging() {
    step = 2;
    store.startCharging(booking.id);
    const totalMin = sel.hours * 60;
    const fill = h('div', { class: 'battery-fill' });
    const pct = h('span', { class: 'battery-pct' }, '0%');
    const kwhEl = h('b', {}, formatKwh(0));
    const costEl = h('b', {}, formatUAH(0));
    const clock = h('b', {}, `0:00 / ${simClock(totalMin)}`);

    show(h('div', { class: 'wizard-body' },
      h('h2', {}, '⚡ Заряджається…'),
      h('div', { class: 'battery' }, h('div', { class: 'battery-body' }, fill, pct), h('div', { class: 'battery-cap' })),
      h('div', { class: 'meters' },
        h('div', { class: 'meter' }, h('span', {}, 'Отримано'), kwhEl),
        h('div', { class: 'meter' }, h('span', {}, 'До сплати'), costEl),
        h('div', { class: 'meter' }, h('span', {}, 'Час сесії'), clock)),
      h('p', { class: 'hint' }, `Демо прискорене: уся сесія займає ${SIM_DURATION_MS / 1000} секунд.`),
      h('div', { class: 'wizard-actions' },
        h('button', { type: 'button', class: 'btn btn-secondary', onclick: finishCharging }, 'Завершити раніше'))));

    const startedAt = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - startedAt) / SIM_DURATION_MS);
      currentKwh = booking.estimatedKwh * p;
      fill.style.width = `${p * 100}%`;
      pct.textContent = `${Math.round(p * 100)}%`;
      kwhEl.textContent = formatKwh(currentKwh);
      costEl.textContent = formatUAH(currentKwh * spot.pricePerKwh);
      clock.textContent = `${simClock(totalMin * p)} / ${simClock(totalMin)}`;
      if (p < 1) rafId = requestAnimationFrame(tick);
      else finishCharging();
    };
    rafId = requestAnimationFrame(tick);
  }

  function finishCharging() {
    if (step !== 2) return;
    cancelAnimationFrame(rafId);
    store.finishCharging(booking.id, round2(currentKwh));
    const paid = store.getState().bookings.find((b) => b.id === booking.id);
    if (paid.actualKwh > 0) {
      userHistory?.recordCharge({ spot_id: spot.id, spot_title: spot.title, district: spot.district, kwh: paid.actualKwh, total: paid.total });
    }
    stepPaid();
  }

  // ---- Крок 4: оплата ----
  function stepPaid() {
    step = 3;
    const paid = store.getState().bookings.find((b) => b.id === booking.id);
    const saved = savingsVsCommercial(paid.actualKwh, spot.pricePerKwh);
    show(h('div', { class: 'wizard-body' },
      h('div', { class: 'success' },
        h('span', { class: 'check-wrap', html: '<svg class="check" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-15"/></svg>' }),
        h('h2', {}, 'Зарядка завершена!')),
      h('div', { class: 'summary' },
        row('Отримано енергії', formatKwh(paid.actualKwh)),
        row('Сума до сплати', formatUAH(paid.total), 'sum-total'),
        row(`Господарю (${hostName})`, formatUAH(paid.hostPayout), 'sum-sub'),
        row(`Комісія ЕнерГість ${Math.round(COMMISSION * 100)}%`, formatUAH(paid.fee), 'sum-sub'),
        row('Повернуто із заморожених', formatUAH(round2(paid.heldAmount - paid.total)))),
      saved > 0 && h('div', { class: 'saved-banner' },
        `💚 Ви зекономили ${formatUAH(saved)} порівняно з комерційною зарядкою (~${COMMERCIAL_PRICE} грн/кВт·год)`),
      h('div', { class: 'wizard-actions' },
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => modal.close() }, 'Готово'),
        h('button', { type: 'button', class: 'btn btn-primary btn-lg', onclick: stepReview }, 'Залишити відгук'))));
  }

  // ---- Крок 5: відгук ----
  function stepReview() {
    step = 4;
    let rating = 5;
    const starsBox = h('div', { class: 'star-input', role: 'radiogroup', 'aria-label': 'Оцінка' });
    const drawStars = () => starsBox.replaceChildren(...[1, 2, 3, 4, 5].map((n) =>
      h('button', { type: 'button', class: n <= rating ? 'on' : '', role: 'radio', 'aria-checked': String(n === rating),
        'aria-label': `${n} з 5`, onclick: () => { rating = n; drawStars(); } }, '★')));
    drawStars();
    const text = h('textarea', { class: 'input', rows: 3, placeholder: 'Як усе пройшло? Чи легко було знайти розетку?' });

    show(h('div', { class: 'wizard-body' },
      h('h2', {}, 'Оцініть зарядку'),
      starsBox,
      text,
      h('div', { class: 'wizard-actions' },
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => modal.close() }, 'Пропустити'),
        h('button', { type: 'button', class: 'btn btn-primary btn-lg', onclick: () => {
          store.addReview(booking.id, { stars: rating, text: text.value.trim() || 'Все пройшло чудово!', author: userName });
          modal.close();
          toast('Дякуємо за відгук!');
        } }, 'Надіслати відгук'))));
  }

  stepTime();
  return modal;
}
