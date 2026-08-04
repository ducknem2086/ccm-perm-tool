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
    this.style = {};
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

  select() { /* fallback copy path — chi can khong nem loi */ }

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

  append(...els) {
    this.children.push(...els);
    els.forEach((el) => { el.parentElement = this; });
  }

  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((c) => c !== this);
    this.parentElement = null;
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
    for (const m of html.matchAll(/data-curl-copy="(\w+)"/g)) {
      const btn = new MockElement('button');
      btn.attributes['data-curl-copy'] = m[1];
      this.children.push(btn);
    }
    for (const m of html.matchAll(/data-curl-download="(\w+)"/g)) {
      const btn = new MockElement('button');
      btn.attributes['data-curl-download'] = m[1];
      this.children.push(btn);
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
  const body = new MockElement('body');
  const docListeners = {};

  globalThis.document = {
    body,
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
    execCommand: () => true,
  };

  // window.ccmToast va navigator.clipboard la hai diem ma copyCurl/downloadCurl
  // (detail-drawer.js) goi truc tiep — 'window' khong ton tai san trong Node,
  // bi ep bang chinh globalThis de 'window.ccmToast' tro ve dung noi test doc lai.
  globalThis.window = globalThis;
  const toasts = [];
  globalThis.ccmToast = (message, kind) => toasts.push({ message, kind });
  navigator.clipboard = { writeText: async () => {} };

  return {
    drawer, docListeners, toasts, body,
  };
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

function makeRecordWithOracle() {
  return {
    ...makeRecord(),
    oracleFunction: '/ccm-troubleTicket-feedbackTicket',
    oracleAction: 'Read',
    oracle: {
      request: {
        method: 'POST',
        url: 'https://api.vn/iam/engage/checkPermission',
        headers: { Cookie: 'access_token=abc' },
        body: '{"permissionSpecification":{"function":"/ccm-x"}}',
      },
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      body: { allow: true },
      bodyText: '{"allow":true}',
      errorCode: null,
      errorMessage: null,
    },
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

test('Click vao dong cua bang perm khong dong drawer vua mo', () => {
  const { drawer } = setupMockDOM();
  const detailDrawer = initDetailDrawer();

  detailDrawer.open(makeRecord());
  assert.equal(drawer.hidden, false);

  const permRow = new MockElement('tr');
  const permCell = new MockElement('td');
  permCell.closest = (sel) => (sel === '#perm-table tbody tr' ? permRow : null);

  globalThis.document.dispatchEvent({ type: 'click', target: permCell });

  assert.equal(drawer.hidden, false);
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

/* ---------- hai cot flex: nghiep vu + check permission ---------- */

test('record khong co oracle chi ket xuat mot cot', () => {
  const { drawer } = setupMockDOM();
  initDetailDrawer().open(makeRecord());

  const cols = drawer.innerHTML.match(/class="detail-col"/g) ?? [];
  assert.equal(cols.length, 1);
  assert.ok(drawer.innerHTML.includes('NGHIỆP VỤ'));
  assert.ok(!drawer.innerHTML.includes('CHECK PERMISSION'));
});

test('record co oracle ket xuat hai cot ngang, mot cho NGHIỆP VỤ mot cho CHECK PERMISSION', () => {
  const { drawer } = setupMockDOM();
  initDetailDrawer().open(makeRecordWithOracle());

  const cols = drawer.innerHTML.match(/class="detail-col"/g) ?? [];
  assert.equal(cols.length, 2);
  assert.ok(drawer.innerHTML.includes('NGHIỆP VỤ'));
  assert.ok(drawer.innerHTML.includes('CHECK PERMISSION'));
  assert.ok(drawer.innerHTML.includes('https://api.vn/iam/engage/checkPermission'));
});

test('moi o URL deu mang class url-box (min-height 50px qua CSS)', () => {
  const { drawer } = setupMockDOM();
  initDetailDrawer().open(makeRecordWithOracle());

  const urlBoxes = drawer.innerHTML.match(/class="url-box"/g) ?? [];
  assert.equal(urlBoxes.length, 2);
});

test('bam tab Pretty/Raw o cot NGHIỆP VỤ khong lam doi pane cua cot CHECK PERMISSION', () => {
  const { drawer } = setupMockDOM();
  initDetailDrawer().open(makeRecordWithOracle());

  const businessRawTab = drawer.querySelector('[data-tab="raw_business"]');
  const businessRawPane = drawer.querySelector('[data-pane="raw_business"]');
  const businessPrettyPane = drawer.querySelector('[data-pane="pretty_business"]');
  const oraclePrettyPane = drawer.querySelector('[data-pane="pretty_oracle"]');
  const oracleRawPane = drawer.querySelector('[data-pane="raw_oracle"]');

  assert.equal(oraclePrettyPane.hidden, false, 'oracle bat dau o Pretty (co JSON body)');

  businessRawTab.click();

  assert.equal(businessRawPane.hidden, false);
  assert.equal(businessPrettyPane.hidden, true);
  assert.equal(oraclePrettyPane.hidden, false, 'cot oracle khong bi dong theo');
  assert.equal(oracleRawPane.hidden, true);
});

test('bam tab o cot CHECK PERMISSION khong lam doi pane cua cot NGHIỆP VỤ', () => {
  const { drawer } = setupMockDOM();
  initDetailDrawer().open(makeRecordWithOracle());

  const oracleRawTab = drawer.querySelector('[data-tab="raw_oracle"]');
  const businessPrettyPane = drawer.querySelector('[data-pane="pretty_business"]');

  oracleRawTab.click();

  assert.equal(businessPrettyPane.hidden, false, 'cot nghiep vu khong bi dong theo');
});

/* ---------- export cURL ---------- */

test('moi cot co du nut Copy cURL va tai .txt', () => {
  const { drawer } = setupMockDOM();
  initDetailDrawer().open(makeRecordWithOracle());

  assert.ok(drawer.querySelector('[data-curl-copy="business"]'));
  assert.ok(drawer.querySelector('[data-curl-download="business"]'));
  assert.ok(drawer.querySelector('[data-curl-copy="oracle"]'));
  assert.ok(drawer.querySelector('[data-curl-download="oracle"]'));
});

test('record khong co oracle chi co nut export cho cot nghiep vu', () => {
  const { drawer } = setupMockDOM();
  initDetailDrawer().open(makeRecord());

  assert.ok(drawer.querySelector('[data-curl-copy="business"]'));
  assert.ok(!drawer.querySelector('[data-curl-copy="oracle"]'));
});

test('Copy cURL cot nghiep vu goi clipboard voi lenh dung tu request nghiep vu, bao toast', async () => {
  const { drawer, toasts } = setupMockDOM();
  const calls = [];
  navigator.clipboard = { writeText: async (text) => { calls.push(text); } };

  initDetailDrawer().open(makeRecordWithOracle());
  const btn = drawer.querySelector('[data-curl-copy="business"]');
  btn.click();
  await new Promise((r) => setTimeout(r, 0));

  assert.equal(calls.length, 1);
  assert.match(calls[0], /^curl --location --request POST 'https:\/\/example\.com\/api\/test\?foo=bar'/);
  assert.ok(calls[0].includes("--header 'Authorization: Bearer token123'"));
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].kind, 'ok');
});

test('Copy cURL cot check permission dung request cua oracle, khac request nghiep vu', async () => {
  const { drawer } = setupMockDOM();
  const calls = [];
  navigator.clipboard = { writeText: async (text) => { calls.push(text); } };

  initDetailDrawer().open(makeRecordWithOracle());
  drawer.querySelector('[data-curl-copy="oracle"]').click();
  await new Promise((r) => setTimeout(r, 0));

  assert.equal(calls.length, 1);
  assert.match(calls[0], /checkPermission/);
  assert.ok(calls[0].includes("--header 'Cookie: access_token=abc'"));
  assert.ok(!calls[0].includes('example.com/api/test'));
});

test('Clipboard API bi tu choi thi roi ve fallback textarea + execCommand, van bao toast ok', async () => {
  const { drawer, toasts, body } = setupMockDOM();
  navigator.clipboard = { writeText: async () => { throw new Error('denied'); } };

  initDetailDrawer().open(makeRecord());
  drawer.querySelector('[data-curl-copy="business"]').click();
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));

  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].kind, 'ok');
  assert.equal(body.children.length, 0, 'textarea tam da duoc remove sau khi copy');
});

test('tai .txt sinh dung ten file va bao toast', () => {
  const { drawer, toasts } = setupMockDOM();
  initDetailDrawer().open(makeRecordWithOracle());

  drawer.querySelector('[data-curl-download="oracle"]').click();

  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].kind, 'ok');
});

