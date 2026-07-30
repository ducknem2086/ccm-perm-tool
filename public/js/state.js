const STORAGE_KEY = 'ccm-tool-config';

let authSeq = 0;

export function makeAuth(over = {}) {
  authSeq += 1;
  return {
    id: `auth_${Date.now().toString(36)}_${authSeq}`,
    name: '',
    mode: 'fields',
    token: '',
    cookie: '',
    refreshToken: '',
    curlRaw: '',
    ...over,
  };
}

export function defaultConfig() {
  return {
    domain: '',
    selectedSheet: 'all',
    commonEndpoints: '',
    auths: [makeAuth({ name: 'Default' })],
    runFilter: { methods: [], msisdnPatterns: [], authIds: [] },
    dateRange: { from: '', to: '' },
    dateFormat: 'ddMMyyyy',
    msisdns: [],
    endpoints: [],
    importTemplate: [
      { id: 'tpl_name', type: 'name', selector: 'name', target: 'name' },
      { id: 'tpl_method', type: 'name', selector: 'method', target: 'method' },
      { id: 'tpl_endpoint', type: 'name', selector: 'endpoint', target: 'endpoint' },
    ],
    globalQueryParams: [
      { key: 'fromDate', value: '{{fromDate}}', enabled: true },
      { key: 'toDate', value: '{{toDate}}', enabled: true },
    ],
    globalHeaders: [],
    globalHeaderMode: 'kv',
    globalHeaderRaw: '',
    globalBodyMode: 'none',
    globalBodyParams: [],
    globalBodyRaw: '',
    advanced: {
      workerCount: 4,
      timeoutMs: 30000,
      errorCodePaths: ['errorCode', 'error_code', 'code', 'error.code'],
      dedupeOnImport: true,
    },
  };
}

export const state = defaultConfig();

export const results = [];

let runId = null;
export const getRunId = () => runId;
export const setRunId = (v) => { runId = v; };

export function resetResults() {
  results.length = 0;
}

const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notify() {
  for (const fn of listeners) fn();
}

export function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* localStorage full or disabled — ignore safely */ }
}

// Ban cu luu credential o ba khoa phang cua state. Goi chung lai thanh mot
// profile ten 'Default' de cau hinh cu mo len chay y het truoc.
function migrateAuths(target, incoming) {
  const saved = Array.isArray(incoming?.auths) ? incoming.auths : [];
  target.auths = saved.length > 0
    ? saved.map((a) => ({ ...makeAuth(), ...a }))
    : [makeAuth({
      name: 'Default',
      token: String(incoming?.token ?? ''),
      cookie: String(incoming?.cookie ?? ''),
      refreshToken: String(incoming?.refreshToken ?? ''),
    })];

  delete target.token;
  delete target.cookie;
  delete target.refreshToken;
}

export function load() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
  } catch { saved = null; }
  if (!saved || typeof saved !== 'object') return;

  const base = defaultConfig();
  Object.assign(state, base, saved, {
    dateRange: { ...base.dateRange, ...(saved.dateRange ?? {}) },
    advanced: { ...base.advanced, ...(saved.advanced ?? {}) },
    runFilter: { ...base.runFilter, ...(saved.runFilter ?? {}) },
  });
  migrateAuths(state, saved);

  // Cau hinh cu dung khoa concurrency, doc sang workerCount.
  if (saved.advanced?.workerCount === undefined && saved.advanced?.concurrency !== undefined) {
    state.advanced.workerCount = Number(saved.advanced.concurrency) || 4;
  }
  delete state.advanced.concurrency;
}

export function applyConfig(incoming) {
  const base = defaultConfig();
  Object.assign(state, base, incoming, {
    dateRange: { ...base.dateRange, ...(incoming.dateRange ?? {}) },
    advanced: { ...base.advanced, ...(incoming.advanced ?? {}) },
    runFilter: { ...base.runFilter, ...(incoming.runFilter ?? {}) },
  });
  migrateAuths(state, incoming);

  // Cau hinh cu dung khoa concurrency, doc sang workerCount.
  if (incoming.advanced?.workerCount === undefined && incoming.advanced?.concurrency !== undefined) {
    state.advanced.workerCount = Number(incoming.advanced.concurrency) || 4;
  }
  delete state.advanced.concurrency;

  persist();
  notify();
}
