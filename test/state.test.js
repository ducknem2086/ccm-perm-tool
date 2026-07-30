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
  applyConfig,
  makeAuth
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
  assert.equal(cfg.token, undefined);
  assert.equal(cfg.cookie, undefined);
  assert.equal(cfg.refreshToken, undefined);
  assert.equal(cfg.auths.length, 1);
  assert.equal(cfg.auths[0].name, 'Default');
  assert.equal(cfg.auths[0].mode, 'fields');
  assert.deepEqual(cfg.runFilter, { methods: [], msisdnPatterns: [], authIds: [] });
  assert.deepEqual(cfg.dateRange, { from: '', to: '' });
  assert.equal(cfg.dateFormat, 'ddMMyyyy');
  assert.deepEqual(cfg.msisdns, []);
  assert.deepEqual(cfg.endpoints, []);
  assert.deepEqual(cfg.globalQueryParams, [
    { key: 'fromDate', value: '{{fromDate}}', enabled: true },
    { key: 'toDate', value: '{{toDate}}', enabled: true },
  ]);
  assert.deepEqual(cfg.globalHeaders, []);
  assert.equal(cfg.globalBodyMode, 'none');
  assert.deepEqual(cfg.globalBodyParams, []);
  assert.equal(cfg.globalBodyRaw, '');
  assert.equal(cfg.advanced.workerCount, 4);
  assert.equal(cfg.advanced.timeoutMs, 30000);
  assert.deepEqual(cfg.advanced.errorCodePaths, ['errorCode', 'error_code', 'code', 'error.code']);
  assert.equal(cfg.advanced.dedupeOnImport, true);
});

test('defaultConfig has permission configs', () => {
  const config = defaultConfig();
  assert.deepEqual(config.permissionFile, { filename: '', headers: [], rows: [] });
  assert.deepEqual(config.permissionMapping, { usecase1: [], usecase2: { permissionColumn: '', targetSheet: 'all' } });
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
    auths: [{ id: 'a1', name: 'P', mode: 'fields', token: 'my-token', cookie: '', refreshToken: '', curlRaw: '' }],
    dateRange: { from: '2026-01-01' },
    advanced: { workerCount: 10 }
  });

  assert.equal(state.domain, 'https://test.com');
  assert.equal(state.auths[0].token, 'my-token');
  assert.equal(state.dateRange.from, '2026-01-01');
  assert.equal(state.dateRange.to, '');
  assert.equal(state.advanced.workerCount, 10);
  assert.equal(state.advanced.timeoutMs, 30000);

  // Clear memory state roi test load()
  Object.assign(state, defaultConfig());
  assert.equal(state.domain, '');

  load();
  assert.equal(state.domain, 'https://test.com');
  assert.equal(state.auths[0].token, 'my-token');
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

test('makeAuth sinh id khac nhau moi lan goi', () => {
  const a = makeAuth();
  const b = makeAuth();
  assert.notEqual(a.id, b.id);
  assert.ok(a.id.startsWith('auth_'));
});

test('load goi config cu thanh auths[0] ten Default', () => {
  setupMockLocalStorage();
  localStorage.setItem('ccm-tool-config', JSON.stringify({
    domain: 'https://api-abc.vn', token: 'TOK', cookie: 'CK', refreshToken: 'RF',
  }));
  Object.assign(state, defaultConfig());
  load();

  assert.equal(state.auths.length, 1);
  assert.equal(state.auths[0].name, 'Default');
  assert.equal(state.auths[0].mode, 'fields');
  assert.equal(state.auths[0].token, 'TOK');
  assert.equal(state.auths[0].cookie, 'CK');
  assert.equal(state.auths[0].refreshToken, 'RF');
});

test('load xoa ba khoa credential cu khoi state', () => {
  setupMockLocalStorage();
  localStorage.setItem('ccm-tool-config', JSON.stringify({ token: 'TOK', cookie: 'CK', refreshToken: 'RF' }));
  Object.assign(state, defaultConfig());
  load();

  assert.equal(state.token, undefined);
  assert.equal(state.cookie, undefined);
  assert.equal(state.refreshToken, undefined);
});

test('load van sinh Default khi ba o credential cu deu rong', () => {
  setupMockLocalStorage();
  localStorage.setItem('ccm-tool-config', JSON.stringify({ domain: 'https://x.vn' }));
  Object.assign(state, defaultConfig());
  load();

  assert.equal(state.auths.length, 1);
  assert.equal(state.auths[0].name, 'Default');
  assert.equal(state.auths[0].token, '');
});

test('load khong dung vao auths da co san', () => {
  setupMockLocalStorage();
  localStorage.setItem('ccm-tool-config', JSON.stringify({
    auths: [
      { id: 'a1', name: 'PROD', mode: 'fields', token: 'T1', cookie: '', refreshToken: '', curlRaw: '' },
      { id: 'a2', name: 'UAT', mode: 'curl', token: '', cookie: '', refreshToken: '', curlRaw: 'curl -H "a: b"' },
    ],
  }));
  Object.assign(state, defaultConfig());
  load();

  assert.equal(state.auths.length, 2);
  assert.deepEqual(state.auths.map((a) => a.name), ['PROD', 'UAT']);
});

test('load bu truong con thieu cho auth luu tu ban cu', () => {
  setupMockLocalStorage();
  localStorage.setItem('ccm-tool-config', JSON.stringify({
    auths: [{ id: 'a1', name: 'PROD', token: 'T1' }],
  }));
  Object.assign(state, defaultConfig());
  load();

  assert.equal(state.auths[0].mode, 'fields');
  assert.equal(state.auths[0].curlRaw, '');
  assert.equal(state.auths[0].cookie, '');
});

test('load bu runFilter con thieu', () => {
  setupMockLocalStorage();
  localStorage.setItem('ccm-tool-config', JSON.stringify({ runFilter: { methods: ['GET'] } }));
  Object.assign(state, defaultConfig());
  load();

  assert.deepEqual(state.runFilter, { methods: ['GET'], msisdnPatterns: [], authIds: [] });
});

test('applyConfig migrate config cu giong load', () => {
  setupMockLocalStorage();
  applyConfig({ domain: 'https://api-abc.vn', token: 'TOK' });

  assert.equal(state.auths[0].name, 'Default');
  assert.equal(state.auths[0].token, 'TOK');
  assert.equal(state.token, undefined);
});

test('load va applyConfig merge safe permissionFile va permissionMapping', () => {
  setupMockLocalStorage();
  applyConfig({
    permissionFile: { filename: 'test.xlsx', headers: ['a'], rows: [['1']] },
    permissionMapping: {
      usecase1: ['colA'],
      usecase2: { permissionColumn: 'colB', targetSheet: 'Sheet1' }
    }
  });

  assert.equal(state.permissionFile.filename, 'test.xlsx');
  assert.deepEqual(state.permissionFile.headers, ['a']);
  assert.deepEqual(state.permissionMapping.usecase1, ['colA']);
  assert.equal(state.permissionMapping.usecase2.permissionColumn, 'colB');
  assert.equal(state.permissionMapping.usecase2.targetSheet, 'Sheet1');

  // Test load with partial config
  localStorage.setItem('ccm-tool-config', JSON.stringify({
    permissionMapping: {
      usecase2: { permissionColumn: 'colC' }
    }
  }));
  Object.assign(state, defaultConfig());
  load();

  assert.equal(state.permissionFile.filename, '');
  assert.equal(state.permissionMapping.usecase2.permissionColumn, 'colC');
  assert.equal(state.permissionMapping.usecase2.targetSheet, 'all');
});
