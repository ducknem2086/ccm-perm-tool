import test from 'node:test';
import assert from 'node:assert/strict';
import { initFilters } from '../public/js/ui/filters.js';
import { ALL_COLUMNS } from '../public/js/shared/filter-logic.js';

class MockElement {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.children = [];
    this.value = '';
    this.type = '';
    this.placeholder = '';
    this.title = '';
    this.className = '';
    this.listeners = {};
  }

  addEventListener(event, fn) {
    this.listeners[event] = this.listeners[event] || [];
    this.listeners[event].push(fn);
  }

  dispatchEvent(event) {
    const list = this.listeners[event.type] || [];
    list.forEach((fn) => fn(event));
  }

  append(...nodes) {
    for (const node of nodes) {
      this.children.push(node);
    }
  }

  replaceChildren(...nodes) {
    this.children = [...nodes];
  }
}

function setupMockDOM() {
  const elements = {};
  const fltMsisdn = new MockElement('input', 'flt-msisdn');
  const btnColumns = new MockElement('button', 'btn-columns');
  elements['flt-msisdn'] = fltMsisdn;
  elements['btn-columns'] = btnColumns;

  const storage = {};
  global.localStorage = {
    getItem(key) { return storage[key] ?? null; },
    setItem(key, val) { storage[key] = String(val); },
    clear() { Object.keys(storage).forEach(k => delete storage[k]); },
  };

  global.document = {
    getElementById(id) {
      return elements[id] || null;
    },
    createElement(tagName) {
      return new MockElement(tagName);
    },
  };

  return { fltMsisdn, btnColumns };
}

test('initFilters tra ve getFilter, getVisibleColumns, filterCell, refreshOptions', () => {
  setupMockDOM();
  const filters = initFilters();
  assert.ok(typeof filters.getFilter === 'function');
  assert.ok(typeof filters.getVisibleColumns === 'function');
  assert.ok(typeof filters.filterCell === 'function');
  assert.ok(typeof filters.refreshOptions === 'function');
});

test('initFilters filterCell tra ve nameInput va statusPair dung key', () => {
  setupMockDOM();
  const filters = initFilters();

  const nameCell = filters.filterCell('name');
  assert.equal(nameCell.tagName, 'INPUT');
  assert.equal(nameCell.placeholder, 'gõ tìm');

  const statusCell = filters.filterCell('status');
  assert.equal(statusCell.tagName, 'DIV');
  assert.equal(statusCell.className, 'filter-pair');
  assert.equal(statusCell.children.length, 2);
  assert.equal(statusCell.children[0].tagName, 'SELECT');
  assert.equal(statusCell.children[1].tagName, 'SELECT');

  assert.equal(filters.filterCell('index'), null);
});

test('syncFilter cap nhat msisdn, name, status, errorCode va trigger onChange', () => {
  const { fltMsisdn } = setupMockDOM();
  let changed = false;
  const filters = initFilters({ onChange: () => { changed = true; } });

  fltMsisdn.value = ' 0912345678 ';
  fltMsisdn.dispatchEvent({ type: 'input' });

  assert.equal(changed, true);
  const filter = filters.getFilter();
  assert.equal(filter.msisdn, '0912345678');
});

test('refreshOptions cap nhat danh sach status va error code', () => {
  setupMockDOM();
  const filters = initFilters();

  const records = [
    { response: { status: 200 }, errorCode: null },
    { response: { status: 500 }, errorCode: 'E500' },
  ];

  filters.refreshOptions(records);

  const statusCell = filters.filterCell('status');
  const statusSelect = statusCell.children[0];
  const errorSelect = statusCell.children[1];

  assert.equal(statusSelect.children.length, 3); // (tat ca), 200, 500
  assert.equal(statusSelect.children[0].textContent, '(tất cả)');
  assert.equal(statusSelect.children[1].textContent, '200');
  assert.equal(statusSelect.children[2].textContent, '500');

  assert.equal(errorSelect.children.length, 2); // (tat ca), E500
  assert.equal(errorSelect.children[0].textContent, '(tất cả)');
  assert.equal(errorSelect.children[1].textContent, 'E500');
});
