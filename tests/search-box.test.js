import { test, eq } from './runner.js';
import { searchBox } from '../js/views/search-box.js';

function fakes() {
  const ls = new Set();
  let st = { status: 'ready', searches: [{ kind: 'query', value: 'Центр', created_at: '1' }], charges: [] };
  const userHistory = {
    getState: () => st,
    subscribe: (f) => (ls.add(f), () => ls.delete(f)),
    recordQuery: (q) => { st = { ...st, searches: [{ kind: 'query', value: q, created_at: '2' }, ...st.searches] }; ls.forEach((f) => f(st)); },
    removeQuery() {},
    clearQueries() {},
  };
  const store = { getState: () => ({ spots: [], filters: { query: '' } }), setFilters() {} };
  const notify = () => ls.forEach((f) => f(st));
  return { userHistory, store, notify };
}

function mount() {
  const f = fakes();
  const box = searchBox(f.store, f.userHistory);
  document.body.append(box.el);
  const input = box.el.querySelector('input');
  input.focus();
  input.dispatchEvent(new Event('focus'));
  return { ...f, box, input, panel: () => box.el.querySelector('.search-panel') };
}

test('після Enter підказки не відкриваються самі, коли історія оновилась', () => {
  const m = mount();
  try {
    m.input.value = 'Замостя';
    m.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    m.notify(); // історія оновилась пізніше (напр., дозавантажилась)
    eq(m.panel().hidden, true);
  } finally { m.box.destroy(); m.box.el.remove(); }
});

test('після Esc підказки не відкриваються самі', () => {
  const m = mount();
  try {
    eq(m.panel().hidden, false);
    m.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    m.notify();
    eq(m.panel().hidden, true);
  } finally { m.box.destroy(); m.box.el.remove(); }
});
