import test from 'node:test';
import assert from 'node:assert/strict';
import { initResultTable } from '../public/js/ui/result-table.js';
import { ALL_COLUMNS, emptyFilter } from '../public/js/shared/filter-logic.js';

class MockElement {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.children = [];
    this.parentElement = null;
    this._classList = new Set();
    this.attributes = {};
    this.listeners = {};
    this.dataset = {};
    this.hidden = false;
    this.scrollTop = 0;
    this.clientHeight = 400;
    this.style = {};
    this.title = '';
    this.colSpan = 1;
    this._textContent = '';
    
    const self = this;
    this.classList = {
      add(...cs) { cs.forEach(c => self._classList.add(c)); },
      remove(...cs) { cs.forEach(c => self._classList.delete(c)); },
      contains(c) { return self._classList.has(c); },
    };
  }

  get textContent() {
    if (this._textContent) return this._textContent;
    return this.children.map(c => typeof c === 'string' ? c : c.textContent).join('');
  }

  set textContent(val) {
    this._textContent = String(val);
    this.children = [];
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

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name];
  }

  append(...nodes) {
    for (const node of nodes) {
      if (typeof node === 'string') {
        const textNode = new MockElement('#text');
        textNode.textContent = node;
        this.children.push(textNode);
        textNode.parentElement = this;
      } else {
        this.children.push(node);
        node.parentElement = this;
      }
    }
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }

  addEventListener(type, fn) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(fn);
  }

  dispatchEvent(event) {
    const handlers = this.listeners[event.type] || [];
    for (const fn of handlers) {
      fn(event);
    }
  }

  click() {
    this.dispatchEvent({ type: 'click' });
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    const check = (node) => {
      if (matchesSelector(node, selector)) {
        results.push(node);
      }
      for (const child of node.children) {
        if (typeof child !== 'string') check(child);
      }
    };
    for (const child of this.children) {
      if (typeof child !== 'string') check(child);
    }
    return results;
  }
}

function matchesSelector(node, selector) {
  if (selector.startsWith('.')) {
    return node.classList.contains(selector.slice(1));
  }
  if (selector === 'tr' || selector === 'td' || selector === 'th' || selector === 'thead' || selector === 'tbody') {
    return node.tagName === selector.toUpperCase();
  }
  return false;
}

function setupMockDOM() {
  const viewport = new MockElement('div', 'result-viewport');
  const table = new MockElement('table', 'result-table');

  globalThis.document = {
    getElementById: (id) => {
      if (id === 'result-viewport') return viewport;
      if (id === 'result-table') return table;
      return null;
    },
    createElement: (tagName) => new MockElement(tagName),
  };

  globalThis.requestAnimationFrame = (cb) => cb();

  return { viewport, table };
}

function makeRecord(index, override = {}) {
  return {
    index,
    endpointName: 'Endpoint 1',
    msisdn: '0912345678',
    request: {
      method: 'GET',
      url: `https://api.example.com/test/${index}`,
      headers: {},
      pathParams: {},
      queryParams: {},
      body: null,
    },
    response: {
      status: 200,
      statusText: 'OK',
      headers: {},
      body: { code: 0 },
      bodyText: '{"code":0}',
    },
    errorCode: null,
    durationMs: 120,
    errorMessage: null,
    ...override,
  };
}

test('initResultTable render empty state khi khong co ban ghi', () => {
  const { table } = setupMockDOM();
  let records = [];

  const tableCtrl = initResultTable({
    getRecords: () => records,
    getFilter: () => emptyFilter(),
    getVisibleColumns: () => ['index', 'request', 'response', 'status', 'errorCode', 'durationMs'],
  });

  tableCtrl.render();

  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  assert.ok(thead);
  assert.ok(tbody);

  const emptyTd = tbody.querySelector('.el-empty');
  assert.ok(emptyTd);
  assert.equal(emptyTd.textContent, 'Chưa có kết quả nào khớp bộ lọc.');
  assert.deepEqual(tableCtrl.getVisibleIndexes(), []);
});

test('initResultTable render danh sach duoi nguong VIRTUAL_THRESHOLD', () => {
  const { table } = setupMockDOM();
  let clickedRecord = null;
  const records = [
    makeRecord(1, { response: { status: 200, statusText: 'OK', body: {}, bodyText: 'OK' } }),
    makeRecord(2, { response: { status: 500, statusText: 'Error', body: null, bodyText: '' }, errorCode: 'ERR_500', errorMessage: 'Server Error' }),
  ];

  const tableCtrl = initResultTable({
    getRecords: () => records,
    getFilter: () => emptyFilter(),
    getVisibleColumns: () => ['index', 'request', 'response', 'status', 'errorCode', 'durationMs'],
    onRowClick: (rec) => { clickedRecord = rec; },
  });

  tableCtrl.render();

  const tbody = table.querySelector('tbody');
  const rows = tbody.children;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].dataset.index, '1');
  assert.equal(rows[1].dataset.index, '2');

  // Check cells of row 0
  const tds0 = rows[0].children;
  assert.equal(tds0[0].textContent, '1'); // index
  assert.equal(tds0[1].textContent, 'GET https://api.example.com/test/1'); // request
  assert.equal(tds0[2].textContent, 'OK'); // response
  assert.equal(tds0[3].textContent, '200'); // status
  assert.equal(tds0[3].classList.contains('status-up'), true);
  assert.equal(tds0[4].textContent, '—'); // errorCode
  assert.equal(tds0[4].classList.contains('status-up'), false);
  assert.equal(tds0[4].classList.contains('status-down'), false);
  assert.equal(tds0[5].textContent, '120ms'); // durationMs

  // Check cells of row 1
  const tds1 = rows[1].children;
  assert.equal(tds1[3].textContent, '500');
  assert.equal(tds1[3].classList.contains('status-down'), true);
  assert.equal(tds1[4].textContent, 'ERR_500');
  assert.equal(tds1[4].classList.contains('status-down'), true);

  // Test row click
  rows[0].click();
  assert.equal(clickedRecord, records[0]);

  assert.deepEqual(tableCtrl.getVisibleIndexes(), [1, 2]);
});

test('initResultTable virtual scroll khi so luong ban ghi > 500', () => {
  const { viewport, table } = setupMockDOM();
  const records = [];
  for (let i = 1; i <= 600; i++) {
    records.push(makeRecord(i));
  }

  const tableCtrl = initResultTable({
    getRecords: () => records,
    getFilter: () => emptyFilter(),
    getVisibleColumns: () => ['index', 'request'],
  });

  viewport.scrollTop = 0;
  viewport.clientHeight = 340; // 10 rows visible

  tableCtrl.render();

  let tbody = table.querySelector('tbody');
  // start = max(0, 0 - 10) = 0, visible = 10 + 20 = 30, end = 30
  // start == 0 -> no top spacer
  // end = 30 < 600 -> bottom spacer present
  let rows = tbody.children;
  assert.equal(rows[0].dataset.index, '1');
  const lastChild = rows[rows.length - 1];
  assert.equal(lastChild.classList.contains('spacer-row'), true);

  // Scroll down
  viewport.scrollTop = 3400; // 100th row
  viewport.dispatchEvent({ type: 'scroll' });

  tbody = table.querySelector('tbody');
  rows = tbody.children;
  // First row should be a top spacer row
  assert.equal(rows[0].classList.contains('spacer-row'), true);
  assert.equal(tableCtrl.getVisibleIndexes().length, 600);
});
