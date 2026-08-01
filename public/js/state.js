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

// Ban DA LUU cua cau hinh phan quyen. Bang phan quyen raw, CHECK PERM va
// RUN ALL doc rieng ban nay — sua dropdown o panel PHAN QUYEN chi dong vao
// ban nhap (state.permissionMapping / runFilter / permissionFile.selectedSheet)
// cho toi khi bam Luu. Khong tach ra thi bang ve lai tren trang thai nua voi
// giua chung mot thao tac ba buoc (cot <-> sheet <-> auth).
export function emptySavedConfig() {
  return {
    permissionMapping: {
      usecase1: [],
      usecase2: { permissionColumn: '', columnSheet: '', endpointColumn: '' }
    },
    // KHONG co 'methods'. Bo loc method di thang qua state.runFilter nhu RUN ALL
    // (matchPermissionEndpoints goi filterEndpoints), nen dua no vao gate chi lam
    // badge "chua luu" bat len trong khi bam Luu khong doi ket qua gi.
    permissionSheet: ''
  };
}

export function defaultConfig() {
  return {
    domain: '',
    selectedSheet: 'all',
    commonEndpoints: '',
    commonEndpointsEnabled: true,
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
    // headers/rows la ban sao cua sheets[i] — giu lai thi moi lan doi sheet phai
    // dong bo ba cho, va khong cach nao doi sheet o ban nhap ma khong dung ban
    // da luu. Doc qua sheetByName() thay vi.
    permissionFile: { filename: '', sheets: [], selectedSheet: '' },
    permissionMapping: {
      // CHECK PERM chi mot duong: endpoint thuoc sheet khai o usecase1[].endpointSheet,
      // khu trung METHOD:pathTemplate. Endpoint khong dong UC2 nao keo ve van chay, cham 'empty'.
      usecase1: [],
      usecase2: { permissionColumn: '', columnSheet: '', endpointColumn: '' }
    },
    savedConfig: emptySavedConfig(),
    advanced: {
      workerCount: 4,
      timeoutMs: 30000,
      errorCodePaths: ['errorCode', 'error_code', 'code', 'error.code'],
      dedupeOnImport: true,
    },
    ui: { permSplitPct: 60 },
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

// Run rieng cua nut CHECK PERM, doc lap voi RUN ALL — chay cai nay khong
// xoa ket qua dang co o tab OUTPUT va nguoc lai.
export const permResults = [];

let permRunId = null;
export const getPermRunId = () => permRunId;
export const setPermRunId = (v) => { permRunId = v; };

export function resetPermResults() {
  permResults.length = 0;
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

/* ---------- sheet cua file phan quyen ---------- */

export function sheetByName(name) {
  const sheets = state.permissionFile?.sheets ?? [];
  return sheets.find((s) => s.name === name) ?? null;
}

// null khi sheet da luu khong con trong file (nguoi dung import file khac) —
// trang thai hop le, bang raw bao rieng thay vi bao "khong co cot nao".
export const savedSheet = () => sheetByName(state.savedConfig?.permissionSheet);
export const savedMapping = () => state.savedConfig?.permissionMapping ?? emptySavedConfig().permissionMapping;

// Sheet dang do o panel PHAN QUYEN — chi panel do duoc doc, vi no LA giao dien
// sua ban nhap. Moi noi khac doc savedSheet().
export const draftSheet = () => sheetByName(state.permissionFile?.selectedSheet);

/* ---------- commit / revert cau hinh phan quyen ---------- */

function snapshot() {
  return structuredClone({
    permissionMapping: state.permissionMapping,
    permissionSheet: state.permissionFile?.selectedSheet ?? ''
  });
}

export function saveConfig() {
  state.savedConfig = snapshot();
  persist();
  notify();
}

export function revertConfig() {
  const s = structuredClone(state.savedConfig ?? emptySavedConfig());
  state.permissionMapping = s.permissionMapping;
  // KHONG dung toi state.runFilter — ca ba truc (methods/authIds/msisdnPatterns)
  // deu ngoai gate, Huy ma xoa chung la xoa lua chon dang dung cua nguoi dung.
  if (state.permissionFile) state.permissionFile.selectedSheet = s.permissionSheet;
  persist();
  notify();
}

export function isConfigDirty() {
  return JSON.stringify(snapshot()) !== JSON.stringify(state.savedConfig ?? emptySavedConfig());
}

// Nhan cho badge — nguoi dung biet dang treo cai gi thay vi chi thay "chua luu".
export function dirtyParts() {
  const cur = snapshot();
  const sav = state.savedConfig ?? emptySavedConfig();
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const out = [];
  if (!same(cur.permissionMapping, sav.permissionMapping)) out.push('mapping UC1/UC2');
  if (cur.permissionSheet !== sav.permissionSheet) out.push('sheet phân quyền');
  return out;
}

function normalizeSavedConfig(incoming) {
  if (!incoming) return null;
  const base = emptySavedConfig();
  return {
    permissionMapping: {
      usecase1: incoming.permissionMapping?.usecase1 ?? [],
      usecase2: {
        ...base.permissionMapping.usecase2,
        ...(incoming.permissionMapping?.usecase2 ?? {})
      }
    },
    // 'methods' cua cau hinh cu bi bo qua o day — khong con thuoc gate.
    permissionSheet: incoming.permissionSheet ?? ''
  };
}

// Ban cu luu permissionFile.headers/rows thay vi sheets. Dung lai mot sheet
// 'Default' de cau hinh cu mo len van xem duoc bang, roi bo hai khoa phai sinh.
function migratePermissionFile(target, incoming) {
  const pf = target.permissionFile;
  if (!pf) return;

  const oldHeaders = incoming?.permissionFile?.headers;
  if ((pf.sheets ?? []).length === 0 && Array.isArray(oldHeaders) && oldHeaders.length > 0) {
    pf.sheets = [{ name: 'Default', headers: oldHeaders, rows: incoming.permissionFile.rows ?? [] }];
    pf.selectedSheet = 'Default';
  }

  delete pf.headers;
  delete pf.rows;
}

// Cau hinh cu chua co savedConfig — snapshot tu gia tri dang co, coi nhu da
// Luu. Nguoi dung cu mo len khong thay khac gi.
function migrateSavedConfig(incoming) {
  state.savedConfig = normalizeSavedConfig(incoming?.savedConfig) ?? snapshot();
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
    ui: { ...base.ui, ...(saved.ui ?? {}) },
    runFilter: { ...base.runFilter, ...(saved.runFilter ?? {}) },
    permissionFile: { ...base.permissionFile, ...(saved.permissionFile ?? {}) },
    permissionMapping: {
      ...base.permissionMapping,
      ...(saved.permissionMapping ?? {}),
      usecase2: {
        ...base.permissionMapping?.usecase2,
        ...(saved.permissionMapping?.usecase2 ?? {})
      }
    }
  });
  migrateAuths(state, saved);
  migratePermissionFile(state, saved);
  migrateSavedConfig(saved);

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
    ui: { ...base.ui, ...(incoming.ui ?? {}) },
    runFilter: { ...base.runFilter, ...(incoming.runFilter ?? {}) },
    permissionFile: { ...base.permissionFile, ...(incoming.permissionFile ?? {}) },
    permissionMapping: {
      ...base.permissionMapping,
      ...(incoming.permissionMapping ?? {}),
      usecase2: {
        ...base.permissionMapping?.usecase2,
        ...(incoming.permissionMapping?.usecase2 ?? {})
      }
    }
  });
  migrateAuths(state, incoming);
  migratePermissionFile(state, incoming);
  migrateSavedConfig(incoming);

  // Cau hinh cu dung khoa concurrency, doc sang workerCount.
  if (incoming.advanced?.workerCount === undefined && incoming.advanced?.concurrency !== undefined) {
    state.advanced.workerCount = Number(incoming.advanced.concurrency) || 4;
  }
  delete state.advanced.concurrency;

  persist();
  notify();
}
