import test from 'node:test';
import assert from 'node:assert/strict';
import { initDetailDrawer } from '../public/js/ui/detail-drawer.js';

class MockElement {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.children = [];
    this.parentElement = null;
    this.attributes = {};
    this.listeners = {};
    this.hidden = true;
    this.focused = false;
    this._innerHTML = '';
    this._classList = new Set();
    const self = this;
    this.classList = {
      add(...cs) { cs.forEach((c) => self._classList.add(c)); },
      remove(...cs) { cs.forEach((c) => self._classList.delete(c)); },
      contains(c) { return self._classList.has(c); },
      toggle(c, on) { if (on) self._classList.add(c); else self._classList.delete(c); },
    };
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name];
  }

  focus() {
    this.focused = true;
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
    this.dispatchEvent({ type: 'click' });
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(html) {
    this._innerHTML = html;
    this.children = [];
    if (!html) return;

    if (html.includes('data-close')) {
      const closeBtn = new MockElement('button');
      closeBtn.attributes['data-close'] = '';
      this.children.push(closeBtn);
    }
    for (const m of html.matchAll(/data-tab="(\w+)"/g)) {
      const btn = new MockElement('button');
      btn.attributes['data-tab'] = m[1];
      const tagMatch = html.match(new RegExp(`<button[^>]*data-tab="${m[1]}"[^>]*>`));
      if (tagMatch) {
        if (tagMatch[0].includes('is-active')) {
          btn.classList.add('is-active');
        }
        if (tagMatch[0].includes('disabled')) {
          btn.attributes['disabled'] = '';
          btn.disabled = true;
        }
      }
      this.children.push(btn);
    }
    for (const m of html.matchAll(/data-pane="(\w+)"/g)) {
      const pane = new MockElement('div');
      pane.attributes['data-pane'] = m[1];
      const tagMatch = html.match(new RegExp(`<div[^>]*data-pane="${m[1]}"[^>]*>`));
      if (tagMatch && tagMatch[0].includes('hidden')) {
        pane.hidden = true;
      } else {
        pane.hidden = false;
      }
      this.children.push(pane);
    }
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const m = /^\[([\w-]+)(?:="(\w+)")?\]$/.exec(selector);
    if (!m) return [];
    const [, attr, value] = m;
    return this.children.filter((c) => (
      c.attributes[attr] !== undefined && (value === undefined || c.attributes[attr] === value)
    ));
  }

  contains(target) {
    if (target === this) return true;
    return this.children.includes(target);
  }
}

function setupMockDOM() {
  const drawer = new MockElement('aside', 'drawer');
  const docListeners = {};

  globalThis.document = {
    getElementById: (id) => {
      if (id === 'drawer') return drawer;
      return null;
    },
    createElement: (tagName) => new MockElement(tagName),
    addEventListener: (type, fn) => {
      if (!docListeners[type]) docListeners[type] = [];
      docListeners[type].push(fn);
    },
    dispatchEvent: (event) => {
      const handlers = docListeners[event.type] || [];
      for (const fn of handlers) {
        fn(event);
      }
    },
  };

  return { drawer, docListeners };
}

function makeRecord() {
  return {
    index: 42,
    request: {
      method: 'POST',
      url: 'https://example.com/api/test?foo=bar',
      headers: { Authorization: 'Bearer token123', 'Content-Type': 'application/json' },
      pathParams: { id: '123' },
      queryParams: { foo: 'bar' },
      body: { name: 'test' },
    },
    response: {
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      body: { result: 'success' },
      bodyText: '{"result":"success"}',
    },
    errorCode: null,
    durationMs: 45,
    errorMessage: null,
  };
}

test('initDetailDrawer open mo drawer va hien thi thong tin request', () => {
  const { drawer } = setupMockDOM();
  const detailDrawer = initDetailDrawer();

  const rec = makeRecord();
  detailDrawer.open(rec);

  assert.equal(drawer.hidden, false);
  assert.equal(drawer.getAttribute('aria-hidden'), 'false');
  assert.ok(drawer.innerHTML.includes('Request #42'));
  assert.ok(drawer.innerHTML.includes('POST · 200 OK'));
  assert.ok(drawer.innerHTML.includes('https://example.com/api/test?foo=bar'));
  assert.ok(drawer.innerHTML.includes('<td class="kv-k mono">Authorization</td>'));
  assert.ok(drawer.innerHTML.includes('<td class="kv-v mono">Bearer token123</td>'));
  assert.ok(drawer.innerHTML.includes('<td class="kv-k mono">content-type</td>'));
  assert.ok(drawer.innerHTML.includes('tok-key'));

  const closeBtn = drawer.querySelector('[data-close]');
  assert.ok(closeBtn);
  assert.equal(closeBtn.focused, true);
});

test('detailDrawer close va nut data-close dong drawer', () => {
  const { drawer } = setupMockDOM();
  const detailDrawer = initDetailDrawer();

  detailDrawer.open(makeRecord());
  assert.equal(drawer.hidden, false);

  const closeBtn = drawer.querySelector('[data-close]');
  closeBtn.click();

  assert.equal(drawer.hidden, true);
  assert.equal(drawer.getAttribute('aria-hidden'), 'true');
  assert.equal(drawer.innerHTML, '');
});

test('Escape key dong drawer khi drawer dang mo', () => {
  const { drawer } = setupMockDOM();
  const detailDrawer = initDetailDrawer();

  detailDrawer.open(makeRecord());
  assert.equal(drawer.hidden, false);

  // Trigger Escape key
  globalThis.document.dispatchEvent({ type: 'keydown', key: 'Escape' });

  assert.equal(drawer.hidden, true);
  assert.equal(drawer.innerHTML, '');
});

test('Click outside dong drawer', () => {
  const { drawer } = setupMockDOM();
  const detailDrawer = initDetailDrawer();

  detailDrawer.open(makeRecord());
  assert.equal(drawer.hidden, false);

  const outsideElement = new MockElement('div');
  outsideElement.closest = () => null; // not clicking inside #result-table tbody tr

  globalThis.document.dispatchEvent({ type: 'click', target: outsideElement });

  assert.equal(drawer.hidden, true);
});

test('Click bên trong drawer khong dong drawer', () => {
  const { drawer } = setupMockDOM();
  const detailDrawer = initDetailDrawer();

  detailDrawer.open(makeRecord());
  assert.equal(drawer.hidden, false);

  const insideElement = new MockElement('div');
  insideElement.closest = () => null;
  drawer.children.push(insideElement); // mark insideElement inside drawer

  globalThis.document.dispatchEvent({ type: 'click', target: insideElement });

  assert.equal(drawer.hidden, false);
});

test('drawer dung bang key-value cho ca request va response header', () => {
  const { drawer } = setupMockDOM();
  initDetailDrawer().open(makeRecord());

  const kvTables = drawer.innerHTML.match(/<table class="kv">/g) ?? [];
  assert.ok(kvTables.length >= 4, `phai co it nhat 4 bang kv, dang co ${kvTables.length}`);
  assert.ok(drawer.innerHTML.includes('REQUEST HEADERS'));
  assert.ok(drawer.innerHTML.includes('RESPONSE HEADERS'));
});

test('bang key-value rong hien thi dong khong co', () => {
  const { drawer } = setupMockDOM();
  const rec = makeRecord();
  rec.request.pathParams = {};
  initDetailDrawer().open(rec);
  assert.ok(drawer.innerHTML.includes('(không có)'));
});

test('tab Preview bi tat khi content-type khong phai html', () => {
  const { drawer } = setupMockDOM();
  initDetailDrawer().open(makeRecord());
  assert.match(drawer.innerHTML, /data-tab="preview"[^>]*disabled/);
});

test('tab Preview duoc bat va dung iframe sandbox khi content-type la html', () => {
  const { drawer } = setupMockDOM();
  const rec = makeRecord();
  rec.response.headers = { 'content-type': 'text/html; charset=utf-8' };
  rec.response.body = null;
  rec.response.bodyText = '<h1>Xin chào</h1>';
  initDetailDrawer().open(rec);

  assert.doesNotMatch(drawer.innerHTML, /data-tab="preview"[^>]*disabled/);
  assert.ok(drawer.innerHTML.includes('<iframe class="preview-frame" sandbox srcdoc='));
  assert.ok(drawer.innerHTML.includes('&lt;h1&gt;Xin chào&lt;/h1&gt;'));
});

test('body rong co errorMessage thi mo tab Raw va tat Pretty', () => {
  const { drawer } = setupMockDOM();
  const rec = makeRecord();
  rec.response = { status: null, statusText: '', headers: {}, body: null, bodyText: '' };
  rec.errorCode = 'ETIMEDOUT';
  rec.errorMessage = 'Quá thời gian chờ';
  initDetailDrawer().open(rec);

  assert.match(drawer.innerHTML, /data-tab="pretty"[^>]*disabled/);
  assert.ok(drawer.innerHTML.includes('Quá thời gian chờ'));
});

test('bam tab Raw thi doi pane dang hien', () => {
  const { drawer } = setupMockDOM();
  initDetailDrawer().open(makeRecord());

  const rawTab = drawer.querySelector('[data-tab="raw"]');
  const prettyPane = drawer.querySelector('[data-pane="pretty"]');
  const rawPane = drawer.querySelector('[data-pane="raw"]');

  rawTab.click();

  assert.equal(rawTab.classList.contains('is-active'), true);
  assert.equal(rawPane.hidden, false);
  assert.equal(prettyPane.hidden, true);
});

test('to mau JSON khong lam ro ri the HTML tu body', () => {
  const { drawer } = setupMockDOM();
  const rec = makeRecord();
  rec.response.body = { note: '<script>alert(1)</script>' };
  rec.response.bodyText = JSON.stringify(rec.response.body);
  initDetailDrawer().open(rec);

  assert.ok(!drawer.innerHTML.includes('<script>'));
  assert.ok(drawer.innerHTML.includes('&lt;script&gt;'));
});

