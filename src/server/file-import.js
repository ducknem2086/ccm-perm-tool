import ExcelJS from 'exceljs';
import { VALIDATORS } from '../../public/js/shared/validators.js';

const unquote = (s) => String(s ?? '').trim().replace(/^"(.*)"$/, '$1');

export function parseTxtGrid(text) {
  return String(text).split(/\r?\n/).map((line) => [line.trim()]);
}

export function parseCsvGrid(text) {
  return String(text)
    .split(/\r?\n/)
    .map((line) => line.split(/[,;\t]/).map(unquote));
}

function cellToString(cell) {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'object' && 'text' in cell) return String(cell.text);
  if (typeof cell === 'object' && 'result' in cell) return String(cell.result);
  return String(cell);
}

export async function parseXlsxGrid(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const out = [];
  ws.eachRow((row) => {
    const cells = [];
    // row.cellCount bo qua o trong o cuoi dong, nhung du de doc het cac cot co du lieu.
    for (let i = 1; i <= row.cellCount; i += 1) cells.push(cellToString(row.getCell(i).value).trim());
    out.push(cells);
  });
  return out;
}

export async function parseGrid({ filename, buffer }) {
  const ext = String(filename ?? '').toLowerCase().split('.').pop();

  let grid;
  if (ext === 'txt') grid = parseTxtGrid(buffer.toString('utf8'));
  else if (ext === 'csv') grid = parseCsvGrid(buffer.toString('utf8'));
  else if (ext === 'xlsx' || ext === 'xls') grid = await parseXlsxGrid(buffer);
  else throw new Error(`Đuôi file không hỗ trợ: .${ext}`);

  const nonEmpty = grid.filter((row) => row.some((c) => c !== ''));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };
  return { headers: nonEmpty[0], rows: nonEmpty.slice(1) };
}

export function parseTxt(text) {
  return String(text).split(/\r?\n/);
}

export function parseCsv(text) {
  return parseCsvGrid(text).map((row) => row[0] ?? '').filter((v) => v !== '');
}

export async function parseXlsx(buffer) {
  return (await parseXlsxGrid(buffer)).map((row) => row[0] ?? '');
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

