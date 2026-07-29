import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import {
  maskToken, serializeHeaders, exportFilename, writeResultsToStream, EXPORT_COLUMNS
} from '../src/server/excel-export.js';

const LONG_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdefMWQx';

function record(over = {}) {
  return {
    index: 1, endpointId: 'ep_1', endpointName: '/query/abc/:msisdn', msisdn: '0912345678',
    request: {
      method: 'GET', url: 'https://abc.vn/query/abc/0912345678?fromDate=25032026',
      headers: { Authorization: `Bearer ${LONG_TOKEN}`, Accept: 'application/json' },
      pathParams: { msisdn: '0912345678' }, queryParams: { fromDate: '25032026' }, body: null,
    },
    response: { status: 200, statusText: 'OK', headers: {}, body: { ok: true }, bodyText: '{"ok":true}', sizeBytes: 11 },
    errorCode: null, errorMessage: null, durationMs: 412,
    startedAt: '2026-07-29T03:12:44.001Z', finishedAt: '2026-07-29T03:12:44.413Z',
    ...over,
  };
}

test('maskToken giu 6 ky tu dau va 4 ky tu cuoi', () => {
  const masked = maskToken(`Bearer ${LONG_TOKEN}`);
  assert.equal(masked, `Bearer ${LONG_TOKEN.slice(0, 6)}…${LONG_TOKEN.slice(-4)}`);
  assert.ok(!masked.includes(LONG_TOKEN));
});

test('maskToken che het khi token qua ngan', () => {
  assert.equal(maskToken('Bearer abc'), 'Bearer ****');
});

test('maskToken bo qua header khong phai Bearer', () => {
  assert.equal(maskToken('Basic dXNlcjpwYXNz'), 'Basic dXNlcjpwYXNz');
});

test('serializeHeaders che token khi includeToken false', () => {
  const s = serializeHeaders({ Authorization: `Bearer ${LONG_TOKEN}`, Accept: 'application/json' }, false);
  assert.ok(!s.includes(LONG_TOKEN));
  assert.match(s, /Accept: application\/json/);
});

test('serializeHeaders giu nguyen token khi includeToken true', () => {
  const s = serializeHeaders({ Authorization: `Bearer ${LONG_TOKEN}` }, true);
  assert.ok(s.includes(LONG_TOKEN));
});

test('exportFilename dung dinh dang co dau thoi gian', () => {
  const name = exportFilename(new Date('2026-07-29T10:15:30Z'));
  assert.match(name, /^ccm-result-\d{8}-\d{6}\.xlsx$/);
});

test('EXPORT_COLUMNS du 13 cot theo spec', () => {
  assert.deepEqual(EXPORT_COLUMNS.map((c) => c.header), [
    'Index', 'Endpoint', 'MSISDN', 'Method', 'URL', 'Headers', 'Query Params',
    'Status Code', 'Error Code', 'Duration (ms)', 'Response Body', 'Error Message', 'Started At',
  ]);
});

test('writeResultsToStream tao file xlsx doc lai duoc', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccm-'));
  const file = join(dir, 'out.xlsx');
  try {
    const records = [record(), record({ index: 2, errorCode: 'E0042', response: { ...record().response, status: 500 } })];
    await writeResultsToStream(createWriteStream(file), records, { includeToken: false });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.getWorksheet('Results');
    assert.ok(ws, 'phai co sheet ten Results');
    assert.equal(ws.rowCount, 3, 'header + 2 dong du lieu');
    assert.equal(ws.getRow(1).getCell(1).value, 'Index');
    assert.equal(ws.getRow(2).getCell(1).value, 1);
    assert.equal(ws.getRow(3).getCell(9).value, 'E0042');
    const headersCell = String(ws.getRow(2).getCell(6).value);
    assert.ok(!headersCell.includes(LONG_TOKEN), 'token phai bi che');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('writeResultsToStream giu token khi includeToken true', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccm-'));
  const file = join(dir, 'out.xlsx');
  try {
    await writeResultsToStream(createWriteStream(file), [record()], { includeToken: true });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const cell = String(wb.getWorksheet('Results').getRow(2).getCell(6).value);
    assert.ok(cell.includes(LONG_TOKEN));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
