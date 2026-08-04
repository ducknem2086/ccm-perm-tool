import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import {
  maskToken, maskCookie, serializeHeaders, exportFilename, writeResultsToStream, EXPORT_COLUMNS, getExportColumns,
  PERMISSION_EXPORT_COLUMNS,
} from '../src/server/excel-export.js';

const LONG_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdefMWQx';
const LONG_COOKIE = 'JSESSIONID=abcdef123456789; AUTH_SESSION=xyz987654321';

function record(over = {}) {
  return {
    index: 1, endpointId: 'ep_1', endpointName: 'Tra cuu thue bao',
    pathTemplate: '/query/abc/{*}', msisdn: '0912345678', authName: 'Default',
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

test('maskCookie giu 6 ky tu dau va 4 ky tu cuoi', () => {
  assert.equal(maskCookie(LONG_COOKIE), `${LONG_COOKIE.slice(0, 6)}…${LONG_COOKIE.slice(-4)}`);
  assert.ok(!maskCookie(LONG_COOKIE).includes(LONG_COOKIE));
});

test('maskCookie che het khi cookie qua ngan', () => {
  assert.equal(maskCookie('abc=1'), '****');
});

test('serializeHeaders che cookie khi includeToken false, khong phan biet hoa thuong', () => {
  const s = serializeHeaders({ Cookie: LONG_COOKIE, cookie: LONG_COOKIE }, false);
  assert.ok(!s.includes(LONG_COOKIE));
});

test('serializeHeaders giu nguyen cookie khi includeToken true', () => {
  const s = serializeHeaders({ Cookie: LONG_COOKIE }, true);
  assert.ok(s.includes(LONG_COOKIE));
});

test('serializeHeaders che ca refresh_token, id_token, access_token', () => {
  const secret = 'eyJhbGciOiJSUzI1NiJ9.payload-rat-dai-o-day.chu-ky';
  const s = serializeHeaders({
    refresh_token: secret, id_token: secret, access_token: secret, Accept: 'application/json',
  }, false);
  assert.ok(!s.includes(secret), 'khong duoc lo credential nao');
  assert.match(s, /Accept: application\/json/, 'header thuong van giu nguyen');
});

test('serializeHeaders khong che header thuong', () => {
  const s = serializeHeaders({ 'User-Agent': 'Mozilla/5.0 abcdefghijklmnop', Origin: 'http://localhost:9000' }, false);
  assert.match(s, /User-Agent: Mozilla\/5\.0 abcdefghijklmnop/);
  assert.match(s, /Origin: http:\/\/localhost:9000/);
});

test('exportFilename dung dinh dang co dau thoi gian', () => {
  const name = exportFilename(new Date('2026-07-29T10:15:30Z'));
  assert.match(name, /^ccm-result-\d{8}-\d{6}\.xlsx$/);
});

test('EXPORT_COLUMNS du 16 cot theo spec, co them cot Auth ngay sau MSISDN', () => {
  assert.deepEqual(EXPORT_COLUMNS.map((c) => c.header), [
    'Index', 'Name', 'Path', 'MSISDN', 'Auth', 'Method', 'URL', 'Headers', 'Query Params',
    'Status Code', 'Error Code', 'Duration (ms)', 'Response Body', 'Response Headers', 'Error Message', 'Started At',
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
    assert.equal(ws.getRow(3).getCell(11).value, 'E0042');
    const headersCell = String(ws.getRow(2).getCell(8).value);
    assert.ok(!headersCell.includes(LONG_TOKEN), 'token phai bi che');
    assert.equal(ws.getRow(2).getCell(2).value, 'Tra cuu thue bao');
    assert.equal(ws.getRow(2).getCell(3).value, '/query/abc/{*}');
    assert.equal(ws.getRow(2).getCell(5).value, 'Default');
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
    const cell = String(wb.getWorksheet('Results').getRow(2).getCell(8).value);
    assert.ok(cell.includes(LONG_TOKEN));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('cot Response Body ghi JSON pretty tu object da parse', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccm-'));
  const file = join(dir, 'out.xlsx');
  try {
    const rec = record({
      response: {
        status: 200, statusText: 'OK', headers: { 'content-type': 'application/json' },
        body: { errorCode: '0', data: { msisdn: '0912345678' } },
        bodyText: '{"errorCode":"0","data":{"msisdn":"0912345678"}}', sizeBytes: 48,
      },
    });
    await writeResultsToStream(createWriteStream(file), [rec], { includeToken: false });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const cell = wb.getWorksheet('Results').getRow(2).getCell(13);
    assert.equal(String(cell.value), JSON.stringify(rec.response.body, null, 2));
    assert.equal(cell.alignment?.wrapText, true, 'cot JSON phai wrap text');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('cot Response Body giu chuoi tho khi response khong phai JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccm-'));
  const file = join(dir, 'out.xlsx');
  try {
    const html = '<!DOCTYPE html>\n<html><body>login</body></html>';
    await writeResultsToStream(createWriteStream(file), [record({
      response: {
        status: 200, statusText: 'OK', headers: { 'content-type': 'text/html' },
        body: null, bodyText: html, sizeBytes: html.length,
      },
    })], { includeToken: false });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    assert.equal(String(wb.getWorksheet('Results').getRow(2).getCell(13).value), html);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('token cua profile A khong ro sang dong cua profile B', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccm-'));
  const file = join(dir, 'out.xlsx');
  const TOKEN_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaTOKENA';
  const TOKEN_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbTOKENB';
  try {
    const recA = record({
      index: 1, authName: 'PROD-A',
      request: { ...record().request, headers: { Authorization: `Bearer ${TOKEN_A}` } },
    });
    const recB = record({
      index: 2, authName: 'UAT-B',
      request: { ...record().request, headers: { Authorization: `Bearer ${TOKEN_B}` } },
    });

    for (const includeToken of [false, true]) {
      await writeResultsToStream(createWriteStream(file), [recA, recB], { includeToken });
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(file);
      const ws = wb.getWorksheet('Results');
      const rowAHeaders = String(ws.getRow(2).getCell(8).value);
      const rowBHeaders = String(ws.getRow(3).getCell(8).value);

      assert.ok(!rowAHeaders.includes(TOKEN_B), 'dong A khong duoc chua token B');
      assert.ok(!rowBHeaders.includes(TOKEN_A), 'dong B khong duoc chua token A');
      if (!includeToken) {
        assert.ok(!rowAHeaders.includes(TOKEN_A), 'che thi token A cung phai bi che');
        assert.ok(!rowBHeaders.includes(TOKEN_B), 'che thi token B cung phai bi che');
      } else {
        assert.ok(rowAHeaders.includes(TOKEN_A));
        assert.ok(rowBHeaders.includes(TOKEN_B));
      }
      assert.equal(ws.getRow(2).getCell(5).value, 'PROD-A');
      assert.equal(ws.getRow(3).getCell(5).value, 'UAT-B');
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('EXPORT_COLUMNS giu cot MSISDN va them cot Response Headers', () => {
  const keys = EXPORT_COLUMNS.map((c) => c.key);
  assert.ok(keys.includes('msisdn'), 'van phai co cot msisdn');
  assert.ok(keys.includes('responseHeaders'), 'phai co cot responseHeaders');
  assert.equal(keys.indexOf('responseHeaders'), keys.indexOf('bodyText') + 1);
});

test('getExportColumns thay cot durationMs bang statusPermission khi hasPermission true', () => {
  const colsNormal = getExportColumns(false);
  assert.equal(colsNormal[11].header, 'Duration (ms)');
  assert.equal(colsNormal[11].key, 'durationMs');

  const colsPerm = getExportColumns(true);
  assert.equal(colsPerm[11].header, 'Status Permission');
  assert.equal(colsPerm[11].key, 'statusPermission');
});

test('writeResultsToStream thay duration bang statusPermission va to mau khi hasPermission true', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccm-'));
  const file = join(dir, 'out.xlsx');
  try {
    const records = [
      record({ index: 1, statusPermission: 'true' }),
      record({ index: 2, statusPermission: 'false' }),
      record({ index: 3, statusPermission: 'empty' }),
    ];
    await writeResultsToStream(createWriteStream(file), records, { includeToken: false, hasPermission: true });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.getWorksheet('Results');

    assert.equal(ws.getRow(1).getCell(12).value, 'Status Permission');
    assert.equal(ws.getRow(2).getCell(12).value, 'true');
    assert.equal(ws.getRow(2).getCell(12).font?.color?.argb, 'FF0ECB81');
    assert.equal(ws.getRow(3).getCell(12).value, 'false');
    assert.equal(ws.getRow(3).getCell(12).font?.color?.argb, 'FFF6465D');
    assert.equal(ws.getRow(4).getCell(12).value, 'empty');
    assert.equal(ws.getRow(4).getCell(12).font?.color?.argb, undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('PERMISSION_EXPORT_COLUMNS co dung 9 header theo dung thu tu, khop bang UI', () => {
  assert.deepEqual(PERMISSION_EXPORT_COLUMNS.map((c) => c.header), [
    'Status', 'Status Check Perm', 'Status Perm', 'Auth', 'Endpoint', 'Role',
    'Endpoint Name', 'UC2 Name', 'Function Name',
  ]);
});

test('layout permission dung dung 9 cot, gop method vao o status, to mau statusPermission', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccm-'));
  const file = join(dir, 'out.xlsx');
  try {
    const records = [
      record({
        index: 1, statusPermission: 'true', sheetName: 'Sheet 1',
        endpointName: 'Tra cuu thue bao', permissionMatchedName: 'Tra cuu TB',
        oracleFunction: 'FN_TRA_CUU',
        oracle: { status: 200, request: { method: 'POST' } },
      }),
      record({
        index: 2, statusPermission: 'false', sheetName: 'Sheet 2',
        endpointName: 'Doi SIM 4G', permissionMatchedName: 'Doi SIM',
        oracleFunction: 'FN_DOI_SIM',
        oracle: { status: 403, request: { method: 'POST' } },
        response: { status: 403, statusText: 'Forbidden', headers: {}, body: null, bodyText: '{"error":"forbidden"}', sizeBytes: 20 },
      }),
      record({
        index: 3, statusPermission: 'empty', sheetName: 'Sheet 3',
        endpointName: 'Khong khai FUNCTION', permissionMatchedName: '',
        oracleFunction: null, oracle: null,
      }),
    ];
    await writeResultsToStream(createWriteStream(file), records, { layout: 'permission' });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.getWorksheet('Results');

    assert.deepEqual(
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map((c) => ws.getRow(1).getCell(c).value),
      ['Status', 'Status Check Perm', 'Status Perm', 'Auth', 'Endpoint', 'Role', 'Endpoint Name', 'UC2 Name', 'Function Name'],
    );

    assert.equal(ws.getRow(2).getCell(1).value, 'GET · 200');
    assert.equal(ws.getRow(2).getCell(1).font?.color?.argb, 'FF0ECB81');
    assert.equal(ws.getRow(2).getCell(2).value, 'POST · 200');
    assert.equal(ws.getRow(2).getCell(2).font?.color?.argb, 'FF0ECB81');
    assert.equal(ws.getRow(2).getCell(3).value, 'true');
    assert.equal(ws.getRow(2).getCell(3).font?.color?.argb, 'FF0ECB81');
    assert.equal(ws.getRow(2).getCell(4).value, 'Default');
    assert.equal(ws.getRow(2).getCell(5).value, '/query/abc/{*}');
    assert.equal(ws.getRow(2).getCell(6).value, 'Sheet 1');
    assert.equal(ws.getRow(2).getCell(7).value, 'Tra cuu thue bao');
    assert.equal(ws.getRow(2).getCell(8).value, 'Tra cuu TB');
    assert.equal(ws.getRow(2).getCell(9).value, 'FN_TRA_CUU');

    assert.equal(ws.getRow(3).getCell(1).value, 'GET · 403');
    assert.equal(ws.getRow(3).getCell(1).font?.color?.argb, 'FFF6465D');
    assert.equal(ws.getRow(3).getCell(2).value, 'POST · 403');
    assert.equal(ws.getRow(3).getCell(2).font?.color?.argb, 'FFF6465D');
    assert.equal(ws.getRow(3).getCell(3).value, 'false');
    assert.equal(ws.getRow(3).getCell(3).font?.color?.argb, 'FFF6465D');
    assert.equal(ws.getRow(3).getCell(6).value, 'Sheet 2');
    assert.equal(ws.getRow(3).getCell(7).value, 'Doi SIM 4G');
    assert.equal(ws.getRow(3).getCell(8).value, 'Doi SIM');
    assert.equal(ws.getRow(3).getCell(9).value, 'FN_DOI_SIM');

    // Khong co oracle (khong khai FUNCTION) — o Status Check Perm ra '—' tron,
    // khong to mau; UC2 Name/Function Name rong ra '—'.
    assert.equal(ws.getRow(4).getCell(2).value, '—');
    assert.equal(ws.getRow(4).getCell(2).font?.color?.argb, undefined);
    assert.equal(ws.getRow(4).getCell(3).value, 'empty');
    assert.equal(ws.getRow(4).getCell(8).value, '—');
    assert.equal(ws.getRow(4).getCell(9).value, '—');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('layout mac dinh khong doi so voi hanh vi hien tai', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccm-'));
  const file = join(dir, 'out.xlsx');
  try {
    await writeResultsToStream(createWriteStream(file), [record()], { includeToken: false });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.getWorksheet('Results');

    assert.equal(ws.getRow(1).getCell(1).value, 'Index');
    assert.equal(ws.getRow(1).getCell(12).value, 'Duration (ms)');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});


