import { test, eq } from './runner.js';
import { render } from '../js/views/spot.js';
import { createStore, memoryStorage } from '../js/store.js';

const ID = '11111111-1111-4111-8111-111111111111';
const session = (status, uid = null) => ({
  getState: () => ({ status, user: uid ? { uid } : null }),
  subscribe: () => () => {},
  requireAuth() {},
  currentName: () => 'Гість',
});
const pilotSpot = (extra = {}) => ({
  id: ID, pilot: true, ownerId: 'host', hostName: 'Господар точки', title: 'Сонячна', district: 'Поділля',
  lat: 49.2251, lng: 28.4402, area: { lat: 49.2251, lng: 28.4402 }, exactLocation: false,
  source: 'solar', connector: 'type2', powerKw: 7.4, pricePerKwh: 11, devices: ['ev'], reviews: [],
  schedule: { from: '08:00', to: '20:00' }, closedWeekdays: [], photos: [], details: null, ...extra,
});

function mount(spot, status, uid) {
  const store = createStore(memoryStorage());
  if (spot) store.setPilotSpots([spot]);
  const root = document.createElement('div');
  const before = location.hash;
  const cleanup = render({ id: spot?.id ?? store.getState().spots[0].id }, root, store, session(status, uid));
  const hash = location.hash;
  return { root, hash, store, done: () => { cleanup(); history.replaceState(null, '', before || location.pathname); } };
}

test('картка точки: господар відкриває свою приховану точку й просить перевірити знову, інші — ні', async () => {
  const hidden = pilotSpot({ ownerId: 'host', hiddenAt: '2026-11-23T10:00:00Z', hiddenReason: 'Адреси не існує', reviewRequestedAt: null });
  const asked = [];
  const pilotFor = (uid) => ({
    ownSpots: () => (uid === 'host' ? [hidden] : []),
    subscribe: () => () => {},
    requestReview: async (id) => { asked.push(id); },
  });
  const open = (uid) => {
    const store = createStore(memoryStorage());
    store.setPilotSpots([]); // на карті прихованої точки немає
    const root = document.createElement('div');
    const before = location.hash;
    const cleanup = render({ id: ID }, root, store, session('signedIn', uid), null, pilotFor(uid));
    return { root, hash: location.hash, done: () => { cleanup(); history.replaceState(null, '', before || location.pathname); } };
  };
  const owner = open('host');
  try {
    eq(owner.root.querySelector('.spot-name').textContent, 'Сонячна');
    const note = owner.root.querySelector('.own-spot-hidden');
    eq(/Точку приховав модератор/.test(note.textContent), true);
    eq(/Причина: Адреси не існує/.test(note.textContent), true);
    eq(owner.root.querySelector('.back-link').getAttribute('href'), '#/host');
    [...note.querySelectorAll('button')].find((b) => b.textContent === 'Я виправив — перевірте знову').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    eq(asked, [ID]);
  } finally { owner.done(); }
  const guest = open('guest');
  try { eq([guest.hash, guest.root.querySelector('.spot-name')], ['#/map', null]); } finally { guest.done(); }
});

test('картка точки: запит на перевірку вже надіслано — кнопки немає, є дата', () => {
  const store = createStore(memoryStorage());
  store.setPilotSpots([]);
  const spot = pilotSpot({ ownerId: 'host', hiddenAt: '2026-11-23T10:00:00Z', reviewRequestedAt: '2026-11-23T12:05:00Z' });
  const root = document.createElement('div');
  const cleanup = render({ id: ID }, root, store, session('signedIn', 'host'), null,
    { ownSpots: () => [spot], subscribe: () => () => {}, requestReview: async () => {} });
  try {
    const note = root.querySelector('.own-spot-hidden');
    eq(/Запит на повторну перевірку надіслано 23 лис, 14:05/.test(note.textContent), true);
    eq(note.querySelector('button'), null);
  } finally { cleanup(); }
});

test('картка точки: демо-точка поза демо-режимом не відкривається — веде на карту', () => {
  for (const status of ['signedOut', 'signedIn']) {
    const m = mount(null, status, 'u1');
    try { eq([m.hash, m.root.querySelector('.spot-name')], ['#/map', null]); } finally { m.done(); }
  }
  const demo = mount(null, 'demo');
  try {
    eq(Boolean(demo.root.querySelector('.spot-name')), true);
    eq(/Демо-режим: оплата лише імітується/.test(demo.root.textContent), true);
  } finally { demo.done(); }
});

test('картка точки: гість бачить зону й обіцянку точного місця після підтвердження, без маршруту', () => {
  const m = mount(pilotSpot(), 'signedIn', 'guest');
  try {
    const box = m.root.querySelector('.spot-location');
    eq(box.querySelector('h2').textContent, 'Розташування');
    eq(/Точне місце господар відкриє після підтвердження бронювання/.test(box.textContent), true);
    eq(box.querySelector('a[href*="google.com/maps"]'), null);
    eq(/Пілот/.test(m.root.textContent), false);
    eq(/Онлайн-оплати поки немає/.test(m.root.textContent), true);
  } finally { m.done(); }
});

test('картка точки: підтверджений гість бачить точне місце і маршрут, господар — пояснення про зону', () => {
  const guest = mount(pilotSpot({ lat: 49.2237, lng: 28.4386, exactLocation: true }), 'signedIn', 'guest');
  try {
    const route = guest.root.querySelector('.spot-location a[href*="google.com/maps"]');
    eq(route.textContent, 'Прокласти маршрут');
    eq(route.getAttribute('href').includes('destination=49.2237,28.4386'), true);
  } finally { guest.done(); }
  const owner = mount(pilotSpot({ lat: 49.2237, lng: 28.4386, exactLocation: true }), 'signedIn', 'host');
  try {
    const box = owner.root.querySelector('.spot-location');
    eq(/Ви бачите точне місце\. Гості до підтвердження бронювання бачать лише зону ~300 м/.test(box.textContent), true);
    eq(box.querySelector('a[href*="google.com/maps"]'), null);
  } finally { owner.done(); }
});
