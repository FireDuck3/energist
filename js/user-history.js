// Історія поточного користувача: пошуки, переглянуті точки, зарядки.
// Увійшов — читаємо й пишемо в акаунт (session.service); демо — лише в пам'яті; інакше — нічого.
// Запис оптимістичний: спершу локально, потім у сервіс; збій сервісу нічого не ламає.
import { normalizeQuery } from './filters.js';

const MAX_VALUE = 80;
const EMPTY = { searches: [], charges: [] };

export function createUserHistory(session, { now = () => new Date().toISOString() } = {}) {
  let state = { status: 'off', ...EMPTY };
  let uid = null;
  let loadSeq = 0;
  let pending = { ...EMPTY }; // записане, поки історія ще вантажиться
  const listeners = new Set();

  const set = (patch) => {
    state = { ...state, ...patch };
    listeners.forEach((fn) => fn(state));
  };
  // У сервіс пишемо лише для увійденого; помилки ковтаємо — локальний запис лишається.
  const remote = (fn) => {
    const svc = session.service;
    if (!uid || !svc) return;
    try {
      Promise.resolve(fn(svc)).catch(() => {});
    } catch { /* синхронна помилка сервісу — так само ігноруємо */ }
  };

  async function load() {
    const seq = ++loadSeq;
    const forUid = uid;
    pending = { searches: [], charges: [] };
    set({ status: 'loading', ...EMPTY });
    try {
      const data = await session.service.loadHistory(forUid);
      if (seq !== loadSeq) return; // поки вантажили, користувач змінився
      set({
        status: 'ready',
        searches: [...pending.searches, ...data.searches],
        charges: [...pending.charges, ...data.charges],
      });
    } catch {
      if (seq === loadSeq) set({ status: 'error' });
    }
  }

  function reset(status) {
    uid = null;
    loadSeq++;
    set({ status, ...EMPTY });
  }

  function sync() {
    const { status, user } = session.getState();
    if (status === 'signedIn') {
      if (user.uid !== uid) {
        uid = user.uid;
        load();
      }
    } else if (status === 'demo') {
      if (state.status !== 'local') reset('local');
    } else if (state.status !== 'off') {
      reset('off');
    }
  }

  const writable = () => state.status !== 'off';

  function addSearch(kind, raw) {
    const value = String(raw ?? '').trim().slice(0, MAX_VALUE);
    if (!value || !writable()) return;
    const row = { kind, value, created_at: now() };
    if (state.status === 'loading') pending.searches.unshift(row);
    set({ searches: [row, ...state.searches] });
    remote((svc) => svc.addSearch(uid, { kind, value }));
  }

  session.subscribe(sync);
  sync();

  return {
    getState: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    recordQuery: (q) => addSearch('query', q),
    recordSpot: (spotId) => addSearch('spot', spotId),
    recordCharge(entry) {
      if (!writable()) return;
      const row = { ...entry, charged_at: now() };
      if (state.status === 'loading') pending.charges.unshift(row);
      set({ charges: [row, ...state.charges] });
      remote((svc) => svc.addCharge(uid, entry));
    },
    // Прибирає всі написання запиту («Вишенька», «вишенька»…).
    removeQuery(q) {
      const key = normalizeQuery(q);
      const removed = new Set();
      const searches = state.searches.filter((r) => {
        const match = r.kind === 'query' && normalizeQuery(r.value) === key;
        if (match) removed.add(r.value);
        return !match;
      });
      set({ searches });
      removed.forEach((value) => remote((svc) => svc.removeSearch(uid, { kind: 'query', value })));
    },
    clearQueries() {
      set({ searches: state.searches.filter((r) => r.kind !== 'query') });
      remote((svc) => svc.clearSearches(uid));
    },
    retry() {
      if (uid && state.status === 'error') load();
    },
  };
}
