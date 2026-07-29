import ExcelJS from 'exceljs';
import { bodyPretty } from '../../public/js/shared/response-body.js';

// Cot nhieu dong (JSON pretty, headers moi cai mot dong) can wrapText, khong thi
// Excel don het ve mot dong dai.
const MULTILINE = { alignment: { wrapText: true, vertical: 'top' } };

export const EXPORT_COLUMNS = [
  { header: 'Index', key: 'index', width: 8 },
  { header: 'Name', key: 'name', width: 30 },
  { header: 'Path', key: 'path', width: 45 },
  { header: 'MSISDN', key: 'msisdn', width: 16 },
  { header: 'Method', key: 'method', width: 10 },
  { header: 'URL', key: 'url', width: 70 },
  { header: 'Headers', key: 'headers', width: 45, style: MULTILINE },
  { header: 'Query Params', key: 'queryParams', width: 35, style: MULTILINE },
  { header: 'Status Code', key: 'status', width: 12 },
  { header: 'Error Code', key: 'errorCode', width: 16 },
  { header: 'Duration (ms)', key: 'durationMs', width: 14 },
  { header: 'Response Body', key: 'bodyText', width: 80, style: MULTILINE },
  { header: 'Response Headers', key: 'responseHeaders', width: 45, style: MULTILINE },
  { header: 'Error Message', key: 'errorMessage', width: 40 },
  { header: 'Started At', key: 'startedAt', width: 26 },
];

const COLOR_UP = 'FF0ECB81';
const COLOR_DOWN = 'FFF6465D';
const COLOR_SURFACE = 'FF1E2329';
const COLOR_BODY = 'FFEAECEF';

export function maskToken(headerValue) {
  const m = /^Bearer\s+(.+)$/i.exec(String(headerValue ?? ''));
  if (!m) return String(headerValue ?? '');
  const token = m[1];
  if (token.length <= 10) return 'Bearer ****';
  return `Bearer ${token.slice(0, 6)}…${token.slice(-4)}`;
}

export function serializeHeaders(headers, includeToken) {
  return Object.entries(headers ?? {})
    .map(([k, v]) => {
      const isAuth = k.toLowerCase() === 'authorization';
      return `${k}: ${isAuth && !includeToken ? maskToken(v) : v}`;
    })
    .join('\n');
}

const pad2 = (n) => String(n).padStart(2, '0');

export function exportFilename(now = new Date()) {
  const s = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`
    + `-${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
  return `ccm-result-${s}.xlsx`;
}

function toRow(rec, includeToken) {
  return {
    index: rec.index,
    name: rec.endpointName ?? '',
    path: rec.pathTemplate ?? '',
    msisdn: rec.msisdn ?? '',
    method: rec.request.method,
    url: rec.request.url,
    headers: serializeHeaders(rec.request.headers, includeToken),
    queryParams: Object.entries(rec.request.queryParams ?? {}).map(([k, v]) => `${k}=${v}`).join('\n'),
    status: rec.response.status ?? '',
    errorCode: rec.errorCode ?? '',
    durationMs: rec.durationMs,
    bodyText: bodyPretty(rec),
    responseHeaders: serializeHeaders(rec.response.headers, true),
    errorMessage: rec.errorMessage ?? '',
    startedAt: rec.startedAt,
  };
}

export async function writeResultsToStream(stream, records, { includeToken = false } = {}) {
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useStyles: true });
  const ws = wb.addWorksheet('Results', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  ws.columns = EXPORT_COLUMNS;
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: EXPORT_COLUMNS.length } };

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: COLOR_BODY } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_SURFACE } };
  header.commit();

  for (const rec of records) {
    const row = ws.addRow(toRow(rec, includeToken));
    const status = rec.response.status;
    const isOk = status !== null && status < 400;
    row.getCell('status').font = { color: { argb: isOk ? COLOR_UP : COLOR_DOWN }, bold: true };
    if (!isOk) row.getCell('errorCode').font = { color: { argb: COLOR_DOWN } };
    row.commit();
  }

  await ws.commit();
  await wb.commit();
}
