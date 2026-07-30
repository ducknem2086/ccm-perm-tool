import { state, persist, notify } from '../state.js';
import { createKvTable } from './kv-table.js';
import { parseRawHeaders } from '../shared/endpoint-path.js';

const TABLES = [
  { hostId: 'tbl-query-params', key: 'globalQueryParams', kind: 'query', keyPlaceholder: 'fromDate', valPlaceholder: '{{fromDate}}' },
  { hostId: 'tbl-headers', key: 'globalHeaders', kind: 'header', keyPlaceholder: 'Content-Type', valPlaceholder: 'application/json' },
  { hostId: 'tbl-body-common', key: 'globalBodyParams', kind: 'body', keyPlaceholder: 'msisdn', valPlaceholder: '{{msisdn}}' },
];

export function initParamTables() {
  const activeTables = TABLES.filter((t) => document.getElementById(t.hostId));
  const tables = new Map(activeTables.map((t) => [t.kind, createKvTable({
    host: document.getElementById(t.hostId),
    getRows: () => state[t.key] ?? [],
    setRows: (rows) => { state[t.key] = rows; persist(); },
    onChange: notify,
    keyPlaceholder: t.keyPlaceholder,
    valPlaceholder: t.valPlaceholder,
  })]));

  for (const btn of document.querySelectorAll('[data-add-param]')) {
    btn.addEventListener('click', () => tables.get(btn.dataset.addParam)?.addRow());
  }

  /* ---------- HEADERS: check if element exists before binding ---------- */
  const modeSelect = document.getElementById('sel-header-mode');
  const rawInput = document.getElementById('inp-header-raw');
  const rawCount = document.getElementById('header-raw-count');
  const headerHost = document.getElementById('tbl-headers');
  const addHeaderBtn = document.querySelector('[data-add-param="header"]');

  function refreshRawCount() {
    if (!rawCount) return;
    const pairs = parseRawHeaders(state.globalHeaderRaw ?? '');
    const names = pairs.map((p) => p.key).join(', ');
    rawCount.textContent = pairs.length === 0
      ? 'Chưa đọc được header nào từ nội dung trên.'
      : `Đọc được ${pairs.length} header: ${names}`;
    rawCount.classList.toggle('status-down', pairs.length === 0 && (state.globalHeaderRaw ?? '').trim() !== '');
  }

  function applyMode() {
    if (!modeSelect || !headerHost || !rawInput || !rawCount) return;
    const raw = (state.globalHeaderMode ?? 'kv') === 'raw';
    modeSelect.value = raw ? 'raw' : 'kv';
    headerHost.hidden = raw;
    if (addHeaderBtn) addHeaderBtn.hidden = raw;
    rawInput.hidden = !raw;
    rawCount.hidden = !raw;
    if (raw) refreshRawCount();
  }

  if (modeSelect && rawInput) {
    modeSelect.addEventListener('change', () => {
      state.globalHeaderMode = modeSelect.value;
      persist();
      notify();
      applyMode();
    });

    rawInput.value = state.globalHeaderRaw ?? '';
    rawInput.addEventListener('input', () => {
      state.globalHeaderRaw = rawInput.value;
      persist();
      notify();
      refreshRawCount();
    });

    applyMode();
  }

  /* ---------- BODY CHUNG: None / Key-value / Chuoi tho ---------- */
  const bodyModeSelect = document.getElementById('sel-body-mode');
  const bodyRawInput = document.getElementById('inp-body-raw');
  const bodyHost = document.getElementById('tbl-body-common');
  const addBodyBtn = document.querySelector('[data-add-param="body"]');

  function applyBodyMode() {
    if (!bodyModeSelect || !bodyHost || !bodyRawInput) return;
    const mode = state.globalBodyMode ?? 'none';
    bodyModeSelect.value = mode;
    bodyHost.hidden = mode !== 'kv';
    if (addBodyBtn) addBodyBtn.hidden = mode !== 'kv';
    bodyRawInput.hidden = mode !== 'raw';
  }

  if (bodyModeSelect && bodyRawInput) {
    bodyModeSelect.addEventListener('change', () => {
      state.globalBodyMode = bodyModeSelect.value;
      persist();
      notify();
      applyBodyMode();
    });

    bodyRawInput.value = state.globalBodyRaw ?? '';
    bodyRawInput.addEventListener('input', () => {
      state.globalBodyRaw = bodyRawInput.value;
      persist();
      notify();
    });

    applyBodyMode();
  }

  return {
    render: () => {
      tables.forEach((t) => t.render());
      if (rawInput) rawInput.value = state.globalHeaderRaw ?? '';
      applyMode();
      if (bodyRawInput) bodyRawInput.value = state.globalBodyRaw ?? '';
      applyBodyMode();
    },
  };
}
