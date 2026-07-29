import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditableList } from '../public/js/ui/editable-list.js';

class MockElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
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
    this.files = [];
    this.selectionStart = 0;
    this.selectionEnd = 0;
    this.focused = false;
    
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

  getAttribute(attr) {
    return this.attributes[attr] ?? null;
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
    // Build tree representing template innerHTML in createEditableList
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
      const matches = [...html.matchAll(/data-extra-action="(\d+)".*?>(.*?)<\/button>/g)];
      for (const m of matches) {
        const btnExtra = new MockElement('button');
        btnExtra.className = 'btn btn-secondary btn-sm';
        btnExtra.attributes['data-extra-action'] = m[1];
        btnExtra.textContent = m[2];
        actions.append(btnExtra);
      }
      this.append(h2, body, actions);
    }
  }

  get innerHTML() {
    return '';
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
        check(child);
      }
    };
    for (const child of this.children) {
      check(child);
    }
    return results;
  }

  addEventListener(type, fn) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(fn);
  }

  dispatchEvent(event) {
    const handlers = this.listeners[event.type] || [];
    return handlers.map((fn) => fn(event));
  }

  click() {
    this.dispatchEvent({ type: 'click' });
  }

  focus() {
    this.focused = true;
  }

  setSelectionRange(start, end) {
    this.selectionStart = start;
    this.selectionEnd = end;
  }
}

function matchesSelector(node, selector) {
  if (selector.startsWith('[') && selector.endsWith(']')) {
    const attr = selector.slice(1, -1);
    return node.attributes[attr] !== undefined;
  }
  if (selector.startsWith('.')) {
    const cls = selector.slice(1);
    return node.classList.contains(cls);
  }
  return false;
}

function setupDOMMock() {
  globalThis.document = {
    createElement: (tagName) => new MockElement(tagName)
  };
  globalThis.confirm = () => true;
  globalThis.window = {
    confirm: globalThis.confirm,
    ccmToast: () => {}
  };
}

test('createEditableList hien thi empty state khi khong co item', () => {
  setupDOMMock();
  const host = new MockElement('section');
  let items = [];

  createEditableList({
    host,
    title: 'MSISDN',
    kind: 'msisdn',
    getItems: () => items,
    setItems: (v) => { items = v; },
  });

  const count = host.querySelector('[data-count]');
  const body = host.querySelector('[data-body]');
  const empty = body.querySelector('.el-empty');

  assert.equal(count.textContent, '(0)');
  assert.ok(empty);
  assert.equal(empty.textContent, 'Chưa có dữ liệu. Bấm "+ Thêm" hoặc "⤓ Import".');
});

test('createEditableList render danh sach va hieu chinh msisdn validation', () => {
  setupDOMMock();
  const host = new MockElement('section');
  let items = ['0912345678', 'invalid_phone'];
  let changed = false;

  createEditableList({
    host,
    title: 'MSISDN',
    kind: 'msisdn',
    placeholder: '0912345678',
    getItems: () => items,
    setItems: (v) => { items = v; },
    onChange: () => { changed = true; }
  });

  const count = host.querySelector('[data-count]');
  const body = host.querySelector('[data-body]');
  const inputs = body.querySelectorAll('.el-input');

  assert.equal(count.textContent, '(2)');
  assert.equal(inputs.length, 2);

  assert.equal(inputs[0].value, '0912345678');
  assert.equal(inputs[0].classList.contains('is-invalid'), false);

  assert.equal(inputs[1].value, 'invalid_phone');
  assert.equal(inputs[1].classList.contains('is-invalid'), true);
  assert.ok(inputs[1].title.length > 0);

  // Test input event
  inputs[1].value = '0987654321';
  inputs[1].dispatchEvent({ type: 'input' });

  assert.equal(items[1], '0987654321');
  assert.equal(changed, true);
  assert.equal(inputs[1].classList.contains('is-invalid'), false);
});

test('nut + Them chen dong moi va commit', () => {
  setupDOMMock();
  const host = new MockElement('section');
  let items = ['0912345678'];

  createEditableList({
    host,
    title: 'MSISDN',
    kind: 'msisdn',
    getItems: () => items,
    setItems: (v) => { items = v; },
  });

  const addBtn = host.querySelector('[data-add]');
  addBtn.click();

  assert.equal(items.length, 2);
  assert.equal(items[1], '');

  const inputs = host.querySelector('[data-body]').querySelectorAll('.el-input');
  assert.equal(inputs.length, 2);
  assert.equal(inputs[1].focused, true);
});

test('nut Xoa dong xoa item tai index', () => {
  setupDOMMock();
  const host = new MockElement('section');
  let items = ['0912345678', '0987654321'];

  createEditableList({
    host,
    title: 'MSISDN',
    kind: 'msisdn',
    getItems: () => items,
    setItems: (v) => { items = v; },
  });

  const delBtns = host.querySelector('[data-body]').querySelectorAll('.el-del');
  delBtns[0].click();

  assert.equal(items.length, 1);
  assert.equal(items[0], '0987654321');
});

test('phim Enter va Backspace trong input', () => {
  setupDOMMock();
  const host = new MockElement('section');
  let items = ['0912345678', ''];

  createEditableList({
    host,
    title: 'MSISDN',
    kind: 'msisdn',
    getItems: () => items,
    setItems: (v) => { items = v; },
  });

  const body = host.querySelector('[data-body]');
  let inputs = body.querySelectorAll('.el-input');

  // Enter o dong 0 -> chen dong moi o index 1
  let prevented = false;
  inputs[0].dispatchEvent({
    type: 'keydown',
    key: 'Enter',
    preventDefault: () => { prevented = true; }
  });
  assert.equal(prevented, true);
  assert.equal(items.length, 3);
  assert.equal(items[1], '');

  // Backspace o dong rong index 1 -> xoa dong 1
  inputs = body.querySelectorAll('.el-input');
  prevented = false;
  inputs[1].dispatchEvent({
    type: 'keydown',
    key: 'Backspace',
    preventDefault: () => { prevented = true; }
  });
  assert.equal(prevented, true);
  assert.equal(items.length, 2);
});

test('paste nhieu dong tach thanh nhieu item', () => {
  setupDOMMock();
  const host = new MockElement('section');
  let items = ['0912345678'];

  createEditableList({
    host,
    title: 'MSISDN',
    kind: 'msisdn',
    getItems: () => items,
    setItems: (v) => { items = v; },
  });

  const body = host.querySelector('[data-body]');
  const input = body.querySelectorAll('.el-input')[0];

  let prevented = false;
  input.dispatchEvent({
    type: 'paste',
    clipboardData: {
      getData: (type) => type === 'text' ? '0911111111\n0922222222\n0933333333' : ''
    },
    preventDefault: () => { prevented = true; }
  });

  assert.equal(prevented, true);
  assert.deepEqual(items, ['0911111111', '0922222222', '0933333333']);
});

test('nut Xoa het hien dialog confirm va xoa toan bo', () => {
  setupDOMMock();
  const host = new MockElement('section');
  let items = ['0912345678', '0987654321'];

  createEditableList({
    host,
    title: 'MSISDN',
    kind: 'msisdn',
    getItems: () => items,
    setItems: (v) => { items = v; },
  });

  const clearBtn = host.querySelector('[data-clear]');
  clearBtn.click();

  assert.deepEqual(items, []);
  const empty = host.querySelector('[data-body]').querySelector('.el-empty');
  assert.ok(empty);
});

test('renderExtra hook chèn phan tu vao truoc input', () => {
  setupDOMMock();
  const host = new MockElement('section');
  let items = [{ path: '/api/v1', enabled: true, method: 'GET' }];

  createEditableList({
    host,
    title: 'Endpoints',
    kind: 'endpoint',
    getItems: () => items,
    setItems: (v) => { items = v; },
    getValue: (item) => item.path,
    setValue: (item, val) => ({ ...item, path: val }),
    makeItem: (val) => ({ path: val, enabled: true, method: 'GET' }),
    renderExtra: (item, index, row) => {
      const chk = new MockElement('input');
      chk.type = 'checkbox';
      chk.className = 'el-extra-chk';
      row.append(chk);
    }
  });

  const row = host.querySelector('[data-body]').querySelector('.el-row');
  const chk = row.querySelector('.el-extra-chk');
  assert.ok(chk);
});

test('extraActions chen them nut vao thanh hanh dong', () => {
  setupDOMMock();
  const host = new MockElement('section');
  let items = [];
  let clicked = 0;

  createEditableList({
    host,
    title: 'Endpoints',
    kind: 'endpoint',
    getItems: () => items,
    setItems: (v) => { items = v; },
    extraActions: [{ label: '⊢ Template', title: 'Map cột', onClick: () => { clicked += 1; } }],
  });

  const btn = host.querySelector('[data-extra-action]');
  assert.ok(btn);
  assert.equal(btn.textContent, '⊢ Template');
  btn.click();
  assert.equal(clicked, 1);
});

test('onImport thay the luong import mac dinh', async () => {
  setupDOMMock();
  const host = new MockElement('section');
  let items = [];
  let got = null;

  createEditableList({
    host,
    title: 'Endpoints',
    kind: 'endpoint',
    getItems: () => items,
    setItems: (v) => { items = v; },
    onImport: async (file) => { got = file; },
  });

  const fileInput = host.querySelector('[data-file]');
  fileInput.files = [{ name: 'apis.xlsx' }];
  await Promise.all(fileInput.dispatchEvent({ type: 'change' }));

  assert.equal(got.name, 'apis.xlsx');
});

