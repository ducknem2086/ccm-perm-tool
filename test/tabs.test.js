import test from 'node:test';
import assert from 'node:assert/strict';
import { initTabs } from '../public/js/ui/tabs.js';

class MockElement {
  constructor(id) {
    this.id = id;
    this.attributes = {};
    this._classList = new Set();
    const self = this;
    this.classList = {
      add(c) { self._classList.add(c); },
      remove(c) { self._classList.delete(c); },
      contains(c) { return self._classList.has(c); },
      toggle(c, force) {
        if (force === undefined) {
          if (self._classList.has(c)) self._classList.delete(c);
          else self._classList.add(c);
        } else if (force) {
          self._classList.add(c);
        } else {
          self._classList.delete(c);
        }
      }
    };
    this.hidden = false;
    this.tabIndex = 0;
    this.listeners = {};
    this.focused = false;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name];
  }

  focus() {
    this.focused = true;
  }

  addEventListener(type, handler) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(handler);
  }

  click() {
    this.dispatchEvent({ type: 'click' });
  }

  keydown(key) {
    let defaultPrevented = false;
    const event = {
      type: 'keydown',
      key,
      preventDefault: () => { defaultPrevented = true; }
    };
    this.dispatchEvent(event);
    return defaultPrevented;
  }

  dispatchEvent(event) {
    const handlers = this.listeners[event.type] || [];
    for (const h of handlers) {
      h(event);
    }
  }
}

function setupMockDOM() {
  const elements = {
    'tab-input': new MockElement('tab-input'),
    'tab-auths': new MockElement('tab-auths'),
    'tab-output': new MockElement('tab-output'),
    'tab-perm': new MockElement('tab-perm'),
    'panel-input': new MockElement('panel-input'),
    'panel-auths': new MockElement('panel-auths'),
    'panel-output': new MockElement('panel-output'),
    'panel-perm': new MockElement('panel-perm')
  };

  globalThis.document = {
    getElementById: (id) => elements[id] || null
  };

  return elements;
}

test('initTabs khoi tao tab input active theo mac dinh', () => {
  const elements = setupMockDOM();
  const onChangeCalls = [];

  const { select } = initTabs({
    onChange: (id) => onChangeCalls.push(id)
  });

  assert.equal(elements['tab-input'].getAttribute('aria-selected'), 'true');
  assert.equal(elements['tab-input'].tabIndex, 0);
  assert.equal(elements['tab-input'].classList.contains('is-active'), true);
  assert.equal(elements['panel-input'].hidden, false);

  assert.equal(elements['tab-auths'].getAttribute('aria-selected'), 'false');
  assert.equal(elements['panel-auths'].hidden, true);

  assert.equal(elements['tab-output'].getAttribute('aria-selected'), 'false');
  assert.equal(elements['tab-output'].tabIndex, -1);
  assert.equal(elements['tab-output'].classList.contains('is-active'), false);
  assert.equal(elements['panel-output'].hidden, true);

  assert.equal(elements['tab-perm'].getAttribute('aria-selected'), 'false');
  assert.equal(elements['panel-perm'].hidden, true);

  assert.deepEqual(onChangeCalls, ['input']);
});

test('select auths mo panel auths va dong cac panel kia', () => {
  const elements = setupMockDOM();
  const { select } = initTabs();

  select('auths');

  assert.equal(elements['panel-auths'].hidden, false);
  assert.equal(elements['panel-input'].hidden, true);
  assert.equal(elements['panel-output'].hidden, true);
  assert.equal(elements['panel-perm'].hidden, true);
  assert.equal(elements['tab-auths'].classList.contains('is-active'), true);
});

test('select perm mo panel CHECK PERMISSION va dong cac panel kia', () => {
  const elements = setupMockDOM();
  const { select } = initTabs();

  select('perm');

  assert.equal(elements['panel-perm'].hidden, false);
  assert.equal(elements['panel-input'].hidden, true);
  assert.equal(elements['panel-auths'].hidden, true);
  assert.equal(elements['panel-output'].hidden, true);
  assert.equal(elements['tab-perm'].classList.contains('is-active'), true);
});

test('select chuyen tab va goi onChange', () => {
  const elements = setupMockDOM();
  const onChangeCalls = [];
  
  const { select } = initTabs({
    onChange: (id) => onChangeCalls.push(id)
  });

  select('output');

  assert.equal(elements['tab-input'].getAttribute('aria-selected'), 'false');
  assert.equal(elements['panel-input'].hidden, true);

  assert.equal(elements['tab-output'].getAttribute('aria-selected'), 'true');
  assert.equal(elements['panel-output'].hidden, false);

  assert.deepEqual(onChangeCalls, ['input', 'output']);
});

test('click vao tab chuyen tab va focus', () => {
  const elements = setupMockDOM();
  initTabs();

  elements['tab-output'].click();

  assert.equal(elements['tab-output'].classList.contains('is-active'), true);
  assert.equal(elements['tab-output'].focused, true);
  assert.equal(elements['panel-output'].hidden, false);
});

test('dieu huong ban phim mui ten trai/phai, home/end', () => {
  const elements = setupMockDOM();
  initTabs();

  // Tu tab input nhan ArrowRight -> sang tab auths
  const prevented = elements['tab-input'].keydown('ArrowRight');
  assert.equal(prevented, true);
  assert.equal(elements['tab-auths'].classList.contains('is-active'), true);
  assert.equal(elements['tab-auths'].focused, true);

  // Tu tab auths nhan ArrowLeft -> ve tab input
  elements['tab-auths'].keydown('ArrowLeft');
  assert.equal(elements['tab-input'].classList.contains('is-active'), true);

  // Nhan End -> nhay ve tab cuoi cung (perm)
  elements['tab-input'].keydown('End');
  assert.equal(elements['tab-perm'].classList.contains('is-active'), true);

  // Nhan Home -> nhay ve input
  elements['tab-perm'].keydown('Home');
  assert.equal(elements['tab-input'].classList.contains('is-active'), true);
});
