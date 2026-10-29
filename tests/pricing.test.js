import { test, eq } from './runner.js';
import {
  sessionCost, savingsVsCommercial, gridValue, estimateKwh,
  monthlyGuestSavings, monthlyHostEarnings, formatUAH, formatKwh,
} from '../js/pricing.js';

test('еталон 30 кВт·год × 12 грн', () => {
  eq(sessionCost(30, 12), { total: 360, fee: 36, hostPayout: 324 });
  eq(savingsVsCommercial(30, 12), 690);
  eq(gridValue(30), 129.6);
});

test('нуль кВт·год — нуль грошей', () => eq(sessionCost(0, 12), { total: 0, fee: 0, hostPayout: 0 }));

test('estimateKwh обрізає за ємністю', () => {
  eq(estimateKwh(3.6, 2, 'ev'), 7.2);
  eq(estimateKwh(3.6, 3, 'ev'), 10.8);
  eq(estimateKwh(11, 6, 'ev'), 40);
  eq(estimateKwh(3.6, 3, 'ecoflow'), 1);
  eq(estimateKwh(3.6, 1, 'gadget'), 0.1);
});

test('копійки округлюються', () => eq(sessionCost(1.333, 9), { total: 12, fee: 1.2, hostPayout: 10.8 }));

test('місячні розрахунки', () => {
  eq(monthlyGuestSavings(10, 12), 995.9); // 43.3 × (35 − 12)
  eq(monthlyHostEarnings(100, 12), 1080);
});

// Нерозривні пробіли: число не відривається від одиниці при переносі рядка.
const NB = ' ';
test('форматування', () => {
  eq(formatUAH(360), `360${NB}грн`);
  eq(formatUAH(129.6), `129,60${NB}грн`);
  eq(formatUAH(2987.7), `2${NB}987,70${NB}грн`);
  eq(formatKwh(7.2), `7,2${NB}кВт·год`);
  eq(formatKwh(40), `40${NB}кВт·год`);
});
