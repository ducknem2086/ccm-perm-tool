import {
  emptyPermFilter, collectPermStatuses, collectPermCheckStatuses, collectPermAuths, collectPermRoles,
} from '../shared/permission-filter-logic.js';

const ANY = '';
const PERM_VALUES = ['true', 'false', 'empty'];

function makeSelect(title) {
  const select = document.createElement('select');
  select.className = 'input input-sm';
  select.title = title;
  return select;
}

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

function makeSearch(placeholder, title) {
  const input = document.createElement('input');
  input.className = 'input input-sm';
  input.type = 'search';
  input.placeholder = placeholder;
  input.title = title;
  return input;
}

const normalize = (s) => String(s ?? '').trim().toLowerCase();

export function initPermissionFilters({ onChange } = {}) {
  const filter = emptyPermFilter();

  const statusSelect = makeSelect('Lọc theo status code');
  // Cung khuon voi statusSelect (cot 'Status') nhung doc rec.oracle?.status —
  // status THO cua checkPermission, khong phai cot 'Status Perm' da cham diem.
  const permStatusSelect = makeSelect('Lọc theo status code của checkPermission');
  const permSelect = makeSelect('Lọc theo status permission');
  const authSelect = makeSelect('Lọc theo auth profile');
  const roleSelect = makeSelect('Lọc theo role (sheet)');
  const endpointInput = makeSearch('gõ tìm', 'Lọc theo endpoint');
  const epNameInput = makeSearch('gõ tìm', 'Lọc theo tên endpoint');
  const permNameInput = makeSearch('gõ tìm', 'Lọc theo UC2 name');
  const bodyInput = makeSearch('gõ tìm', 'Lọc theo response body');

  fillSelect(statusSelect, [], '(tất cả)');
  fillSelect(permStatusSelect, [], '(tất cả)');
  fillSelect(permSelect, PERM_VALUES, '(tất cả)');
  fillSelect(authSelect, [], '(tất cả)');
  fillSelect(roleSelect, [], '(tất cả)');

  function syncFilter() {
    filter.status = statusSelect.value;
    filter.permStatus = permStatusSelect.value;
    filter.perm = permSelect.value;
    filter.auth = authSelect.value;
    filter.role = roleSelect.value;
    filter.endpoint = endpointInput.value.trim();
    filter.epName = epNameInput.value.trim();
    filter.permName = permNameInput.value.trim();
    filter.body = bodyInput.value.trim();
    onChange?.();
  }

  const inputs = [
    statusSelect, permStatusSelect, permSelect, authSelect, roleSelect,
    endpointInput, epNameInput, permNameInput, bodyInput,
  ];
  for (const el of inputs) {
    el.addEventListener('change', syncFilter);
    el.addEventListener('input', syncFilter);
  }

  return {
    getFilter: () => filter,
    filterCell(key) {
      switch (key) {
        case 'status': return statusSelect;
        case 'permStatus': return permStatusSelect;
        case 'perm': return permSelect;
        case 'auth': return authSelect;
        case 'role': return roleSelect;
        case 'endpoint': return endpointInput;
        case 'epName': return epNameInput;
        case 'permName': return permNameInput;
        case 'body': return bodyInput;
        default: return null;
      }
    },
    refreshOptions(records) {
      fillSelect(statusSelect, collectPermStatuses(records), '(tất cả)');
      fillSelect(permStatusSelect, collectPermCheckStatuses(records), '(tất cả)');
      fillSelect(authSelect, collectPermAuths(records), '(tất cả)');
      fillSelect(roleSelect, collectPermRoles(records), '(tất cả)');
    },
    // Nut Check (main.js) — loc theo tap bename dang hien o bang HAS
    // PERMISSIONS, doc lap voi cac o loc thu cong o tren.
    applyCheckNames(names) {
      filter.checkNames = new Set(names.map(normalize));
      onChange?.();
    },
    clearCheckNames() {
      filter.checkNames = null;
      onChange?.();
    },
    hasCheckNames: () => filter.checkNames !== null,
  };
}
