import { parseRawHeaders } from './shared/endpoint-path.js';

const STORAGE_KEY = 'ccm-tool-config';

let authSeq = 0;

let commonEndpointSeq = 0;

export function makeCommonEndpoint(over = {}) {
  commonEndpointSeq += 1;
  return {
    id: `ce_${Date.now().toString(36)}_${commonEndpointSeq}`,
    kind: 'business', // 'business' vao pool RUN ALL, 'oracle' la khai bao checkPermission
    line: '',
    // Rieng dong 'oracle': cURL checkPermission that, dung lam KHUON cho
    // request (URL + toan bo header + body skeleton). Danh tinh trong do bi
    // thay bang danh tinh cua auth dang chay — xem buildOracleRequest.
    // Khong co khuon thi Origin/Referer/X-Current-Url roi ve origin cua tool
    // (localhost:9000) va IAM sau WAF tra 401.
    curlRaw: '',
    ...over,
  };
}

export function makeAuth(over = {}) {
  authSeq += 1;
  return {
    id: `auth_${Date.now().toString(36)}_${authSeq}`,
    name: '',
    // Nguon danh tinh DUY NHAT. Moi header cua request nghiep vu lay tu day;
    // CHECK PERM muon lai rieng phan cookie loi auth (xem auth-identity.js).
    curlRaw: '',
    // Khong nam trong token — FE tu gui theo role dang chon tren man hinh.
    role: '',
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
      usecase2: { permissionColumn: '', columnSheet: '', endpointColumn: '' },
      // actionColumn de rong la hop le: file endpoints thuc te thuong khong co
      // cot action FE rieng — de rong thi giu nguyen action co san trong body
      // cua curl mau checkPermission.
      usecase3: { columnSheet: '', functionColumn: '', actionColumn: '' }
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
    // Danh sach co phan loai: kind 'business' vao pool RUN ALL (thay cho chuoi
    // commonEndpoints cu — xem migrateCommonEndpoints), kind 'oracle' la khai
    // bao endpoint checkPermission mac dinh, KHONG vao pool nao.
    commonEndpointList: [],
    commonEndpointsEnabled: true,
    auths: [makeAuth({ name: 'Default' })],
    runFilter: { methods: [], msisdnPatterns: [], authIds: [] },
    dateRange: { from: '', to: '' },
    dateFormat: 'ddMMyyyy',
    msisdns: [],
    endpoints: [],
    // Ten sheet tho lay tu file import — song song voi endpoints, KHONG suy ra
    // tu no. Giu lai sheet bi lech cot theo template (0 dong map duoc) de tab
    // van hien du sheet trong file goc thay vi am tham bien mat.
    endpointSheetNames: [],
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
      usecase2: { permissionColumn: '', columnSheet: '', endpointColumn: '' },
      // UC3 cap function/action cho oracle checkPermission. De trong ca ba o
      // thi CHECK PERM chi chay request nghiep vu nhu truoc thay doi nay.
      usecase3: { columnSheet: '', functionColumn: '', actionColumn: '' }
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
      },
      // Cau hinh cu chua co UC3 — trai tu base de mo len khong bi undefined.
      usecase3: {
        ...base.permissionMapping.usecase3,
        ...(incoming.permissionMapping?.usecase3 ?? {})
      }
    },
    // 'methods' cua cau hinh cu bi bo qua o day — khong con thuoc gate.
    permissionSheet: incoming.permissionSheet ?? ''
  };
}

// Ban cu luu ENDPOINTS CHUNG thanh chuoi 'commonEndpoints' (moi dong 1
// endpoint). Tach thanh danh sach 'business' — mo cau hinh cu len chay y het
// truoc, khong ai bi ep khai lai. Chi chay khi commonEndpointList chua co gi,
// tranh de len danh sach nguoi dung vua tao trong phien nay.
function migrateCommonEndpoints(target, incoming) {
  if ((target.commonEndpointList ?? []).length > 0) return;
  const text = String(incoming?.commonEndpoints ?? '').trim();
  if (text === '') return;
  target.commonEndpointList = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    .map((line) => makeCommonEndpoint({ kind: 'business', line }));
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

function curlFromLegacyFields(a) {
  const lines = [];
  if (a?.token) lines.push(`Authorization: Bearer ${a.token}`);
  if (a?.cookie) lines.push(`Cookie: ${a.cookie}`);
  if (a?.refreshToken) lines.push(`refresh_token: ${a.refreshToken}`);
  return lines.join('\n');
}

// HEADERS CHUNG co dang khai danh tinh hay khong. Doc ca hai che do nhap
// (bang key-value va o dan cURL) vi ca hai deu vao globalHeaderPairs.
function globalHeadersCarryIdentity(incoming) {
  const names = [];
  if ((incoming?.globalHeaderMode ?? 'kv') === 'raw') {
    names.push(...parseRawHeaders(incoming?.globalHeaderRaw ?? '').map((p) => p.key));
  } else {
    names.push(...(incoming?.globalHeaders ?? []).filter((p) => p.enabled !== false).map((p) => p.key));
  }
  return names.some((k) => ['authorization', 'cookie'].includes(String(k).toLowerCase()));
}

// Auth profile cu khai ba o rieng token/cookie/refreshToken (mode 'fields')
// hoac dan nguyen cURL (mode 'curl') — gop ca hai duong ve mot curlRaw duy nhat.
//
// NHUNG ba o rieng chi duoc dung len curlRaw khi HEADERS CHUNG khong tu khai
// danh tinh. Ly do: truoc thay doi nay authHeaderPairs tra [] cho mode
// 'fields', nen ba o do KHONG BAO GIO duoc gui di — cau hinh nao vua co ba o
// vua co cURL o HEADERS CHUNG thi thu dang chay that la cai cURL, con ba o
// chi la rac con sot tu phien truoc. Dung chung len curlRaw se de nguoc len
// HEADERS CHUNG (auth thang global) va gui token het han -> 401 hang loat.
function legacyAuthToCurlRaw(a, incoming) {
  const own = String(a?.curlRaw ?? '').trim();
  if (own !== '') return String(a.curlRaw);
  return globalHeadersCarryIdentity(incoming) ? '' : curlFromLegacyFields(a);
}

// Ban cu luu credential o ba khoa phang cua state, hoac tren tung auth
// profile — gop tat ca ve mot curlRaw + role moi. Xem
// docs/superpowers/specs/2026-08-03-auth-single-cookie-design.md.
function migrateAuths(target, incoming) {
  const saved = Array.isArray(incoming?.auths) ? incoming.auths : [];
  target.auths = saved.length > 0
    // Trai len makeAuth() de auth cu thieu khoa nao — nhat la `id`, thu
    // selectedAuths loc theo — van duoc cap gia tri hop le thay vi undefined.
    ? saved.map((a) => makeAuth({
      ...(a.id ? { id: a.id } : {}),
      name: a.name ?? '',
      role: a.role ?? '',
      curlRaw: legacyAuthToCurlRaw(a, incoming),
    }))
    : [makeAuth({ name: 'Default', curlRaw: curlFromLegacyFields(incoming) })];

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
      },
      usecase3: {
        ...base.permissionMapping?.usecase3,
        ...(saved.permissionMapping?.usecase3 ?? {})
      }
    }
  });
  migrateAuths(state, saved);
  migratePermissionFile(state, saved);
  migrateSavedConfig(saved);
  migrateCommonEndpoints(state, saved);
  delete state.commonEndpoints;

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
      },
      usecase3: {
        ...base.permissionMapping?.usecase3,
        ...(incoming.permissionMapping?.usecase3 ?? {})
      }
    }
  });
  migrateAuths(state, incoming);
  migratePermissionFile(state, incoming);
  migrateSavedConfig(incoming);
  migrateCommonEndpoints(state, incoming);
  delete state.commonEndpoints;

  // Cau hinh cu dung khoa concurrency, doc sang workerCount.
  if (incoming.advanced?.workerCount === undefined && incoming.advanced?.concurrency !== undefined) {
    state.advanced.workerCount = Number(incoming.advanced.concurrency) || 4;
  }
  delete state.advanced.concurrency;

  persist();
  notify();
}
