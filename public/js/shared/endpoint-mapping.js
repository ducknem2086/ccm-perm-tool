import { dedupeEndpoints } from './endpoint-dedupe.js';

export const TARGETS = ['name', 'method', 'endpoint'];
export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

// Nhieu rule cung target = alias cua cung mot du lieu, chi khac nhan cot giua
// cac sheet (vd "Name" / "Name *"). Thu tu template la do uu tien: alias dau
// tien dinh vi duoc cot thi thang, dung nhom. Mot alias khong khop KHONG loi —
// chi ca nhom khong alias nao khop moi bao (chan cho endpoint, canh bao cho
// cac truong con lai) — xem 2026-08-05-endpoint-mapping-alias-groups-design.md.
export function resolveColumns(headers, template, sheetName) {
  const list = Array.isArray(headers) ? headers : [];
  const columns = {};
  const errors = [];
  const warnings = [];
  const prefix = sheetName ? `Sheet "${sheetName}" — ` : '';

  const groups = new Map();
  for (const rule of template ?? []) {
    const selector = String(rule?.selector ?? '').trim();
    if (selector === '') continue;
    if (!TARGETS.includes(rule?.target)) continue;
    if (!groups.has(rule.target)) groups.set(rule.target, []);
    groups.get(rule.target).push(rule);
  }

  for (const [target, rules] of groups) {
    let matched = false;
    const tried = [];

    for (const rule of rules) {
      const selector = String(rule.selector).trim();

      if (rule.type === 'index') {
        const n = Number(selector);
        if (Number.isInteger(n) && n >= 1 && n <= list.length) {
          columns[target] = n - 1;
          matched = true;
          break;
        }
        tried.push(`cột số ${selector}`);
        continue;
      }

      const at = list.findIndex((h) => norm(h) === norm(selector));
      if (at !== -1) {
        columns[target] = at;
        matched = true;
        break;
      }
      tried.push(`"${selector}"`);
    }

    if (matched) continue;

    if (target === 'endpoint') {
      errors.push(`${prefix}không tìm thấy cột nào cho trường endpoint. Đã thử: ${tried.join(', ')}. Header trong file: ${list.join(' | ')}`);
    } else {
      warnings.push(`${prefix}không tìm thấy cột nào cho trường ${target}. Đã thử: ${tried.join(', ')}. Trường này để trống.`);
    }
  }

  if (!groups.has('endpoint')) {
    errors.push(`${prefix}Template thiếu dòng cho trường endpoint — không dựng được request nào.`);
  }

  return { columns, errors, warnings };
}

// Giu lai toan bo cot goc cua file endpoints duoi dang { header: value }, bo o
// rong va header rong — UC2 can chon cot bat ky lam cot dich/cot khu trung
// (permission-match.js), khong chi ba truong name/method/endpoint.
function rawOf(cells, headers) {
  const out = {};
  headers.forEach((h, i) => {
    const header = String(h ?? '').trim();
    const value = String(cells[i] ?? '').trim();
    if (header === '' || value === '') return;
    out[header] = value;
  });
  return out;
}

function mapSingleSheetRows(sheet, template, sheetName) {
  const { headers = [], rows = [] } = sheet ?? {};
  const { columns, errors: columnErrors, warnings } = resolveColumns(headers, template, sheetName);

  if (columnErrors.length > 0) {
    return { records: [], errors: columnErrors.map((reason) => ({ row: 1, reason })) };
  }

  const records = [];
  const errors = warnings.map((reason) => ({ row: 1, reason }));

  rows.forEach((cells, i) => {
    const rowNumber = i + 2;               // +1 vi 0-based, +1 vi dong header
    const at = (key) => String(cells[columns[key]] ?? '').trim();

    if (cells.every((c) => String(c ?? '').trim() === '')) return;

    // Cot method sai/la (vi du dinh vao nham cot trang thai kieu Co/Khong) TRUOC
    // DAY lam mat nguyen dong khoi bang endpoint — sai muc dich: dong van co
    // duong dan hop le, chi mac method la khong doan duoc. Gio giu dong lai,
    // mac dinh GET, chi canh bao — hien het la yeu cau, khong phai tuy chon.
    const rawMethod = at('method');
    let method = rawMethod === '' ? 'GET' : rawMethod.toUpperCase();
    if (!METHODS.includes(method)) {
      errors.push({ row: rowNumber, reason: `method "${rawMethod}" không hợp lệ — đã mặc định GET` });
      method = 'GET';
    }

    const raw = at('endpoint');
    if (raw === '') {
      errors.push({ row: rowNumber, reason: 'đường dẫn để trống' });
      return;
    }
    const endpoint = raw.startsWith('/') ? raw : `/${raw}`;

    records.push({ name: at('name'), method, endpoint, raw: rawOf(cells, headers) });
  });

  return { records, errors };
}

export function mapRows(gridResult, template, options = {}) {
  const sheets = Array.isArray(gridResult?.sheets) && gridResult.sheets.length > 0
    ? gridResult.sheets
    : [{ name: 'Sheet 1', headers: gridResult?.headers ?? [], rows: gridResult?.rows ?? [] }];

  let allRecords = [];
  const allErrors = [];
  let totalSkipped = 0;

  for (const sheet of sheets) {
    const sheetName = sheet.name ?? 'Sheet 1';
    const { records, errors } = mapSingleSheetRows(sheet, template, sheetName);
    for (const r of records) {
      r.sheetName = sheetName;
    }
    allRecords.push(...records);
    allErrors.push(...errors);
  }

  if (options.dedupe === true) {
    const { unique, skipped } = dedupeEndpoints(allRecords);
    allRecords = unique;
    totalSkipped += skipped;
  }

  return { records: allRecords, errors: allErrors, skipped: totalSkipped };
}
