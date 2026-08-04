import test from 'node:test';
import assert from 'node:assert/strict';
import { initPermissionTable } from '../public/js/ui/permission-table.js';
import { emptyPermFilter } from '../public/js/shared/permission-filter-logic.js';

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
    this.style = {};
    this.title = '';
    this.colSpan = 1;
    this._textContent = '';

    const self = this;
    this.classList = {
      add(...cs) { cs.forEach((c) => self._classList.add(c)); },
      remove(...cs) { cs.forEach((c) => self._classList.delete(c)); },
      contains(c) { return self._classList.has(c); },
      toggle(c, force) {
        const shouldAdd = force !== undefined ? Boolean(force) : !self._classList.has(c);
        if (shouldAdd) self._classList.add(c);
        else self._classList.delete(c);
        return shouldAdd;
      },
    };
  }

  get textContent() {
    if (this._textContent) return this._textContent;
    return this.children.map((c) => (typeof c === 'string' ? c : c.textContent)).join('');
  }

  set textContent(val) {
    this._textContent = String(val);
    this.children = [];
  }

  get className() { return Array.from(this._classList).join(' '); }

  set className(val) {
    this._classList.clear();
    if (val) val.split(/\s+/).filter(Boolean).forEach((c) => this._classList.add(c));
  }

  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name]; }

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
    for (const fn of handlers) fn(event);
  }

  click() { this.dispatchEvent({ type: 'click', stopPropagation() {} }); }

  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }

  querySelectorAll(selector) {
    const out = [];
    const check = (node) => {
      if (matchesSelector(node, selector)) out.push(node);
      for (const child of node.children) if (typeof child !== 'string') check(child);
    };
    for (const child of this.children) if (typeof child !== 'string') check(child);
    return out;
  }
}

function matchesSelector(node, selector) {
  if (selector.startsWith('.')) return node.classList.contains(selector.slice(1));
  if (['tr', 'td', 'th', 'thead', 'tbody'].includes(selector)) return node.tagName === selector.toUpperCase();
  return false;
}

function setupMockDOM() {
  const table = new MockElement('table', 'perm-table');
  globalThis.document = {
    getElementById: (id) => (id === 'perm-table' ? table : null),
    createElement: (tag) => new MockElement(tag),
  };
  return { table };
}

function rec(index, over = {}) {
  return {
    index,
    statusPermission: 'true',
    authName: 'User Profile',
    sheetName: 'Sheet 1',
    pathTemplate: '/api/v1/user',
    endpointName: 'Tra cuu thue bao',
    permissionMatchedName: 'Tra cuu TB',
    response: { status: 200, bodyText: '{"data":"ok"}' },
    ...over,
  };
}

test('initPermissionTable render empty state khi khong co ban ghi', () => {
  const { table } = setupMockDOM();
  const ctrl = initPermissionTable({ getRecords: () => [], getFilter: () => emptyPermFilter() });
  ctrl.render();

  const tbody = table.querySelector('tbody');
  const emptyTd = tbody.querySelector('.el-empty');
  assert.ok(emptyTd);
  assert.deepEqual(ctrl.getVisibleIndexes(), []);
});

test('initPermissionTable render du cot dung thu tu, co cot Action dau bang', () => {
  const { table } = setupMockDOM();
  const ctrl = initPermissionTable({ getRecords: () => [rec(1)], getFilter: () => emptyPermFilter() });
  ctrl.render();

  const headRow = table.querySelector('thead').querySelectorAll('th').filter((th) => !th.classList.contains('filter-cell'));
  assert.deepEqual(headRow.map((th) => th.textContent), [
    'Action', 'Status', 'Status Check Perm', 'Status Perm', 'Auth', 'Endpoint', 'Role',
    'Endpoint Name', 'UC2 Name', 'Response Body',
  ]);
});

test('initPermissionTable dien dung noi dung tung o theo nguon du lieu', () => {
  const { table } = setupMockDOM();
  const record = rec(1, {
    statusPermission: 'false',
    authName: 'Admin Profile',
    sheetName: 'Sheet 2',
    pathTemplate: '/api/v1/report',
    endpointName: 'Bao cao chi tiet',
    permissionMatchedName: 'Bao cao',
    response: { status: 403, bodyText: '{"error":"forbidden"}' },
  });
  const ctrl = initPermissionTable({ getRecords: () => [record], getFilter: () => emptyPermFilter() });
  ctrl.render();

  const row = table.querySelector('tbody').querySelector('tr');
  const cells = row.children.map((td) => td.textContent);
  assert.equal(cells[1], '403');
  assert.equal(cells[3], 'false');
  assert.equal(cells[4], 'Admin Profile');
  assert.equal(cells[5], '/api/v1/report');
  assert.equal(cells[6], 'Sheet 2');
  assert.equal(cells[7], 'Bao cao chi tiet');
  assert.equal(cells[8], 'Bao cao');
  assert.ok(cells[9].includes('forbidden'));
});

test('o Status Perm gan class status-up cho true, status-down cho false, khong class cho empty', () => {
  const { table } = setupMockDOM();
  const records = [
    rec(1, { statusPermission: 'true' }),
    rec(2, { statusPermission: 'false' }),
    rec(3, { statusPermission: 'empty' }),
  ];
  const ctrl = initPermissionTable({ getRecords: () => records, getFilter: () => emptyPermFilter() });
  ctrl.render();

  const rows = table.querySelector('tbody').querySelectorAll('tr');
  const permCellOf = (row) => row.children[3];
  assert.equal(permCellOf(rows[0]).classList.contains('status-up'), true);
  assert.equal(permCellOf(rows[1]).classList.contains('status-down'), true);
  assert.equal(permCellOf(rows[2]).classList.contains('status-up'), false);
  assert.equal(permCellOf(rows[2]).classList.contains('status-down'), false);
});

test('cot Action co nut xem chi tiet, bam nut goi onRowClick voi dung record', () => {
  const { table } = setupMockDOM();
  let clicked = null;
  const record = rec(1);
  const ctrl = initPermissionTable({
    getRecords: () => [record],
    getFilter: () => emptyPermFilter(),
    onRowClick: (r) => { clicked = r; },
  });
  ctrl.render();

  const row = table.querySelector('tbody').querySelector('tr');
  const actionCell = row.children[0];
  assert.ok(actionCell.classList.contains('cell-actions'));
  const btn = actionCell.querySelector('.btn-icon');
  assert.ok(btn);

  btn.click();
  assert.equal(clicked, record);
});

test('bam vao row (ngoai nut Action) khong goi onRowClick', () => {
  const { table } = setupMockDOM();
  let clicked = null;
  const record = rec(1);
  const ctrl = initPermissionTable({
    getRecords: () => [record],
    getFilter: () => emptyPermFilter(),
    onRowClick: (r) => { clicked = r; },
  });
  ctrl.render();

  table.querySelector('tbody').querySelector('tr').click();
  assert.equal(clicked, null);
});

test('bang dang loc thi getVisibleIndexes chi tinh dong con hien thi', () => {
  const { table } = setupMockDOM();
  const records = [rec(1, { statusPermission: 'true' }), rec(2, { statusPermission: 'false' }), rec(3, { statusPermission: 'true' })];
  const ctrl = initPermissionTable({
    getRecords: () => records,
    getFilter: () => ({ ...emptyPermFilter(), perm: 'true' }),
  });
  ctrl.render();

  assert.deepEqual(ctrl.getVisibleIndexes(), [1, 3]);
});
