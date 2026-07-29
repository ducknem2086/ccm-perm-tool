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
    this.dispatchEvent({ type: 'click', stopPropagation() {} });
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
    pathTemplate: '/query/abc-information/{*}',
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
      headers: { 'content-type': 'application/json' },
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
    getVisibleColumns: () => ['index', 'status', 'name', 'path', 'request', 'responseBody', 'responseHeaders'],
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
    makeRecord(1, { response: { status: 200, statusText: 'OK', headers: { 'content-type': 'application/json' }, body: { code: 0, data: null }, bodyText: '{"code":0,"data":null}' } }),
    makeRecord(2, { response: { status: 500, statusText: 'Error', headers: {}, body: null, bodyText: '' }, errorCode: 'ERR_500', errorMessage: 'Server Error' }),
  ];

  const tableCtrl = initResultTable({
    getRecords: () => records,
    getFilter: () => emptyFilter(),
    getVisibleColumns: () => ['index', 'status', 'name', 'path', 'request', 'responseBody', 'responseHeaders'],
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
  assert.equal(tds0[0].textContent, '1');                                  // index
  assert.equal(tds0[1].textContent, '200 · 120ms');                        // status gom
  assert.equal(tds0[1].classList.contains('status-up'), true);
  assert.equal(tds0[2].textContent, 'Endpoint 1');                         // name
  assert.equal(tds0[3].textContent, '/query/abc-information/{*}');         // path
  assert.equal(tds0[4].textContent, 'GET https://api.example.com/test/1'); // request
  assert.equal(tds0[5].textContent, '{"code":0,"data":null}');             // response body: object da parse
  assert.equal(tds0[6].textContent, 'content-type: application/json');     // response header

  // Check cells of row 1
  const tds1 = rows[1].children;
  assert.equal(tds1[1].textContent, '500 · ERR_500 · 120ms');
  assert.equal(tds1[1].classList.contains('status-down'), true);

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

test('cot status hien dau gach ngang khi khong co status code', () => {
  const { table } = setupMockDOM();
  const records = [makeRecord(1, {
    response: { status: null, statusText: '', headers: {}, body: null, bodyText: '' },
    errorCode: 'ETIMEDOUT', errorMessage: 'timeout', durationMs: 30000,
  })];

  const tableCtrl = initResultTable({
    getRecords: () => records,
    getFilter: () => emptyFilter(),
    getVisibleColumns: () => ['status'],
  });
  tableCtrl.render();

  const td = table.querySelector('tbody').children[0].children[0];
  assert.equal(td.textContent, '— · ETIMEDOUT · 30000ms');
  assert.equal(td.classList.contains('status-down'), true);
});

test('cot name va response header hien dau gach ngang khi rong', () => {
  const { table } = setupMockDOM();
  const records = [makeRecord(1, {
    endpointName: '',
    response: { status: 200, statusText: 'OK', headers: {}, body: null, bodyText: '' },
  })];

  const tableCtrl = initResultTable({
    getRecords: () => records,
    getFilter: () => emptyFilter(),
    getVisibleColumns: () => ['name', 'responseHeaders'],
  });
  tableCtrl.render();

  const tds = table.querySelector('tbody').children[0].children;
  assert.equal(tds[0].textContent, '—');
  assert.equal(tds[1].textContent, '—');
});

test('cot response body hien object da parse thay vi chuoi tho', () => {
  const { table } = setupMockDOM();
  const records = [makeRecord(1, {
    response: {
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json;charset=UTF-8' },
      // bodyText co xuong dong va thut dau, cell van phai ra JSON compact.
      body: { errorCode: '0', data: { msisdn: '0912345678' } },
      bodyText: '{\n  "errorCode": "0",\n  "data": { "msisdn": "0912345678" }\n}',
    },
  })];

  const tableCtrl = initResultTable({
    getRecords: () => records,
    getFilter: () => emptyFilter(),
    getVisibleColumns: () => ['responseBody'],
  });
  tableCtrl.render();

  const td = table.querySelector('tbody').children[0].children[0];
  assert.equal(td.textContent, '{"errorCode":"0","data":{"msisdn":"0912345678"}}');
});

test('response khong phai JSON thi gan nhan mime truoc chuoi tho', () => {
  const { table } = setupMockDOM();
  const records = [makeRecord(1, {
    response: {
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: null,
      bodyText: '<!DOCTYPE html>\n<html><body>login</body></html>',
    },
  })];

  const tableCtrl = initResultTable({
    getRecords: () => records,
    getFilter: () => emptyFilter(),
    getVisibleColumns: () => ['responseBody'],
  });
  tableCtrl.render();

  const td = table.querySelector('tbody').children[0].children[0];
  assert.equal(td.textContent, '[text/html] <!DOCTYPE html> <html><body>login</body></html>');
});

test('moi hang co nut cURL, bam khong mo drawer', () => {
  const { table } = setupMockDOM();
  let clickedRow = null;
  let curlRec = null;
  const records = [makeRecord(1), makeRecord(2)];

  const tableCtrl = initResultTable({
    getRecords: () => records,
    getFilter: () => emptyFilter(),
    getVisibleColumns: () => ['index'],
    onRowClick: (rec) => { clickedRow = rec; },
    onCurlClick: (rec) => { curlRec = rec; },
  });
  tableCtrl.render();

  const rows = table.querySelector('tbody').children;
  const actionTd = rows[1].children[1];
  assert.ok(actionTd.classList.contains('cell-actions'));

  const btn = actionTd.children[0];
  assert.equal(btn.tagName, 'BUTTON');
  assert.equal(btn.textContent, 'cURL');

  btn.click();
  assert.equal(curlRec, records[1]);
  assert.equal(clickedRow, null, 'stopPropagation phai chan onRowClick');
});

test('thead giu nguyen node khi paint lai de khong mat focus o filter', () => {
  const { table } = setupMockDOM();
  const records = [makeRecord(1)];

  const tableCtrl = initResultTable({
    getRecords: () => records,
    getFilter: () => emptyFilter(),
    getVisibleColumns: () => ['index', 'status'],
  });

  tableCtrl.render();
  const firstHead = table.querySelector('thead');
  tableCtrl.render();
  assert.equal(table.querySelector('thead'), firstHead, 'thead phai la cung mot node');
});

test('filterCell duoc gan vao hang filter dung cot', () => {
  const { table } = setupMockDOM();
  const nameInput = new MockElement('input');
  nameInput.id = 'flt-col-name';

  const tableCtrl = initResultTable({
    getRecords: () => [makeRecord(1)],
    getFilter: () => emptyFilter(),
    getVisibleColumns: () => ['index', 'status', 'name'],
    filterCell: (key) => (key === 'name' ? nameInput : null),
  });
  tableCtrl.render();

  const thead = table.querySelector('thead');
  const filterRow = thead.children[1];
  assert.ok(filterRow.classList.contains('filter-row'));
  assert.equal(filterRow.children.length, 4, '3 cot chon + cot cURL luon co');
  assert.equal(filterRow.children[2].children[0], nameInput);
});
