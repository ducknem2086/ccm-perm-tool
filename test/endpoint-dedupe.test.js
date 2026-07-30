import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dedupeEndpoints } from '../public/js/shared/endpoint-dedupe.js';
import { mapRows } from '../public/js/shared/endpoint-mapping.js';

const HEADERS = ['Tên API', 'HTTP Method', 'Đường dẫn'];
function tpl() {
  return [
    { id: 't1', type: 'name', selector: 'Tên API', target: 'name' },
    { id: 't2', type: 'name', selector: 'HTTP Method', target: 'method' },
    { id: 't3', type: 'name', selector: 'Đường dẫn', target: 'endpoint' },
  ];
}

test('dedupeEndpoints loai bo endpoint trung nhau theo method va pathTemplate/endpoint', () => {
  const input = [
    { name: 'API 1', method: 'GET', pathTemplate: '/query/abc/{*}', sheetName: 'Sheet1' },
    { name: 'API 1 Duplicate', method: 'get', endpoint: ' /query/abc/{*} ', sheetName: 'Sheet2' },
    { name: 'API 2', method: 'POST', pathTemplate: '/query/abc/{*}', sheetName: 'Sheet1' },
  ];
  const { unique, skipped } = dedupeEndpoints(input);
  assert.equal(unique.length, 2);
  assert.equal(skipped, 1);
  assert.equal(unique[0].sheetName, 'Sheet1');
  assert.equal(unique[1].method, 'POST');
});

test('dedupeEndpoints xu ly input khong phai array', () => {
  const res = dedupeEndpoints(null);
  assert.deepEqual(res, { unique: [], skipped: 0 });
});

test('mapRows ho tro gridResult co nhieu sheet va gan sheetName', () => {
  const gridResult = {
    sheets: [
      {
        name: 'Sheet 1',
        headers: HEADERS,
        rows: [['API 1', 'GET', '/api/v1/users']],
      },
      {
        name: 'Sheet 2',
        headers: HEADERS,
        rows: [['API 2', 'POST', '/api/v1/users']],
      },
    ],
  };

  const { records, errors, skipped } = mapRows(gridResult, tpl());
  assert.equal(errors.length, 0);
  assert.equal(records.length, 2);
  assert.equal(skipped, 0);
  assert.equal(records[0].sheetName, 'Sheet 1');
  assert.equal(records[0].endpoint, '/api/v1/users');
  assert.equal(records[1].sheetName, 'Sheet 2');
  assert.equal(records[1].endpoint, '/api/v1/users');
});

test('mapRows dedupe tren tat ca cac sheet va dem skipped', () => {
  const gridResult = {
    sheets: [
      {
        name: 'Sheet 1',
        headers: HEADERS,
        rows: [['API 1', 'GET', '/api/v1/users']],
      },
      {
        name: 'Sheet 2',
        headers: HEADERS,
        rows: [['API 1 Dup', 'GET', '/api/v1/users']],
      },
    ],
  };

  const { records, errors, skipped } = mapRows(gridResult, tpl());
  assert.equal(errors.length, 0);
  assert.equal(records.length, 1);
  assert.equal(skipped, 1);
  assert.equal(records[0].sheetName, 'Sheet 1');
});

test('mapRows mac dinh sheetName la Sheet 1 khi sheet.name thieu', () => {
  const gridResult = {
    headers: HEADERS,
    rows: [['API 1', 'GET', '/api/v1/users']],
  };

  const { records } = mapRows(gridResult, tpl());
  assert.equal(records[0].sheetName, 'Sheet 1');
});
