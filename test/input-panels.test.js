import test from 'node:test';
import assert from 'node:assert/strict';
import { state, defaultConfig, applyConfig } from '../public/js/state.js';
import { initConnectionPanel, tryLoadToken } from '../public/js/ui/connection-panel.js';
import { initDateRange } from '../public/js/ui/date-range.js';
import { initEndpointList } from '../public/js/ui/endpoint-list.js';
import { initParamTables } from '../public/js/ui/param-table.js';

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

  get className() {
    return Array.from(this._classList).join(' ');
  }

  set className(val) {
    this._classList.clear();
    if (val) {
      val.split(/\s+/).filter(Boolean).forEach(c => this._classList.add(c));
    }
  }

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

      const body = new MockElement('div');
      body.className = 'el-body';
      body.attributes['data-body'] = '';

      const actions = new MockElement('div');
      actions.className = 'el-actions';

      const btnAdd = new MockElement('button');
      btnAdd.className = 'btn btn-secondary btn-sm';
      btnAdd.attributes['data-add'] = '';

      const btnImport = new MockElement('button');
      btnImport.className = 'btn btn-secondary btn-sm';
      btnImport.attributes['data-import'] = '';

      const btnClear = new MockElement('button');
      btnClear.className = 'btn btn-secondary btn-sm';
      btnClear.attributes['data-clear'] = '';

      const inputFile = new MockElement('input');
      inputFile.type = 'file';
      inputFile.attributes['data-file'] = '';

      actions.append(btnAdd, btnImport, btnClear, inputFile);
      this.append(h2, body, actions);
    }
  }

  get innerHTML() {
    return '';
  }

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

  querySelector(selector) {
    const match = (node) => {
      if (selector.startsWith('.')) {
        return node._classList.has(selector.slice(1));
      }
      if (selector.startsWith('#')) {
        return node.id === selector.slice(1);
      }
      if (selector.startsWith('[') && selector.endsWith(']')) {
        const attrExpr = selector.slice(1, -1);
        if (attrExpr.includes('=')) {
          const [key, val] = attrExpr.split('=');
          const cleanVal = val.replace(/['"]/g, '');
          if (key === 'type') {
            return node.type === cleanVal;
          }
          return node.attributes[key] === cleanVal || node.dataset[key.slice(5)] === cleanVal;
        }
        if (attrExpr.startsWith('data-')) {
          return node.attributes[attrExpr] !== undefined || node.dataset[attrExpr.slice(5)] !== undefined;
        }
        if (attrExpr === 'type') {
          return Boolean(node.type);
        }
        return node.attributes[attrExpr] !== undefined;
      }
      return node.tagName === selector.toUpperCase();
    };

    const traverse = (node) => {
      if (match(node)) return node;
      for (const child of node.children) {
        const found = traverse(child);
        if (found) return found;
      }
      return null;
    };

    for (const child of this.children) {
      const found = traverse(child);
      if (found) return found;
    }
    return null;
  }

  querySelectorAll(selector) {
    const res = [];
    const match = (node) => {
      if (selector.startsWith('.')) {
        return node._classList.has(selector.slice(1));
      }
      if (selector.startsWith('[') && selector.endsWith(']')) {
        const attrExpr = selector.slice(1, -1);
        if (attrExpr.includes('=')) {
          const [key, val] = attrExpr.split('=');
          const cleanVal = val.replace(/['"]/g, '');
          if (key === 'type') {
            return node.type === cleanVal;
          }
          return node.attributes[key] === cleanVal || node.dataset[key.slice(5)] === cleanVal;
        }
        if (attrExpr.startsWith('data-')) {
          return node.attributes[attrExpr] !== undefined || node.dataset[attrExpr.slice(5)] !== undefined;
        }
        if (attrExpr === 'type') {
          return Boolean(node.type);
        }
        return node.attributes[attrExpr] !== undefined;
      }
      return node.tagName === selector.toUpperCase();
    };

    const traverse = (node) => {
      if (match(node)) res.push(node);
      for (const child of node.children) {
        traverse(child);
      }
    };

    for (const child of this.children) {
      traverse(child);
    }
    return res;
  }

  addEventListener(type, handler) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(handler);
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
    'inp-domain': new MockElement('input', 'inp-domain'),
    'token-indicator': new MockElement('span', 'token-indicator'),
    'btn-reload-token': new MockElement('button', 'btn-reload-token'),
    'tab-auths-badge': new MockElement('span', 'tab-auths-badge'),

    'inp-daterange': new MockElement('input', 'inp-daterange'),
    'inp-date-from': new MockElement('input', 'inp-date-from'),
    'inp-date-to': new MockElement('input', 'inp-date-to'),
    'sel-date-format': new MockElement('select', 'sel-date-format'),
    'date-preview': new MockElement('span', 'date-preview'),

    'list-endpoint': new MockElement('div', 'list-endpoint'),

    'tbl-query-params': new MockElement('div', 'tbl-query-params'),
    'tbl-headers': new MockElement('div', 'tbl-headers'),
    'sel-header-mode': new MockElement('select', 'sel-header-mode'),
    'inp-header-raw': new MockElement('textarea', 'inp-header-raw'),
    'header-raw-count': new MockElement('p', 'header-raw-count'),
  };

  globalThis.document = {
    cookie: '',
    getElementById: (id) => elements[id] || null,
    createElement: (tagName) => new MockElement(tagName),
    createTextNode: (text) => String(text),
    querySelectorAll: (selector) => {
      if (selector === '[data-add-param]') {
        const btnQuery = new MockElement('button');
        btnQuery.dataset.addParam = 'query';
        const btnHeader = new MockElement('button');
        btnHeader.dataset.addParam = 'header';
        return [btnQuery, btnHeader];
      }
      return [];
    },
    querySelector: (selector) => {
      if (selector === '[data-add-param="header"]') {
        const btn = new MockElement('button');
        btn.dataset.addParam = 'header';
        return btn;
      }
      return null;
    }
  };

  const store = new Map();
  globalThis.localStorage = {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
    clear() { store.clear(); }
  };

  globalThis.sessionStorage = {
    getItem(key) { return null; }
  };

  globalThis.window = {
    ccmToastCalls: [],
    ccmToast(msg, type) {
      this.ccmToastCalls.push({ msg, type });
    }
  };

  return { elements, store };
}

test('Connection Panel - domain binding va validate', () => {
  const { elements } = setupMockDOM();
  Object.assign(state, defaultConfig());
  initConnectionPanel();

  assert.equal(elements['inp-domain'].value, '');

  elements['inp-domain'].value = 'http://test.com';
  elements['inp-domain'].dispatchEvent({ type: 'input' });
  assert.equal(state.domain, 'http://test.com');
  assert.equal(elements['inp-domain'].classList.contains('is-invalid'), false);

  elements['inp-domain'].value = 'invalid-domain';
  elements['inp-domain'].dispatchEvent({ type: 'input' });
  assert.equal(elements['inp-domain'].classList.contains('is-invalid'), true);
});

test('indicator dem so profile co token', () => {
  const { elements } = setupMockDOM();
  Object.assign(state, defaultConfig());
  state.auths = [
    { id: 'a1', name: 'A', mode: 'fields', token: 'T', cookie: '', refreshToken: '', curlRaw: '' },
    { id: 'a2', name: 'B', mode: 'fields', token: '', cookie: '', refreshToken: '', curlRaw: '' },
    { id: 'a3', name: 'C', mode: 'curl', token: '', cookie: '', refreshToken: '', curlRaw: "curl -H 'Authorization: Bearer z'" },
  ];

  initConnectionPanel();

  assert.equal(elements['token-indicator'].textContent, '● 2/3 auth có token');
  assert.equal(elements['token-indicator'].classList.contains('is-off'), false);
});

test('indicator bao is-off khi khong profile nao co token', () => {
  const { elements } = setupMockDOM();
  Object.assign(state, defaultConfig());
  state.auths = [{ id: 'a1', name: 'A', mode: 'fields', token: '', cookie: '', refreshToken: '', curlRaw: '' }];

  initConnectionPanel();

  assert.equal(elements['token-indicator'].textContent, '○ 0/1 auth có token');
  assert.equal(elements['token-indicator'].classList.contains('is-off'), true);
});

test('Reload Token ghi vao profile dau tien khi chua chon filter', () => {
  const { elements } = setupMockDOM();
  Object.assign(state, defaultConfig());
  state.auths = [{ id: 'a1', name: 'PROD', mode: 'fields', token: '', cookie: '', refreshToken: '', curlRaw: '' }];

  initConnectionPanel();

  elements['btn-reload-token'].dispatchEvent({ type: 'click' });
  assert.equal(globalThis.window.ccmToastCalls.length, 1);
  assert.equal(globalThis.window.ccmToastCalls[0].type, 'error');

  globalThis.document.cookie = 'access_token=cookie-token-123';
  elements['btn-reload-token'].dispatchEvent({ type: 'click' });
  assert.equal(state.auths[0].token, 'cookie-token-123');
  assert.equal(globalThis.window.ccmToastCalls.length, 2);
  assert.equal(globalThis.window.ccmToastCalls[1].type, 'ok');
  assert.ok(globalThis.window.ccmToastCalls[1].msg.includes('PROD'));
});

test('Reload Token ghi vao profile dang duoc chon trong runFilter', () => {
  const { elements } = setupMockDOM();
  Object.assign(state, defaultConfig());
  state.auths = [
    { id: 'a1', name: 'PROD', mode: 'fields', token: '', cookie: '', refreshToken: '', curlRaw: '' },
    { id: 'a2', name: 'UAT', mode: 'fields', token: '', cookie: '', refreshToken: '', curlRaw: '' },
  ];
  state.runFilter = { methods: [], msisdnPatterns: [], authIds: ['a2'] };

  initConnectionPanel();

  globalThis.document.cookie = 'access_token=cookie-token-123';
  elements['btn-reload-token'].dispatchEvent({ type: 'click' });
  assert.equal(state.auths[1].token, 'cookie-token-123');
  assert.equal(state.auths[0].token, '');
});

test('Date Range Panel - formatting, picker sync, validation', () => {
  const { elements } = setupMockDOM();
  Object.assign(state, defaultConfig());

  const dr = initDateRange();

  // Initial
  assert.equal(elements['inp-daterange'].value, '');

  // Input valid range
  elements['inp-daterange'].value = '25/03/2026-01/04/2026';
  elements['inp-daterange'].dispatchEvent({ type: 'input' });
  assert.equal(state.dateRange.from, '25/03/2026');
  assert.equal(state.dateRange.to, '01/04/2026');
  assert.equal(elements['inp-daterange'].classList.contains('is-invalid'), false);
  assert.ok(elements['date-preview'].textContent.includes('25032026'));

  // Changing format dropdown
  elements['sel-date-format'].value = 'yyyy-MM-dd';
  elements['sel-date-format'].dispatchEvent({ type: 'change' });
  assert.equal(state.dateFormat, 'yyyy-MM-dd');
  assert.ok(elements['date-preview'].textContent.includes('2026-03-25'));

  // Input invalid range
  elements['inp-daterange'].value = '01/04/2026-25/03/2026';
  elements['inp-daterange'].dispatchEvent({ type: 'input' });
  assert.equal(elements['inp-daterange'].classList.contains('is-invalid'), true);
  assert.ok(elements['date-preview'].textContent.includes('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc'));
});

test('Endpoint List Panel - custom endpoint objects and checkboxes', () => {
  const { elements } = setupMockDOM();
  Object.assign(state, defaultConfig());
  state.endpoints = ['/endpoint1', { id: 'ep2', enabled: false, method: 'POST', pathTemplate: '/endpoint2', queryParams: [], headers: [] }];

  const list = initEndpointList();

  // Legacy string endpoint should be upgraded to object
  assert.equal(state.endpoints.length, 2);
  assert.equal(typeof state.endpoints[0], 'object');
  assert.equal(state.endpoints[0].pathTemplate, '/endpoint1');
  assert.equal(state.endpoints[0].enabled, true);
  assert.equal(state.endpoints[0].method, 'GET');

  assert.equal(state.endpoints[1].pathTemplate, '/endpoint2');
  assert.equal(state.endpoints[1].enabled, false);
  assert.equal(state.endpoints[1].method, 'POST');
});

test('Param Tables - initialization, add/delete params, state toggling', () => {
  const { elements } = setupMockDOM();
  Object.assign(state, defaultConfig());
  state.globalQueryParams = [
    { key: 'p1', value: 'v1', enabled: true }
  ];

  const pt = initParamTables();

  // Verify p1 exists in query params table DOM
  const table = elements['tbl-query-params'];
  assert.equal(table.children.length, 1);
  const row = table.children[0];

  // Try checking checkbox toggle in row
  const checkbox = row.querySelector('[type=checkbox]');
  assert.ok(checkbox);
  checkbox.checked = false;
  checkbox.dispatchEvent({ type: 'change' });
  assert.equal(state.globalQueryParams[0].enabled, false);

  // Try typing in key input in row
  const keyInp = row.querySelector('.pt-key');
  assert.ok(keyInp);
  keyInp.value = 'p1_updated';
  keyInp.dispatchEvent({ type: 'input' });
  assert.equal(state.globalQueryParams[0].key, 'p1_updated');

  // Try typing in value input in row
  const valInp = row.querySelector('.pt-val');
  assert.ok(valInp);
  valInp.value = 'v1_updated';
  valInp.dispatchEvent({ type: 'input' });
  assert.equal(state.globalQueryParams[0].value, 'v1_updated');

  // Click delete button
  const delBtn = row.querySelector('.el-del');
  assert.ok(delBtn);
  delBtn.dispatchEvent({ type: 'click' });
  assert.equal(state.globalQueryParams.length, 0);
  assert.equal(table.children.length, 1);
  assert.equal(table.children[0].className, 'el-empty');
});

test('HEADERS chung mac dinh o che do bang key-value', () => {
  const { elements } = setupMockDOM();
  Object.assign(state, defaultConfig());

  initParamTables();

  assert.equal(elements['sel-header-mode'].value, 'kv');
  assert.equal(elements['tbl-headers'].hidden, false);
  assert.equal(elements['inp-header-raw'].hidden, true);
  assert.equal(elements['header-raw-count'].hidden, true);
});

test('doi sang che do raw hien textarea, an bang key-value', () => {
  const { elements } = setupMockDOM();
  Object.assign(state, defaultConfig());

  initParamTables();

  elements['sel-header-mode'].value = 'raw';
  elements['sel-header-mode'].dispatchEvent({ type: 'change' });

  assert.equal(state.globalHeaderMode, 'raw');
  assert.equal(elements['tbl-headers'].hidden, true);
  assert.equal(elements['inp-header-raw'].hidden, false);
  assert.equal(elements['header-raw-count'].hidden, false);
});

test('dan cURL vao textarea ghi vao state va dem dung so header, bo dong URL', () => {
  const { elements } = setupMockDOM();
  Object.assign(state, defaultConfig());

  initParamTables();

  elements['sel-header-mode'].value = 'raw';
  elements['sel-header-mode'].dispatchEvent({ type: 'change' });

  const curl = "curl 'https://api.vn/x?a=1' \\\n"
    + "  -H 'Accept: application/json' \\\n"
    + "  -H 'refresh_token: eyJ.sig' \\\n"
    + "  -b 'access_token=aaa'";
  elements['inp-header-raw'].value = curl;
  elements['inp-header-raw'].dispatchEvent({ type: 'input' });

  assert.equal(state.globalHeaderRaw, curl);
  const msg = elements['header-raw-count'].textContent;
  assert.match(msg, /Đọc được 3 header/);
  assert.match(msg, /Accept/);
  assert.match(msg, /refresh_token/);
  assert.match(msg, /Cookie/);
  assert.ok(!/https/.test(msg), 'URL khong duoc dem thanh header');
});

test('dan noi dung khong co header nao thi bao ro thay vi im lang', () => {
  const { elements } = setupMockDOM();
  Object.assign(state, defaultConfig());

  initParamTables();
  elements['sel-header-mode'].value = 'raw';
  elements['sel-header-mode'].dispatchEvent({ type: 'change' });

  elements['inp-header-raw'].value = 'https://api.vn/chi-co-url';
  elements['inp-header-raw'].dispatchEvent({ type: 'input' });

  assert.match(elements['header-raw-count'].textContent, /Chưa đọc được header nào/);
  assert.equal(elements['header-raw-count'].classList.contains('status-down'), true);
});
