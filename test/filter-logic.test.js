import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyFilter, matchesFilter, applyFilter, collectStatuses, collectErrorCodes, ALL_COLUMNS,
} from '../public/js/shared/filter-logic.js';

function rec(over = {}) {
  const { status = 200, errorCode = null, durationMs = 100, ...rest } = over;
  return {
    index: 1, endpointName: '/x', msisdn: '0912345678',
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

test('loc theo status code', () => {
  const f = { ...emptyFilter(), statuses: ['200'] };
  assert.equal(matchesFilter(rec({ status: 200 }), f), true);
  assert.equal(matchesFilter(rec({ status: 500 }), f), false);
});

test('status null duoc dai dien bang N/A', () => {
  const f = { ...emptyFilter(), statuses: ['N/A'] };
  assert.equal(matchesFilter(rec({ status: null }), f), true);
  assert.equal(matchesFilter(rec({ status: 200 }), f), false);
});

test('loc theo error code', () => {
  const f = { ...emptyFilter(), errorCodes: ['E0042'] };
  assert.equal(matchesFilter(rec({ errorCode: 'E0042' }), f), true);
  assert.equal(matchesFilter(rec({ errorCode: null }), f), false);
});

test('loc theo khoang thoi gian', () => {
  assert.equal(matchesFilter(rec({ durationMs: 500 }), { ...emptyFilter(), timeMin: 400 }), true);
  assert.equal(matchesFilter(rec({ durationMs: 300 }), { ...emptyFilter(), timeMin: 400 }), false);
  assert.equal(matchesFilter(rec({ durationMs: 300 }), { ...emptyFilter(), timeMax: 400 }), true);
  assert.equal(matchesFilter(rec({ durationMs: 500 }), { ...emptyFilter(), timeMax: 400 }), false);
  assert.equal(matchesFilter(rec({ durationMs: 300 }), { ...emptyFilter(), timeMin: 100, timeMax: 400 }), true);
});

test('tim kiem tu do quet url, msisdn va body', () => {
  assert.equal(matchesFilter(rec(), { ...emptyFilter(), search: '0912345678' }), true);
  assert.equal(matchesFilter(rec(), { ...emptyFilter(), search: 'ok' }), true);
  assert.equal(matchesFilter(rec(), { ...emptyFilter(), search: 'khongcogi' }), false);
});

test('tim kiem khong phan biet hoa thuong', () => {
  assert.equal(matchesFilter(rec(), { ...emptyFilter(), search: 'ABC.VN' }), true);
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

test('ALL_COLUMNS gom status error time va them Name, Path, MSISDN', () => {
  assert.deepEqual(
    ALL_COLUMNS.map((c) => c.key),
    ['index', 'name', 'path', 'msisdn', 'request', 'response', 'status'],
  );
  assert.ok(ALL_COLUMNS.every((c) => c.default === true));
});

test('tim kiem tu do quet ca pathTemplate', () => {
  const r = rec({ pathTemplate: '/query/white-list-ir-subscriber/{*}' });
  assert.equal(matchesFilter(r, { ...emptyFilter(), search: 'white-list' }), true);
});

