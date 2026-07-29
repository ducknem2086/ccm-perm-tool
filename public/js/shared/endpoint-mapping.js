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

export function mapRows(grid, template, { dedupe = true } = {}) {
  const { headers = [], rows = [] } = grid ?? {};
  const { columns, errors: columnErrors } = resolveColumns(headers, template);

  // Cot khong khop thi khong nap dong nao — nap mot nua con kho go hon.
  if (columnErrors.length > 0) {
    return { records: [], errors: columnErrors.map((reason) => ({ row: 1, reason })), skipped: 0 };
  }

  const records = [];
  const errors = [];
  const keys = new Set();
  let skipped = 0;

  rows.forEach((cells, i) => {
    const rowNumber = i + 2;               // +1 vi 0-based, +1 vi dong header
    const at = (key) => String(cells[columns[key]] ?? '').trim();

    if (cells.every((c) => String(c ?? '').trim() === '')) return;

    const method = at('method') === '' ? 'GET' : at('method').toUpperCase();
    if (!METHODS.includes(method)) {
      errors.push({ row: rowNumber, reason: `method "${at('method')}" không hợp lệ` });
      return;
    }

    const raw = at('endpoint');
    if (raw === '') {
      errors.push({ row: rowNumber, reason: 'đường dẫn để trống' });
      return;
    }
    const endpoint = raw.startsWith('/') ? raw : `/${raw}`;

    if (dedupe) {
      const key = `${method} ${endpoint}`;
      if (keys.has(key)) { skipped += 1; return; }
      keys.add(key);
    }

    records.push({ name: at('name'), method, endpoint });
  });

  return { records, errors, skipped };
}
