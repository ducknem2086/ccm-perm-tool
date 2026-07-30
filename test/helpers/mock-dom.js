export class MockElement {
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

  keydown(key) {
    let defaultPrevented = false;
    this.dispatchEvent({ type: 'keydown', key, preventDefault: () => { defaultPrevented = true; } });
    return defaultPrevented;
  }

  remove() {
    const parent = this.parentElement;
    if (!parent) return;
    parent.children = parent.children.filter((c) => c !== this);
    this.parentElement = null;
  }

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

export function installMockDocument(elementsById = {}) {
  const elements = { ...elementsById };
  const docListeners = {};

  globalThis.document = {
    getElementById: (id) => elements[id] ?? null,
    createElement: (tagName) => new MockElement(tagName),
    createTextNode: (text) => String(text),
    addEventListener: (type, fn) => {
      if (!docListeners[type]) docListeners[type] = [];
      docListeners[type].push(fn);
    },
    dispatchEvent: (event) => {
      for (const fn of docListeners[event.type] ?? []) fn(event);
    },
  };

  globalThis.localStorage = {
    getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {},
  };

  return { elements, docListeners };
}
