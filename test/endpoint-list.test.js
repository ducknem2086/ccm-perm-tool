import test from 'node:test';
import assert from 'node:assert/strict';
import { state, defaultConfig, notify } from '../public/js/state.js';
import {
  fromRecord, initEndpointList, endpointKey, allFieldOnVisible, setFieldForVisible,
} from '../public/js/ui/endpoint-list.js';

test('fromRecord chep raw tu record sang endpoint', () => {
  const ep = fromRecord({
    name: 'Tra cuu TB', method: 'GET', endpoint: '/api/x', sheetName: 'Sheet 1',
    raw: { 'Ten API': 'Tra cuu TB', 'Ma CN': 'WL01' },
  });
  assert.deepEqual(ep.raw, { 'Ten API': 'Tra cuu TB', 'Ma CN': 'WL01' });
});

test('fromRecord: record thieu raw thi endpoint nhan {}, khong undefined', () => {
  const ep = fromRecord({ name: 'X', method: 'GET', endpoint: '/api/y', sheetName: 'Sheet 1' });
  assert.deepEqual(ep.raw, {});
});

test('fromRecord van giu du name/method/sheetName/pathTemplate/enabled nhu truoc', () => {
  const ep = fromRecord({
    name: 'Tra cuu TB', method: 'POST', endpoint: '/api/x', sheetName: 'Sheet 2',
    raw: { A: '1' },
  });
  assert.equal(ep.name, 'Tra cuu TB');
  assert.equal(ep.method, 'POST');
  assert.equal(ep.sheetName, 'Sheet 2');
  assert.equal(ep.pathTemplate, '/api/x');
  assert.equal(ep.enabled, true);
});

/* ---------- endpointKey / allFieldOnVisible / setFieldForVisible ---------- */

test('endpointKey chuan hoa method ve hoa va trim path, thieu method mac dinh GET', () => {
  assert.equal(endpointKey({ method: 'get', pathTemplate: '  /a/b  ' }), 'GET:/a/b');
  assert.equal(endpointKey({ pathTemplate: '/x' }), 'GET:/x');
});

test('allFieldOnVisible([]) tra false', () => {
  assert.equal(allFieldOnVisible([], 'attachMsisdn'), false);
});

test('allFieldOnVisible tra true khi moi phan tu khac false (ke ca undefined)', () => {
  const visible = [{ attachMsisdn: true }, { attachMsisdn: undefined }, {}];
  assert.equal(allFieldOnVisible(visible, 'attachMsisdn'), true);
});

test('allFieldOnVisible tra false khi co mot phan tu field === false', () => {
  const visible = [{ attachMsisdn: true }, { attachMsisdn: false }];
  assert.equal(allFieldOnVisible(visible, 'attachMsisdn'), false);
});

test('setFieldForVisible tab All: ban trung bi khu de hien thi van doi theo', () => {
  Object.assign(state, defaultConfig());
  state.selectedSheet = 'all';
  state.endpoints = [
    { id: 'e1', method: 'GET', pathTemplate: '/dup', sheetName: 'Sheet 1', attachMsisdn: true },
    { id: 'e2', method: 'GET', pathTemplate: '/dup', sheetName: 'Sheet 3', attachMsisdn: true },
    { id: 'e3', method: 'GET', pathTemplate: '/other', sheetName: 'Sheet 1', attachMsisdn: true },
  ];
  const visible = [state.endpoints[0]]; // ban dai dien duy nhat con hien tren bang da khu trung

  setFieldForVisible(visible, 'attachMsisdn', false);

  assert.equal(state.endpoints[0].attachMsisdn, false);
  assert.equal(state.endpoints[1].attachMsisdn, false, 'ban trung o Sheet 3 phai doi theo');
  assert.equal(state.endpoints[2].attachMsisdn, true, 'endpoint khac khoa khong duoc dung');
});

test('setFieldForVisible tab mot sheet: khong ro sang sheet khac du trung khoa', () => {
  Object.assign(state, defaultConfig());
  state.selectedSheet = 'Sheet 1';
  state.endpoints = [
    { id: 'e1', method: 'GET', pathTemplate: '/dup', sheetName: 'Sheet 1', attachMsisdn: true },
    { id: 'e2', method: 'GET', pathTemplate: '/dup', sheetName: 'Sheet 3', attachMsisdn: true },
  ];
  const visible = [state.endpoints[0]];

  setFieldForVisible(visible, 'attachMsisdn', false);

  assert.equal(state.endpoints[0].attachMsisdn, false);
  assert.equal(state.endpoints[1].attachMsisdn, true, 'sheet khac khong duoc dung cham');
});

test('setFieldForVisible khong dung endpoint co khoa nam ngoai tap visible, ke ca cung sheet', () => {
  Object.assign(state, defaultConfig());
  state.selectedSheet = 'all';
  state.endpoints = [
    { id: 'e1', method: 'GET', pathTemplate: '/a', sheetName: 'Sheet 1', attachMsisdn: true },
    { id: 'e2', method: 'GET', pathTemplate: '/b', sheetName: 'Sheet 1', attachMsisdn: true },
  ];
  const visible = [state.endpoints[0]];

  setFieldForVisible(visible, 'attachMsisdn', false);

  assert.equal(state.endpoints[0].attachMsisdn, false);
  assert.equal(state.endpoints[1].attachMsisdn, true);
});

test('setFieldForVisible chi ghi dung field, khong dung field khac', () => {
  Object.assign(state, defaultConfig());
  state.selectedSheet = 'all';
  state.endpoints = [
    { id: 'e1', method: 'GET', pathTemplate: '/a', sheetName: 'Sheet 1', attachMsisdn: true, attachCommonQuery: true },
  ];

  setFieldForVisible([state.endpoints[0]], 'attachCommonQuery', false);

  assert.equal(state.endpoints[0].attachCommonQuery, false);
  assert.equal(state.endpoints[0].attachMsisdn, true);
});

test('setFieldForVisible voi visible rong: khong doi state.endpoints', () => {
  Object.assign(state, defaultConfig());
  state.endpoints = [{ id: 'e1', method: 'GET', pathTemplate: '/a', sheetName: 'Sheet 1', attachMsisdn: true }];
  const before = state.endpoints;

  setFieldForVisible([], 'attachMsisdn', false);

  assert.equal(state.endpoints, before, 'khong duoc gan lai mang khi khong co gi de ghi');
});

test('toggle qua lai dung chieu: Co -> Khong -> Co', () => {
  Object.assign(state, defaultConfig());
  state.selectedSheet = 'all';
  state.endpoints = [
    { id: 'e1', method: 'GET', pathTemplate: '/a', sheetName: 'Sheet 1', attachMsisdn: true },
    { id: 'e2', method: 'POST', pathTemplate: '/b', sheetName: 'Sheet 1', attachMsisdn: true },
  ];

  let visible = [...state.endpoints];
  assert.equal(allFieldOnVisible(visible, 'attachMsisdn'), true);

  setFieldForVisible(visible, 'attachMsisdn', !allFieldOnVisible(visible, 'attachMsisdn'));
  visible = state.endpoints;
  assert.equal(allFieldOnVisible(visible, 'attachMsisdn'), false);

  setFieldForVisible(visible, 'attachMsisdn', !allFieldOnVisible(visible, 'attachMsisdn'));
  visible = state.endpoints;
  assert.equal(allFieldOnVisible(visible, 'attachMsisdn'), true);
});

/* ---------- DOM: nut MSISDN(loc) / Query(loc) tren panel that ---------- */

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
    this.title = '';
    this.placeholder = '';
    this.spellcheck = false;
    this.textContent = '';
    this.checked = false;
    this.dataset = {};
    this.disabled = false;

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
      },
    };
  }

  get className() { return Array.from(this._classList).join(' '); }

  set className(val) {
    this._classList.clear();
    if (val) val.split(/\s+/).filter(Boolean).forEach((c) => this._classList.add(c));
  }

  // Mock rieng cho panel ENDPOINTS — them nhanh data-search so voi ban dung
  // chung o input-panels.test.js, de test duoc luong go tim kiem that.
  set innerHTML(html) {
    this.children = [];
    if (!html) return;
    if (html.includes('data-body')) {
      const h2 = new MockElement('h2');
      h2.className = 'card-title';

      const titleSpan = new MockElement('span');
      const countSpan = new MockElement('span');
      countSpan.className = 'el-count';
      countSpan.attributes['data-count'] = '';
      countSpan.textContent = '(0)';
      titleSpan.append(countSpan);
      h2.append(titleSpan);

      if (html.includes('data-search')) {
        const searchInput = new MockElement('input');
        searchInput.type = 'search';
        searchInput.className = 'input input-sm el-search';
        searchInput.attributes['data-search'] = '';
        h2.append(searchInput);
      }

      const body = new MockElement('div');
      body.className = 'el-body';
      body.attributes['data-body'] = '';

      const actions = new MockElement('div');
      actions.className = 'el-actions';

      const btnAdd = new MockElement('button');
      btnAdd.attributes['data-add'] = '';
      const btnImport = new MockElement('button');
      btnImport.attributes['data-import'] = '';
      const btnClear = new MockElement('button');
      btnClear.attributes['data-clear'] = '';
      const inputFile = new MockElement('input');
      inputFile.type = 'file';
      inputFile.attributes['data-file'] = '';

      actions.append(btnAdd, btnImport, btnClear, inputFile);

      for (const m of html.matchAll(/data-extra-action="(\d+)"/g)) {
        const btn = new MockElement('button');
        btn.attributes['data-extra-action'] = m[1];
        actions.append(btn);
      }

      this.append(h2, body, actions);
    }
  }

  get innerHTML() { return ''; }

  getAttribute(name) { return this.attributes[name]; }

  append(...nodes) {
    for (const node of nodes) {
      if (node instanceof MockElement) {
        node.parentElement = this;
        this.children.push(node);
      } else if (typeof node === 'string') {
        this.textContent += node;
      }
    }
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }

  replaceWith(node) {
    const parent = this.parentElement;
    if (!parent) return;
    const i = parent.children.indexOf(this);
    if (i !== -1) parent.children[i] = node;
    node.parentElement = parent;
    this.parentElement = null;
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }

  querySelectorAll(selector) {
    const res = [];
    const match = (node) => {
      if (selector.startsWith('.')) return node._classList.has(selector.slice(1));
      if (selector.startsWith('#')) return node.id === selector.slice(1);
      if (selector.startsWith('[') && selector.endsWith(']')) {
        const attrExpr = selector.slice(1, -1);
        if (attrExpr.includes('=')) {
          const [key, val] = attrExpr.split('=');
          const cleanVal = val.replace(/['"]/g, '');
          if (key === 'type') return node.type === cleanVal;
          return node.attributes[key] === cleanVal || node.dataset[key.slice(5)] === cleanVal;
        }
        if (attrExpr.startsWith('data-')) {
          return node.attributes[attrExpr] !== undefined || node.dataset[attrExpr.slice(5)] !== undefined;
        }
        if (attrExpr === 'type') return Boolean(node.type);
        return node.attributes[attrExpr] !== undefined;
      }
      return node.tagName === selector.toUpperCase();
    };
    const traverse = (node) => {
      if (match(node)) res.push(node);
      for (const child of node.children) traverse(child);
    };
    for (const child of this.children) traverse(child);
    return res;
  }

  addEventListener(type, handler) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(handler);
  }

  dispatchEvent(event) {
    const handlers = this.listeners[event.type] || [];
    for (const h of handlers) h(event);
  }
}

function setupMockDOM() {
  const elements = { 'list-endpoint': new MockElement('div', 'list-endpoint') };
  globalThis.document = {
    getElementById: (id) => elements[id] || null,
    createElement: (tagName) => new MockElement(tagName),
    createTextNode: (text) => String(text),
  };
  const store = new Map();
  globalThis.localStorage = {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
    clear() { store.clear(); },
  };
  globalThis.window = { ccmToast: () => {} };
  globalThis.confirm = () => true;
  return { elements };
}

test('canh gac: ref 5 nut extraAction khong doi qua nhieu lan render()/notify()', () => {
  const { elements } = setupMockDOM();
  Object.assign(state, defaultConfig());
  state.endpoints = [
    { id: 'e1', method: 'GET', pathTemplate: '/a', sheetName: 'Sheet 1', attachMsisdn: true },
  ];

  const list = initEndpointList();
  const host = elements['list-endpoint'];

  const before = [0, 1, 2, 3, 4].map((i) => host.querySelector(`[data-extra-action="${i}"]`));
  assert.ok(before.every(Boolean), 'phai tim thay du 5 nut extraAction luc dau');

  list.render();
  notify();
  list.render();

  const after = [0, 1, 2, 3, 4].map((i) => host.querySelector(`[data-extra-action="${i}"]`));
  for (let i = 0; i < 5; i += 1) {
    assert.equal(after[i], before[i], `nut index ${i} phai giu nguyen tham chieu sau render()/notify()`);
  }
});

test('nut MSISDN(loc) disable khi o tim kiem rong, het disable va bao dung so dong khi go', () => {
  const { elements } = setupMockDOM();
  Object.assign(state, defaultConfig());
  state.endpoints = [
    { id: 'e1', method: 'GET', pathTemplate: '/tra-cuu', name: 'Tra cuu A', sheetName: 'Sheet 1', attachMsisdn: true },
    { id: 'e2', method: 'GET', pathTemplate: '/khac', name: 'Khac', sheetName: 'Sheet 1', attachMsisdn: true },
  ];

  initEndpointList();
  const host = elements['list-endpoint'];
  const msisdnFilteredBtn = host.querySelector('[data-extra-action="3"]');
  assert.ok(msisdnFilteredBtn);
  assert.equal(msisdnFilteredBtn.disabled, true, 'search rong thi nut phai disable');

  const searchInput = host.querySelector('[data-search]');
  searchInput.value = 'tra cuu';
  searchInput.dispatchEvent({ type: 'input' });

  assert.equal(msisdnFilteredBtn.disabled, false);
  assert.ok(msisdnFilteredBtn.textContent.includes('lọc 1'), `nhan phai bao so dong dang hien: ${msisdnFilteredBtn.textContent}`);
});

test('search khop 0 dong: nut Query(loc) disable lai va bao (loc 0)', () => {
  const { elements } = setupMockDOM();
  Object.assign(state, defaultConfig());
  state.endpoints = [
    { id: 'e1', method: 'GET', pathTemplate: '/a', name: 'A', sheetName: 'Sheet 1', attachCommonQuery: true },
  ];

  initEndpointList();
  const host = elements['list-endpoint'];
  const commonQueryFilteredBtn = host.querySelector('[data-extra-action="4"]');
  const searchInput = host.querySelector('[data-search]');

  searchInput.value = 'khong-ton-tai';
  searchInput.dispatchEvent({ type: 'input' });

  assert.equal(commonQueryFilteredBtn.disabled, true);
  assert.ok(commonQueryFilteredBtn.textContent.includes('lọc 0'), `nhan phai bao 0 dong: ${commonQueryFilteredBtn.textContent}`);
});
