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
    this.dataset = {};
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

      if (html.includes('data-search')) {
        const searchInput = new MockElement('input');
        searchInput.type = 'search';
        searchInput.className = 'input input-sm el-search';
        searchInput.attributes['data-search'] = '';
        const ph = /data-search placeholder="([^"]*)"/.exec(html);
        searchInput.placeholder = ph ? ph[1] : '';
        h2.append(searchInput);
      }

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

/* ---------- search box ---------- */

function endpointItems() {
  return [
    { name: 'Tra cứu thuê bao', pathTemplate: '/query/abc-information' },
    { name: 'Tra cứu gói cước', pathTemplate: '/query/package-info' },
    { name: 'Đăng ký gói', pathTemplate: '/register/package' },
  ];
}

const byNameOrPath = (item, q) => {
  const query = q.trim().toLowerCase();
  return item.name.toLowerCase().includes(query) || item.pathTemplate.toLowerCase().includes(query);
};

test('khong truyen search thi khong co o tim kiem', () => {
  setupDOMMock();
  const host = new MockElement('section');
  createEditableList({
    host, title: 'MSISDN', kind: 'msisdn', getItems: () => [], setItems: () => {},
  });
  assert.equal(host.querySelector('[data-search]'), null);
});

test('truyen search thi o tim kiem nam trong h2 tieu de, ben canh khoi ten', () => {
  setupDOMMock();
  const host = new MockElement('section');
  createEditableList({
    host, title: 'ENDPOINTS', kind: 'endpoint', getItems: () => [], setItems: () => {},
    search: { placeholder: 'Tìm theo tên hoặc endpoint...', match: byNameOrPath },
  });

  const h2 = host.querySelectorAll('.card-title')[0];
  const searchInput = host.querySelector('[data-search]');
  assert.ok(searchInput);
  assert.ok(h2.children.includes(searchInput), 'o search phai la con truc tiep cua h2 tieu de');
  assert.equal(searchInput.placeholder, 'Tìm theo tên hoặc endpoint...');
});

test('go vao o search chi hien dong khop, khong xoa du lieu goc', () => {
  setupDOMMock();
  const host = new MockElement('section');
  let items = endpointItems();

  createEditableList({
    host, title: 'ENDPOINTS', kind: 'endpoint',
    getItems: () => items, setItems: (v) => { items = v; },
    getValue: (ep) => ep.pathTemplate,
    setValue: (ep, v) => ({ ...ep, pathTemplate: v }),
    search: { match: byNameOrPath },
  });

  const searchInput = host.querySelector('[data-search]');
  searchInput.value = 'tra cứu';
  searchInput.dispatchEvent({ type: 'input' });

  const rows = host.querySelector('[data-body]').querySelectorAll('.el-input');
  assert.equal(rows.length, 2, 'chi 2 dong co ten bat dau bang Tra cuu');
  assert.equal(items.length, 3, 'du lieu goc khong bi xoa boi search');
});

test('search khop theo pathTemplate', () => {
  setupDOMMock();
  const host = new MockElement('section');
  let items = endpointItems();

  createEditableList({
    host, title: 'ENDPOINTS', kind: 'endpoint',
    getItems: () => items, setItems: (v) => { items = v; },
    getValue: (ep) => ep.pathTemplate,
    setValue: (ep, v) => ({ ...ep, pathTemplate: v }),
    search: { match: byNameOrPath },
  });

  const searchInput = host.querySelector('[data-search]');
  searchInput.value = 'register';
  searchInput.dispatchEvent({ type: 'input' });

  const rows = host.querySelector('[data-body]').querySelectorAll('.el-input');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].value, '/register/package');
});

test('search khong khop hien thong bao rieng, giu nguyen du lieu', () => {
  setupDOMMock();
  const host = new MockElement('section');
  let items = endpointItems();

  createEditableList({
    host, title: 'ENDPOINTS', kind: 'endpoint',
    getItems: () => items, setItems: (v) => { items = v; },
    getValue: (ep) => ep.pathTemplate,
    setValue: (ep, v) => ({ ...ep, pathTemplate: v }),
    search: { match: byNameOrPath },
  });

  const searchInput = host.querySelector('[data-search]');
  searchInput.value = 'khong-ton-tai';
  searchInput.dispatchEvent({ type: 'input' });

  const body = host.querySelector('[data-body]');
  const empty = body.querySelector('.el-empty');
  assert.ok(empty);
  assert.equal(empty.textContent, 'Không tìm thấy dòng nào khớp tìm kiếm.');
  assert.equal(items.length, 3);
});

test('xoa o search tra ve day du danh sach', () => {
  setupDOMMock();
  const host = new MockElement('section');
  let items = endpointItems();

  createEditableList({
    host, title: 'ENDPOINTS', kind: 'endpoint',
    getItems: () => items, setItems: (v) => { items = v; },
    getValue: (ep) => ep.pathTemplate,
    setValue: (ep, v) => ({ ...ep, pathTemplate: v }),
    search: { match: byNameOrPath },
  });

  const searchInput = host.querySelector('[data-search]');
  searchInput.value = 'register';
  searchInput.dispatchEvent({ type: 'input' });
  assert.equal(host.querySelector('[data-body]').querySelectorAll('.el-input').length, 1);

  searchInput.value = '';
  searchInput.dispatchEvent({ type: 'input' });
  assert.equal(host.querySelector('[data-body]').querySelectorAll('.el-input').length, 3);
});

test('sua dong dang hien thi khi loc van ghi dung vao phan tu goc, khong lech index', () => {
  setupDOMMock();
  const host = new MockElement('section');
  let items = endpointItems();

  createEditableList({
    host, title: 'ENDPOINTS', kind: 'endpoint',
    getItems: () => items, setItems: (v) => { items = v; },
    getValue: (ep) => ep.pathTemplate,
    setValue: (ep, v) => ({ ...ep, pathTemplate: v }),
    search: { match: byNameOrPath },
  });

  const searchInput = host.querySelector('[data-search]');
  searchInput.value = 'register';
  searchInput.dispatchEvent({ type: 'input' });

  const row = host.querySelector('[data-body]').querySelectorAll('.el-input')[0];
  row.value = '/register/package-v2';
  row.dispatchEvent({ type: 'input' });

  assert.equal(items[0].pathTemplate, '/query/abc-information', 'dong 0 khong bi dung nham');
  assert.equal(items[1].pathTemplate, '/query/package-info', 'dong 1 khong bi dung nham');
  assert.equal(items[2].pathTemplate, '/register/package-v2', 'dong 2 (dang hien) duoc sua dung');
});

/* ---------- getVisibleItems / getSearchQuery ---------- */

test('getVisibleItems tra nguyen danh sach khi o tim kiem rong', () => {
  setupDOMMock();
  const host = new MockElement('section');
  let items = endpointItems();

  const list = createEditableList({
    host, title: 'ENDPOINTS', kind: 'endpoint',
    getItems: () => items, setItems: (v) => { items = v; },
    getValue: (ep) => ep.pathTemplate,
    setValue: (ep, v) => ({ ...ep, pathTemplate: v }),
    search: { match: byNameOrPath },
  });

  assert.deepEqual(list.getVisibleItems(), items);
});

test('getVisibleItems chi tra item khop khi da go tim kiem', () => {
  setupDOMMock();
  const host = new MockElement('section');
  let items = endpointItems();

  const list = createEditableList({
    host, title: 'ENDPOINTS', kind: 'endpoint',
    getItems: () => items, setItems: (v) => { items = v; },
    getValue: (ep) => ep.pathTemplate,
    setValue: (ep, v) => ({ ...ep, pathTemplate: v }),
    search: { match: byNameOrPath },
  });

  const searchInput = host.querySelector('[data-search]');
  searchInput.value = 'tra cứu';
  searchInput.dispatchEvent({ type: 'input' });

  const visible = list.getVisibleItems();
  assert.equal(visible.length, 2);
  assert.ok(visible.every((it) => it.name.toLowerCase().includes('tra cứu')));
});

test('getVisibleItems tra rong khi khong item nao khop', () => {
  setupDOMMock();
  const host = new MockElement('section');
  let items = endpointItems();

  const list = createEditableList({
    host, title: 'ENDPOINTS', kind: 'endpoint',
    getItems: () => items, setItems: (v) => { items = v; },
    getValue: (ep) => ep.pathTemplate,
    setValue: (ep, v) => ({ ...ep, pathTemplate: v }),
    search: { match: byNameOrPath },
  });

  const searchInput = host.querySelector('[data-search]');
  searchInput.value = 'khong-ton-tai';
  searchInput.dispatchEvent({ type: 'input' });

  assert.deepEqual(list.getVisibleItems(), []);
});

test('list khong truyen search: getVisibleItems tra nguyen danh sach, getSearchQuery rong', () => {
  setupDOMMock();
  const host = new MockElement('section');
  let items = ['0912345678', '0987654321'];

  const list = createEditableList({
    host, title: 'MSISDN', kind: 'msisdn',
    getItems: () => items, setItems: (v) => { items = v; },
  });

  assert.deepEqual(list.getVisibleItems(), items);
  assert.equal(list.getSearchQuery(), '');
});

test('getSearchQuery tra dung gia tri dang go trong o tim kiem', () => {
  setupDOMMock();
  const host = new MockElement('section');
  let items = endpointItems();

  const list = createEditableList({
    host, title: 'ENDPOINTS', kind: 'endpoint',
    getItems: () => items, setItems: (v) => { items = v; },
    getValue: (ep) => ep.pathTemplate,
    setValue: (ep, v) => ({ ...ep, pathTemplate: v }),
    search: { match: byNameOrPath },
  });

  const searchInput = host.querySelector('[data-search]');
  searchInput.value = 'register';
  searchInput.dispatchEvent({ type: 'input' });

  assert.equal(list.getSearchQuery(), 'register');
});

/* ---------- canh gac: ref nut khong chet sau render() ---------- */

test('canh gac: ref nut extraAction van la chinh element trong DOM sau render()', () => {
  setupDOMMock();
  const host = new MockElement('section');
  let items = endpointItems();

  const list = createEditableList({
    host, title: 'ENDPOINTS', kind: 'endpoint',
    getItems: () => items, setItems: (v) => { items = v; },
    getValue: (ep) => ep.pathTemplate,
    setValue: (ep, v) => ({ ...ep, pathTemplate: v }),
    search: { match: byNameOrPath },
    extraActions: [{ label: '☑ MSISDN: Tất cả Có', title: '', onClick: () => {} }],
  });

  const btnBefore = host.querySelectorAll('[data-extra-action]')[0];
  assert.ok(btnBefore);

  list.render();
  list.render();

  const btnAfter = host.querySelectorAll('[data-extra-action]')[0];
  assert.equal(btnAfter, btnBefore, 'render() lap lai khong duoc dung lai .el-actions');
});

