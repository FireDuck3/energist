import { test, eq } from './runner.js';
import { createUserHistory } from '../js/user-history.js';

const tick = () => new Promise((r) => setTimeout(r, 0));
const signedIn = (uid = 'u1') => ({ status: 'signedIn', user: { uid, email: `${uid}@b.ua` }, profile: { name: 'Ірина', role: 'guest' } });
const signedOut = { status: 'signedOut', user: null, profile: null };
let clock = 0;
const now = () => `2026-10-29T12:00:${String(clock++).padStart(2, '0')}Z`;

function fakeSession(initial, service) {
  let state = initial;
  const ls = new Set();
  return {
    service,
    getState: () => state,
    subscribe: (f) => (ls.add(f), () => ls.delete(f)),
    emit(s) { state = s; ls.forEach((f) => f(state)); },
  };
}

function fakeService({ history = { searches: [], charges: [] }, failLoad = 0, failWrites = false } = {}) {
  const calls = [];
  const w = (name) => async (...args) => { calls.push([name, ...args]); if (failWrites) throw { code: 'auth/network-request-failed' }; };
  return {
    calls,
    async loadHistory(uid) {
      calls.push(['loadHistory', uid]);
      if (failLoad > 0) { failLoad--; throw { code: 'auth/network-request-failed' }; }
      return structuredClone(typeof history === 'function' ? history(uid) : history);
    },
    addSearch: w('addSearch'), removeSearch: w('removeSearch'), clearSearches: w('clearSearches'), addCharge: w('addCharge'),
  };
}

test('без входу — off, запис ігнорується і сервіс не кличеться', async () => {
  const svc = fakeService();
  const h = createUserHistory(fakeSession(signedOut, svc), { now });
  h.recordQuery('Вишенька');
  h.recordCharge({ spot_id: 'oleh-ses', spot_title: 'x', district: 'y', kwh: 5, total: 60 });
  eq([h.getState().status, h.getState().searches, h.getState().charges, svc.calls], ['off', [], [], []]);
});

test('увійшов — loading, потім ready з даними сервісу', async () => {
  const svc = fakeService({ history: { searches: [{ kind: 'query', value: 'Центр', created_at: 't' }], charges: [] } });
  const h = createUserHistory(fakeSession(signedIn(), svc), { now });
  eq(h.getState().status, 'loading');
  await tick();
  eq([h.getState().status, h.getState().searches.map((r) => r.value), svc.calls[0]], ['ready', ['Центр'], ['loadHistory', 'u1']]);
});

test('запит з\'являється одразу і йде в сервіс', async () => {
  const svc = fakeService();
  const h = createUserHistory(fakeSession(signedIn(), svc), { now });
  await tick();
  h.recordQuery('Вишенька');
  const first = h.getState().searches[0];
  eq([first.kind, first.value, typeof first.created_at], ['query', 'Вишенька', 'string']);
  eq(svc.calls.at(-1), ['addSearch', 'u1', { kind: 'query', value: 'Вишенька' }]);
});

test('сервіс не записав — локальний запис лишається', async () => {
  const svc = fakeService({ failWrites: true });
  const h = createUserHistory(fakeSession(signedIn(), svc), { now });
  await tick();
  h.recordQuery('Замостя');
  await tick();
  eq(h.getState().searches.map((r) => r.value), ['Замостя']);
});

test('порожній запит не пишеться, довгий обрізається до 80', async () => {
  const svc = fakeService();
  const h = createUserHistory(fakeSession(signedIn(), svc), { now });
  await tick();
  h.recordQuery('   ');
  eq(h.getState().searches, []);
  h.recordQuery('а'.repeat(100));
  eq([h.getState().searches[0].value.length, svc.calls.at(-1)[2].value.length], [80, 80]);
});

test('перегляд точки і зарядка', async () => {
  const svc = fakeService();
  const h = createUserHistory(fakeSession(signedIn(), svc), { now });
  await tick();
  h.recordSpot('oleh-ses');
  const charge = { spot_id: 'oleh-ses', spot_title: 'Сонячний дах Олега', district: 'Вишенька', kwh: 22.2, total: 266.4 };
  h.recordCharge(charge);
  eq(h.getState().searches[0], { kind: 'spot', value: 'oleh-ses', created_at: h.getState().searches[0].created_at });
  eq([h.getState().charges[0].spot_id, typeof h.getState().charges[0].charged_at], ['oleh-ses', 'string']);
  eq(svc.calls.slice(-2), [['addSearch', 'u1', { kind: 'spot', value: 'oleh-ses' }], ['addCharge', 'u1', charge]]);
});

test('removeQuery прибирає всі написання запиту, clearQueries — лише запити', async () => {
  const svc = fakeService({ history: { searches: [
    { kind: 'query', value: 'Вишенька', created_at: '3' }, { kind: 'query', value: 'вишенька', created_at: '2' },
    { kind: 'query', value: 'Центр', created_at: '1' }, { kind: 'spot', value: 'oleh-ses', created_at: '0' },
  ], charges: [] } });
  const h = createUserHistory(fakeSession(signedIn(), svc), { now });
  await tick();
  h.removeQuery('ВИШЕНЬКА');
  eq(h.getState().searches.map((r) => r.value), ['Центр', 'oleh-ses']);
  eq(svc.calls.filter((c) => c[0] === 'removeSearch').map((c) => c[2].value).sort(), ['Вишенька', 'вишенька']);
  h.clearQueries();
  eq([h.getState().searches.map((r) => r.value), svc.calls.at(-1)], [['oleh-ses'], ['clearSearches', 'u1']]);
});

test('вихід з акаунта — історія зникає одразу; інший користувач — нове завантаження', async () => {
  const svc = fakeService({ history: (uid) => ({ searches: [{ kind: 'query', value: `від ${uid}`, created_at: 't' }], charges: [] }) });
  const s = fakeSession(signedIn('u1'), svc);
  const h = createUserHistory(s, { now });
  await tick();
  eq(h.getState().searches.map((r) => r.value), ['від u1']);
  s.emit(signedOut);
  eq([h.getState().status, h.getState().searches, h.getState().charges], ['off', [], []]);
  s.emit(signedIn('u2'));
  await tick();
  eq([h.getState().status, h.getState().searches.map((r) => r.value)], ['ready', ['від u2']]);
});

test('відповідь для старого користувача ігнорується', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const svc = fakeService();
  svc.loadHistory = async (uid) => { if (uid === 'u1') await gate; return { searches: [{ kind: 'query', value: uid, created_at: 't' }], charges: [] }; };
  const s = fakeSession(signedIn('u1'), svc);
  const h = createUserHistory(s, { now });
  s.emit(signedIn('u2'));
  await tick();
  release();
  await tick();
  eq(h.getState().searches.map((r) => r.value), ['u2']);
});

test('демо-режим — local, лише в пам\'яті', async () => {
  const svc = fakeService();
  const h = createUserHistory(fakeSession({ status: 'demo', user: null, profile: null }, svc), { now });
  h.recordQuery('Центр');
  eq([h.getState().status, h.getState().searches.map((r) => r.value), svc.calls], ['local', ['Центр'], []]);
});

test('не завантажилось — error, retry перезавантажує', async () => {
  const svc = fakeService({ failLoad: 1, history: { searches: [], charges: [{ spot_id: 'oleh-ses', spot_title: 'x', district: 'y', kwh: 1, total: 12, charged_at: 't' }] } });
  const h = createUserHistory(fakeSession(signedIn(), svc), { now });
  await tick();
  eq(h.getState().status, 'error');
  h.retry();
  await tick();
  eq([h.getState().status, h.getState().charges.length], ['ready', 1]);
});

test('записане під час завантаження не губиться', async () => {
  const svc = fakeService({ history: { searches: [{ kind: 'query', value: 'Старе', created_at: '1' }], charges: [] } });
  const h = createUserHistory(fakeSession(signedIn(), svc), { now });
  h.recordQuery('Нове');
  await tick();
  eq(h.getState().searches.map((r) => r.value), ['Нове', 'Старе']);
});
