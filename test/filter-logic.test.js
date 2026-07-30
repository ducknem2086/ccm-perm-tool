import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyFilter, matchesFilter, applyFilter, collectStatuses, collectErrorCodes, collectAuthNames, ALL_COLUMNS, STATUS_NA,
} from '../public/js/shared/filter-logic.js';

function rec(over = {}) {
  const { status = 200, errorCode = null, durationMs = 100, ...rest } = over;
  return {
    index: 1, endpointName: 'Tra cuu thue bao', pathTemplate: '/query/abc', msisdn: '0912345678',
    request: { method: 'GET', url: 'https://abc.vn/x/0912345678', headers: {}, queryParams: {}, pathParams: {}, body: null },
    response: { status, statusText: '', headers: {}, body: null, bodyText: '{"ok":true}', sizeBytes: 11 },
    errorCode, errorMessage: null, durationMs,
    startedAt: '2026-07-29T03:12:44.001Z', finishedAt: '2026-07-29T03:12:44.101Z',
    ...rest,
  };
}

test('emptyFilter cho qua moi ban ghi', () => {
  assert.equal(matchesFilter(rec(), emptyFilter()), true);
});

test('emptyFilter chi co 5 truong', () => {
  assert.deepEqual(emptyFilter(), { msisdn: '', name: '', status: '', errorCode: '', auth: '' });
});

test('loc theo status code', () => {
  const f = { ...emptyFilter(), status: '200' };
  assert.equal(matchesFilter(rec({ status: 200 }), f), true);
  assert.equal(matchesFilter(rec({ status: 500 }), f), false);
});

test('status null duoc dai dien bang N/A', () => {
  const f = { ...emptyFilter(), status: STATUS_NA };
  assert.equal(matchesFilter(rec({ status: null }), f), true);
  assert.equal(matchesFilter(rec({ status: 200 }), f), false);
});

test('loc theo error code', () => {
  const f = { ...emptyFilter(), errorCode: 'E0042' };
  assert.equal(matchesFilter(rec({ errorCode: 'E0042' }), f), true);
  assert.equal(matchesFilter(rec({ errorCode: null }), f), false);
});

test('loc theo name khop chuoi con khong phan biet hoa thuong', () => {
  assert.equal(matchesFilter(rec(), { ...emptyFilter(), name: 'thue bao' }), true);
  assert.equal(matchesFilter(rec(), { ...emptyFilter(), name: 'THUE BAO' }), true);
  assert.equal(matchesFilter(rec(), { ...emptyFilter(), name: 'khongcogi' }), false);
});

test('loc theo name voi ban ghi khong co ten', () => {
  assert.equal(matchesFilter(rec({ endpointName: '' }), { ...emptyFilter(), name: 'a' }), false);
});

test('loc theo msisdn khop chuoi con', () => {
  assert.equal(matchesFilter(rec(), { ...emptyFilter(), msisdn: '0912' }), true);
  assert.equal(matchesFilter(rec(), { ...emptyFilter(), msisdn: '0999' }), false);
});

test('loc theo msisdn voi ban ghi khong co msisdn', () => {
  assert.equal(matchesFilter(rec({ msisdn: null }), { ...emptyFilter(), msisdn: '09' }), false);
  assert.equal(matchesFilter(rec({ msisdn: null }), emptyFilter()), true);
});

test('to hop msisdn va status cung luc', () => {
  const f = { ...emptyFilter(), msisdn: '0912', status: '500' };
  assert.equal(matchesFilter(rec({ status: 500 }), f), true);
  assert.equal(matchesFilter(rec({ status: 200 }), f), false);
});

test('applyFilter sap xep theo index', () => {
  const out = applyFilter([rec({ index: 3 }), rec({ index: 1 }), rec({ index: 2 })], emptyFilter());
  assert.deepEqual(out.map((r) => r.index), [1, 2, 3]);
});

test('collectStatuses tra ve danh sach duy nhat da sap xep', () => {
  assert.deepEqual(
    collectStatuses([rec({ status: 500 }), rec({ status: 200 }), rec({ status: 200 }), rec({ status: null })]),
    ['200', '500', 'N/A'],
  );
});

test('collectErrorCodes bo qua ban ghi khong co ma loi', () => {
  assert.deepEqual(collectErrorCodes([rec({ errorCode: 'E2' }), rec({ errorCode: null }), rec({ errorCode: 'E1' })]), ['E1', 'E2']);
});

test('ALL_COLUMNS dat status ngay sau index va tach response thanh 2 cot', () => {
  assert.deepEqual(
    ALL_COLUMNS.map((c) => c.key),
    ['index', 'status', 'name', 'auth', 'path', 'request', 'responseBody', 'responseHeaders'],
  );
  assert.ok(ALL_COLUMNS.every((c) => c.default === true));
});

test('ALL_COLUMNS co cot auth va bat mac dinh', () => {
  const col = ALL_COLUMNS.find((c) => c.key === 'auth');
  assert.ok(col);
  assert.equal(col.header, 'Auth');
  assert.equal(col.default, true);
});

test('matchesFilter loc theo authName khop chinh xac', () => {
  const r = rec({ authName: 'PROD' });
  assert.equal(matchesFilter(r, { ...emptyFilter(), auth: 'PROD' }), true);
  assert.equal(matchesFilter(r, { ...emptyFilter(), auth: 'PRO' }), false);
  assert.equal(matchesFilter(r, { ...emptyFilter(), auth: 'UAT' }), false);
});

test('collectAuthNames tra danh sach khong trung da sap xep', () => {
  const recs = [rec({ authName: 'UAT' }), rec({ authName: 'PROD' }), rec({ authName: 'UAT' }), rec({ authName: '' })];
  assert.deepEqual(collectAuthNames(recs), ['PROD', 'UAT']);
});
