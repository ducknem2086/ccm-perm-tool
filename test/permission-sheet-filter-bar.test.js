import test from 'node:test';
import assert from 'node:assert/strict';
import { initPermissionSheetFilterBar } from '../public/js/ui/permission-sheet-filter-bar.js';

class MockElement {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.listeners = {};
    this._textContent = '';
    this.checked = false;
    this.type = '';
  }

  get textContent() { return this._textContent; }

  set textContent(val) { this._textContent = String(val); }

  get value() { return this._value ?? ''; }

  set value(val) { this._value = String(val); }

  addEventListener(type, fn) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(fn);
  }

  dispatchEvent(event) {
    for (const fn of this.listeners[event.type] || []) fn(event);
  }
}

function setup() {
  const chkGranted = new MockElement('input');
  chkGranted.type = 'checkbox';
  chkGranted.checked = true;
  const chkDenied = new MockElement('input');
  chkDenied.type = 'checkbox';
  chkDenied.checked = true;
  const searchInput = new MockElement('input');
  searchInput.type = 'text';
  const countEl = new MockElement('span');

  globalThis.document = {
    getElementById: (id) => ({
      'chk-perm-granted': chkGranted,
      'chk-perm-denied': chkDenied,
      'inp-perm-sheet-search': searchInput,
      'perm-sheet-count': countEl,
    }[id] ?? null),
  };

  return {
    chkGranted, chkDenied, searchInput, countEl,
  };
}

test('getFilter tra ve trang thai 2 checkbox va o search', () => {
  const { chkGranted, chkDenied, searchInput } = setup();
  const bar = initPermissionSheetFilterBar({ onChange: () => {} });
  assert.deepEqual(bar.getFilter(), { granted: true, denied: true, search: '' });
  chkGranted.checked = false;
  searchInput.value = '  tra cuu  ';
  assert.deepEqual(bar.getFilter(), { granted: false, denied: true, search: 'tra cuu' });
  void chkDenied;
});

test('doi tich checkbox granted/denied goi onChange', () => {
  const { chkGranted } = setup();
  let changed = 0;
  initPermissionSheetFilterBar({ onChange: () => { changed += 1; } });
  chkGranted.dispatchEvent({ type: 'change' });
  assert.equal(changed, 1);
});

test('go vao o search goi onChange', () => {
  const { searchInput } = setup();
  let changed = 0;
  initPermissionSheetFilterBar({ onChange: () => { changed += 1; } });
  searchInput.dispatchEvent({ type: 'input' });
  assert.equal(changed, 1);
});

test('refreshCount cap nhat text dung dinh dang', () => {
  const { countEl } = setup();
  const bar = initPermissionSheetFilterBar({ onChange: () => {} });
  bar.refreshCount(3, 10);
  assert.equal(countEl.textContent, 'hiện 3/10 dòng');
});
