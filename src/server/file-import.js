import ExcelJS from 'exceljs';
import { VALIDATORS } from '../../public/js/shared/validators.js';

export function parseTxt(text) {
  return String(text).split(/\r?\n/);
}

export function parseCsv(text) {
  return String(text)
    .split(/\r?\n/)
    .map((line) => (line.split(/[,;\t]/)[0] ?? '').trim().replace(/^"(.*)"$/, '$1'))
    .filter((v) => v !== '');
}

export async function parseXlsx(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const out = [];
  ws.eachRow((row) => {
    const cell = row.getCell(1).value;
    if (cell === null || cell === undefined) { out.push(''); return; }
    if (typeof cell === 'object' && 'text' in cell) { out.push(String(cell.text)); return; }
    if (typeof cell === 'object' && 'result' in cell) { out.push(String(cell.result)); return; }
    out.push(String(cell));
  });
  return out;
}

function stripHeaderRow(values, kind) {
  const validate = VALIDATORS[kind];
  if (!validate || values.length < 2) return values;
  if (!validate(values[0]) && values.slice(1).some(validate)) return values.slice(1);
  return values;
}

export async function parseImport({ filename, buffer, kind, dedupe = true }) {
  const ext = String(filename ?? '').toLowerCase().split('.').pop();

  let raw;
  if (ext === 'txt') raw = parseTxt(buffer.toString('utf8'));
  else if (ext === 'csv') raw = parseCsv(buffer.toString('utf8'));
  else if (ext === 'xlsx' || ext === 'xls') raw = await parseXlsx(buffer);
  else throw new Error(`Đuôi file không hỗ trợ: .${ext}`);

  const trimmed = raw.map((v) => String(v).trim()).filter((v) => v !== '');
  const withoutHeader = stripHeaderRow(trimmed, kind);
  const values = dedupe ? [...new Set(withoutHeader)] : withoutHeader;

  return { values, total: trimmed.length, skipped: trimmed.length - values.length };
}
