import { ALL_COLUMNS, emptyFilter, collectStatuses, collectErrorCodes } from '../shared/filter-logic.js';

const COLUMNS_KEY = 'ccm-tool-columns';

function loadColumns() {
  try {
    const saved = JSON.parse(localStorage.getItem(COLUMNS_KEY) ?? 'null');
    if (Array.isArray(saved) && saved.length > 0) return saved;
  } catch { /* bo qua */ }
  return ALL_COLUMNS.filter((c) => c.default).map((c) => c.key);
}

function fillSelect(select, values, keep) {
  const chosen = new Set(keep);
  select.innerHTML = '';
  for (const v of values) {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    opt.selected = chosen.has(v);
    select.append(opt);
  }
  select.size = Math.min(Math.max(values.length, 1), 5);
}

export function initFilters({ onChange } = {}) {
  const status = document.getElementById('flt-status');
  const error = document.getElementById('flt-error');
  const timeMin = document.getElementById('flt-time-min');
  const timeMax = document.getElementById('flt-time-max');
  const search = document.getElementById('flt-search');
  const columnsBtn = document.getElementById('btn-columns');

  let visibleColumns = loadColumns();
  const filter = emptyFilter();

  const readNumber = (input) => (input.value === '' ? null : Number(input.value));

  function syncFilter() {
    filter.statuses = [...status.selectedOptions].map((o) => o.value);
    filter.errorCodes = [...error.selectedOptions].map((o) => o.value);
    filter.timeMin = readNumber(timeMin);
    filter.timeMax = readNumber(timeMax);
    filter.search = search.value.trim();
    onChange?.();
  }

  for (const el of [status, error, timeMin, timeMax, search]) {
    el.addEventListener('change', syncFilter);
    el.addEventListener('input', syncFilter);
  }

  columnsBtn.addEventListener('click', () => {
    const picked = prompt(
      'Cột hiển thị — liệt kê các key, cách nhau bởi dấu phẩy.\n'
      + `Có thể chọn: ${ALL_COLUMNS.map((c) => c.key).join(', ')}`,
      visibleColumns.join(', '),
    );
    if (picked === null) return;
    const keys = picked.split(',').map((s) => s.trim()).filter((s) => ALL_COLUMNS.some((c) => c.key === s));
    if (keys.length === 0) {
      window.ccmToast?.('Phải chọn ít nhất 1 cột hợp lệ', 'error');
      return;
    }
    visibleColumns = keys;
    localStorage.setItem(COLUMNS_KEY, JSON.stringify(keys));
    onChange?.();
  });

  return {
    getFilter: () => filter,
    getVisibleColumns: () => visibleColumns,
    refreshOptions(records) {
      fillSelect(status, collectStatuses(records), filter.statuses);
      fillSelect(error, collectErrorCodes(records), filter.errorCodes);
    },
  };
}
