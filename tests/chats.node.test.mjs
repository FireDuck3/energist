import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPilot } from '../js/pilot.js';

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.events = {}; }
  append(...children) { this.children.push(...children); }
  setAttribute() {}
  addEventListener(name, fn) { this.events[name] = fn; }
  get textContent() { return this.children.map(c => typeof c === 'string' ? c : c.textContent).join(''); }
}

test('chat list includes both participant roles and clears on sign-out', async () => {
  const original = { Node: globalThis.Node, document: globalThis.document, setInterval: globalThis.setInterval };
  globalThis.Node = Element;
  globalThis.document = { createElement: tag => new Element(tag) };
  globalThis.setInterval = () => 0;
  try {
    let state = { status: 'signedIn', user: { uid: 'me' } }, changed;
    const booking = { spot_id: 'spot', slot: '[2026-11-16T10:00,2026-11-16T11:00)', status: 'pending' };
    const pilot = createPilot({
      getState: () => state, subscribe: fn => { changed = fn; }, ready: new Promise(() => {}),
      service: {
        listPilotSpots: async () => [{ id: 'spot', title: 'Зарядка' }],
        listPilotBookings: async () => [
          { ...booking, id: 'guest-chat', guest_id: 'me', owner_id: 'host', counterpart_name: 'Господар' },
          { ...booking, id: 'host-chat', guest_id: 'guest', owner_id: 'me', counterpart_name: 'Гість' },
          { ...booking, id: 'other-chat', guest_id: 'other', owner_id: 'other2', counterpart_name: 'Сторонній' },
        ],
      },
    }, { getState: () => ({ pilotReady: true }), setPilotSpots() {} }, { notifications: { notify() {}, remove() {} } });
    await pilot.refresh();
    const list = pilot.chatsPanel();
    assert.match(list.textContent, /Господар/);
    assert.match(list.textContent, /Гість/);
    assert.doesNotMatch(list.textContent, /Сторонній/);
    const rows = list.children.find(c => c.tag === 'ul').children;
    assert.equal(rows.length, 2);
    assert.equal(typeof rows[0].children[1].events.click, 'function');
    state = { status: 'signedOut', user: null };
    changed();
    assert.doesNotMatch(pilot.chatsPanel().textContent, /Господар|Гість/);
    await pilot.refresh();
  } finally { Object.assign(globalThis, original); }
});

