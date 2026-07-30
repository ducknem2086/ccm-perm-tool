import test from 'node:test';
import assert from 'node:assert/strict';
import { state, defaultConfig } from '../public/js/state.js';
import { initEndpointDrawer } from '../public/js/ui/endpoint-drawer.js';

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
    this.value = '';
    this.type = '';
    this.title = '';
    this.placeholder = '';
    this._textContent = '';
    this._focused = false;

    const self = this;
    this.classList = {
      add(...cs) { cs.forEach((c) => self._classList.add(c)); },
      remove(...cs) { cs.forEach((c) => self._classList.delete(c)); },
      contains(c) { return self._classList.has(c); },
      toggle(c, force) {
        const on = force === undefined ? !self._classList.has(c) : force;
        if (on) self._classList.add(c); else self._classList.delete(c);
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

  focus() { this._focused = true; }

  append(...nodes) {
    for (const node of nodes) {
      if (typeof node === 'string') {
        const t = new MockElement('#text');
        t.textContent = node;
        this.children.push(t);
        t.parentElement = this;
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

  click() { this.dispatchEvent({ type: 'click' }); }

  input(value) { this.value = value; this.dispatchEvent({ type: 'input' }); }

  change(value) { this.value = value; this.dispatchEvent({ type: 'change' }); }

  querySelectorAll(selector) {
    const results = [];
    const check = (node) => {
      if (matchesSelector(node, selector)) results.push(node);
      for (const child of node.children) if (typeof child !== 'string') check(child);
    };
    for (const child of this.children) if (typeof child !== 'string') check(child);
    return results;
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function matchesSelector(node, selector) {
  if (selector.startsWith('.')) return node.classList.contains(selector.slice(1));
  if (selector.startsWith('[') && selector.endsWith(']')) {
    const expr = selector.slice(1, -1);
    const [rawAttr, rawVal] = expr.split('=');
    const attr = rawAttr.trim();
    const val = rawVal !== undefined ? rawVal.replace(/['"]/g, '').trim() : undefined;
    const dataKey = attr.startsWith('data-') ? attr.slice(5) : attr;
    const dataVal = node.dataset[dataKey];
    if (dataVal !== undefined) return val === undefined || dataVal === val;
    return node.attributes[attr] !== undefined;
  }
  return node.tagName === selector.toUpperCase();
}

function setupMockDOM() {
  const drawer = new MockElement('aside', 'endpoint-drawer');
  const docListeners = {};

  globalThis.document = {
    getElementById: (id) => (id === 'endpoint-drawer' ? drawer : null),
    createElement: (tagName) => new MockElement(tagName),
    addEventListener: (type, fn) => {
      if (!docListeners[type]) docListeners[type] = [];
      docListeners[type].push(fn);
    },
    dispatchEvent: (event) => {
      for (const fn of docListeners[event.type] || []) fn(event);
    },
  };

  globalThis.localStorage = {
    getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {},
  };

  return { drawer, docListeners };
}

function makeEndpoint(over = {}) {
  return {
    id: 'ep_1', enabled: true, name: 'Tra cứu', method: 'GET',
    pathTemplate: '/query/abc/{*}', attachMsisdn: true,
    queryParams: [], headers: [],
    queryMode: 'kv', queryRaw: '',
    headerMode: 'kv', headerRaw: '',
    bodyMode: 'none', bodyRaw: '', bodyParams: [],
    ...over,
  };
}

function setup(endpointOver = {}) {
  const dom = setupMockDOM();
  Object.assign(state, defaultConfig());
  state.endpoints = [makeEndpoint(endpointOver)];
  const drawerCtrl = initEndpointDrawer();
  return { ...dom, drawerCtrl };
}

test('open hien ca ba muc cung luc', () => {
  const { drawer, drawerCtrl } = setup();
  drawerCtrl.open(0);

  assert.equal(drawer.hidden, false);
  assert.equal(drawer.getAttribute('aria-hidden'), 'false');

  const head = drawer.querySelector('.el-head');
  assert.ok(head.textContent.includes('GET'));
  assert.ok(head.textContent.includes('/query/abc/{*}'));

  assert.equal(drawer.querySelector('[data-pane=query]').hidden, false);
  assert.equal(drawer.querySelector('[data-pane=headers]').hidden, false);
  assert.equal(drawer.querySelector('[data-pane=body]').hidden, false);
});

test('close an drawer va xoa noi dung', () => {
  const { drawer, drawerCtrl } = setup();
  drawerCtrl.open(0);
  drawer.querySelector('[data-close]').click();

  assert.equal(drawer.hidden, true);
  assert.equal(drawer.getAttribute('aria-hidden'), 'true');
  assert.equal(drawer.children.length, 0);
});

test('Escape dong drawer', () => {
  const { drawer, drawerCtrl } = setup();
  drawerCtrl.open(0);
  document.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(drawer.hidden, true);
});

test('tab QUERY mode kv: sua bang ghi vao state.endpoints[i].queryParams', () => {
  const { drawer, drawerCtrl } = setup();
  drawerCtrl.open(0);

  const queryPane = drawer.querySelector('[data-pane=query]');
  queryPane.querySelector('.btn-secondary').click(); // + Them dong

  assert.equal(state.endpoints[0].queryParams.length, 1);

  const keyInput = queryPane.querySelector('.pt-key');
  keyInput.input('page');
  const valInput = queryPane.querySelector('.pt-val');
  valInput.input('1');

  assert.deepEqual(state.endpoints[0].queryParams[0], { key: 'page', value: '1', enabled: true });
});

test('tab QUERY doi sang mode raw hien textarea va ghi vao queryRaw', () => {
  const { drawer, drawerCtrl } = setup();
  drawerCtrl.open(0);

  const queryPane = drawer.querySelector('[data-pane=query]');
  const select = queryPane.querySelector('select');
  select.change('raw');
  assert.equal(state.endpoints[0].queryMode, 'raw');

  const freshPane = drawer.querySelector('[data-pane=query]');
  const ta = freshPane.querySelector('textarea');
  assert.ok(ta);
  ta.input('page=1&size=50');
  assert.equal(state.endpoints[0].queryRaw, 'page=1&size=50');
});

test('doi mode qua lai khong xoa du lieu o nguon kia', () => {
  const { drawer, drawerCtrl } = setup({
    queryParams: [{ key: 'page', value: '1', enabled: true }],
    queryRaw: 'size=50',
  });
  drawerCtrl.open(0);

  const queryPane = () => drawer.querySelector('[data-pane=query]');
  queryPane().querySelector('select').change('raw');
  assert.equal(state.endpoints[0].queryParams.length, 1, 'du lieu kv van con');

  queryPane().querySelector('select').change('kv');
  assert.equal(state.endpoints[0].queryRaw, 'size=50', 'du lieu raw van con');
});

test('tab HEADERS ghi vao state.endpoints[i].headers', () => {
  const { drawer, drawerCtrl } = setup();
  drawerCtrl.open(0);

  const headerPane = drawer.querySelector('[data-pane=headers]');
  headerPane.querySelector('.btn-secondary').click();
  const keyInput = headerPane.querySelector('.pt-key');
  keyInput.input('Accept');

  assert.equal(state.endpoints[0].headers[0].key, 'Accept');
});

test('tab BODY mode none hien dong chu khong gui body', () => {
  const { drawer, drawerCtrl } = setup();
  drawerCtrl.open(0);

  const bodyPane = drawer.querySelector('[data-pane=body]');
  assert.ok(bodyPane.textContent.includes('không gửi body'));
  assert.equal(bodyPane.querySelector('textarea'), null);
});

test('tab BODY mode json ghi bodyRaw va bao loi khi sai cu phap', () => {
  const { drawer, drawerCtrl } = setup();
  drawerCtrl.open(0);

  let bodyPane = drawer.querySelector('[data-pane=body]');
  bodyPane.querySelector('select').change('json');
  bodyPane = drawer.querySelector('[data-pane=body]');

  const ta = bodyPane.querySelector('textarea');
  ta.input('{invalid');
  assert.equal(state.endpoints[0].bodyRaw, '{invalid');
  assert.equal(ta.classList.contains('is-invalid'), true);

  ta.input('{"a":1}');
  assert.equal(ta.classList.contains('is-invalid'), false);
});

test('tab BODY mode kv ghi bodyParams va hien goi y JSON object', () => {
  const { drawer, drawerCtrl } = setup();
  drawerCtrl.open(0);

  let bodyPane = drawer.querySelector('[data-pane=body]');
  bodyPane.querySelector('select').change('kv');
  bodyPane = drawer.querySelector('[data-pane=body]');

  bodyPane.querySelector('.btn-secondary').click();
  bodyPane.querySelector('.pt-key').input('msisdn');

  assert.equal(state.endpoints[0].bodyParams[0].key, 'msisdn');
  assert.ok(bodyPane.textContent.includes('JSON object'));
});

test('tab BODY canh bao khi method GET va bodyMode khac none', () => {
  const { drawer, drawerCtrl } = setup({ method: 'GET', bodyMode: 'text', bodyRaw: 'x' });
  drawerCtrl.open(0);

  const bodyPane = drawer.querySelector('[data-pane=body]');
  assert.ok(bodyPane.textContent.includes('GET không gửi được body'));
});

test('mo lai endpoint khac thi render dung du lieu endpoint do', () => {
  const dom = setupMockDOM();
  Object.assign(state, defaultConfig());
  state.endpoints = [
    makeEndpoint({ method: 'GET', pathTemplate: '/a' }),
    makeEndpoint({ method: 'POST', pathTemplate: '/b', id: 'ep_2' }),
  ];
  const drawerCtrl = initEndpointDrawer();

  drawerCtrl.open(1);
  const head = dom.drawer.querySelector('.el-head');
  assert.ok(head.textContent.includes('POST'));
  assert.ok(head.textContent.includes('/b'));
});

test('drawer khong con thanh tab', () => {
  const { drawer, drawerCtrl } = setup();
  drawerCtrl.open(0);
  assert.equal(drawer.querySelector('.body-tabs'), null);
});

test('moi muc co tieu de rieng', () => {
  const { drawer, drawerCtrl } = setup();
  drawerCtrl.open(0);
  const titles = drawer.querySelectorAll('.ed-section-title').map((n) => n.textContent);
  assert.deepEqual(titles, ['QUERY', 'HEADERS', 'BODY']);
});
