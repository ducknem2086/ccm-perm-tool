import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authHeaderPairs, hasToken, findDuplicateNames } from '../public/js/shared/auth-utils.js';

const CURL = `curl 'https://api-abc.vn/x' \\
  -H 'Authorization: Bearer eyJabc' \\
  -H 'X-Tenant: vnpt' \\
  -b 'BIGipServerpool=1.2.3'`;

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function makeJwt(payload) {
  return `${b64url({ alg: 'RS256' })}.${b64url(payload)}.sig`;
}

function curlWithAccessToken(exp = Math.floor(Date.now() / 1000) + 3600) {
  const token = makeJwt({ individual_id: 'ind-1', preferred_username: 'user@vnp.vn', exp });
  return `curl 'https://x.vn' -b 'access_token=${token}'`;
}

test('authHeaderPairs parse het header trong curlRaw, khong con phu thuoc mode', () => {
  const pairs = authHeaderPairs({ curlRaw: CURL });
  assert.deepEqual(pairs.map((p) => p.key), ['Authorization', 'X-Tenant', 'Cookie']);
  assert.equal(pairs[0].value, 'Bearer eyJabc');
  assert.equal(pairs[2].value, 'BIGipServerpool=1.2.3');
});

test('authHeaderPairs tra mang rong khi curlRaw rong', () => {
  assert.deepEqual(authHeaderPairs({ curlRaw: '' }), []);
  assert.deepEqual(authHeaderPairs({}), []);
});

test('authHeaderPairs chiu duoc auth undefined', () => {
  assert.deepEqual(authHeaderPairs(undefined), []);
});

test('hasToken true khi cookie trong curlRaw co access_token con han', () => {
  assert.equal(hasToken({ curlRaw: curlWithAccessToken() }), true);
});

test('hasToken false khi cookie khong co access_token', () => {
  assert.equal(hasToken({ curlRaw: CURL }), false, 'CURL chi co Authorization, khong co cookie access_token');
  assert.equal(hasToken({ curlRaw: '' }), false);
  assert.equal(hasToken(undefined), false);
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
