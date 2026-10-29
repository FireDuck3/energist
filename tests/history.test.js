import { test, eq } from './runner.js';
import { recentQueries, recentSpots } from '../js/history.js';
import { SPOTS } from '../js/data.js';

const row = (kind, value, minute) => ({ kind, value, created_at: `2026-10-29T10:${String(minute).padStart(2, '0')}:00Z` });

test('recentQueries: новіші першими, без повторів, ліміт 5', () => {
  const rows = [
    row('query', 'Центр', 1), row('query', 'вишенька', 2), row('query', 'Замостя', 3),
    row('spot', 'oleh-ses', 4), row('query', 'Сабарів', 5), row('query', 'гараж', 6),
    row('query', 'Вишенька', 7), row('query', 'Тяжилів', 8),
  ];
  // «Вишенька» і «вишенька» — один запис, у найсвіжішому написанні.
  eq(recentQueries(rows), ['Тяжилів', 'Вишенька', 'гараж', 'Сабарів', 'Замостя']);
  eq(recentQueries(rows, 2), ['Тяжилів', 'Вишенька']);
  eq(recentQueries([]), []);
});

test('recentQueries: апострофи й пробіли не роблять дублікатів', () => {
  eq(recentQueries([row('query', "П'ятничани", 1), row('query', ' п’ятничани ', 2)]), [' п’ятничани ']);
});

test('recentSpots: новіші першими, без повторів, пропускає неіснуючі', () => {
  const rows = [
    row('spot', 'oleh-ses', 1), row('spot', 'centre-cafe', 2), row('spot', 'no-such-spot', 3),
    row('spot', 'oleh-ses', 4), row('query', 'oleh-garage', 5),
  ];
  eq(recentSpots(rows, SPOTS).map((s) => s.id), ['oleh-ses', 'centre-cafe']);
  eq(recentSpots(rows, SPOTS, 1).map((s) => s.id), ['oleh-ses']);
});
