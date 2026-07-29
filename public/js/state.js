const STORAGE_KEY = 'ccm-tool-config';

export function defaultConfig() {
  return {
    domain: '',
    token: '',
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
  });

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
  });

  // Cau hinh cu dung khoa concurrency, doc sang workerCount.
  if (incoming.advanced?.workerCount === undefined && incoming.advanced?.concurrency !== undefined) {
    state.advanced.workerCount = Number(incoming.advanced.concurrency) || 4;
  }
  delete state.advanced.concurrency;

  persist();
  notify();
}
