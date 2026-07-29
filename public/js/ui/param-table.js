import { state, persist, notify } from '../state.js';

const TABLES = [
  { hostId: 'tbl-query-params', key: 'globalQueryParams', kind: 'query', keyPlaceholder: 'fromDate', valPlaceholder: '{{fromDate}}' },
  { hostId: 'tbl-headers', key: 'globalHeaders', kind: 'header', keyPlaceholder: 'Content-Type', valPlaceholder: 'application/json' },
];

function renderTable({ hostId, key, keyPlaceholder, valPlaceholder }) {
  const host = document.getElementById(hostId);
  host.innerHTML = '';
  const rows = state[key] ?? [];

  rows.forEach((pair, index) => {
    const row = document.createElement('div');
    row.className = 'pt-row';

    const enabled = document.createElement('input');
    enabled.type = 'checkbox';
    enabled.checked = pair.enabled !== false;
    enabled.title = 'Bật/tắt param này';
    enabled.addEventListener('change', () => {
      state[key][index] = { ...pair, enabled: enabled.checked };
      persist(); notify();
    });

    const keyInput = document.createElement('input');
    keyInput.className = 'input pt-key';
    keyInput.type = 'text';
    keyInput.spellcheck = false;
    keyInput.placeholder = keyPlaceholder;
    keyInput.value = pair.key ?? '';
    keyInput.addEventListener('input', () => {
      state[key][index] = { ...state[key][index], key: keyInput.value };
      persist(); notify();
    });

    const valInput = document.createElement('input');
    valInput.className = 'input pt-val mono';
    valInput.type = 'text';
    valInput.spellcheck = false;
    valInput.placeholder = valPlaceholder;
    valInput.value = pair.value ?? '';
    valInput.addEventListener('input', () => {
      state[key][index] = { ...state[key][index], value: valInput.value };
      persist(); notify();
    });

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'el-del';
    del.textContent = '✕';
    del.title = 'Xóa dòng';
    del.addEventListener('click', () => {
      state[key].splice(index, 1);
      persist(); notify(); render();
    });

    row.append(enabled, keyInput, valInput, del);
    host.append(row);
  });

  if (rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'el-empty';
    empty.textContent = 'Chưa có dòng nào.';
    host.append(empty);
  }
}

function render() {
  for (const t of TABLES) renderTable(t);
}

export function initParamTables() {
  for (const btn of document.querySelectorAll('[data-add-param]')) {
    btn.addEventListener('click', () => {
      const kind = btn.dataset.addParam;
      const table = TABLES.find((t) => t.kind === kind);
      state[table.key] = [...(state[table.key] ?? []), { key: '', value: '', enabled: true }];
      persist(); notify(); render();
    });
  }
  render();
  return { render };
}
