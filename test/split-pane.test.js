import test from 'node:test';
import assert from 'node:assert/strict';
import { initSplitPane } from '../public/js/ui/split-pane.js';

class MockElement {
  constructor() {
    this.style = {};
    this.listeners = {};
    this.attributes = {};
  }

  addEventListener(type, fn) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(fn);
  }

  dispatchEvent(event) {
    const handlers = this.listeners[type_(event)] || [];
    for (const fn of handlers) fn(event);
  }

  setAttribute(name, value) { this.attributes[name] = String(value); }

  setPointerCapture() {}
  releasePointerCapture() {}

  getBoundingClientRect() { return { left: 0, width: 1000 }; }

  fire(type, props = {}) {
    const handlers = this.listeners[type] || [];
    for (const fn of handlers) fn({ type, preventDefault() {}, ...props });
  }
}

function type_(event) { return event.type; }

const docListeners = {};
globalThis.document = {
  addEventListener: (type, fn) => {
    if (!docListeners[type]) docListeners[type] = [];
    docListeners[type].push(fn);
  },
  removeEventListener: (type, fn) => {
    if (!docListeners[type]) return;
    docListeners[type] = docListeners[type].filter((f) => f !== fn);
  },
  dispatchEvent: (event) => {
    const handlers = docListeners[event.type] || [];
    for (const fn of [...handlers]) fn({ preventDefault() {}, ...event });
  },
};

function setup(initialPct = 60) {
  const container = new MockElement();
  const handle = new MockElement();
  const changes = [];
  initSplitPane({
    container, handle, initialPct, onChange: (pct) => changes.push(pct),
  });
  return { container, handle, changes };
}

test('khoi tao set gridTemplateColumns theo initialPct', () => {
  const { container } = setup(60);
  assert.equal(container.style.gridTemplateColumns, '60% 6px 1fr');
});

test('pointerdown roi pointermove tren document doi ti le', () => {
  const { container, handle } = setup(60);
  handle.fire('pointerdown', { clientX: 600, pointerId: 1 });
  document.dispatchEvent({ type: 'pointermove', clientX: 700 });
  assert.equal(container.style.gridTemplateColumns, '70% 6px 1fr');
});

test('khong pointerdown thi pointermove khong doi gi', () => {
  const { container } = setup(60);
  document.dispatchEvent({ type: 'pointermove', clientX: 999 });
  assert.equal(container.style.gridTemplateColumns, '60% 6px 1fr');
});

test('keo qua bien bi kep trong [20,80]', () => {
  const { container, handle } = setup(60);
  handle.fire('pointerdown', { clientX: 600, pointerId: 1 });
  document.dispatchEvent({ type: 'pointermove', clientX: 5000 });
  assert.equal(container.style.gridTemplateColumns, '80% 6px 1fr');

  document.dispatchEvent({ type: 'pointermove', clientX: -5000 });
  assert.equal(container.style.gridTemplateColumns, '20% 6px 1fr');
});

test('onChange chi goi mot lan luc pointerup, khong goi luc pointermove', () => {
  const { handle, changes } = setup(60);
  handle.fire('pointerdown', { clientX: 600, pointerId: 1 });
  document.dispatchEvent({ type: 'pointermove', clientX: 650 });
  document.dispatchEvent({ type: 'pointermove', clientX: 700 });
  assert.equal(changes.length, 0);

  document.dispatchEvent({ type: 'pointerup' });
  assert.deepEqual(changes, [70]);
});

test('dblclick handle tra ve 60 mac dinh goc, khong phai initialPct', () => {
  const { container, handle, changes } = setup(35);
  handle.fire('dblclick', {});
  assert.equal(container.style.gridTemplateColumns, '60% 6px 1fr');
  assert.deepEqual(changes, [60]);
});

test('ArrowLeft/ArrowRight tren handle doi 5% moi lan, goi onChange tung lan', () => {
  const { container, handle, changes } = setup(60);
  handle.fire('keydown', { key: 'ArrowRight' });
  assert.equal(container.style.gridTemplateColumns, '65% 6px 1fr');
  handle.fire('keydown', { key: 'ArrowLeft' });
  handle.fire('keydown', { key: 'ArrowLeft' });
  assert.equal(container.style.gridTemplateColumns, '55% 6px 1fr');
  assert.deepEqual(changes, [65, 60, 55]);
});

test('ArrowLeft/ArrowRight cung kep bien [20,80]', () => {
  const { container, handle } = setup(78);
  handle.fire('keydown', { key: 'ArrowRight' });
  handle.fire('keydown', { key: 'ArrowRight' });
  assert.equal(container.style.gridTemplateColumns, '80% 6px 1fr');
});
