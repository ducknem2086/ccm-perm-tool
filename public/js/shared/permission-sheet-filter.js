// Loc thuan cho bang phan quyen RAW (khac permission-filter-logic.js — do loc
// ket qua CHECK PERM). Cot role suy tu usecase1[].permissionColumn — cung
// nguon UC1 quyet dinh pool CHECK PERM (xem permission-match.js). Quy uoc 'x'
// phai khop dung evaluateUc2Permission ben server (src/server/http-client.js).

// {index,name}[] — moi cot duoc khai o UC1, khu trung, giu thu tu header.
export function roleColumns(headers, uc1) {
  const seen = new Set();
  const out = [];
  for (const m of uc1 ?? []) {
    const index = (headers ?? []).indexOf(m.permissionColumn);
    if (index === -1 || seen.has(index)) continue;
    seen.add(index);
    out.push({ index, name: headers[index] });
  }
  return out;
}

export function roleColumnIndexes(headers, uc1) {
  return roleColumns(headers, uc1).map((c) => c.index);
}

// Cot dinh danh dong (permissionColumn cua UC2) — luon hien trong bang raw,
// khong nam trong bo loc cot role.
export function identifierColumnIndex(headers, uc2) {
  return (headers ?? []).indexOf(uc2?.permissionColumn ?? '');
}

export function rowHasPermission(row, roleIdxs) {
  return roleIdxs.some((i) => String(row[i] ?? '').trim().toLowerCase() === 'x');
}

export function emptySheetFilter() {
  return { granted: true, denied: true, search: '' };
}

// idIdx: cot dinh danh (cot dau tien hien thi) — search CHI loc tren cot nay,
// khong dung cho cot role. Bo qua khi idIdx = -1 (chua chon cot dinh danh).
export function applySheetFilter(rows, roleIdxs, filter, idIdx = -1) {
  const search = String(filter.search ?? '').trim().toLowerCase();
  return rows
    .map((row, index) => ({ row, index, granted: rowHasPermission(row, roleIdxs) }))
    .filter((r) => (r.granted ? filter.granted : filter.denied))
    .filter((r) => (!search || idIdx === -1
      ? true
      : String(r.row[idIdx] ?? '').toLowerCase().includes(search)));
}

// Gia tri cot dinh danh (bename) cua cac dong dang hien theo filter YES/NO —
// nguon cho nut Check o main.js. Bo dong rong, khu trung.
export function visibleIdentifierValues(headers, rows, uc1, uc2, sheetFilter) {
  const idIdx = identifierColumnIndex(headers, uc2);
  if (idIdx === -1) return [];
  const roleIdxs = roleColumnIndexes(headers, uc1);
  const visible = applySheetFilter(rows, roleIdxs, sheetFilter, idIdx);
  const names = new Set();
  for (const v of visible) {
    const val = String(v.row[idIdx] ?? '').trim();
    if (val) names.add(val);
  }
  return [...names];
}
