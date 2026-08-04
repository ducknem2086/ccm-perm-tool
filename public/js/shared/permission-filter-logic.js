// Cap voi filter-logic.js cua bang OUTPUT nhung cho 7 cot rieng cua bang
// CHECK PERMISSION. Moi dieu kien ket hop AND; o/select trong nghia la
// khong loc theo cot do.

export function emptyPermFilter() {
  return {
    status: '', permStatus: '', perm: '', auth: '', endpoint: '', role: '', epName: '', permName: '', body: '',
    checkNames: null,
  };
}

const statusLabel = (rec) => (rec.response.status === null ? 'N/A' : String(rec.response.status));
// rec.oracle null nghia la endpoint khong khai FUNCTION (UC3) nen khong goi
// checkPermission — cham chung voi status === null vao 'N/A' de nguoi loc
// khong phai phan biet hai nguyen nhan.
const permStatusLabel = (rec) => (rec.oracle?.status == null ? 'N/A' : String(rec.oracle.status));
const contains = (hay, needle) => String(hay ?? '').toLowerCase().includes(needle.toLowerCase());
const normalize = (s) => String(s ?? '').trim().toLowerCase();

export function matchPermRecord(rec, filter) {
  if (filter.status && statusLabel(rec) !== filter.status) return false;
  if (filter.permStatus && permStatusLabel(rec) !== filter.permStatus) return false;
  if (filter.perm && String(rec.statusPermission ?? '') !== filter.perm) return false;
  if (filter.auth && (rec.authName ?? '') !== filter.auth) return false;
  if (filter.role && (rec.sheetName ?? '') !== filter.role) return false;
  if (filter.endpoint && !contains(rec.pathTemplate, filter.endpoint)) return false;
  if (filter.epName && !contains(rec.endpointName, filter.epName)) return false;
  if (filter.permName && !contains(rec.permissionMatchedName, filter.permName)) return false;
  if (filter.body && !contains(rec.response?.bodyText, filter.body)) return false;
  // Nut Check (main.js): loc theo tap bename dang hien o bang HAS PERMISSIONS.
  // permissionMatchedName la ban sao chinh xac cua bename da khop luc dung
  // config chay (xem permission-match.js) nen so khop CHINH XAC sau normalize,
  // khong can contains fuzzy.
  if (filter.checkNames && !filter.checkNames.has(normalize(rec.permissionMatchedName))) return false;
  return true;
}

export function applyPermFilter(records, filter) {
  return records.filter((r) => matchPermRecord(r, filter)).sort((a, b) => a.index - b.index);
}

function sortStatusLabels(labels) {
  return [...new Set(labels)].sort((a, b) => {
    if (a === 'N/A') return 1;
    if (b === 'N/A') return -1;
    return Number(a) - Number(b);
  });
}

export function collectPermStatuses(records) {
  return sortStatusLabels(records.map(statusLabel));
}

export function collectPermCheckStatuses(records) {
  return sortStatusLabels(records.map(permStatusLabel));
}

export function collectPermAuths(records) {
  return [...new Set(records.map((r) => r.authName).filter(Boolean))].sort();
}

export function collectPermRoles(records) {
  return [...new Set(records.map((r) => r.sheetName).filter(Boolean))].sort();
}
