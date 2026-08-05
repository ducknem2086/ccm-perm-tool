import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TARGETS, METHODS, resolveColumns, mapRows } from '../public/js/shared/endpoint-mapping.js';

const HEADERS = ['Tên API', 'HTTP Method', 'Đường dẫn'];

function tpl(over = []) {
  return over.length > 0 ? over : [
    { id: 't1', type: 'name', selector: 'Tên API', target: 'name' },
    { id: 't2', type: 'name', selector: 'HTTP Method', target: 'method' },
    { id: 't3', type: 'name', selector: 'Đường dẫn', target: 'endpoint' },
  ];
}

const grid = (rows, headers = HEADERS) => ({ headers, rows });

test('TARGETS va METHODS dung danh sach da chot', () => {
  assert.deepEqual(TARGETS, ['name', 'method', 'endpoint']);
  assert.deepEqual(METHODS, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
});

test('resolveColumns khop cot theo ten', () => {
  const r = resolveColumns(HEADERS, tpl());
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.columns, { name: 0, method: 1, endpoint: 2 });
});

test('resolveColumns bo qua hoa thuong va khoang trang thua', () => {
  const r = resolveColumns(['  tên   api  ', 'HTTP METHOD', 'đường dẫn'], tpl());
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.columns, { name: 0, method: 1, endpoint: 2 });
});

test('resolveColumns khop cot theo index 1-based', () => {
  const r = resolveColumns(HEADERS, [
    { id: 't1', type: 'index', selector: '3', target: 'endpoint' },
  ]);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.columns, { endpoint: 2 });
});

test('resolveColumns bao loi khi index ngoai khoang', () => {
  const r = resolveColumns(HEADERS, [
    { id: 't1', type: 'index', selector: '9', target: 'endpoint' },
  ]);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /9/);
});

test('resolveColumns bao loi kem danh sach header khi khong tim thay ten cot', () => {
  const r = resolveColumns(HEADERS, [
    { id: 't1', type: 'name', selector: 'Verb', target: 'endpoint' },
  ]);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /Verb/);
  assert.match(r.errors[0], /Tên API \| HTTP Method \| Đường dẫn/);
});

test('resolveColumns bao loi khi template thieu dong endpoint', () => {
  const r = resolveColumns(HEADERS, [
    { id: 't1', type: 'name', selector: 'Tên API', target: 'name' },
  ]);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /endpoint/);
});

test('resolveColumns bo qua dong template co selector rong', () => {
  const r = resolveColumns(HEADERS, [
    { id: 't1', type: 'name', selector: '   ', target: 'name' },
    { id: 't2', type: 'name', selector: 'Đường dẫn', target: 'endpoint' },
  ]);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.columns, { endpoint: 2 });
});

test('mapRows doc dung ba truong', () => {
  const r = mapRows(grid([['Tra cứu TB', 'GET', '/query/abc/{*}']]), tpl());
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.records, [{
    name: 'Tra cứu TB', method: 'GET', endpoint: '/query/abc/{*}', sheetName: 'Sheet 1',
    raw: { 'Tên API': 'Tra cứu TB', 'HTTP Method': 'GET', 'Đường dẫn': '/query/abc/{*}' },
  }]);
});

test('mapRows giu raw cells cua toan bo header goc', () => {
  const r = mapRows(grid([['A', 'GET', '/a/{*}', 'Ghi chu B']], ['Tên API', 'HTTP Method', 'Đường dẫn', 'Mo ta']), tpl());
  assert.deepEqual(r.records[0].raw, {
    'Tên API': 'A', 'HTTP Method': 'GET', 'Đường dẫn': '/a/{*}', 'Mo ta': 'Ghi chu B',
  });
});

test('mapRows bo o rong va header rong khoi raw', () => {
  const r = mapRows(grid([['A', 'GET', '/a/{*}', '']], ['Tên API', 'HTTP Method', 'Đường dẫn', '']), tpl());
  assert.deepEqual(r.records[0].raw, { 'Tên API': 'A', 'HTTP Method': 'GET', 'Đường dẫn': '/a/{*}' });
});

test('mapRows viet hoa method va mac dinh GET khi o rong', () => {
  const r = mapRows(grid([['A', 'post', '/a/{*}'], ['B', '', '/b/{*}']]), tpl());
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.records.map((x) => x.method), ['POST', 'GET']);
});

test('mapRows KHONG bo dong khi method khong hop le — van hien endpoint, mac dinh GET va chi canh bao', () => {
  const r = mapRows(grid([['A', 'FETCH', '/a/{*}'], ['B', 'GET', '/b/{*}']]), tpl());
  assert.equal(r.records.length, 2);
  assert.deepEqual(r.records.map((x) => x.endpoint), ['/a/{*}', '/b/{*}']);
  assert.deepEqual(r.records.map((x) => x.method), ['GET', 'GET']);
  assert.deepEqual(r.errors, [{ row: 2, reason: 'method "FETCH" không hợp lệ — đã mặc định GET' }]);
});

test('mapRows tu them dau gach cheo khi path thieu', () => {
  const r = mapRows(grid([['A', 'GET', 'query/abc/{*}']]), tpl());
  assert.equal(r.records[0].endpoint, '/query/abc/{*}');
});

test('mapRows bo dong co path rong', () => {
  const r = mapRows(grid([['A', 'GET', '  ']]), tpl());
  assert.deepEqual(r.records, []);
  assert.deepEqual(r.errors, [{ row: 2, reason: 'đường dẫn để trống' }]);
});

test('mapRows bo qua dong rong hoan toan ma khong bao loi', () => {
  const r = mapRows(grid([['', '', ''], ['A', 'GET', '/a/{*}']]), tpl());
  assert.equal(r.records.length, 1);
  assert.deepEqual(r.errors, []);
});

test('mapRows giu ca hai khi cung path khac method', () => {
  const r = mapRows(grid([['A', 'GET', '/a/{*}'], ['B', 'POST', '/a/{*}']]), tpl());
  assert.equal(r.records.length, 2);
  assert.equal(r.skipped, 0);
});

test('mapRows loai trung theo cap method va path khi dedupe: true', () => {
  const r = mapRows(grid([['A', 'GET', '/a/{*}'], ['A lan hai', 'get', '/a/{*}']]), tpl(), { dedupe: true });
  assert.equal(r.records.length, 1);
  assert.equal(r.skipped, 1);
});

test('mapRows giu ban ghi trung khi tat dedupe', () => {
  const r = mapRows(grid([['A', 'GET', '/a/{*}'], ['A', 'GET', '/a/{*}']]), tpl(), { dedupe: false });
  assert.equal(r.records.length, 2);
  assert.equal(r.skipped, 0);
});

test('mapRows khong nap gi khi cot khong khop', () => {
  const r = mapRows(grid([['A', 'GET', '/a/{*}']]), [
    { id: 't1', type: 'name', selector: 'Verb', target: 'endpoint' },
  ]);
  assert.deepEqual(r.records, []);
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].row, 1);
});

test('mapRows de trong name khi template khong khai dong name', () => {
  const r = mapRows(grid([['A', 'GET', '/a/{*}']]), [
    { id: 't2', type: 'name', selector: 'HTTP Method', target: 'method' },
    { id: 't3', type: 'name', selector: 'Đường dẫn', target: 'endpoint' },
  ]);
  assert.deepEqual(r.records, [{
    name: '', method: 'GET', endpoint: '/a/{*}', sheetName: 'Sheet 1',
    raw: { 'Tên API': 'A', 'HTTP Method': 'GET', 'Đường dẫn': '/a/{*}' },
  }]);
});

// --- nhom alias: nhieu rule cung target ---

function aliasTpl() {
  return [
    { id: 't1', type: 'name', selector: 'Name', target: 'name' },
    { id: 't2', type: 'name', selector: 'Name *', target: 'name' },
    { id: 't3', type: 'name', selector: 'Method', target: 'method' },
    { id: 't4', type: 'name', selector: 'API Mapping', target: 'endpoint' },
  ];
}

test('resolveColumns alias: sheet co cot Name thi dung alias dau', () => {
  const headers = ['Name', 'Method', 'API Mapping'];
  const r = resolveColumns(headers, aliasTpl());
  assert.equal(r.columns.name, 0);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
});

test('resolveColumns alias: sheet co cot Name * thi roi xuong alias sau', () => {
  const headers = ['Name *', 'Method', 'API Mapping'];
  const r = resolveColumns(headers, aliasTpl());
  assert.equal(r.columns.name, 0);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
});

test('resolveColumns alias: sheet co ca hai cot thi thang theo thu tu template', () => {
  const headers = ['Name', 'Name *', 'Method', 'API Mapping'];
  const r = resolveColumns(headers, aliasTpl());
  assert.equal(r.columns.name, 0); // "Name" (rule dau) thang, khong phai "Name *"
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
});

test('resolveColumns alias: ca nhom name mat het thi canh bao, khong loi chan', () => {
  const headers = ['Method', 'API Mapping'];
  const r = resolveColumns(headers, aliasTpl());
  assert.equal(r.columns.name, undefined);
  assert.deepEqual(r.errors, []);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /name/);
});

test('resolveColumns alias: ca nhom endpoint mat het thi loi chan, liet ke du alias', () => {
  const headers = ['Name', 'Method'];
  const r = resolveColumns(headers, [
    { id: 't1', type: 'name', selector: 'Name', target: 'name' },
    { id: 't2', type: 'name', selector: 'API Mapping', target: 'endpoint' },
    { id: 't3', type: 'name', selector: 'Path', target: 'endpoint' },
  ]);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /API Mapping/);
  assert.match(r.errors[0], /Path/);
});

test('resolveColumns alias: index ngoai khoang roi xuong alias sau khop ten', () => {
  const headers = ['Name', 'Method', 'API Mapping'];
  const r = resolveColumns(headers, [
    { id: 't1', type: 'index', selector: '9', target: 'name' },
    { id: 't2', type: 'name', selector: 'Name', target: 'name' },
    { id: 't3', type: 'name', selector: 'Method', target: 'method' },
    { id: 't4', type: 'name', selector: 'API Mapping', target: 'endpoint' },
  ]);
  assert.equal(r.columns.name, 0);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
});

test('resolveColumns sheetName them tien to vao message, thieu thi khong', () => {
  const headers = ['Method', 'API Mapping'];
  const withName = resolveColumns(headers, aliasTpl(), 'Widget');
  assert.match(withName.warnings[0], /Sheet "Widget"/);

  const withoutName = resolveColumns(headers, aliasTpl());
  assert.doesNotMatch(withoutName.warnings[0], /Sheet "/);
});

test('mapRows: 2 sheet lech nhan cot name van nap dung ca hai', () => {
  const gridResult = {
    sheets: [
      { name: 'A', headers: ['Name', 'Method', 'API Mapping'], rows: [['Tạo phiếu', 'POST', '/a']] },
      { name: 'B', headers: ['Name *', 'Method', 'API Mapping'], rows: [['Sửa phiếu', 'PUT', '/b']] },
    ],
  };
  const r = mapRows(gridResult, aliasTpl());
  assert.equal(r.records.length, 2);
  assert.equal(r.records[0].name, 'Tạo phiếu');
  assert.equal(r.records[1].name, 'Sửa phiếu');
});

test('mapRows: sheet thieu ca hai alias name van nap, name rong, co canh bao', () => {
  const gridResult = {
    sheets: [
      { name: 'C', headers: ['Method', 'API Mapping'], rows: [['GET', '/c']] },
    ],
  };
  const r = mapRows(gridResult, aliasTpl());
  assert.equal(r.records.length, 1);
  assert.equal(r.records[0].name, '');
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0].reason, /name/);
});
