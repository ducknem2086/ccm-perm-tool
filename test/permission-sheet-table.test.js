import test from 'node:test';
import assert from 'node:assert/strict';
import { initPermissionSheetTable } from '../public/js/ui/permission-sheet-table.js';
import { emptySheetFilter } from '../public/js/shared/permission-sheet-filter.js';

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
  const table = new MockElement('table', 'perm-sheet-table');
  globalThis.document = {
    getElementById: (id) => (id === 'perm-sheet-table' ? table : null),
    createElement: (tag) => new MockElement(tag),
  };
  return { table };
}

function sheet(over = {}) {
  return {
    filename: 'quyen.xlsx',
    headers: ['BE Name', 'Action BE', 'ĐTV đối tác'],
    rows: [
      ['Tra cuu whitelist', 'GET /query/a', 'x'],
      ['Cap nhat whitelist', 'POST /query/b', ''],
    ],
    ...over,
  };
}

const uc2 = { permissionColumn: 'BE Name' };
const roleCols = [{ index: 2, name: 'ĐTV đối tác' }];

function makeCtrl(over = {}) {
  return initPermissionSheetTable({
    getSheet: () => sheet(),
    getRoleColumns: () => roleCols,
    getUc2: () => uc2,
    getFilter: () => emptySheetFilter(),
    ...over,
  });
}

test('render empty state khi chua nap file', () => {
  const { table } = setupMockDOM();
  const ctrl = makeCtrl({ getSheet: () => sheet({ filename: '' }) });
  const result = ctrl.render();

  const tbody = table.querySelector('tbody');
  assert.ok(tbody.querySelector('.el-empty'));
  assert.deepEqual(result, { shown: 0, total: 0 });
});

test('header chi gom # + cot dinh danh UC2 + cot role da tick, khong co Action BE', () => {
  const { table } = setupMockDOM();
  const ctrl = makeCtrl();
  ctrl.render();

  const headRow = table.querySelector('thead').querySelectorAll('th');
  assert.deepEqual(headRow.map((th) => th.textContent), ['#', 'BE Name', 'ĐTV đối tác']);
});

test('khong cot role nao duoc chon thi chi con # + cot dinh danh', () => {
  const { table } = setupMockDOM();
  const ctrl = makeCtrl({ getRoleColumns: () => [] });
  ctrl.render();

  const headRow = table.querySelector('thead').querySelectorAll('th');
  assert.deepEqual(headRow.map((th) => th.textContent), ['#', 'BE Name']);
});

test('render dien dung noi dung tung o theo displayCols, cot # la so dong Excel (index+2)', () => {
  const { table } = setupMockDOM();
  const ctrl = makeCtrl();
  ctrl.render();

  const rows = table.querySelector('tbody').querySelectorAll('tr');
  const firstCells = rows[0].children.map((td) => td.textContent);
  assert.deepEqual(firstCells, ['2', 'Tra cuu whitelist', 'x']);
});

test('o x trong cot role co class status-up, cot dinh danh thi khong', () => {
  const { table } = setupMockDOM();
  const ctrl = initPermissionSheetTable({
    getSheet: () => sheet({
      headers: ['BE Name', 'ĐTV đối tác'],
      rows: [['x', 'x']],
    }),
    getRoleColumns: () => [{ index: 1, name: 'ĐTV đối tác' }],
    getUc2: () => uc2,
    getFilter: () => emptySheetFilter(),
  });
  ctrl.render();

  const row = table.querySelector('tbody').querySelector('tr');
  const [numCell, beNameCell, roleCell] = row.children;
  assert.equal(numCell.classList.contains('status-up'), false);
  assert.equal(beNameCell.classList.contains('status-up'), false);
  assert.equal(roleCell.classList.contains('status-up'), true);
});

test('filter granted false thi chi con dong khong co quyen', () => {
  const { table } = setupMockDOM();
  const ctrl = makeCtrl({ getFilter: () => ({ granted: false, denied: true }) });
  const result = ctrl.render();

  const rows = table.querySelector('tbody').querySelectorAll('tr');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].children[1].textContent, 'Cap nhat whitelist');
  assert.deepEqual(result, { shown: 1, total: 2 });
});

// Mot nguon su that (Option A): getRoleColumns() vua quyet dinh cot HIEN THI
// vua quyet dinh cot CHAM DIEM granted/denied — khong con hai lop tach biet
// nhu ban thiet ke cu (roleColumns toan cuc + getSelectedColumns rieng).
test('getRoleColumns rong: khong cot nao duoc cham, moi dong la khong co quyen', () => {
  const { table } = setupMockDOM();
  const ctrl = makeCtrl({ getFilter: () => ({ granted: false, denied: true }), getRoleColumns: () => [] });
  const result = ctrl.render();

  const rows = table.querySelector('tbody').querySelectorAll('tr');
  assert.equal(rows.length, 2, 'ca hai dong deu la khong co quyen vi khong cot role nao duoc cham');
  assert.deepEqual(result, { shown: 2, total: 2 });
});

test('render tra ve shown/total dung', () => {
  setupMockDOM();
  const ctrl = makeCtrl();
  assert.deepEqual(ctrl.render(), { shown: 2, total: 2 });
});

test('sheet khong chua cot nao dang khai: bao dung ly do thay vi bang chi co cot #', () => {
  const { table } = setupMockDOM();
  const ctrl = makeCtrl({
    getSheet: () => sheet({ headers: ['Ma', 'Mo ta'], rows: [['M1', 'abc'], ['M2', 'def']] }),
    getRoleColumns: () => [],
  });
  const result = ctrl.render();

  const tbody = table.querySelector('tbody');
  const empty = tbody.querySelector('.el-empty');
  assert.ok(empty, 'phai co empty state');
  assert.ok(empty.textContent.includes('không có cột nào đang khai'));
  assert.deepEqual(result, { shown: 0, total: 2 });
});

test('cot dinh danh UC2 trung cot role da chon: chi render mot lan', () => {
  const { table } = setupMockDOM();
  const ctrl = makeCtrl({
    getRoleColumns: () => [{ index: 0, name: 'BE Name' }, { index: 2, name: 'ĐTV đối tác' }],
  });
  ctrl.render();

  const headRow = table.querySelector('thead').querySelectorAll('th');
  assert.deepEqual(headRow.map((th) => th.textContent), ['#', 'BE Name', 'ĐTV đối tác']);
});

test('sheet da luu bien mat: bao dung nguyen nhan, khong bao "khong co cot nao"', () => {
  const { table } = setupMockDOM();
  const ctrl = makeCtrl({
    getSheet: () => ({ filename: 'quyen.xlsx', missing: true }),
    getRoleColumns: () => [],
  });
  const result = ctrl.render();

  const empty = table.querySelector('tbody').querySelector('.el-empty');
  assert.ok(empty.textContent.includes('Sheet đã lưu không còn trong file phân quyền'));
  assert.deepEqual(result, { shown: 0, total: 0 });
});
