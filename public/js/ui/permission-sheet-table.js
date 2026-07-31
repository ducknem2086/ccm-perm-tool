import {
  roleColumns, roleColumnIndexes, identifierColumnIndex, applySheetFilter,
} from '../shared/permission-sheet-filter.js';

export function initPermissionSheetTable({
  getSheet, getUc1, getUc2, getFilter, getSelectedColumns,
}) {
  const table = document.getElementById('perm-sheet-table');

  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');
  table.replaceChildren(thead, tbody);

  let displayCols = [];
  let headKey = null;

  function paintHead() {
    const key = displayCols.map((c) => `${c.index}:${c.name}`).join('|');
    if (key === headKey) return;
    headKey = key;

    const headRow = document.createElement('tr');
    const numTh = document.createElement('th');
    numTh.textContent = '#';
    headRow.append(numTh);
    for (const col of displayCols) {
      const th = document.createElement('th');
      th.textContent = col.name;
      headRow.append(th);
    }
    thead.replaceChildren(headRow);
  }

  function buildRow(row, index, roleIdxSet) {
    const tr = document.createElement('tr');

    const numTd = document.createElement('td');
    numTd.textContent = String(index + 2);
    tr.append(numTd);

    for (const col of displayCols) {
      const td = document.createElement('td');
      const text = row[col.index] ?? '';
      td.textContent = text;
      td.title = text;
      if (roleIdxSet.has(col.index) && String(text).trim().toLowerCase() === 'x') {
        td.classList.add('status-up');
      }
      tr.append(td);
    }

    return tr;
  }

  function emptyRow(text) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = displayCols.length + 1;
    td.className = 'el-empty';
    td.textContent = text;
    tr.append(td);
    return tr;
  }

  return {
    render() {
      const sheet = getSheet() ?? {};
      const headers = sheet.headers ?? [];
      const rows = sheet.rows ?? [];
      const uc1 = getUc1();
      const allRoleCols = roleColumns(headers, uc1);
      const selected = getSelectedColumns();
      const idIdx = identifierColumnIndex(headers, getUc2());

      displayCols = [];
      if (idIdx !== -1) displayCols.push({ index: idIdx, name: headers[idIdx] });
      for (const col of allRoleCols) {
        if (selected.has(col.name)) displayCols.push(col);
      }

      paintHead();

      if (!sheet.filename) {
        tbody.replaceChildren(emptyRow('Chưa nạp file phân quyền — vào tab INPUT → PHÂN QUYỀN để import.'));
        return { shown: 0, total: 0 };
      }

      const roleIdxSet = new Set(roleColumnIndexes(headers, uc1));
      const visible = applySheetFilter(rows, [...roleIdxSet], getFilter());

      if (visible.length === 0) {
        tbody.replaceChildren(emptyRow('Chưa có dòng nào khớp bộ lọc.'));
      } else {
        tbody.replaceChildren(...visible.map((v) => buildRow(v.row, v.index, roleIdxSet)));
      }

      return { shown: visible.length, total: rows.length };
    },
  };
}
