import { state, persist, notify } from '../state.js';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

function ensureFilter() {
  if (!state.runFilter) state.runFilter = { methods: [], msisdnPatterns: [], authIds: [] };
  return state.runFilter;
}

// Dung chung cho run-filter (chay endpoint nao) — dat canh o tim endpoint
// theo ten de loc nhanh danh sach dang xem truoc khi RUN ALL.
export function createMethodFilterGroup() {
  const box = document.createElement('div');
  box.className = 'el-method-filter';

  function render() {
    box.replaceChildren();
    const filter = ensureFilter();
    const selected = state.selectedSheet ?? 'all';
    const enabled = (state.endpoints ?? []).filter(
      (e) => e.enabled && (selected === 'all' || (e.sheetName ?? 'Sheet 1') === selected)
    );

    for (const m of METHODS) {
      const count = enabled.filter((e) => String(e.method || 'GET').toUpperCase() === m).length;
      const wrap = document.createElement('label');
      wrap.className = 'rf-method';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.dataset.method = m;
      cb.checked = (filter.methods ?? []).includes(m);
      cb.addEventListener('click', () => {
        const list = filter.methods ?? [];
        filter.methods = list.includes(m) ? list.filter((x) => x !== m) : [...list, m];
        persist();
        notify();
      });

      wrap.append(cb, document.createTextNode(`${m} (${count})`));
      box.append(wrap);
    }
  }

  render();
  return { el: box, render };
}
