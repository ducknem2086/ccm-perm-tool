import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authHeaderPairs, hasToken, findDuplicateNames } from '../public/js/shared/auth-utils.js';

const CURL = `curl 'https://api-abc.vn/x' \\
  -H 'Authorization: Bearer eyJabc' \\
  -H 'X-Tenant: vnpt' \\
  -b 'BIGipServerpool=1.2.3'`;

test('authHeaderPairs mode fields tra mang rong', () => {
  assert.deepEqual(authHeaderPairs({ mode: 'fields', token: 'x' }), []);
});

test('authHeaderPairs mode curl tra het header parse duoc', () => {
  const pairs = authHeaderPairs({ mode: 'curl', curlRaw: CURL });
  assert.deepEqual(pairs.map((p) => p.key), ['Authorization', 'X-Tenant', 'Cookie']);
  assert.equal(pairs[0].value, 'Bearer eyJabc');
  assert.equal(pairs[2].value, 'BIGipServerpool=1.2.3');
});

test('authHeaderPairs coi thieu mode la fields', () => {
  assert.deepEqual(authHeaderPairs({ curlRaw: CURL }), []);
});

test('authHeaderPairs chiu duoc auth undefined', () => {
  assert.deepEqual(authHeaderPairs(undefined), []);
});

test('hasToken mode fields dua vao o token', () => {
  assert.equal(hasToken({ mode: 'fields', token: 'eyJ' }), true);
  assert.equal(hasToken({ mode: 'fields', token: '   ' }), false);
});

test('hasToken mode curl tim header Authorization khong phan biet hoa thuong', () => {
  assert.equal(hasToken({ mode: 'curl', curlRaw: CURL }), true);
  assert.equal(hasToken({ mode: 'curl', curlRaw: "curl 'https://x' -H 'authorization: Bearer z'" }), true);
  assert.equal(hasToken({ mode: 'curl', curlRaw: "curl 'https://x' -H 'Accept: */*'" }), false);
});

test('findDuplicateNames tra ten bi trung', () => {
  const dup = findDuplicateNames([{ name: 'A' }, { name: 'B' }, { name: 'A' }]);
  assert.deepEqual([...dup], ['A']);
});

test('findDuplicateNames so sanh sau khi trim', () => {
  const dup = findDuplicateNames([{ name: 'A' }, { name: '  A  ' }]);
  assert.deepEqual([...dup], ['A']);
});

test('findDuplicateNames phan biet hoa thuong', () => {
  assert.equal(findDuplicateNames([{ name: 'PROD' }, { name: 'prod' }]).size, 0);
});

test('findDuplicateNames bo qua ten rong', () => {
  assert.equal(findDuplicateNames([{ name: '' }, { name: '   ' }]).size, 0);
});
