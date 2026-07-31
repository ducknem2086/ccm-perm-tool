import test from 'node:test';
import assert from 'node:assert/strict';
import { initPermissionSheetFilterBar } from '../public/js/ui/permission-sheet-filter-bar.js';

class MockElement {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.children = [];
    this.parentElement = null;
    this._classList = new Set();
    this.attributes = {};
    this.listeners = {};
    this.hidden = false;
    this._textContent = '';
    this.checked = false;
    this.type = '';

    const self = this;
    this.classList = {
      add(...cs) { cs.forEach((c) => self._classList.add(c)); },
      remove(...cs) { cs.forEach((c) => self._classList.delete(c)); },
      contains(c) { return self._classList.has(c); },
    };
  }

  get textContent() {
    if (this._textContent) return this._textContent;
    return this.children.map((c) => (typeof c === 'string' ? c : c.textContent)).join('');
  }

  set textContent(val) { this._textContent = String(val); this.children = []; }

  append(...nodes) {
    for (const node of nodes) {
      if (typeof node === 'string') {
        const t = new MockElement('#text');
        t.textContent = node;
        this.children.push(t);
      } else {
        this.children.push(node);
        node.parentElement = this;
      }
    }
  }

  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }

  addEventListener(type, fn) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(fn);
  }

  dispatchEvent(event) {
    for (const fn of this.listeners[event.type] || []) fn(event);
  }

  click() { this.dispatchEvent({ type: 'click' }); }

  contains(target) {
    if (target === this) return true;
    return this.children.some((c) => (typeof c !== 'string' && (c === target || c.contains?.(target))));
  }

  querySelectorAll(sel) {
    if (sel === 'input[type="checkbox"]') {
      const out = [];
      const walk = (n) => {
        for (const c of n.children) {
          if (typeof c === 'string') continue;
          if (c.type === 'checkbox') out.push(c);
          walk(c);
        }
      };
      walk(this);
      return out;
    }
    return [];
  }
}

function setup() {
  const chkGranted = new MockElement('input');
  chkGranted.type = 'checkbox';
  chkGranted.checked = true;
  const chkDenied = new MockElement('input');
  chkDenied.type = 'checkbox';
  chkDenied.checked = true;
  const countEl = new MockElement('span');
  const colBtn = new MockElement('button');
  const colPopup = new MockElement('ul');
  colPopup.hidden = true;

  const docListeners = {};
  globalThis.document = {
    getElementById: (id) => ({
      'chk-perm-granted': chkGranted,
      'chk-perm-denied': chkDenied,
      'perm-sheet-count': countEl,
      'btn-perm-col-filter': colBtn,
      'perm-col-popup': colPopup,
    }[id] ?? null),
    createElement: (tag) => new MockElement(tag),
    addEventListener: (type, fn) => {
      if (!docListeners[type]) docListeners[type] = [];
      docListeners[type].push(fn);
    },
    dispatchEvent: (event) => {
      for (const fn of docListeners[event.type] || []) fn(event);
    },
  };

  return { chkGranted, chkDenied, countEl, colBtn, colPopup };
}

test('getFilter tra ve trang thai 2 checkbox', () => {
  const { chkGranted, chkDenied } = setup();
  const bar = initPermissionSheetFilterBar({ getRoleColumns: () => [], onChange: () => {} });
  assert.deepEqual(bar.getFilter(), { granted: true, denied: true });
  chkGranted.checked = false;
  assert.deepEqual(bar.getFilter(), { granted: false, denied: true });
  void chkDenied;
});

test('getSelectedColumns mac dinh tick het cot role lan dau thay', () => {
  setup();
  const bar = initPermissionSheetFilterBar({
    getRoleColumns: () => [{ index: 1, name: 'ĐTV đối tác' }, { index: 2, name: 'Trưởng ca' }],
    onChange: () => {},
  });
  assert.deepEqual(bar.getSelectedColumns(), new Set(['ĐTV đối tác', 'Trưởng ca']));
});

test('bam vao button mo popup ve du checkbox theo role columns hien tai', () => {
  const { colBtn, colPopup } = setup();
  const bar = initPermissionSheetFilterBar({
    getRoleColumns: () => [{ index: 1, name: 'ĐTV đối tác' }],
    onChange: () => {},
  });
  void bar;
  colBtn.click();
  assert.equal(colPopup.hidden, false);
  const boxes = colPopup.querySelectorAll('input[type="checkbox"]');
  assert.equal(boxes.length, 1);
  assert.equal(boxes[0].checked, true);
});

test('bo tick mot checkbox cot thi getSelectedColumns mat ten do, goi onChange', () => {
  const { colBtn, colPopup } = setup();
  let changed = 0;
  const bar = initPermissionSheetFilterBar({
    getRoleColumns: () => [{ index: 1, name: 'ĐTV đối tác' }],
    onChange: () => { changed += 1; },
  });
  colBtn.click();
  const cb = colPopup.querySelectorAll('input[type="checkbox"]')[0];
  cb.checked = false;
  cb.dispatchEvent({ type: 'change' });

  assert.deepEqual(bar.getSelectedColumns(), new Set());
  assert.equal(changed, 1);
});

test('cot role moi xuat hien sau nay mac dinh duoc tick', () => {
  setup();
  let roleCols = [{ index: 1, name: 'ĐTV đối tác' }];
  const bar = initPermissionSheetFilterBar({ getRoleColumns: () => roleCols, onChange: () => {} });
  assert.deepEqual(bar.getSelectedColumns(), new Set(['ĐTV đối tác']));

  roleCols = [{ index: 1, name: 'ĐTV đối tác' }, { index: 2, name: 'Trưởng ca' }];
  assert.deepEqual(bar.getSelectedColumns(), new Set(['ĐTV đối tác', 'Trưởng ca']));
});

test('doi tich checkbox granted/denied goi onChange', () => {
  const { chkGranted } = setup();
  let changed = 0;
  initPermissionSheetFilterBar({ getRoleColumns: () => [], onChange: () => { changed += 1; } });
  chkGranted.dispatchEvent({ type: 'change' });
  assert.equal(changed, 1);
});

test('refreshCount cap nhat text dung dinh dang', () => {
  const { countEl } = setup();
  const bar = initPermissionSheetFilterBar({ getRoleColumns: () => [], onChange: () => {} });
  bar.refreshCount(3, 10);
  assert.equal(countEl.textContent, 'hiện 3/10 dòng');
});
