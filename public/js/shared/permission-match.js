import { normalizeName } from './permission-scope.js';
import { filterEndpoints } from './run-filter.js';

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

// Gia tri khoa ghep cua mot endpoint. Ba tang, KHONG phai ba lan doan:
//   1. dung ten cot da chon o UC2
//   2. cot cung ten sau normalize — lech hoa/thuong hoac khoang trang thua
//   3. e.name, CHI khi sheet do khong he co cot nay
// Can ba tang vi uc2.endpointColumn la MOT ten cot chon tu MOT sheet
// (uc2.columnSheet), con pool CHECK PERM trai moi sheet — cac sheet dat ten cot
// khac nhau (xem endpointColumnsOfSheet ngay tren). O rong trong sheet CO cot
// thi tra rong, khong roi xuong tang 3: do la du lieu thieu, doan bang ten
// endpoint se ghep nham vi hitsForRow bot dan tu dau tu khoa nen rat long.
export function joinValueOf(endpoint, endpointColumn) {
  const raw = endpoint?.raw ?? {};
  const want = normalizeName(endpointColumn);
  if (want === '') return '';

  const hit = Object.entries(raw).find(([k]) => normalizeName(k) === want);
  if (hit) return String(hit[1] ?? '');

  // Cung khoa ma nhanh RUN ALL dung (matchPermissionRow doc req.endpointName),
  // nen hai duong cham diem khong lech nguon.
  return String(endpoint?.name ?? '');
}

// Cung khoa METHOD:pathTemplate nhu dedupeEndpoints, nhung khi hai ban dung do
// thi giu ban CO khoa ghep. dedupeEndpoints giu ban gap dau tien — ban do co the
// la ban de trong o ten, con ban ghep duoc o sheet sau bi vut, ket qua phu thuoc
// thu tu mang. Map giu thu tu chen nen ban gap dau tien van thang khi ca hai
// cung ghep duoc (hoac cung khong).
function dedupePreferJoinable(endpoints, endpointColumn) {
  const best = new Map();
  for (const e of endpoints ?? []) {
    const method = String(e.method ?? 'GET').toUpperCase();
    const path = String(e.pathTemplate ?? e.endpoint ?? '').trim();
    const key = `${method}:${path}`;
    const cur = best.get(key);
    if (!cur) { best.set(key, e); continue; }
    const curHas = normalizeName(joinValueOf(cur, endpointColumn)) !== '';
    const newHas = normalizeName(joinValueOf(e, endpointColumn)) !== '';
    if (!curHas && newHas) best.set(key, e);
  }
  return [...best.values()];
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
//   1. GOM   — DUNG danh sach ma nut RUN ALL dang dem (filterEndpoints, xem request-count.js), nen
//      doi tab sheet hay bo loc method la ca hai nut cung doi. Tab "Tat ca (All)" = quet het. Khong
//      doc checkbox 'enabled', khong doc uc1[].endpointSheet nua. commonEndpointsEnabled: false —
//      ban ghi common go tay khong co raw nen khong dong UC2 nao ghep duoc, chay vao chi cham 'empty'.
//   2. KHU TRUNG — METHOD:pathTemplate, uu tien ban CO khoa ghep. Bat buoc lam TRUOC buoc ghep:
//      ghep truoc roi khu trung thi hai ban cung API co the dinh hai dong UC2 khac nhau, ban nao
//      song sot la ngau nhien theo thu tu mang.
//   3. GHEP  — moi dong UC2 (dung thu tu file) keo ve tap endpoint qua hitsForRow; dong den truoc giu cho.
//   4. TRA VE HET — endpoint khong dong nao voi toi van co mat, permRowIndex: null (cham 'empty').
export function matchPermissionEndpoints(state) {
  const saved = state?.savedConfig ?? {};
  const mapping = saved.permissionMapping ?? {};
  const uc2 = mapping.usecase2 ?? {};
  const sheet = (state?.permissionFile?.sheets ?? []).find((s) => s.name === saved.permissionSheet);
  const headers = sheet?.headers ?? [];
  const rows = sheet?.rows ?? [];
  const endpointColumn = uc2.endpointColumn;

  const filtered = filterEndpoints(
    state?.endpoints, state?.runFilter, state?.selectedSheet, '', false,
  );
  const unique = dedupePreferJoinable(filtered, endpointColumn);

  const srcIdx = uc2.permissionColumn ? headers.indexOf(uc2.permissionColumn) : -1;
  const bare = (e) => ({ endpoint: e, permName: null, permRowIndex: null });
  if (srcIdx === -1 || !endpointColumn) return unique.map(bare);

  const pool = unique
    .map((e) => ({ e, hay: normalizeName(joinValueOf(e, endpointColumn)) }))
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
