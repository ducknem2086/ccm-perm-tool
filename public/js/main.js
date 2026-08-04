import {
  state, load, persist, notify, subscribe, results, resetResults, getRunId, setRunId, applyConfig,
  permResults, resetPermResults, getPermRunId, setPermRunId, savedSheet, savedMapping,
} from './state.js';
import { startRun, openStream, cancelRun, exportExcel } from './api.js';
import { countRequests } from './shared/request-count.js';
import { filterEndpoints, selectedAuths, businessCommonText } from './shared/run-filter.js';
import { toCurl, curlFilename } from './shared/curl.js';
import { downloadBlob } from './shared/download.js';
import {
  buildPermissionRunConfig, validatePermissionScope, savedPermissionPayload,
} from './shared/permission-scope.js';
import { roleColumns, visibleIdentifierValues } from './shared/permission-sheet-filter.js';
import { initCommonEndpoints } from './ui/common-endpoints.js';
import { initTabs } from './ui/tabs.js';
import { initConnectionPanel } from './ui/connection-panel.js';
import { initDateRange } from './ui/date-range.js';
import { initMsisdnDrawer } from './ui/msisdn-drawer.js';
import { initTemplateDrawer } from './ui/template-drawer.js';
import { initEndpointDrawer } from './ui/endpoint-drawer.js';
import { initEndpointList } from './ui/endpoint-list.js';
import { initParamTables } from './ui/param-table.js';
import { initFilters } from './ui/filters.js';
import { initResultTable } from './ui/result-table.js';
import { initPermissionFilters } from './ui/permission-filters.js';
import { initPermissionTable } from './ui/permission-table.js';
import { initPermissionSheetTable } from './ui/permission-sheet-table.js';
import { initPermissionSheetFilterBar } from './ui/permission-sheet-filter-bar.js';
import { initSplitPane } from './ui/split-pane.js';
import { initDetailDrawer } from './ui/detail-drawer.js';
import { formatConfigErrors } from './shared/error-format.js';
import { initAuthsPanel } from './ui/auths-panel.js';
import { initPermissionsPanel } from './ui/permissions-panel.js';
import { initRunFilterBar } from './ui/run-filter-bar.js';
import { dedupeEndpoints } from './shared/endpoint-dedupe.js';

/* ---------- toast ---------- */
const toastHost = document.getElementById('toast-host');
window.ccmToast = (message, kind = '') => {
  const el = document.createElement('div');
  el.className = `toast ${kind ? `is-${kind}` : ''}`;
  el.textContent = message;
  toastHost.append(el);
  setTimeout(() => el.remove(), 6000);
};


/* ---------- khoi tao ---------- */
load();

// Khai bao som vi refreshRunButton() doc bien nay va co the chay ngay khi notify() dau tien ban ra.
let running = false;
let stream = null;

// Run rieng cua CHECK PERM, doc lap hoan toan voi RUN ALL.
let permRunning = false;
let permStream = null;
// Chot lai luc dung config, khong doc lai tu permResults: statusPermission
// 'empty' con phat sinh khi request loi mang, dem no la tron hai nguyen nhan.
let permUnmatched = 0;

const tabs = initTabs();
const connectionPanel = initConnectionPanel();
initDateRange();
initMsisdnDrawer();

const authsPanel = initAuthsPanel();
initPermissionsPanel();
const runFilterBar = initRunFilterBar();
initCommonEndpoints();
const chkCommonEnabled = document.getElementById('chk-common-enabled');

if (chkCommonEnabled) {
  chkCommonEnabled.checked = state.commonEndpointsEnabled !== false;
  chkCommonEnabled.addEventListener('change', () => {
    state.commonEndpointsEnabled = chkCommonEnabled.checked;
    persist();
    notify();
  });
}

// Sua token/them-bot auth o tab AUTHS lam indicator tren topbar va so lieu
// filter bar cu di — ve lai ca ba moi lan state doi tu bat ky dau.
subscribe(() => {
  connectionPanel.refresh();
  authsPanel.render();
  runFilterBar.render();
  if (chkCommonEnabled && chkCommonEnabled.checked !== (state.commonEndpointsEnabled !== false)) {
    chkCommonEnabled.checked = state.commonEndpointsEnabled !== false;
  }
});

const templateDrawer = initTemplateDrawer();
const endpointDrawer = initEndpointDrawer();
initEndpointList({
  onOpenTemplate: () => templateDrawer.open(),
  onOpenConfig: (index) => endpointDrawer.open(index),
});
initParamTables();

const drawer = initDetailDrawer();

const filters = initFilters({ onChange: () => renderResults() });
const resultTable = initResultTable({
  getRecords: () => results,
  getFilter: () => filters.getFilter(),
  getVisibleColumns: () => filters.getVisibleColumns(),
  filterCell: (key) => filters.filterCell(key),
  onRowClick: (rec) => drawer.open(rec),
  onCurlClick: (rec) => {
    downloadBlob(curlFilename(rec), toCurl(rec), 'text/plain;charset=utf-8');
    window.ccmToast('Đã tải file cURL — Postman: Import → Raw text', 'ok');
  },
});

const permFilters = initPermissionFilters({ onChange: () => renderPermResults() });
const permTable = initPermissionTable({
  getRecords: () => permResults,
  getFilter: () => permFilters.getFilter(),
  filterCell: (key) => permFilters.filterCell(key),
  onRowClick: (rec) => drawer.open(rec),
});

const permSheetFilterBar = initPermissionSheetFilterBar({
  onChange: () => renderPermSheet(),
});
// Bang raw doc ban DA LUU, khong doc ban nhap: sua dropdown o panel PHAN QUYEN
// khong lam bang nhay theo tung buoc cua mot thao tac ba buoc.
const permSheetTable = initPermissionSheetTable({
  getSheet: () => ({
    filename: state.permissionFile.filename,
    missing: Boolean(state.permissionFile.filename) && savedSheet() === null,
    ...(savedSheet() ?? {}),
  }),
  getRoleColumns: () => roleColumns(savedSheet()?.headers, savedMapping().usecase1),
  getUc2: () => savedMapping().usecase2,
  getFilter: () => permSheetFilterBar.getFilter(),
});

function renderPermSheet() {
  const { shown, total } = permSheetTable.render();
  permSheetFilterBar.refreshCount(shown, total);
}

subscribe(renderPermSheet);
// Bang phan quyen RAW doc lap voi run: khong co notify() nao ban ra trong
// duong chay CHECK PERM, nen khong ve mot lan o day thi bang trong tron cho
// toi khi nguoi dung cham vao mot o input bat ky.
renderPermSheet();

initSplitPane({
  container: document.getElementById('perm-split'),
  handle: document.getElementById('perm-split-handle'),
  initialPct: state.ui.permSplitPct,
  onChange: (pct) => { state.ui.permSplitPct = pct; persist(); },
});

/* ---------- advanced ---------- */
const workerCount = document.getElementById('inp-worker-count');
const timeout = document.getElementById('inp-timeout');
const errorPaths = document.getElementById('inp-error-paths');
const dedupe = document.getElementById('chk-dedupe');

workerCount.value = state.advanced.workerCount;
timeout.value = state.advanced.timeoutMs;
errorPaths.value = state.advanced.errorCodePaths.join(', ');
dedupe.checked = state.advanced.dedupeOnImport;

workerCount.addEventListener('input', () => {
  state.advanced.workerCount = Math.max(1, Math.min(Number(workerCount.value) || 4, 16));
  persist();
});
timeout.addEventListener('input', () => { state.advanced.timeoutMs = Number(timeout.value) || 30000; persist(); });
errorPaths.addEventListener('input', () => {
  state.advanced.errorCodePaths = errorPaths.value.split(',').map((s) => s.trim()).filter(Boolean);
  persist();
});
dedupe.addEventListener('change', () => { state.advanced.dedupeOnImport = dedupe.checked; persist(); });

/* ---------- dem so request ---------- */
const btnRun = document.getElementById('btn-run');
const btnCheckPerm = document.getElementById('btn-check-perm');

function refreshRunButton() {
  const activeAuthCount = selectedAuths(state.auths, state.runFilter).length;
  const n = countRequests(state);

  if (activeAuthCount === 0) {
    btnRun.textContent = '▶ RUN ALL (Cần chọn Auth)';
    btnRun.disabled = true;
    btnRun.title = 'Vui lòng chọn ít nhất 1 Auth Profile ở thanh filter bên dưới';
    return;
  }

  btnRun.title = '';
  btnRun.textContent = `▶ RUN ALL (${n})`;
  btnRun.disabled = n === 0 || running;
}

const permWarningsEl = document.getElementById('perm-warnings');

function refreshCheckPermButton() {
  if (!state.permissionFile?.filename) {
    btnCheckPerm.textContent = '🔐 CHECK PERM (cần file phân quyền)';
    btnCheckPerm.disabled = true;
    btnCheckPerm.title = 'Nạp file phân quyền và khai mapping UC1/UC2 ở tab INPUT trước';
    permWarningsEl.hidden = true;
    return;
  }

  const {
    pairs, total, unmatched, noFunction, collapsed, endpointCount,
  } = buildPermissionRunConfig(state);

  // Ba canh bao gom lai — nguoi dung doc truoc khi bam, khong phai tu dem
  // trong bang ket qua sau khi da chay xong. Hien truc tiep trong panel (khong
  // phai title/tooltip) de khong phai hover moi thay.
  const warns = [];
  if (unmatched > 0) warns.push(`${unmatched}/${endpointCount} endpoint không khớp dòng phân quyền`);
  if (noFunction > 0) warns.push(`${noFunction} endpoint trống cột FUNCTION — không gọi được oracle`);
  if (collapsed > 0) warns.push(`${collapsed} bản trùng đã gộp`);
  btnCheckPerm.title = '';
  permWarningsEl.textContent = warns.length > 0 ? `⚠ ${warns.join(' · ')}` : '';
  permWarningsEl.hidden = warns.length === 0;

  // total la so request THAT se ban di (pairs + oracleCalls), khong phai so cap.
  btnCheckPerm.textContent = `🔐 CHECK PERM (${pairs} cặp · ${total} request)`;
  btnCheckPerm.disabled = pairs === 0 || permRunning;
}

subscribe(refreshRunButton);
subscribe(refreshCheckPermButton);

/* ---------- chay ---------- */
const progressEl = document.getElementById('run-progress');
const statsEl = document.getElementById('run-stats');
const badge = document.getElementById('tab-output-badge');
const btnCancel = document.getElementById('btn-cancel');
const btnExport = document.getElementById('btn-export-excel');

const permProgressEl = document.getElementById('perm-progress');
const permStatsEl = document.getElementById('perm-stats');
const permBadge = document.getElementById('tab-perm-badge');
const btnPermCancel = document.getElementById('btn-perm-cancel');
const btnPermExport = document.getElementById('btn-perm-export');
const btnPermCheck = document.getElementById('btn-perm-check');
const btnPermCheckClear = document.getElementById('btn-perm-check-clear');
const permCheckBadge = document.getElementById('perm-check-badge');
const permCheckCountEl = document.getElementById('perm-check-count');

function hidePermCheckBadge() {
  permFilters.clearCheckNames();
  permCheckBadge.hidden = true;
}

function renderResults() {
  filters.refreshOptions(results);
  resultTable.render();
  badge.hidden = results.length === 0;
  badge.textContent = String(results.length);
  btnExport.disabled = results.length === 0;
}

function renderPermResults() {
  permFilters.refreshOptions(permResults);
  permTable.render();
  permBadge.hidden = permResults.length === 0;
  permBadge.textContent = String(permResults.length);
  btnPermExport.disabled = permResults.length === 0;
}

// EventSource tu dong ket noi lai khi mang chap chon, va route SSE phat lai toan bo
// ket qua da co cho client vua noi. Khong loc thi moi lan reconnect se nhan doi bang.
const seenIndexes = new Set();

btnRun.addEventListener('click', async () => {
  try {
    const enabledEndpoints = filterEndpoints(
      state.endpoints, state.runFilter, state.selectedSheet,
      businessCommonText(state.commonEndpointList), state.commonEndpointsEnabled,
    );
    const { skipped } = dedupeEndpoints(enabledEndpoints);
    if (skipped > 0) {
      window.ccmToast?.(`Đã loại bỏ ${skipped} endpoint trùng lặp trước khi chạy`, 'ok');
    }

    stream?.close();
    seenIndexes.clear();
    resetResults();
    renderResults();
    progressEl.textContent = '0/0';
    statsEl.textContent = '';

    // Cham diem permission cua RUN ALL cung doc ban DA LUU — server nhan
    // permissionFile phang (headers/rows), state khong con hai khoa do.
    const { runId, total } = await startRun({ ...state, ...savedPermissionPayload(state) });
    setRunId(runId);
    running = true;
    btnCancel.disabled = false;
    refreshRunButton();
    tabs.select('output');
    progressEl.textContent = `0/${total}`;

    stream = openStream(runId, {
      onResult: (rec) => {
        if (seenIndexes.has(rec.index)) return;
        seenIndexes.add(rec.index);
        results.push(rec);
        renderResults();
      },
      onProgress: ({ done, total: t }) => { progressEl.textContent = `${done}/${t}`; },
      onDone: (summary) => {
        running = false;
        btnCancel.disabled = true;
        refreshRunButton();
        statsEl.textContent = `⏱ ${(summary.elapsedMs / 1000).toFixed(1)}s · ✓ ${summary.ok} · ✕ ${summary.failed}`;
        window.ccmToast(
          summary.status === 'cancelled'
            ? `Đã dừng sau ${summary.done}/${summary.total} request`
            : `Xong ${summary.total} request trong ${(summary.elapsedMs / 1000).toFixed(1)}s`,
          summary.failed > 0 ? 'error' : 'ok',
        );
      },
    });
  } catch (err) {
    running = false;
    refreshRunButton();
    const detail = formatConfigErrors(err.errors, state.endpoints);
    window.ccmToast(detail ? `Cấu hình chưa hợp lệ:\n${detail}` : err.message, 'error');
    tabs.select('input');
  }
});

btnCancel.addEventListener('click', async () => {
  const runId = getRunId();
  if (!runId) return;
  await cancelRun(runId);
  btnCancel.disabled = true;
});

// EventSource cho CHECK PERM cung phat lai toan bo khi reconnect — loc trung
// giong het co che cua seenIndexes o RUN ALL, nhung tach rieng vi hai run
// doc lap co the dang chay dong thoi.
const permSeenIndexes = new Set();

btnCheckPerm.addEventListener('click', async () => {
  const errors = validatePermissionScope(state);
  if (errors.length > 0) {
    window.ccmToast(`Cấu hình phân quyền chưa hợp lệ:\n${errors.join('\n')}`, 'error');
    tabs.select('input');
    return;
  }

  try {
    const { config, total, unmatched } = buildPermissionRunConfig(state);
    permUnmatched = unmatched;

    permStream?.close();
    permSeenIndexes.clear();
    resetPermResults();
    hidePermCheckBadge();
    renderPermResults();
    permProgressEl.textContent = '0/0';
    permStatsEl.textContent = '';

    const { runId } = await startRun(config);
    setPermRunId(runId);
    permRunning = true;
    btnPermCancel.disabled = false;
    refreshCheckPermButton();
    tabs.select('perm');
    permProgressEl.textContent = `0/${total}`;

    permStream = openStream(runId, {
      onResult: (rec) => {
        if (permSeenIndexes.has(rec.index)) return;
        permSeenIndexes.add(rec.index);
        permResults.push(rec);
        renderPermResults();
      },
      onProgress: ({ done, total: t }) => { permProgressEl.textContent = `${done}/${t}`; },
      onDone: (summary) => {
        permRunning = false;
        btnPermCancel.disabled = true;
        refreshCheckPermButton();
        permStatsEl.textContent = `⏱ ${(summary.elapsedMs / 1000).toFixed(1)}s · ✓ ${summary.ok} · ✕ ${summary.failed}`
          + (permUnmatched > 0 ? ` · ⚠ ${permUnmatched} không khớp phân quyền` : '');
        window.ccmToast(
          summary.status === 'cancelled'
            ? `Đã dừng sau ${summary.done}/${summary.total} request`
            : `Xong ${summary.total} request trong ${(summary.elapsedMs / 1000).toFixed(1)}s`,
          summary.failed > 0 ? 'error' : 'ok',
        );
      },
    });
  } catch (err) {
    permRunning = false;
    refreshCheckPermButton();
    const detail = formatConfigErrors(err.errors, state.endpoints);
    window.ccmToast(detail ? `Cấu hình chưa hợp lệ:\n${detail}` : err.message, 'error');
    tabs.select('input');
  }
});

btnPermCancel.addEventListener('click', async () => {
  const runId = getPermRunId();
  if (!runId) return;
  await cancelRun(runId);
  btnPermCancel.disabled = true;
});

// Nut Check — xem nhanh log theo TOAN BO bang HAS PERMISSIONS dang hien (theo
// checkbox YES/NO), khong phai go tay tung ten mot vao o loc UC2 Name. Snapshot
// tai thoi diem bam — doi checkbox sau do phai bam lai Check moi cap nhat.
btnPermCheck.addEventListener('click', () => {
  const sheet = savedSheet();
  const names = visibleIdentifierValues(
    sheet?.headers ?? [], sheet?.rows ?? [],
    savedMapping().usecase1, savedMapping().usecase2,
    permSheetFilterBar.getFilter(),
  );
  if (names.length === 0) {
    window.ccmToast('Không có bản ghi has permission nào đang hiển thị để check', 'error');
    return;
  }
  permFilters.applyCheckNames(names);
  permCheckCountEl.textContent = String(names.length);
  permCheckBadge.hidden = false;
});

btnPermCheckClear.addEventListener('click', () => {
  hidePermCheckBadge();
});

/* ---------- export excel ---------- */
const radioInclude = document.getElementById('radio-token-include');
const radioMask = document.getElementById('radio-token-mask');
const tokenWarning = document.getElementById('token-warning');

const syncTokenWarning = () => { tokenWarning.hidden = !radioInclude.checked; };
radioInclude.addEventListener('change', syncTokenWarning);
radioMask.addEventListener('change', syncTokenWarning);
syncTokenWarning();

btnExport.addEventListener('click', async () => {
  const runId = getRunId();
  if (!runId) return;
  try {
    await exportExcel(runId, resultTable.getVisibleIndexes(), radioInclude.checked);
    window.ccmToast('Đã tải file Excel', 'ok');
  } catch (err) {
    window.ccmToast(`Export thất bại: ${err.message}`, 'error');
  }
});

btnPermExport.addEventListener('click', async () => {
  const runId = getPermRunId();
  if (!runId) return;
  try {
    await exportExcel(runId, permTable.getVisibleIndexes(), false, 'permission');
    window.ccmToast('Đã tải file Excel', 'ok');
  } catch (err) {
    window.ccmToast(`Export thất bại: ${err.message}`, 'error');
  }
});

/* ---------- export / import config ---------- */
document.getElementById('btn-export-config').addEventListener('click', () => {
  downloadBlob('ccm-config.json', JSON.stringify(state, null, 2), 'application/json');
});

document.getElementById('btn-import-config').addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      applyConfig(JSON.parse(await file.text()));
      location.reload();
    } catch (err) {
      window.ccmToast(`File config không đọc được: ${err.message}`, 'error');
    }
  });
  input.click();
});

refreshRunButton();
renderResults();
refreshCheckPermButton();
renderPermResults();
renderPermSheet();
