import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {
  parseTxt, parseCsv, parseImport,
  parseTxtGrid, parseCsvGrid, parseXlsxGrid, parseGrid,
} from '../src/server/file-import.js';

async function xlsxBuffer(rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test('parseTxt tach theo dong', () => {
  assert.deepEqual(parseTxt('0912345678\r\n0913000111\n'), ['0912345678', '0913000111', '']);
});

test('parseCsv lay cot dau tien', () => {
  assert.deepEqual(parseCsv('0912345678,Nguyen A\n0913000111,Tran B'), ['0912345678', '0913000111']);
});

test('parseCsv go dau nhay kep', () => {
  assert.deepEqual(parseCsv('"0912345678",x'), ['0912345678']);
});

test('parseCsv chap nhan dau cham phay va tab', () => {
  assert.deepEqual(parseCsv('0912345678;x\n0913000111\ty'), ['0912345678', '0913000111']);
});

test('parseImport doc file txt', async () => {
  const r = await parseImport({
    filename: 'phones.txt', buffer: Buffer.from('0912345678\n\n0913000111\n'), kind: 'msisdn',
  });
  assert.deepEqual(r.values, ['0912345678', '0913000111']);
});

test('parseImport bo dong header cua file csv', async () => {
  const r = await parseImport({
    filename: 'phones.csv', buffer: Buffer.from('msisdn,ten\n0912345678,A\n0913000111,B'), kind: 'msisdn',
  });
  assert.deepEqual(r.values, ['0912345678', '0913000111']);
});

test('parseImport giu nguyen khi file csv khong co header', async () => {
  const r = await parseImport({
    filename: 'phones.csv', buffer: Buffer.from('0912345678\n0913000111'), kind: 'msisdn',
  });
  assert.deepEqual(r.values, ['0912345678', '0913000111']);
});

test('parseImport loai trung khi dedupe bat', async () => {
  const r = await parseImport({
    filename: 'p.txt', buffer: Buffer.from('0912345678\n0912345678\n0913000111'), kind: 'msisdn', dedupe: true,
  });
  assert.deepEqual(r.values, ['0912345678', '0913000111']);
  assert.equal(r.skipped, 1);
});

test('parseImport giu trung khi dedupe tat', async () => {
  const r = await parseImport({
    filename: 'p.txt', buffer: Buffer.from('0912345678\n0912345678'), kind: 'msisdn', dedupe: false,
  });
  assert.equal(r.values.length, 2);
});

test('parseImport doc cot dau cua file xlsx', async () => {
  const buffer = await xlsxBuffer([['msisdn', 'ten'], ['0912345678', 'A'], ['0913000111', 'B']]);
  const r = await parseImport({ filename: 'p.xlsx', buffer, kind: 'msisdn' });
  assert.deepEqual(r.values, ['0912345678', '0913000111']);
});

test('parseImport doc duoc danh sach path', async () => {
  const r = await parseImport({
    filename: 'paths.txt',
    buffer: Buffer.from('/query/abc-information/:msisdn\n/query/other/:msisdn'),
    kind: 'endpoint',
  });
  assert.equal(r.values.length, 2);
  assert.equal(r.values[0], '/query/abc-information/:msisdn');
});

test('parseImport bao loi voi duoi file la', async () => {
  await assert.rejects(
    () => parseImport({ filename: 'p.pdf', buffer: Buffer.from(''), kind: 'msisdn' }),
    /không hỗ trợ/
  );
});

test('parseCsvGrid giu du moi cot', () => {
  assert.deepEqual(
    parseCsvGrid('name,method,endpoint\nTra cuu,GET,/query/abc/{*}'),
    [['name', 'method', 'endpoint'], ['Tra cuu', 'GET', '/query/abc/{*}']],
  );
});

test('parseCsvGrid go dau nhay kep tung o', () => {
  assert.deepEqual(parseCsvGrid('"Tra cuu","GET"'), [['Tra cuu', 'GET']]);
});

test('parseTxtGrid coi moi dong la mot o', () => {
  assert.deepEqual(parseTxtGrid('/a\n/b'), [['/a'], ['/b']]);
});

async function multiSheetXlsxBuffer(sheetDataMap) {
  const wb = new ExcelJS.Workbook();
  for (const [sheetName, rows] of Object.entries(sheetDataMap)) {
    const ws = wb.addWorksheet(sheetName);
    for (const r of rows) ws.addRow(r);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test('parseXlsxGrid giu du moi cot', async () => {
  const buffer = await xlsxBuffer([['name', 'method', 'endpoint'], ['Tra cuu', 'GET', '/query/abc/{*}']]);
  assert.deepEqual(
    await parseXlsxGrid(buffer),
    [{ name: 'Sheet1', headers: ['name', 'method', 'endpoint'], rows: [['Tra cuu', 'GET', '/query/abc/{*}']] }],
  );
});

test('parseGrid doc tat ca cac sheet trong file xlsx', async () => {
  const buffer = await multiSheetXlsxBuffer({
    Sheet1: [['name', 'method', 'endpoint'], ['Api 1', 'GET', '/a/{*}']],
    Sheet2: [['name', 'method', 'endpoint'], ['Api 2', 'POST', '/b/{*}']],
  });
  const res = await parseGrid({ filename: 'multi.xlsx', buffer });
  assert.equal(res.sheets.length, 2);
  assert.equal(res.sheets[0].name, 'Sheet1');
  assert.deepEqual(res.sheets[0].rows, [['Api 1', 'GET', '/a/{*}']]);
  assert.equal(res.sheets[1].name, 'Sheet2');
  assert.deepEqual(res.sheets[1].rows, [['Api 2', 'POST', '/b/{*}']]);
});

test('parseGrid tach dong dau lam header', async () => {
  const buffer = await xlsxBuffer([['name', 'method', 'endpoint'], ['Tra cuu', 'GET', '/a/{*}'], ['Cap nhat', 'POST', '/b/{*}']]);
  const g = await parseGrid({ filename: 'apis.xlsx', buffer });
  assert.deepEqual(g.headers, ['name', 'method', 'endpoint']);
  assert.equal(g.rows.length, 2);
  assert.deepEqual(g.rows[1], ['Cap nhat', 'POST', '/b/{*}']);
});

test('parseGrid tra ve rong khi file khong co dong nao', async () => {
  const g = await parseGrid({ filename: 'p.txt', buffer: Buffer.from('') });
  assert.deepEqual(g.headers, []);
  assert.deepEqual(g.rows, []);
});

test('parseGrid bao loi voi duoi file la', async () => {
  await assert.rejects(
    () => parseGrid({ filename: 'p.pdf', buffer: Buffer.from('') }),
    /không hỗ trợ/,
  );
});

