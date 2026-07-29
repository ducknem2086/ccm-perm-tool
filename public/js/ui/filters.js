import { ALL_COLUMNS, emptyFilter, collectStatuses, collectErrorCodes } from '../shared/filter-logic.js';

const COLUMNS_KEY = 'ccm-tool-columns';
const ANY = '';

function loadColumns() {
  const fallback = ALL_COLUMNS.filter((c) => c.default).map((c) => c.key);
  try {
    const saved = JSON.parse(localStorage.getItem(COLUMNS_KEY) ?? 'null');
    if (Array.isArray(saved)) {
      // Nguoi dung cu co the con luu key da bi bo (msisdn, response, errorCode...).
      const valid = saved.filter((k) => ALL_COLUMNS.some((c) => c.key === k));
      if (valid.length > 0) return valid;
    }
  } catch { /* bo qua */ }
  return fallback;
}

function makeSelect(title) {
  const select = document.createElement('select');
  select.className = 'input input-sm';
  select.title = title;
  return select;
}

// Giu lai lua chon hien tai neu no van con trong danh sach moi.
function fillSelect(select, values, emptyLabel) {
  const current = select.value;
  select.replaceChildren();

  const any = document.createElement('option');
  any.value = ANY;
  any.textContent = emptyLabel;
  select.append(any);

  for (const v of values) {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    select.append(opt);
  }

  select.value = values.includes(current) ? current : ANY;
}

export function initFilters({ onChange } = {}) {
  const msisdnInput = document.getElementById('flt-msisdn');
  const columnsBtn = document.getElementById('btn-columns');

  let visibleColumns = loadColumns();
  const filter = emptyFilter();

  const nameInput = document.createElement('input');
  nameInput.className = 'input input-sm';
  nameInput.type = 'search';
  nameInput.placeholder = 'gõ tìm';
  nameInput.title = 'Lọc theo tên endpoint';

  const statusSelect = makeSelect('Lọc theo status code');
  const errorSelect = makeSelect('Lọc theo error code');
  fillSelect(statusSelect, [], '(tất cả)');
  fillSelect(errorSelect, [], '(tất cả)');

  const statusPair = document.createElement('div');
  statusPair.className = 'filter-pair';
  statusPair.append(statusSelect, errorSelect);

  function syncFilter() {
    filter.msisdn = msisdnInput.value.trim();
    filter.name = nameInput.value.trim();
    filter.status = statusSelect.value;
    filter.errorCode = errorSelect.value;
    onChange?.();
  }

  for (const el of [msisdnInput, nameInput, statusSelect, errorSelect]) {
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
    filterCell(key) {
      if (key === 'name') return nameInput;
      if (key === 'status') return statusPair;
      return null;
    },
    refreshOptions(records) {
      fillSelect(statusSelect, collectStatuses(records), '(tất cả)');
      fillSelect(errorSelect, collectErrorCodes(records), '(tất cả)');
    },
  };
}
