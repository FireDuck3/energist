// Калькулятор вигоди: скільки економить гість, скільки заробляє господар, скільки отримує сервіс.
import { h } from '../ui.js';
import { monthlyGuestSavings, monthlyHostEarnings, sessionCost, gridValue, formatUAH } from '../pricing.js';
import { HOME_TARIFF, COMMERCIAL_PRICE, COMMERCIAL_RANGE, COMMISSION, WEEKS_PER_MONTH } from '../data.js';

const SCALE_MAX = 40;
const pct = (v) => `${(v / SCALE_MAX) * 100}%`;
const num = (v) => String(v).replace('.', ',');

function slider({ label, min, max, step, value, unit, onInput }) {
  const out = h('b', { class: 'slider-value' });
  const input = h('input', { type: 'range', class: 'range', min, max, step, value, 'aria-label': label,
    oninput: (e) => { out.textContent = `${num(e.target.value)} ${unit}`; onInput(Number(e.target.value)); } });
  out.textContent = `${num(value)} ${unit}`;
  return h('label', { class: 'slider' }, h('span', { class: 'slider-head' }, h('span', {}, label), out), input);
}

function priceScale(price) {
  const [lo, hi] = COMMERCIAL_RANGE;
  return h('div', { class: 'scale' },
    h('div', { class: 'scale-track' },
      h('div', { class: 'scale-band', style: { left: pct(lo), width: pct(hi - lo) } }),
      h('div', { class: 'scale-mark mark-home', style: { left: pct(HOME_TARIFF) } }, h('span', {}, `${num(HOME_TARIFF)} грн`), h('small', {}, 'домашній тариф')),
      h('div', { class: 'scale-mark mark-us', style: { left: pct(price) } }, h('span', {}, `${price} грн`), h('small', {}, 'WattWay')),
      h('div', { class: 'scale-mark mark-commercial', style: { left: pct((lo + hi) / 2) } }, h('span', {}, `${lo}–${hi} грн`), h('small', {}, 'комерційні зарядки'))),
    h('p', { class: 'hint scale-caption' }, 'Ціна за кВт·год. WattWay — посередині: дешевше для гостя, вигідніше для господаря.'));
}

export function mountCalculator(el, { compact = false } = {}) {
  const st = { kwhWeek: 30, kwhMonth: 300, price: 12 };
  const results = h('div', { class: 'calc-results' });
  const scaleBox = h('div');

  function draw() {
    const guestVolume = st.kwhWeek * WEEKS_PER_MONTH;
    const hostVolume = compact ? guestVolume : st.kwhMonth;
    const saved = monthlyGuestSavings(st.kwhWeek, st.price);
    const earned = monthlyHostEarnings(hostVolume, st.price);
    const fee = sessionCost(hostVolume, st.price).fee;

    results.replaceChildren(
      h('div', { class: 'result result-guest' },
        h('span', { class: 'result-who' }, '🚗 Саша економить'),
        h('b', { class: 'result-value' }, `${formatUAH(saved)}/міс`),
        h('span', { class: 'hint' }, `≈ ${formatUAH(Math.round(saved * 12))} на рік порівняно із зарядкою по ~${COMMERCIAL_PRICE} грн`)),
      h('div', { class: 'result result-host' },
        h('span', { class: 'result-who' }, '☀️ Олег заробляє'),
        h('b', { class: 'result-value' }, `${formatUAH(earned)}/міс`),
        h('span', { class: 'hint' }, `За домашнім тарифом ця енергія коштує лише ${formatUAH(gridValue(hostVolume))}, а без зеленого тарифу мережа не платить за надлишок нічого`)),
      h('div', { class: 'result result-us' },
        h('span', { class: 'result-who' }, `⚡ WattWay (${Math.round(COMMISSION * 100)}%)`),
        h('b', { class: 'result-value' }, `${formatUAH(fee)}/міс`),
        h('span', { class: 'hint' }, compact ? 'з цієї пари гість — господар' : 'з одного господаря')));
    scaleBox.replaceChildren(priceScale(st.price));
  }

  const set = (key) => (v) => { st[key] = v; draw(); };
  el.replaceChildren(h('div', { class: `calc card${compact ? ' calc-compact' : ''}` },
    h('div', { class: 'calc-controls' },
      slider({ label: 'Скільки кВт·год на тиждень потрібно Саші', min: 5, max: 150, step: 5, value: st.kwhWeek, unit: 'кВт·год', onInput: set('kwhWeek') }),
      !compact && slider({ label: 'Скільки надлишку на місяць в Олега', min: 50, max: 800, step: 10, value: st.kwhMonth, unit: 'кВт·год', onInput: set('kwhMonth') }),
      slider({ label: 'Ціна в WattWay', min: 8, max: 15, step: 1, value: st.price, unit: 'грн/кВт·год', onInput: set('price') })),
    results,
    scaleBox));
  draw();
}

export function render(_params, root) {
  const box = h('div');
  root.append(h('section', { class: 'section' },
    h('div', { class: 'container' },
      h('h1', { class: 'section-title' }, 'Калькулятор вигоди'),
      h('p', { class: 'section-lead' },
        'Посуньте повзунки: скільки енергії потрібно гостю, скільки надлишку в господаря і за якою ціною вони домовились.'),
      box)));
  mountCalculator(box);
}
