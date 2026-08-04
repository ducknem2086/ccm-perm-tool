import test from 'node:test';
import assert from 'node:assert/strict';
import { createKvTable } from '../public/js/ui/kv-table.js';

class MockElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.listeners = {};
    this.checked = false;
    this.value = '';
    this.type = '';
    this.title = '';
    this.placeholder = '';
    this._textContent = '';
    this._classList = new Set();
    const self = this;
    this.classList = {
      add(...cs) { cs.forEach((c) => self._classList.add(c)); },
      contains(c) { return self._classList.has(c); },
    };
  }

  get className() { return Array.from(this._classList).join(' '); }

  set className(val) {
    this._classList.clear();
    if (val) val.split(/\s+/).filter(Boolean).forEach((c) => this._classList.add(c));
  }

  get textContent() { return this._textContent; }

  set textContent(v) { this._textContent = String(v); }

  append(...nodes) { this.children.push(...nodes); }

  replaceChildren() { this.children = []; }

  set innerHTML(v) { if (v === '') this.children = []; }

  get innerHTML() { return ''; }

  addEventListener(type, fn) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(fn);
  }

  dispatchEvent(event) {
    for (const fn of this.listeners[event.type] || []) fn(event);
  }

  input(value) { this.value = value; this.dispatchEvent({ type: 'input' }); }

  toggle() { this.checked = !this.checked; this.dispatchEvent({ type: 'change' }); }

  click() { this.dispatchEvent({ type: 'click' }); }
}

function setupDocument() {
  globalThis.document = { createElement: (tag) => new MockElement(tag) };
}

function rowByClass(host, cls) {
  return host.children.find((row) => row.className === 'pt-row' && row.children.some((c) => c.className.includes(cls)));
}

test('createKvTable render dung so dong tu getRows', () => {
  setupDocument();
  const host = new MockElement('div');
  createKvTable({
    host,
    getRows: () => [{ key: 'a', value: '1', enabled: true }, { key: 'b', value: '2', enabled: true }],
    setRows: () => {},
  });
  assert.equal(host.children.length, 2);
});

test('createKvTable danh sach rong hien el-empty', () => {
  setupDocument();
  const host = new MockElement('div');
  createKvTable({ host, getRows: () => [], setRows: () => {}, emptyText: 'Trống' });
  assert.equal(host.children.length, 1);
  assert.equal(host.children[0].className, 'el-empty');
  assert.equal(host.children[0].textContent, 'Trống');
});

test('createKvTable sua o key goi setRows voi du lieu moi', () => {
  setupDocument();
  const host = new MockElement('div');
  let rows = [{ key: 'a', value: '1', enabled: true }];
  createKvTable({
    host,
    getRows: () => rows,
    setRows: (next) => { rows = next; },
  });

  const row = host.children[0];
  const keyInput = row.children[1];
  keyInput.input('a_renamed');

  assert.equal(rows[0].key, 'a_renamed');
  assert.equal(rows[0].value, '1');
});

test('createKvTable sua o value goi setRows voi du lieu moi', () => {
  setupDocument();
  const host = new MockElement('div');
  let rows = [{ key: 'a', value: '1', enabled: true }];
  createKvTable({ host, getRows: () => rows, setRows: (next) => { rows = next; } });

  const row = host.children[0];
  const valInput = row.children[2];
  valInput.input('99');

  assert.equal(rows[0].value, '99');
});

test('createKvTable bo tick checkbox dat enabled false', () => {
  setupDocument();
  const host = new MockElement('div');
  let rows = [{ key: 'a', value: '1', enabled: true }];
  createKvTable({ host, getRows: () => rows, setRows: (next) => { rows = next; } });

  const checkbox = host.children[0].children[0];
  checkbox.toggle();

  assert.equal(rows[0].enabled, false);
});

test('createKvTable nut xoa xoa dung dong va goi onChange', () => {
  setupDocument();
  const host = new MockElement('div');
  let rows = [{ key: 'a', value: '1', enabled: true }, { key: 'b', value: '2', enabled: true }];
  let changeCount = 0;
  createKvTable({
    host, getRows: () => rows, setRows: (next) => { rows = next; }, onChange: () => { changeCount += 1; },
  });

  const delBtn = host.children[0].children[3];
  delBtn.click();

  assert.equal(rows.length, 1);
  assert.equal(rows[0].key, 'b');
  assert.equal(changeCount, 1);
});

test('createKvTable addRow them dong moi va render lai', () => {
  setupDocument();
  const host = new MockElement('div');
  let rows = [];
  const table = createKvTable({ host, getRows: () => rows, setRows: (next) => { rows = next; } });

  table.addRow();

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], { key: '', value: '', enabled: true });
  assert.equal(host.children.length, 1);
});

test('createKvTable dung placeholder cho o key va value', () => {
  setupDocument();
  const host = new MockElement('div');
  createKvTable({
    host,
    getRows: () => [{ key: '', value: '', enabled: true }],
    setRows: () => {},
    keyPlaceholder: 'fromDate',
    valPlaceholder: '{{fromDate}}',
  });

  const row = host.children[0];
  assert.equal(row.children[1].placeholder, 'fromDate');
  assert.equal(row.children[2].placeholder, '{{fromDate}}');
});
