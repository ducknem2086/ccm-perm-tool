import { applyPermFilter } from '../shared/permission-filter-logic.js';
import { PERM_COLUMNS, permCellText } from '../shared/permission-columns.js';

// Action la nut xem chi tiet — chi ton tai tren bang, khong xuat Excel nen
// khong nam trong PERM_COLUMNS (nguon dung chung voi excel-export.js).
const COLUMNS = [{ key: 'action', header: 'Action' }, ...PERM_COLUMNS];

export function initPermissionTable({ getRecords, getFilter, filterCell, onRowClick }) {
  const table = document.getElementById('perm-table');

  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');
  table.replaceChildren(thead, tbody);

  let rows = [];
  let headBuilt = false;

  function paintHead() {
    if (headBuilt) return;
    headBuilt = true;

    const headRow = document.createElement('tr');
    const filterRow = document.createElement('tr');
    filterRow.className = 'filter-row';

    for (const col of COLUMNS) {
      const th = document.createElement('th');
      th.textContent = col.header;
      headRow.append(th);

      const ftd = document.createElement('th');
      ftd.className = 'filter-cell';
      const node = filterCell?.(col.key);
      if (node) ftd.append(node);
      filterRow.append(ftd);
    }

    thead.replaceChildren(headRow, filterRow);
  }

  function detailButton(rec) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-icon';
    btn.textContent = '👁';
    btn.title = 'Xem chi tiết';
    btn.addEventListener('click', () => onRowClick?.(rec));
    return btn;
  }

  function buildRow(rec) {
    const tr = document.createElement('tr');
    tr.dataset.index = String(rec.index);
    for (const col of COLUMNS) {
      const td = document.createElement('td');
      if (col.key === 'action') {
        td.className = 'cell-actions';
        td.append(detailButton(rec));
        tr.append(td);
        continue;
      }
      td.textContent = permCellText(rec, col.key);
      td.title = permCellText(rec, col.key);
      if (col.key === 'perm') {
        td.classList.toggle('status-up', rec.statusPermission === 'true');
        td.classList.toggle('status-down', rec.statusPermission === 'false');
      }
      if (col.key === 'status') {
        const ok = rec.response.status !== null && rec.response.status < 400;
        td.classList.add(ok ? 'status-up' : 'status-down');
      }
      if (col.key === 'permStatus' && rec.oracle?.status != null) {
        td.classList.add(rec.oracle.status < 400 ? 'status-up' : 'status-down');
      }
      tr.append(td);
    }
    return tr;
  }

  function paint() {
    paintHead();

    const body = [];
    if (rows.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = COLUMNS.length;
      td.className = 'el-empty';
      td.textContent = 'Chưa có kết quả nào khớp bộ lọc.';
      tr.append(td);
      body.push(tr);
    } else {
      for (const rec of rows) body.push(buildRow(rec));
    }

    tbody.replaceChildren(...body);
  }

  return {
    render() {
      rows = applyPermFilter(getRecords(), getFilter());
      paint();
    },
    getVisibleIndexes() {
      return rows.map((r) => r.index);
    },
  };
}
