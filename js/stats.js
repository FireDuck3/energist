// Зведення для кабінету господаря. Чиста функція над станом store.
import { round2 } from './pricing.js';
import { monthLabel } from './ui.js';

const PAID = new Set(['paid', 'reviewed']);
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export function hostSummary(state, hostId, now = new Date()) {
  const host = state.hosts.find((x) => x.id === hostId);
  const spots = state.spots.filter((s) => s.hostId === hostId);
  const own = new Set(spots.map((s) => s.id));
  const bookings = state.bookings.filter((b) => own.has(b.spotId)).reverse(); // новіші — останні в store
  const paid = bookings.filter((b) => PAID.has(b.status));

  const monthEarned = round2(paid
    .filter((b) => b.date.startsWith(monthKey(now)))
    .reduce((sum, b) => sum + b.hostPayout, 0));
  const reviews = spots.flatMap((s) => s.reviews);
  const rating = reviews.length
    ? Math.round((reviews.reduce((sum, r) => sum + r.stars, 0) / reviews.length) * 10) / 10
    : 0;

  const past = host.pastMonths ?? [0, 0, 0, 0, 0];
  const months = [...past, monthEarned].map((earned, i) => ({
    earned,
    label: monthLabel(new Date(now.getFullYear(), now.getMonth() - (past.length - i), 1)),
  }));
  const earnedTotal = past.reduce((a, b) => a + b, 0) + monthEarned;

  return {
    spots,
    bookings,
    monthEarned,
    charges: host.chargesCount + paid.length,
    kwhSold: round2(paid.reduce((sum, b) => sum + b.actualKwh, 0)),
    rating,
    months,
    paybackPct: host.sesCost ? Math.round((earnedTotal / host.sesCost) * 1000) / 10 : 0,
  };
}
