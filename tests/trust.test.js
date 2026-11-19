import { test, eq } from './runner.js';
import { REPORT_REASONS, hostRating, ratingLabel, validateReport, reportErrorText } from '../js/trust.js';

const spot = (ownerId, stars) => ({ ownerId, reviews: stars.map((s) => ({ stars: s })) });

test('hostRating: усі точки господаря разом', () => {
  const spots = [spot('h1', [5, 4]), spot('h1', [5]), spot('h2', [1])];
  eq(hostRating(spots, 'h1'), { avg: 4.7, count: 3 });
  eq(hostRating(spots, 'nobody'), { avg: null, count: 0 });
});

test('ratingLabel: відмінювання, кома, нові', () => {
  eq(ratingLabel(4.75, 12, 'host'), '★ 4,8 · 12 відгуків');
  eq(ratingLabel(5, 1, 'spot'), '★ 5,0 · 1 відгук');
  eq(ratingLabel(4, 3, 'host'), '★ 4,0 · 3 відгуки');
  eq(ratingLabel(null, 0, 'spot'), 'Нова точка');
  eq(ratingLabel(null, 0, 'host'), 'Новий господар');
});

test('REPORT_REASONS: свої причини для кожного типу', () => {
  eq(REPORT_REASONS.station.some((r) => r.id === 'fraud'), false);
  eq(REPORT_REASONS.user.map((r) => r.id), ['fraud', 'abuse', 'spam', 'no_show', 'other']);
  eq(REPORT_REASONS.spot.length, 6);
});

test('validateReport: причина обов\'язкова, «Інше» вимагає опису, ліміт 1000', () => {
  eq(validateReport({ reason: '', details: '' }, 'spot').ok, false);
  eq(Boolean(validateReport({ reason: 'other', details: 'коротко' }, 'spot').errors.details), true);
  eq(validateReport({ reason: 'spam', details: '' }, 'user').ok, true);
  eq(validateReport({ reason: 'not_working', details: 'я'.repeat(1001) }, 'station').ok, false);
  eq(validateReport({ reason: 'fraud', details: '' }, 'station').ok, false); // чужа причина для станції
});

test('reportErrorText: зрозумілі тексти для кодів сервера', () => {
  eq(/вже/.test(reportErrorText('23505', 'duplicate')), true);
  eq(/10/.test(reportErrorText('WW429', 'daily_limit')), true);
  eq(/власн/.test(reportErrorText('22023', 'own_spot')), true);
  eq(reportErrorText('auth/network-request-failed').length > 10, true);
});
