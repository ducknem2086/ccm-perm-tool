import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultConfig,
  state,
  results,
  resetResults,
  getRunId,
  setRunId,
  subscribe,
  notify,
  persist,
  load,
  applyConfig
} from '../public/js/state.js';

function setupMockLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    }
  };
  return store;
}

test('defaultConfig tra ve cau hinh mac dinh dung chuuan', () => {
  const cfg = defaultConfig();
  assert.equal(cfg.domain, '');
  assert.equal(cfg.token, '');
  assert.deepEqual(cfg.dateRange, { from: '', to: '' });
  assert.equal(cfg.dateFormat, 'ddMMyyyy');
  assert.deepEqual(cfg.msisdns, []);
  assert.deepEqual(cfg.endpoints, []);
  assert.deepEqual(cfg.globalQueryParams, [
    { key: 'fromDate', value: '{{fromDate}}', enabled: true },
    { key: 'toDate', value: '{{toDate}}', enabled: true },
  ]);
  assert.deepEqual(cfg.globalHeaders, []);
  assert.equal(cfg.advanced.workerCount, 4);
  assert.equal(cfg.advanced.timeoutMs, 30000);
  assert.deepEqual(cfg.advanced.errorCodePaths, ['errorCode', 'error_code', 'code', 'error.code']);
  assert.equal(cfg.advanced.dedupeOnImport, true);
});

test('runId getter va setter hoat dong', () => {
  setRunId('run-123');
  assert.equal(getRunId(), 'run-123');
  setRunId(null);
  assert.equal(getRunId(), null);
});

test('resetResults lam rong mang results', () => {
  results.length = 0;
  results.push({ id: 1 }, { id: 2 });
  assert.equal(results.length, 2);
  resetResults();
  assert.equal(results.length, 0);
});

test('subscribe va notify hoat dong dung', () => {
  let count = 0;
  const unsubscribe = subscribe(() => { count++; });
  notify();
  assert.equal(count, 1);
  notify();
  assert.equal(count, 2);
  unsubscribe();
  notify();
  assert.equal(count, 2);
});

test('persist luu state vao localStorage va load doc lai merge voi defaultConfig', () => {
  setupMockLocalStorage();
  
  // Apply state moi
  applyConfig({
    domain: 'https://test.com',
    token: 'my-token',
    dateRange: { from: '2026-01-01' },
    advanced: { workerCount: 10 }
  });

  assert.equal(state.domain, 'https://test.com');
  assert.equal(state.token, 'my-token');
  assert.equal(state.dateRange.from, '2026-01-01');
  assert.equal(state.dateRange.to, '');
  assert.equal(state.advanced.workerCount, 10);
  assert.equal(state.advanced.timeoutMs, 30000);

  // Clear memory state roi test load()
  Object.assign(state, defaultConfig());
  assert.equal(state.domain, '');

  load();
  assert.equal(state.domain, 'https://test.com');
  assert.equal(state.token, 'my-token');
  assert.equal(state.dateRange.from, '2026-01-01');
  assert.equal(state.advanced.workerCount, 10);
});

test('load migrate concurrency sang workerCount neu workerCount chua co', () => {
  setupMockLocalStorage();
  localStorage.setItem('ccm-tool-config', JSON.stringify({
    advanced: { concurrency: 8 }
  }));
  Object.assign(state, defaultConfig());
  load();
  assert.equal(state.advanced.workerCount, 8);
  assert.equal(state.advanced.concurrency, undefined);
});

test('persist khong bi crash khi localStorage bi loi', () => {
  globalThis.localStorage = {
    setItem() {
      throw new Error('QuotaExceededError');
    }
  };
  assert.doesNotThrow(() => {
    persist();
  });
});

test('load xu ly an toan khi localStorage chua du lieu khong hop le hoac null', () => {
  setupMockLocalStorage();
  localStorage.setItem('ccm-tool-config', 'invalid json{');
  assert.doesNotThrow(() => {
    load();
  });

  localStorage.setItem('ccm-tool-config', JSON.stringify('not-an-object'));
  assert.doesNotThrow(() => {
    load();
  });
});

test('defaultConfig co san template map cot khi import endpoint', () => {
  assert.deepEqual(defaultConfig().importTemplate, [
    { id: 'tpl_name', type: 'name', selector: 'name', target: 'name' },
    { id: 'tpl_method', type: 'name', selector: 'method', target: 'method' },
    { id: 'tpl_endpoint', type: 'name', selector: 'endpoint', target: 'endpoint' },
  ]);
});

test('load giu nguyen importTemplate nguoi dung da sua', () => {
  setupMockLocalStorage();
  applyConfig({ importTemplate: [{ id: 'x', type: 'index', selector: '3', target: 'endpoint' }] });
  Object.assign(state, defaultConfig());
  load();
  assert.deepEqual(state.importTemplate, [
    { id: 'x', type: 'index', selector: '3', target: 'endpoint' },
  ]);
});

