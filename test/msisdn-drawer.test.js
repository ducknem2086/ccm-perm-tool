import test from 'node:test';
import assert from 'node:assert/strict';
import { state, defaultConfig, applyConfig } from '../public/js/state.js';
import { initMsisdnDrawer } from '../public/js/ui/msisdn-drawer.js';

class MockElement {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.children = [];
    this.parentElement = null;
    this._classList = new Set();
    this.attributes = {};
    this.listeners = {};
    this.value = '';
    this.type = '';
    this.textContent = '';
    this.hidden = false;
    this.dataset = {};
    this._html = '';

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
  }

  get innerHTML() { return this._html; }
  set innerHTML(val) {
    this._html = val;
    this.children = [];
    if (val.includes('data-close')) {
      const closeBtn = new MockElement('button');
      closeBtn.dataset.close = 'true';
      this.appendChild(closeBtn);
    }
    if (val.includes('drawer-list-host')) {
      const host = new MockElement('section', 'drawer-list-host');
      this.appendChild(host);
    }
    if (val.includes('data-count')) {
      const count = new MockElement('span');
      count.dataset.count = 'true';
      this.appendChild(count);
    }
    if (val.includes('data-body')) {
      const body = new MockElement('div');
      body.dataset.body = 'true';
      this.appendChild(body);
    }
    if (val.includes('data-file')) {
      const file = new MockElement('input');
      file.dataset.file = 'true';
      this.appendChild(file);

      const addBtn = new MockElement('button');
      addBtn.dataset.add = 'true';
      this.appendChild(addBtn);

      const importBtn = new MockElement('button');
      importBtn.dataset.import = 'true';
      this.appendChild(importBtn);

      const clearBtn = new MockElement('button');
      clearBtn.dataset.clear = 'true';
      this.appendChild(clearBtn);
    }
  }

  get className() { return Array.from(this._classList).join(' '); }
  set className(val) {
    this._classList.clear();
    if (val) val.split(' ').forEach((c) => c && this._classList.add(c));
  }

  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] ?? null; }
  addEventListener(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }
  dispatch(event, extra = {}) {
    const handlers = this.listeners[event] || [];
    for (const h of handlers) h({ target: this, preventDefault() {}, ...extra });
  }
  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  append(...nodes) { nodes.forEach((n) => this.appendChild(typeof n === 'string' ? new MockElement('span') : n)); }
  querySelector(sel) {
    if (sel.startsWith('#')) return this.findById(sel.slice(1));
    if (sel.startsWith('[data-')) {
      const key = sel.slice(6, -1);
      return this.findByData(key);
    }
    return this.children[0] || null;
  }
  querySelectorAll(sel) { return this.children; }
  findById(id) {
    if (this.id === id) return this;
    for (const c of this.children) {
      if (c.findById) {
        const found = c.findById(id);
        if (found) return found;
      }
    }
    return null;
  }
  findByData(key) {
    if (this.dataset && key in this.dataset) return this;
    for (const c of this.children) {
      if (c.findByData) {
        const found = c.findByData(key);
        if (found) return found;
      }
    }
    return null;
  }
  focus() {}
}

test('initMsisdnDrawer cap nhat card va dong bo single input voi state', () => {
  applyConfig(defaultConfig());
  state.msisdns = ['0912345678', '0913000111'];

  const singleInput = new MockElement('input', 'inp-single-msisdn');
  const countEl = new MockElement('span', 'msisdn-count');
  const openBtn = new MockElement('button', 'btn-open-msisdn-drawer');
  const drawer = new MockElement('aside', 'msisdn-drawer');
  drawer.hidden = true;

  const elements = {
    'inp-single-msisdn': singleInput,
    'msisdn-count': countEl,
    'btn-open-msisdn-drawer': openBtn,
    'msisdn-drawer': drawer,
  };

  global.document = {
    getElementById: (id) => elements[id] || new MockElement('div', id),
    createElement: (tag) => new MockElement(tag),
    addEventListener: () => {},
  };
  global.localStorage = { getItem: () => null, setItem: () => {} };

  const ctrl = initMsisdnDrawer();

  assert.equal(singleInput.value, '0912345678');
  assert.equal(countEl.textContent, '(2)');
  assert.match(openBtn.textContent, /2/);

  // Sửa single input
  singleInput.value = '0988777666';
  singleInput.dispatch('input');

  assert.equal(state.msisdns[0], '0988777666');
  assert.equal(state.msisdns.length, 2);

  // Mo drawer
  openBtn.dispatch('click');
  assert.equal(drawer.hidden, false);

  // Dong drawer
  ctrl.close();
  assert.equal(drawer.hidden, true);
});
