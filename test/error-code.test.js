import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getByPath, extractErrorCode, DEFAULT_ERROR_CODE_PATHS
} from '../src/server/error-code.js';

test('getByPath doc key phang', () => {
  assert.equal(getByPath({ code: 'E1' }, 'code'), 'E1');
});

test('getByPath doc key long nhau', () => {
  assert.equal(getByPath({ error: { code: 'E2' } }, 'error.code'), 'E2');
});

test('getByPath tra undefined khi duong dan dut giua chung', () => {
  assert.equal(getByPath({ error: null }, 'error.code'), undefined);
  assert.equal(getByPath({}, 'a.b.c'), undefined);
});

test('extractErrorCode lay path dau tien tim thay', () => {
  const body = { code: 'C', errorCode: 'E' };
  assert.equal(extractErrorCode(body, ['errorCode', 'code']), 'E');
  assert.equal(extractErrorCode(body, ['code', 'errorCode']), 'C');
});

test('extractErrorCode giu lai ma so 0', () => {
  assert.equal(extractErrorCode({ code: 0 }, ['code']), '0');
});

test('extractErrorCode bo qua chuoi rong', () => {
  assert.equal(extractErrorCode({ code: '', errorCode: 'E9' }, ['code', 'errorCode']), 'E9');
});

test('extractErrorCode tra null khi body khong phai object', () => {
  assert.equal(extractErrorCode('loi text', ['code']), null);
  assert.equal(extractErrorCode(null, ['code']), null);
});

test('extractErrorCode tra null khi khong tim thay', () => {
  assert.equal(extractErrorCode({ data: 1 }, DEFAULT_ERROR_CODE_PATHS), null);
});

test('DEFAULT_ERROR_CODE_PATHS dung thu tu spec', () => {
  assert.deepEqual(DEFAULT_ERROR_CODE_PATHS, ['errorCode', 'error_code', 'code', 'error.code']);
});
