const DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export const DATE_FORMATS = ['ddMMyyyy', 'dd/MM/yyyy', 'yyyy-MM-dd'];

export function parseDate(str) {
  const m = DATE_RE.exec(String(str ?? '').trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  const valid =
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day;
  return valid ? d : null;
}

export function splitRangeInput(str) {
  const parts = String(str ?? '').split('-');
  if (parts.length !== 2) {
    return { ok: false, error: 'Định dạng phải là dd/mm/yyyy-dd/mm/yyyy' };
  }
  return { ok: true, from: parts[0].trim(), to: parts[1].trim() };
}

export function validateRange(fromStr, toStr) {
  const from = parseDate(fromStr);
  if (!from) return { ok: false, error: 'Ngày bắt đầu không hợp lệ' };
  const to = parseDate(toStr);
  if (!to) return { ok: false, error: 'Ngày kết thúc không hợp lệ' };
  if (from.getTime() > to.getTime()) {
    return { ok: false, error: 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc' };
  }
  return { ok: true, from, to };
}

const pad2 = (n) => String(n).padStart(2, '0');

export function formatDate(date, format) {
  const dd = pad2(date.getUTCDate());
  const MM = pad2(date.getUTCMonth() + 1);
  const yyyy = String(date.getUTCFullYear());
  switch (format) {
    case 'ddMMyyyy': return `${dd}${MM}${yyyy}`;
    case 'dd/MM/yyyy': return `${dd}/${MM}/${yyyy}`;
    case 'yyyy-MM-dd': return `${yyyy}-${MM}-${dd}`;
    default: throw new Error(`Định dạng ngày không hỗ trợ: ${format}`);
  }
}
