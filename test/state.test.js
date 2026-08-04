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
  makeAuth,
  saveConfig,
  revertConfig,
  isConfigDirty,
  dirtyParts,
  savedSheet,
  savedMapping,
  draftSheet
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
  assert.equal(cfg.auths[0].curlRaw, '');
  assert.equal(cfg.auths[0].role, '');
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

test('defaultConfig co ui.permSplitPct mac dinh 60', () => {
  assert.equal(defaultConfig().ui.permSplitPct, 60);
});

test('load config cu khong co ui van ra permSplitPct 60', () => {
  setupMockLocalStorage();
  localStorage.setItem('ccm-tool-config', JSON.stringify({ domain: 'https://x.vn' }));
  Object.assign(state, defaultConfig());
  load();
  assert.equal(state.ui.permSplitPct, 60);
});

test('load giu permSplitPct da luu', () => {
  setupMockLocalStorage();
  applyConfig({ ui: { permSplitPct: 40 } });
  Object.assign(state, defaultConfig());
  load();
  assert.equal(state.ui.permSplitPct, 40);
});

test('defaultConfig has permission configs', () => {
  const config = defaultConfig();
  assert.deepEqual(config.permissionFile, { filename: '', sheets: [], selectedSheet: '' });
  assert.deepEqual(config.permissionMapping, {
    usecase1: [], usecase2: { permissionColumn: '', columnSheet: '', endpointColumn: '' },
    usecase3: { columnSheet: '', functionColumn: '', actionColumn: '' },
  });
  assert.deepEqual(config.savedConfig, {
    permissionMapping: {
      usecase1: [], usecase2: { permissionColumn: '', columnSheet: '', endpointColumn: '' },
      usecase3: { columnSheet: '', functionColumn: '', actionColumn: '' },
    },
    permissionSheet: '',
  });
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
    auths: [{ id: 'a1', name: 'P', curlRaw: "curl 'https://x' -H 'Authorization: Bearer my-token'" }],
    dateRange: { from: '2026-01-01' },
    advanced: { workerCount: 10 }
  });

  assert.equal(state.domain, 'https://test.com');
  assert.match(state.auths[0].curlRaw, /Bearer my-token/);
  assert.equal(state.dateRange.from, '2026-01-01');
  assert.equal(state.dateRange.to, '');
  assert.equal(state.advanced.workerCount, 10);
  assert.equal(state.advanced.timeoutMs, 30000);

  // Clear memory state roi test load()
  Object.assign(state, defaultConfig());
  assert.equal(state.domain, '');

  load();
  assert.equal(state.domain, 'https://test.com');
  assert.match(state.auths[0].curlRaw, /Bearer my-token/);
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
  assert.match(state.auths[0].curlRaw, /Authorization: Bearer TOK/);
  assert.match(state.auths[0].curlRaw, /Cookie: CK/);
  assert.match(state.auths[0].curlRaw, /refresh_token: RF/);
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
  assert.equal(state.auths[0].curlRaw, '');
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

test('load bu truong con thieu cho auth luu tu ban cu — mode fields voi token gop thanh curlRaw', () => {
  setupMockLocalStorage();
  localStorage.setItem('ccm-tool-config', JSON.stringify({
    auths: [{ id: 'a1', name: 'PROD', token: 'T1' }],
  }));
  Object.assign(state, defaultConfig());
  load();

  assert.match(state.auths[0].curlRaw, /Authorization: Bearer T1/);
  assert.equal(state.auths[0].role, '');
  assert.equal(state.auths[0].mode, undefined);
  assert.equal(state.auths[0].cookie, undefined);
});

// Auth cu thieu khoa `id` ma khong duoc cap lai thi selectedAuths (loc theo
// runFilter.authIds) khong khop dong nao -> RUN ALL sinh 0 request.
test('load cap id moi cho auth cu khong co khoa id', () => {
  setupMockLocalStorage();
  localStorage.setItem('ccm-tool-config', JSON.stringify({
    auths: [{ name: 'PROD', token: 'T1' }, { name: 'UAT', token: 'T2' }],
  }));
  Object.assign(state, defaultConfig());
  load();

  assert.ok(state.auths[0].id, 'auth thu nhat phai co id');
  assert.ok(state.auths[1].id, 'auth thu hai phai co id');
  assert.notEqual(state.auths[0].id, state.auths[1].id);
});

test('load giu nguyen id cu khi auth cu da co id', () => {
  setupMockLocalStorage();
  localStorage.setItem('ccm-tool-config', JSON.stringify({
    auths: [{ id: 'a_giu_nguyen', name: 'PROD', token: 'T1' }],
  }));
  Object.assign(state, defaultConfig());
  load();

  assert.equal(state.auths[0].id, 'a_giu_nguyen');
});

/* ---------- migrate 3 o rieng: KHONG duoc de len HEADERS CHUNG ---------- */

// Truoc thay doi "mot cURL la nguon danh tinh duy nhat", authHeaderPairs tra
// [] cho mode 'fields' — ba o rieng KHONG BAO GIO duoc gui di. Cau hinh vua
// co ba o vua co cURL o HEADERS CHUNG thi thu dang chay that la cURL do.
// Dung ba o rac len curlRaw se de nguoc len HEADERS CHUNG (auth thang
// global) va gui token het han -> 401 hang loat.
const GLOBAL_CURL_CO_DANH_TINH = "curl 'https://x' -H 'Authorization: Bearer MOI' -b 'access_token=MOI'";

test('migrate KHONG dung ba o cu len curlRaw khi HEADERS CHUNG (cURL) da khai danh tinh', () => {
  setupMockLocalStorage();
  localStorage.setItem('ccm-tool-config', JSON.stringify({
    auths: [{ id: 'a1', name: 'PROD', mode: 'fields', token: 'CU-HET-HAN', cookie: 'ck=cu' }],
    globalHeaderMode: 'raw',
    globalHeaderRaw: GLOBAL_CURL_CO_DANH_TINH,
  }));
  Object.assign(state, defaultConfig());
  load();

  assert.equal(state.auths[0].curlRaw, '');
});

test('migrate KHONG dung ba o cu len curlRaw khi HEADERS CHUNG (bang kv) khai Authorization', () => {
  setupMockLocalStorage();
  localStorage.setItem('ccm-tool-config', JSON.stringify({
    auths: [{ id: 'a1', name: 'PROD', mode: 'fields', token: 'CU-HET-HAN' }],
    globalHeaderMode: 'kv',
    globalHeaders: [{ key: 'Authorization', value: 'Bearer MOI', enabled: true }],
  }));
  Object.assign(state, defaultConfig());
  load();

  assert.equal(state.auths[0].curlRaw, '');
});

test('migrate BO QUA dong HEADERS CHUNG da tat khi xet danh tinh', () => {
  setupMockLocalStorage();
  localStorage.setItem('ccm-tool-config', JSON.stringify({
    auths: [{ id: 'a1', name: 'PROD', mode: 'fields', token: 'CU' }],
    globalHeaderMode: 'kv',
    globalHeaders: [{ key: 'Authorization', value: 'Bearer MOI', enabled: false }],
  }));
  Object.assign(state, defaultConfig());
  load();

  assert.match(state.auths[0].curlRaw, /Authorization: Bearer CU/);
});

test('migrate VAN dung ba o cu len curlRaw khi HEADERS CHUNG khong khai danh tinh', () => {
  setupMockLocalStorage();
  localStorage.setItem('ccm-tool-config', JSON.stringify({
    auths: [{ id: 'a1', name: 'PROD', mode: 'fields', token: 'CU', cookie: 'ck=1' }],
    globalHeaderMode: 'raw',
    globalHeaderRaw: "curl 'https://x' -H 'X-Tenant: vnpt'",
  }));
  Object.assign(state, defaultConfig());
  load();

  assert.match(state.auths[0].curlRaw, /Authorization: Bearer CU/);
  assert.match(state.auths[0].curlRaw, /Cookie: ck=1/);
});

test('auth da dan cURL rieng luon duoc giu, ke ca khi HEADERS CHUNG co danh tinh', () => {
  setupMockLocalStorage();
  localStorage.setItem('ccm-tool-config', JSON.stringify({
    auths: [{ id: 'a1', name: 'PROD', mode: 'curl', token: '', curlRaw: "curl 'https://x' -H 'Authorization: Bearer TU-AUTH'" }],
    globalHeaderMode: 'raw',
    globalHeaderRaw: GLOBAL_CURL_CO_DANH_TINH,
  }));
  Object.assign(state, defaultConfig());
  load();

  assert.match(state.auths[0].curlRaw, /Bearer TU-AUTH/);
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
  assert.match(state.auths[0].curlRaw, /Authorization: Bearer TOK/);
  assert.equal(state.token, undefined);
});

test('load va applyConfig merge safe permissionFile va permissionMapping', () => {
  setupMockLocalStorage();
  applyConfig({
    permissionFile: { filename: 'test.xlsx', headers: ['a'], rows: [['1']] },
    permissionMapping: {
      usecase1: ['colA'],
      usecase2: { permissionColumn: 'colB' }
    }
  });

  assert.equal(state.permissionFile.filename, 'test.xlsx');
  // headers/rows cua ban cu duoc dung thanh mot sheet 'Default'
  assert.deepEqual(state.permissionFile.sheets, [{ name: 'Default', headers: ['a'], rows: [['1']] }]);
  assert.equal(state.permissionFile.selectedSheet, 'Default');
  assert.equal(state.permissionFile.headers, undefined);
  assert.deepEqual(state.permissionMapping.usecase1, ['colA']);
  assert.equal(state.permissionMapping.usecase2.permissionColumn, 'colB');

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
});

/* ---------- savedConfig: commit / revert ---------- */

function setupSaveGate() {
  setupMockLocalStorage();
  Object.assign(state, defaultConfig());
  state.permissionFile = {
    filename: 'perm.xlsx',
    sheets: [
      { name: 'Sheet A', headers: ['Ten API', 'User'], rows: [['Tra cuu', 'x']] },
      { name: 'Sheet B', headers: ['Ma'], rows: [['M1']] },
    ],
    selectedSheet: 'Sheet A',
  };
  saveConfig();
}

test('saveConfig chup dung hai manh: mapping va sheet phan quyen', () => {
  setupSaveGate();
  state.permissionMapping.usecase2.permissionColumn = 'Ten API';
  state.permissionFile.selectedSheet = 'Sheet B';
  saveConfig();

  assert.equal(savedMapping().usecase2.permissionColumn, 'Ten API');
  assert.equal(state.savedConfig.permissionSheet, 'Sheet B');
  assert.equal(state.savedConfig.methods, undefined);
});

// Bo loc method di thang qua state.runFilter nhu RUN ALL — dua no vao gate chi
// lam badge "chua luu" bat len trong khi bam Luu khong doi ket qua gi.
test('gate Luu KHONG bao gom bo loc method', () => {
  setupSaveGate();
  state.runFilter.methods = ['GET'];
  assert.equal(isConfigDirty(), false);
  assert.deepEqual(dirtyParts(), []);
});

test('saveConfig deep copy — sua ban nhap sau khi Luu khong dong vao ban da luu', () => {
  setupSaveGate();
  state.permissionMapping.usecase1.push({ permissionColumn: 'User', endpointSheet: 'Sheet 1', authProfileName: 'A' });
  saveConfig();

  state.permissionMapping.usecase1[0].authProfileName = 'DA DOI';
  assert.equal(savedMapping().usecase1[0].authProfileName, 'A');
});

test('isConfigDirty bat khi sua ban nhap, tat sau khi Luu', () => {
  setupSaveGate();
  assert.equal(isConfigDirty(), false);

  state.permissionMapping.usecase2.endpointColumn = 'Ten API';
  assert.equal(isConfigDirty(), true);

  saveConfig();
  assert.equal(isConfigDirty(), false);
});

test('dirtyParts liet ke dung phan dang treo', () => {
  setupSaveGate();
  assert.deepEqual(dirtyParts(), []);

  state.permissionFile.selectedSheet = 'Sheet B';
  assert.deepEqual(dirtyParts(), ['sheet phân quyền']);

  state.permissionMapping.usecase2.permissionColumn = 'Ten API';
  assert.deepEqual(dirtyParts(), ['mapping UC1/UC2', 'sheet phân quyền']);
});

test('revertConfig khoi phuc hai manh ve ban da luu', () => {
  setupSaveGate();
  state.permissionMapping.usecase2.permissionColumn = 'Ten API';
  state.permissionFile.selectedSheet = 'Sheet B';

  revertConfig();

  assert.equal(state.permissionMapping.usecase2.permissionColumn, '');
  assert.equal(state.permissionFile.selectedSheet, 'Sheet A');
  assert.equal(isConfigDirty(), false);
});

// Huy khong duoc dung toi state.runFilter: ca ba truc deu ngoai gate, xoa
// chung la xoa lua chon dang dung cua nguoi dung.
test('revertConfig KHONG dung toi state.runFilter', () => {
  setupSaveGate();
  state.runFilter.methods = ['DELETE'];
  state.runFilter.authIds = ['a1'];

  revertConfig();

  assert.deepEqual(state.runFilter.methods, ['DELETE']);
  assert.deepEqual(state.runFilter.authIds, ['a1']);
});

test('savedSheet doc sheet DA LUU, draftSheet doc sheet dang do', () => {
  setupSaveGate();
  state.permissionFile.selectedSheet = 'Sheet B';

  assert.equal(savedSheet().name, 'Sheet A');
  assert.equal(draftSheet().name, 'Sheet B');
});

test('savedSheet tra null khi sheet da luu bien mat khoi file', () => {
  setupSaveGate();
  state.permissionFile.sheets = [{ name: 'Sheet Moi', headers: [], rows: [] }];
  assert.equal(savedSheet(), null);
});

test('load: cau hinh cu khong co savedConfig thi snapshot tu gia tri dang co', () => {
  setupMockLocalStorage();
  localStorage.setItem('ccm-tool-config', JSON.stringify({
    permissionFile: { filename: 'cu.xlsx', headers: ['A', 'B'], rows: [['1', '2']] },
    permissionMapping: { usecase1: [], usecase2: { permissionColumn: 'A' } },
    runFilter: { methods: ['GET'], msisdnPatterns: [], authIds: [] },
  }));
  Object.assign(state, defaultConfig());
  load();

  assert.equal(state.savedConfig.permissionMapping.usecase2.permissionColumn, 'A');
  assert.equal(state.savedConfig.permissionSheet, 'Default');
  assert.equal(isConfigDirty(), false);
});

test('load: khoa methods thua trong cau hinh cu bi bo qua, khong can migration', () => {
  setupMockLocalStorage();
  localStorage.setItem('ccm-tool-config', JSON.stringify({
    permissionFile: { filename: 'p.xlsx', sheets: [{ name: 'S1', headers: ['A'], rows: [] }], selectedSheet: 'S1' },
    savedConfig: {
      permissionMapping: { usecase1: [], usecase2: { permissionColumn: 'A' } },
      methods: ['GET'],
      permissionSheet: 'S1',
    },
  }));
  Object.assign(state, defaultConfig());
  load();

  assert.equal(state.savedConfig.methods, undefined);
  assert.equal(state.savedConfig.permissionSheet, 'S1');
});

test('load: savedConfig da co thi giu nguyen, khong ghi de bang ban nhap', () => {
  setupMockLocalStorage();
  localStorage.setItem('ccm-tool-config', JSON.stringify({
    permissionFile: {
      filename: 'p.xlsx',
      sheets: [{ name: 'S1', headers: ['A'], rows: [] }],
      selectedSheet: 'S1',
    },
    permissionMapping: { usecase1: [], usecase2: { permissionColumn: 'DANG SUA' } },
    savedConfig: {
      permissionMapping: { usecase1: [], usecase2: { permissionColumn: 'DA LUU' } },
      methods: [],
      permissionSheet: 'S1',
    },
  }));
  Object.assign(state, defaultConfig());
  load();

  assert.equal(state.permissionMapping.usecase2.permissionColumn, 'DANG SUA');
  assert.equal(savedMapping().usecase2.permissionColumn, 'DA LUU');
  assert.equal(isConfigDirty(), true);
});
