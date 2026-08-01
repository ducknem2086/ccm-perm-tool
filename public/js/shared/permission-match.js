import { dedupeEndpoints } from './endpoint-dedupe.js';
import { normalizeName, uc1Sheets } from './permission-scope.js';

// Danh sach cot dich cho UC2 chon: union raw-header cua moi endpoint thuoc
// sheet duoc khai trong UC1, giu thu tu gap lan dau. Sheet nao thieu cot dang
// chon thi endpoint cua sheet do don gian la khong match, khong vo.
export function endpointColumns(endpoints, uc1) {
  const sheets = uc1Sheets(uc1);
  const seen = new Set();
  const out = [];
  for (const e of endpoints ?? []) {
    if (!sheets.has(e.sheetName ?? 'Sheet 1')) continue;
    for (const h of Object.keys(e.raw ?? {})) {
      if (!seen.has(h)) { seen.add(h); out.push(h); }
    }
  }
  return out;
}

// Cot cua RIENG mot sheet — nguon option cho UC2 chon cot dich sau khi da
// chon "sheet tham chieu". Khac endpointColumns o cho khong union nhieu
// sheet, tranh chon nham cot dung ten nhung khac y nghia giua 2 sheet.
export function endpointColumnsOfSheet(endpoints, sheetName) {
  if (!sheetName) return [];
  const seen = new Set();
  const out = [];
  for (const e of endpoints ?? []) {
    if ((e.sheetName ?? 'Sheet 1') !== sheetName) continue;
    for (const h of Object.keys(e.raw ?? {})) {
      if (!seen.has(h)) { seen.add(h); out.push(h); }
    }
  }
  return out;
}

// Mot vong quet cua thuat toan include: bot tu DAU tu khoa, toi da 4 vong,
// dung o vong dau tien co ket qua. Chieu khop la gia tri cot dich cua endpoint
// CHUA ten o file phan quyen — khong phai nguoc lai, va khong phai bang nhau:
// file phan quyen ghi "Tra cuu thong tin thue bao" phai bat duoc endpoint
// "API Tra cuu thong tin thue bao VIP" ngay o vong 0.
//
// Vong 0 long hon exact nen thu tu dong trong file phan quyen co trong luong
// hon: dong ten ngan nam tren co the om mat endpoint ma dong dai hon ben duoi
// khop sat hon (xem 'taken' o matchPermissionEndpoints — dong den truoc giu cho).
function hitsForRow(rowText, pool) {
  const words = normalizeName(rowText).split(' ').filter(Boolean);

  for (let k = 0; k < 4 && k < words.length; k += 1) {
    const needle = words.slice(k).join(' ');
    const hits = pool.filter((it) => it.hay.includes(needle));
    if (hits.length > 0) return hits;
  }
  return [];
}

// Pool + ghep cua CHECK PERM — duong duy nhat.
//   1. GOM   — MOI endpoint thuoc sheet khai o UC1, qua bo loc method topbar. Khong doc checkbox
//      'enabled' (khong con thu hep pham vi chay o bat ky duong nao).
//   2. KHU TRUNG — METHOD:pathTemplate, ban gap dau tien thang. Bat buoc lam TRUOC buoc ghep:
//      ghep truoc roi khu trung thi hai ban cung API co the dinh hai dong UC2 khac nhau, ban nao
//      song sot la ngau nhien theo thu tu mang.
//   3. GHEP  — moi dong UC2 (dung thu tu file) keo ve tap endpoint qua hitsForRow; dong den truoc giu cho.
//   4. TRA VE HET — endpoint khong dong nao voi toi van co mat, permRowIndex: null (cham 'empty').
export function matchPermissionEndpoints(state) {
  const saved = state?.savedConfig ?? {};
  const mapping = saved.permissionMapping ?? {};
  const uc1 = mapping.usecase1 ?? [];
  const uc2 = mapping.usecase2 ?? {};
  const sheet = (state?.permissionFile?.sheets ?? []).find((s) => s.name === saved.permissionSheet);
  const headers = sheet?.headers ?? [];
  const rows = sheet?.rows ?? [];

  const sheets = uc1Sheets(uc1);
  const wantedMethods = new Set((saved.methods ?? []).map((m) => String(m).toUpperCase()));
  const filtered = (state?.endpoints ?? []).filter((e) => {
    if (!sheets.has(e.sheetName ?? 'Sheet 1')) return false;
    if (wantedMethods.size > 0 && !wantedMethods.has(String(e.method || 'GET').toUpperCase())) return false;
    return true;
  });

  const unique = dedupeEndpoints(filtered).unique;

  const srcIdx = uc2.permissionColumn ? headers.indexOf(uc2.permissionColumn) : -1;
  const endpointColumn = uc2.endpointColumn;
  const bare = (e) => ({ endpoint: e, permName: null, permRowIndex: null });
  if (srcIdx === -1 || !endpointColumn) return unique.map(bare);

  const pool = unique
    .map((e) => ({ e, hay: normalizeName(e.raw?.[endpointColumn]) }))
    .filter((it) => it.hay !== '');

  const taken = new Map(); // khoa = ban than endpoint
  rows.forEach((row, rowIndex) => {
    for (const h of hitsForRow(row[srcIdx], pool)) {
      if (!taken.has(h.e)) {
        taken.set(h.e, { permName: String(row[srcIdx] ?? ''), permRowIndex: rowIndex });
      }
    }
  });

  return unique.map((e) => (taken.has(e) ? { endpoint: e, ...taken.get(e) } : bare(e)));
}
