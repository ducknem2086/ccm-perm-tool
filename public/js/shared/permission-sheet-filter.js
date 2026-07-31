// Loc thuan cho bang phan quyen RAW (khac permission-filter-logic.js — do loc
// ket qua CHECK PERM). Cot role lay tu UC1 mappings, quy uoc 'x' phai khop
// dung evaluateUc2Permission ben server (src/server/http-client.js) — mot
// nguon su that duy nhat cho "co quyen".

// {index,name} cua tung cot role, thu tu header, khu trung khi hai mapping
// UC1 cung tro ve mot cot.
export function roleColumns(headers, uc1) {
  const seen = new Map();
  for (const m of uc1 ?? []) {
    const idx = (headers ?? []).indexOf(m.permissionColumn);
    if (idx === -1 || seen.has(idx)) continue;
    seen.set(idx, headers[idx]);
  }
  return [...seen.entries()].sort((a, b) => a[0] - b[0]).map(([index, name]) => ({ index, name }));
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
  return { granted: true, denied: true };
}

export function applySheetFilter(rows, roleIdxs, filter) {
  return rows
    .map((row, index) => ({ row, index, granted: rowHasPermission(row, roleIdxs) }))
    .filter((r) => (r.granted ? filter.granted : filter.denied));
}
