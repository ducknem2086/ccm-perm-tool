import { state, load, persist, notify, subscribe, results, resetResults, getRunId, setRunId, applyConfig } from './state.js';
import { startRun, openStream, cancelRun, exportExcel } from './api.js';
import { extractVariables } from './shared/variables.js';
import { initTabs } from './ui/tabs.js';
import { initConnectionPanel } from './ui/connection-panel.js';
import { initDateRange } from './ui/date-range.js';
import { initMsisdnDrawer } from './ui/msisdn-drawer.js';
import { initTemplateDrawer } from './ui/template-drawer.js';
import { initEndpointList } from './ui/endpoint-list.js';
import { initParamTables } from './ui/param-table.js';
import { initFilters } from './ui/filters.js';
import { initResultTable } from './ui/result-table.js';
import { initDetailDrawer } from './ui/detail-drawer.js';

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

const tabs = initTabs();
initConnectionPanel();
initDateRange();
initMsisdnDrawer();

const templateDrawer = initTemplateDrawer();
initEndpointList({ onOpenTemplate: () => templateDrawer.open() });
initParamTables();

const drawer = initDetailDrawer();

const filters = initFilters({ onChange: () => renderResults() });
const resultTable = initResultTable({
  getRecords: () => results,
  getFilter: () => filters.getFilter(),
  getVisibleColumns: () => filters.getVisibleColumns(),
  onRowClick: (rec) => drawer.open(rec),
});

/* ---------- advanced ---------- */
const concurrency = document.getElementById('inp-concurrency');
const timeout = document.getElementById('inp-timeout');
const errorPaths = document.getElementById('inp-error-paths');
const dedupe = document.getElementById('chk-dedupe');

concurrency.value = state.advanced.concurrency;
timeout.value = state.advanced.timeoutMs;
errorPaths.value = state.advanced.errorCodePaths.join(', ');
dedupe.checked = state.advanced.dedupeOnImport;

concurrency.addEventListener('input', () => { state.advanced.concurrency = Number(concurrency.value) || 5; persist(); });
timeout.addEventListener('input', () => { state.advanced.timeoutMs = Number(timeout.value) || 30000; persist(); });
errorPaths.addEventListener('input', () => {
  state.advanced.errorCodePaths = errorPaths.value.split(',').map((s) => s.trim()).filter(Boolean);
  persist();
});
dedupe.addEventListener('change', () => { state.advanced.dedupeOnImport = dedupe.checked; persist(); });

/* ---------- dem so request ---------- */
const btnRun = document.getElementById('btn-run');

function countRequests() {
  return state.endpoints
    .filter((e) => e.enabled)
    .reduce((sum, ep) => sum + (extractVariables(ep.pathTemplate).includes('msisdn') ? state.msisdns.length : 1), 0);
}

function refreshRunButton() {
  const n = countRequests();
  btnRun.textContent = `▶ RUN ALL (${n})`;
  btnRun.disabled = n === 0 || running;
}

subscribe(refreshRunButton);

/* ---------- chay ---------- */
const progressEl = document.getElementById('run-progress');
const statsEl = document.getElementById('run-stats');
const badge = document.getElementById('tab-output-badge');
const btnCancel = document.getElementById('btn-cancel');
const btnExport = document.getElementById('btn-export-excel');

function renderResults() {
  filters.refreshOptions(results);
  resultTable.render();
  badge.hidden = results.length === 0;
  badge.textContent = String(results.length);
  btnExport.disabled = results.length === 0;
}

// EventSource tu dong ket noi lai khi mang chap chon, va route SSE phat lai toan bo
// ket qua da co cho client vua noi. Khong loc thi moi lan reconnect se nhan doi bang.
const seenIndexes = new Set();

btnRun.addEventListener('click', async () => {
  try {
    stream?.close();
    seenIndexes.clear();
    resetResults();
    renderResults();
    progressEl.textContent = '0/0';
    statsEl.textContent = '';

    const { runId, total } = await startRun(state);
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
    const detail = (err.errors ?? []).map((e) => `• ${e.message}`).join('\n');
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

/* ---------- export / import config ---------- */
document.getElementById('btn-export-config').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ccm-config.json';
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
