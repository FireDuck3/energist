// Уся грошова математика демо. Чисті функції: без DOM і стану.
import {
  COMMISSION, HOME_TARIFF, COMMERCIAL_PRICE, DEVICE_CAPACITY, WEEKS_PER_MONTH,
} from './data.js';

export const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

export function estimateKwh(powerKw, hours, device) {
  return round2(Math.min(powerKw * hours, DEVICE_CAPACITY[device]));
}

export function holdAmount(kwh, price) {
  return round2(kwh * price);
}

// Округлюємо крок за кроком, щоб «господарю + комісія» завжди давало суму до копійки.
export function sessionCost(kwh, price) {
  const total = round2(kwh * price);
  const fee = round2(total * COMMISSION);
  return { total, fee, hostPayout: round2(total - fee) };
}

export function savingsVsCommercial(kwh, price) {
  return round2(kwh * COMMERCIAL_PRICE - kwh * price);
}

export function gridValue(kwh) {
  return round2(kwh * HOME_TARIFF);
}

export function monthlyGuestSavings(kwhPerWeek, price) {
  return savingsVsCommercial(kwhPerWeek * WEEKS_PER_MONTH, price);
}

export function monthlyHostEarnings(kwhPerMonth, price) {
  return sessionCost(kwhPerMonth, price).hostPayout;
}

const NB = ' ';
const groupThousands = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, NB);

// 360 → «360 грн», 129.6 → «129,60 грн»: копійки лише коли вони є.
export function formatUAH(x) {
  const v = round2(x);
  const [int, frac] = Math.abs(v).toFixed(2).split('.');
  const sign = v < 0 ? '−' : '';
  const body = frac === '00' ? groupThousands(int) : `${groupThousands(int)},${frac}`;
  return `${sign}${body}${NB}грн`;
}

// 7.2 → «7,2 кВт·год»; до двох знаків, без зайвих нулів.
export function formatKwh(x) {
  const s = String(round2(x)).replace('.', ',');
  return `${s}${NB}кВт·год`;
}
