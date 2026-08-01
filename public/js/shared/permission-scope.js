import { filterMsisdns, filterEndpoints } from './run-filter.js';
import { matchPermissionEndpoints, endpointColumnsOfSheet } from './permission-match.js';

// CHECK PERM — mot duong duy nhat: DUNG danh sach endpoint ma nut RUN ALL dang
// dem (theo tab sheet + bo loc method dang chon), khu trung METHOD:pathTemplate.
// Endpoint khong ghep duoc dong UC2 nao van chay, cham 'empty'. Xem
// permission-match.js.

// Dung chung ca hai phia: client dung de loc endpoint truoc khi goi
// /api/run, server dung de cham diem statusPermission — phai la mot
// nguon su that duy nhat, khong thi lech nhau o trim/lowercase.
export const normalizeName = (s) => String(s ?? '').trim().toLowerCase();

// Vi tri cot Name cua UC2 trong headers, -1 neu chua cau hinh hoac cot da
// bien mat khoi sheet dang chon cua file phan quyen.
export function permissionNameIndex(permissionFile, uc2) {
  const headers = permissionFile?.headers ?? [];
  const col = uc2?.permissionColumn;
  if (!col) return -1;
  return headers.indexOf(col);
}

// Dong dau tien trong permissionFile.rows co o tai cot Name trung ten
// endpoint (so sanh da normalize).
export function matchPermissionRow(endpointName, permissionFile, uc2) {
  const idx = permissionNameIndex(permissionFile, uc2);
  if (idx === -1) return null;
  const rows = permissionFile?.rows ?? [];
  const target = normalizeName(endpointName);
  return rows.find((row) => normalizeName(row[idx]) === target) ?? null;
}

// Gia tri goc trong file phan quyen (giu nguyen hoa/thuong cua file, khong
// phai cua endpoint) — day la "record name cua usecase 2" hien thi cho nguoi
// dung, khac voi endpointName dung de so khop.
export function matchPermissionName(endpointName, permissionFile, uc2) {
  const idx = permissionNameIndex(permissionFile, uc2);
  if (idx === -1) return null;
  const row = matchPermissionRow(endpointName, permissionFile, uc2);
  if (!row) return null;
  const val = row[idx];
  return val === undefined || val === null ? null : String(val);
}

// Ban DA LUU — bang phan quyen raw, CHECK PERM va RUN ALL deu doc rieng ban
// nay. Doc thang state.permissionMapping la doc ban nhap dang sua do.
export const savedOf = (state) => state?.savedConfig ?? {};
export const savedMappingOf = (state) => savedOf(state).permissionMapping ?? {};
export function savedSheetOf(state) {
  const name = savedOf(state).permissionSheet;
  return (state?.permissionFile?.sheets ?? []).find((s) => s.name === name) ?? null;
}

// Server doc permissionFile.headers/.rows phang (src/server/http-client.js),
// nhung state khong con hai khoa do — lam phang tu sheet DA LUU truoc khi gui.
// Ca RUN ALL lan CHECK PERM deu di qua day, khong thi hai duong cham diem bang
// hai cau hinh khac nhau.
export function savedPermissionPayload(state) {
  const sheet = savedSheetOf(state);
  return {
    permissionFile: {
      filename: state?.permissionFile?.filename ?? '',
      headers: sheet?.headers ?? [],
      rows: sheet?.rows ?? []
    },
    permissionMapping: savedMappingOf(state)
  };
}

// Union ten profile cua MOI dong UC1, khong phai subset theo tung sheet —
// profile chi duoc cap o Sheet 2 van phai chay tren Sheet 1 de roi vao
// nhanh ky vong 403 (xem evaluatePermission trong http-client.js).
export function uc1AuthNames(uc1) {
  return new Set((uc1 ?? []).map((m) => normalizeName(m.authProfileName)).filter(Boolean));
}

// Gom loi thay vi dung o loi dau tien — nguoi dung sua het mot lan thay vi
// bam CHECK PERM nhieu lan de lo dan tung loi.
export function validatePermissionScope(state) {
  const errors = [];
  const permissionFile = state?.permissionFile ?? {};
  const mapping = savedMappingOf(state);
  const uc1 = mapping.usecase1 ?? [];
  const uc2 = mapping.usecase2 ?? {};
  const sheet = savedSheetOf(state);
  const headers = sheet?.headers ?? [];

  if (!permissionFile.filename) {
    errors.push('Chưa nạp file phân quyền');
    return errors;
  }

  if (!sheet) {
    errors.push('Sheet đã lưu không còn trong file phân quyền — chọn sheet khác rồi bấm Lưu');
    return errors;
  }

  if (!uc2.permissionColumn || !headers.includes(uc2.permissionColumn)) {
    errors.push('Chưa chọn cột Name (UC2), hoặc cột đã biến mất khỏi sheet đang chọn');
  }

  if (uc1.length === 0) {
    errors.push('Chưa khai mapping UC1 nào — không biết kiểm sheet nào');
    return errors;
  }

  const endpointSheets = new Set((state?.endpoints ?? []).map((e) => e.sheetName ?? 'Sheet 1'));
  const authNames = new Set((state?.auths ?? []).map((a) => normalizeName(a.name)));

  for (const m of uc1) {
    if (!headers.includes(m.permissionColumn)) {
      errors.push(`UC1: cột "${m.permissionColumn}" không có trong sheet phân quyền đang chọn`);
    }
    // Cot ROLE trung khoa ghep UC2 khong sai kieu du lieu nen moi kiem tra khac
    // deu qua, nhung o do chua TEN chu khong chua 'x' — evaluateUc2Permission
    // roi thang vao nhanh "khong co quyen" cho toan bo endpoint.
    if (m.permissionColumn && m.permissionColumn === uc2.permissionColumn) {
      errors.push(`UC1: cột "${m.permissionColumn}" đang là khoá ghép của UC2 — chọn cột ROLE (ô đánh "x")`);
    }
    if (!endpointSheets.has(m.endpointSheet)) {
      errors.push(`UC1: sheet "${m.endpointSheet}" không còn endpoint nào`);
    }
    if (!authNames.has(normalizeName(m.authProfileName))) {
      errors.push(`UC1: auth profile "${m.authProfileName}" không tồn tại — đã đổi tên?`);
    }
  }

  // Cham diem lay dong UC1 DAU TIEN khop auth (evaluateUc2Permission,
  // http-client.js). Hai dong cung auth khac cot ROLE la cau hinh mo ho — dong
  // thu hai khong bao gio duoc doc, nguoi dung tuong minh dang khai hai luat.
  const roleByAuth = new Map();
  const reported = new Set();
  for (const m of uc1) {
    const key = normalizeName(m.authProfileName);
    if (!key) continue;
    if (!roleByAuth.has(key)) { roleByAuth.set(key, m.permissionColumn); continue; }
    const first = roleByAuth.get(key);
    if (first !== m.permissionColumn && !reported.has(key)) {
      reported.add(key);
      errors.push(
        `UC1: auth "${m.authProfileName}" khai hai cột ROLE khác nhau ("${first}" và `
        + `"${m.permissionColumn}") — chấm điểm chỉ dùng cột đầu tiên`,
      );
    }
  }

  // Bam dung pool sap chay, khong phai sheet khai o UC1 nua.
  const scopedRaw = filterEndpoints(state?.endpoints, state?.runFilter, state?.selectedSheet, '', false);
  if (scopedRaw.some((e) => !e.raw)) {
    errors.push('Endpoints import từ bản cũ — cần import lại file endpoints');
  }

  // columnSheet la ong nhom de chon TEN COT, khong phai pham vi chay — xet tren
  // moi sheet co endpoint, khong theo tab dang chon.
  const allSheets = new Set((state?.endpoints ?? []).map((e) => e.sheetName ?? 'Sheet 1'));
  if (!uc2.columnSheet || !allSheets.has(uc2.columnSheet)) {
    errors.push('Chưa chọn sheet endpoints tham chiếu (UC2)');
  }

  // Cung ham ma panel dung de dung option, khong thi validate qua ma dropdown rong.
  const cols = endpointColumnsOfSheet(state?.endpoints, uc2.columnSheet);
  if (!uc2.endpointColumn || !cols.includes(uc2.endpointColumn)) {
    errors.push('Chưa chọn cột đích (UC2), hoặc cột đã biến mất');
  }

  const { endpoints, auths } = scopedEndpointsAndAuths(state);
  if (endpoints.length === 0) {
    errors.push('Không endpoint nào để chạy — kiểm tra sheet khai ở UC1 và bộ lọc method');
  }
  if (auths.length === 0) {
    errors.push('Không auth profile nào trong UC1 còn tồn tại');
  }

  return errors;
}

// Endpoint mang them permName + permRowIndex tu dong UC2 keo ve no — server
// doc lai hai khoa nay de cham diem O(1), khong sheet-gating (xem
// evaluateUc2Permission trong http-client.js).
function scopedEndpointsAndAuths(state) {
  const mapping = savedMappingOf(state);
  const uc1 = mapping.usecase1 ?? [];
  const authNames = uc1AuthNames(uc1);
  const auths = (state?.auths ?? []).filter((a) => authNames.has(normalizeName(a.name)));

  // permRun di kem tung endpoint (khong phai mot khoa rieng cua config) vi
  // server chi nhin thay request, khong nhin thay state — xem evaluatePermission.
  const endpoints = matchPermissionEndpoints(state).map(({ endpoint, permName, permRowIndex }) => ({
    ...endpoint, permName, permRowIndex, permRun: true,
  }));

  return { endpoints, auths };
}

// Dung xuc phai sinh cho POST /api/run: server khong biet gi ve "che do
// permission", chi nhan mot config da thu hep san — validateConfig,
// buildRequests, runner, worker-pool khong doi dong nao.
export function buildPermissionRunConfig(state) {
  const { endpoints, auths } = scopedEndpointsAndAuths(state);
  // msisdnPatterns khong thuoc gate — doc thang ban dang dung.
  const msisdns = filterMsisdns(state?.msisdns, state?.runFilter).slice(0, 1);

  const config = {
    ...state,
    ...savedPermissionPayload(state),
    endpoints,
    auths,
    msisdns,
    selectedSheet: 'all',
    commonEndpointsEnabled: false,
    runFilter: { methods: [], msisdnPatterns: [], authIds: auths.map((a) => a.id) },
  };

  const perAuth = endpoints.reduce((sum, ep) => sum + (ep.attachMsisdn !== false ? msisdns.length : 1), 0);
  const total = auths.length * perAuth;

  // Dem tu permRowIndex chu khong dem statusPermission === 'empty' trong ket qua:
  // 'empty' con phat sinh khi request loi mang (status === null), tron hai nguyen
  // nhan vao mot con so thi no het chi duoc cho nao can sua.
  const unmatched = endpoints.filter((e) => e.permRowIndex == null).length;

  return { config, endpointCount: endpoints.length, authCount: auths.length, total, unmatched };
}
