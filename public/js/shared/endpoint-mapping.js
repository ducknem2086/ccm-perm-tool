import { dedupeEndpoints } from './endpoint-dedupe.js';

export const TARGETS = ['name', 'method', 'endpoint'];
export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export function resolveColumns(headers, template) {
  const list = Array.isArray(headers) ? headers : [];
  const columns = {};
  const errors = [];
  const seen = new Set();

  for (const rule of template ?? []) {
    const selector = String(rule?.selector ?? '').trim();
    if (selector === '') continue;
    if (!TARGETS.includes(rule?.target)) continue;

    seen.add(rule.target);

    if (rule.type === 'index') {
      const n = Number(selector);
      if (!Number.isInteger(n) || n < 1 || n > list.length) {
        errors.push(`Cột số ${selector} không tồn tại — file chỉ có ${list.length} cột.`);
        continue;
      }
      columns[rule.target] = n - 1;
      continue;
    }

    const at = list.findIndex((h) => norm(h) === norm(selector));
    if (at === -1) {
      errors.push(`Không tìm thấy cột "${selector}". Header trong file: ${list.join(' | ')}`);
      continue;
    }
    columns[rule.target] = at;
  }

  if (!seen.has('endpoint')) {
    errors.push('Template thiếu dòng cho trường endpoint — không dựng được request nào.');
  }

  return { columns, errors };
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

function mapSingleSheetRows(sheet, template) {
  const { headers = [], rows = [] } = sheet ?? {};
  const { columns, errors: columnErrors } = resolveColumns(headers, template);

  if (columnErrors.length > 0) {
    return { records: [], errors: columnErrors.map((reason) => ({ row: 1, reason })) };
  }

  const records = [];
  const errors = [];

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
    const { records, errors } = mapSingleSheetRows(sheet, template);
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
