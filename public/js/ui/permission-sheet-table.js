import { identifierColumnIndex, applySheetFilter } from '../shared/permission-sheet-filter.js';

export function initPermissionSheetTable({
  getSheet, getRoleColumns, getUc2, getFilter,
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
      const allRoleCols = getRoleColumns();
      const idIdx = identifierColumnIndex(headers, getUc2());

      // Khu trung theo INDEX: cot dinh danh UC2 va cot role hoan toan co the
      // tro cung mot cot cua file — khong khu thi header lap hai lan.
      displayCols = [];
      const usedIdx = new Set();
      if (idIdx !== -1) {
        displayCols.push({ index: idIdx, name: headers[idIdx] });
        usedIdx.add(idIdx);
      }
      for (const col of allRoleCols) {
        if (!usedIdx.has(col.index)) {
          displayCols.push(col);
          usedIdx.add(col.index);
        }
      }

      paintHead();

      if (!sheet.filename) {
        tbody.replaceChildren(emptyRow('Chưa nạp file phân quyền — vào tab INPUT → PHÂN QUYỀN để import.'));
        return { shown: 0, total: 0 };
      }

      // Sheet da luu bien mat (import file phan quyen khac) — bao dung nguyen
      // nhan. Khong co nhanh nay thi roi xuong thong bao "khong co cot nao dang
      // khai" ben duoi, nguoi dung di sua mapping trong khi loi nam o sheet.
      if (sheet.missing) {
        tbody.replaceChildren(emptyRow(
          'Sheet đã lưu không còn trong file phân quyền — chọn sheet khác rồi bấm Lưu.',
        ));
        return { shown: 0, total: 0 };
      }

      // Doi sheet khong con ghi de cot dang khai (permissions-panel.js), nen
      // sheet khong chua cot nao da khai la trang thai hop le. Khong noi ro thi
      // bang render ra n dong chi co cot '#' — trong nhu loi.
      if (displayCols.length === 0) {
        tbody.replaceChildren(emptyRow(
          'Sheet này không có cột nào đang khai ở UC1/UC2 — chọn sheet khác hoặc sửa mapping ở tab INPUT.',
        ));
        return { shown: 0, total: rows.length };
      }

      const roleIdxSet = new Set(allRoleCols.map((c) => c.index));
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
