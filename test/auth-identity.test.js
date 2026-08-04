import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCookiePairs, authCookieString, decodeJwtPayload, identityOf,
  authIdentityErrors, authWarnings, verifyAuth,
} from '../public/js/shared/auth-identity.js';

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function makeJwt(payload) {
  return `${b64url({ alg: 'RS256' })}.${b64url(payload)}.sig`;
}

const NOW = Math.floor(Date.now() / 1000);
const VALID_PAYLOAD = {
  individual_id: 'ind-1', preferred_username: 'user@vnp.vn',
  exp: NOW + 3600, sid: 'sid-1', azp: 'tmf-api',
};
const CLAIMS = { individual_id: 'ind-1', preferred_username: 'user@vnp.vn' };

function curlWithCookie(cookiePairs, extra = '') {
  const cookie = cookiePairs.map(([k, v]) => `${k}=${v}`).join('; ');
  return `curl 'https://x.vn/api' \\\n  -b '${cookie}' \\\n  ${extra}`;
}

test('parseCookiePairs tach dung cap key=value', () => {
  assert.deepEqual(parseCookiePairs('a=1; b=2;c=3'), [
    { key: 'a', value: '1' }, { key: 'b', value: '2' }, { key: 'c', value: '3' },
  ]);
});

test('parseCookiePairs bo qua phan tu khong co dau bang', () => {
  assert.deepEqual(parseCookiePairs('a=1; rong; b=2'), [
    { key: 'a', value: '1' }, { key: 'b', value: '2' },
  ]);
});

test('authCookieString chi giu 5 khoa loi, bo analytics va sticky-session', () => {
  const token = makeJwt(VALID_PAYLOAD);
  const auth = { curlRaw: curlWithCookie([
    ['_ga', 'GA1.2.123'], ['access_token', token], ['id_token', token],
    ['client_id', 'tmf-api'], ['claims_dev', b64url(CLAIMS)],
    ['BIGipServerpool_x', '123'], ['REDIRECT_AFTER_LOGIN', 'https://x.vn/'],
    ['_clck', 'abc'],
  ]) };
  const cookie = authCookieString(auth);
  assert.ok(cookie.includes('access_token='));
  assert.ok(cookie.includes('id_token='));
  assert.ok(cookie.includes('client_id=tmf-api'));
  assert.ok(cookie.includes('claims_dev='));
  assert.ok(cookie.includes('REDIRECT_AFTER_LOGIN='));
  assert.ok(!cookie.includes('_ga='));
  assert.ok(!cookie.includes('BIGipServerpool'));
  assert.ok(!cookie.includes('_clck'));
});

test('authCookieString giu ten claims_ du doi ten theo moi truong', () => {
  const auth = { curlRaw: curlWithCookie([['claims_uat', b64url(CLAIMS)]]) };
  assert.equal(authCookieString(auth), `claims_uat=${b64url(CLAIMS)}`);
});

test('decodeJwtPayload doc dung payload', () => {
  assert.deepEqual(decodeJwtPayload(makeJwt(VALID_PAYLOAD)), VALID_PAYLOAD);
});

test('decodeJwtPayload tra null voi chuoi khong phai JWT', () => {
  assert.equal(decodeJwtPayload('khong-phai-jwt'), null);
  assert.equal(decodeJwtPayload(''), null);
  assert.equal(decodeJwtPayload(undefined), null);
});

test('identityOf uu tien claims_*, roi voi JWT khi khong co claims', () => {
  const token = makeJwt(VALID_PAYLOAD);
  const withClaims = { curlRaw: curlWithCookie([
    ['access_token', token], ['claims_dev', b64url(CLAIMS)], ['client_id', 'tmf-api'],
  ]) };
  assert.deepEqual(identityOf(withClaims), {
    individualId: 'ind-1', accountId: 'user@vnp.vn',
    exp: VALID_PAYLOAD.exp, sid: 'sid-1', azp: 'tmf-api', clientId: 'tmf-api', source: 'claims',
  });

  const withoutClaims = { curlRaw: curlWithCookie([['access_token', token]]) };
  const id = identityOf(withoutClaims);
  assert.equal(id.source, 'jwt');
  assert.equal(id.individualId, 'ind-1');
  assert.equal(id.accountId, 'user@vnp.vn');
});

test('identityOf tra null khi khong co access_token', () => {
  assert.equal(identityOf({ curlRaw: curlWithCookie([['foo', 'bar']]) }), null);
  assert.equal(identityOf({ curlRaw: '' }), null);
});

test('authIdentityErrors bao khi cUrl rong', () => {
  const errs = authIdentityErrors({ curlRaw: '' });
  assert.equal(errs.length, 1);
  assert.match(errs[0], /Chưa dán cURL/);
});

test('authIdentityErrors bao khi khong doc duoc header nao', () => {
  const errs = authIdentityErrors({ curlRaw: '   ///// khong phai header' });
  assert.match(errs[0], /không đọc được header/);
});

test('authIdentityErrors bao khi cookie thieu access_token', () => {
  const errs = authIdentityErrors({ curlRaw: curlWithCookie([['foo', 'bar']]) });
  assert.match(errs[0], /thiếu access_token/);
});

test('authIdentityErrors bao token het han', () => {
  const expired = makeJwt({ ...VALID_PAYLOAD, exp: NOW - 3600 });
  const errs = authIdentityErrors({ curlRaw: curlWithCookie([['access_token', expired]]) });
  assert.ok(errs.some((e) => /hết hạn/.test(e)));
});

test('authIdentityErrors sach khi token con han va khong co header khac', () => {
  const token = makeJwt(VALID_PAYLOAD);
  const errs = authIdentityErrors({ curlRaw: curlWithCookie([
    ['access_token', token], ['claims_dev', b64url(CLAIMS)], ['client_id', 'tmf-api'],
  ]) });
  assert.deepEqual(errs, []);
});

test('authIdentityErrors bao claims_* va access_token la hai nguoi khac nhau', () => {
  const token = makeJwt(VALID_PAYLOAD);
  const lechClaims = { individual_id: 'ind-KHAC', preferred_username: 'user@vnp.vn' };
  const errs = authIdentityErrors({ curlRaw: curlWithCookie([
    ['access_token', token], ['claims_dev', b64url(lechClaims)],
  ]) });
  assert.ok(errs.some((e) => /hai người khác nhau/.test(e)));
});

test('authIdentityErrors bao Authorization va cookie la hai user khac nhau', () => {
  const token = makeJwt(VALID_PAYLOAD);
  const otherUserBearer = makeJwt({ ...VALID_PAYLOAD, preferred_username: 'khac@vnp.vn' });
  const errs = authIdentityErrors({ curlRaw: curlWithCookie(
    [['access_token', token]], `-H 'Authorization: Bearer ${otherUserBearer}'`,
  ) });
  assert.ok(errs.some((e) => /Authorization và cookie là hai user/.test(e)));
});

test('authIdentityErrors bao Authorization va cookie khac phien dang nhap (cung user, khac sid)', () => {
  const token = makeJwt(VALID_PAYLOAD);
  const otherSidBearer = makeJwt({ ...VALID_PAYLOAD, sid: 'sid-KHAC' });
  const errs = authIdentityErrors({ curlRaw: curlWithCookie(
    [['access_token', token]], `-H 'Authorization: Bearer ${otherSidBearer}'`,
  ) });
  assert.ok(errs.some((e) => /hai phiên đăng nhập khác nhau/.test(e)));
});

test('authIdentityErrors bao client_id cookie khac azp cua token', () => {
  const token = makeJwt(VALID_PAYLOAD);
  const errs = authIdentityErrors({ curlRaw: curlWithCookie([
    ['access_token', token], ['client_id', 'client-KHAC'],
  ]) });
  assert.ok(errs.some((e) => /client_id trong cookie khác azp/.test(e)));
});

test('authIdentityErrors khong nem loi khi JWT hong', () => {
  assert.doesNotThrow(() => {
    authIdentityErrors({ curlRaw: curlWithCookie([['access_token', 'khong.phai.jwt']]) });
  });
});

/* ---------- authWarnings: canh bao khong chan chay ---------- */

// Dan nham cURL checkPermission vao AUTHS: no khong co Authorization nen
// request nghiep vu di khong kem Bearer -> API tra 401.
test('authWarnings bao khi cURL khong co Authorization', () => {
  const token = makeJwt(VALID_PAYLOAD);
  const w = authWarnings({ curlRaw: curlWithCookie([['access_token', token]]) });
  assert.ok(w.some((m) => /không có Authorization/.test(m)));
  assert.ok(w.some((m) => /không phải checkPermission/.test(m)));
});

// Thieu access_token la loi CHAN CHECK PERM chu khong phai canh bao — mot
// dieu kien chi co mot thong bao, khong bao hai lan o hai muc do.
test('thieu access_token la loi chan, khong phai canh bao', () => {
  const auth = { curlRaw: curlWithCookie([['foo', 'bar']], "-H 'Authorization: Bearer x'") };
  assert.ok(authIdentityErrors(auth).some((m) => /thiếu access_token/.test(m)));
  assert.ok(!authWarnings(auth).some((m) => /access_token/.test(m)));
});

test('authWarnings bao khi chua khai role', () => {
  const token = makeJwt(VALID_PAYLOAD);
  const w = authWarnings({
    curlRaw: curlWithCookie([['access_token', token]], `-H 'Authorization: Bearer ${token}'`),
  });
  assert.ok(w.some((m) => /Chưa khai role/.test(m)));
});

test('authWarnings sach khi cURL nghiep vu co du Authorization, access_token va role', () => {
  const token = makeJwt(VALID_PAYLOAD);
  const w = authWarnings({
    curlRaw: curlWithCookie([['access_token', token]], `-H 'Authorization: Bearer ${token}'`),
    role: 'core_donvixuly',
  });
  assert.deepEqual(w, []);
});

/* ---------- verifyAuth: nguon su that cho nut Verify ---------- */

test('verifyAuth ok khi cURL nghiep vu day du', () => {
  const token = makeJwt(VALID_PAYLOAD);
  const r = verifyAuth({
    curlRaw: curlWithCookie([['access_token', token], ['claims_dev', b64url(CLAIMS)], ['client_id', 'tmf-api']],
      `-H 'Authorization: Bearer ${token}'`),
    role: 'core_donvixuly',
  });
  assert.equal(r.ok, true);
  assert.ok(r.checks.every((c) => c.status !== 'fail'));
  assert.ok(r.checks.some((c) => c.label === 'Có Authorization' && c.status === 'pass'));
  assert.ok(r.checks.some((c) => c.label === 'Cookie có access_token' && c.status === 'pass'));
});

test('verifyAuth khong ok khi token het han, va noi ro gio het han', () => {
  const expired = makeJwt({ ...VALID_PAYLOAD, exp: NOW - 3600 });
  const r = verifyAuth({ curlRaw: curlWithCookie([['access_token', expired]]), role: 'r' });
  assert.equal(r.ok, false);
  const c = r.checks.find((x) => x.label === 'Token còn hạn');
  assert.equal(c.status, 'fail');
  assert.match(c.detail, /hết hạn lúc \d{2}:\d{2}/);
});

test('verifyAuth ghi ro check nao anh huong usecase nao', () => {
  const token = makeJwt(VALID_PAYLOAD);
  const r = verifyAuth({ curlRaw: curlWithCookie([['access_token', token]]), role: 'r' });
  assert.equal(r.checks.find((c) => c.label === 'Có Authorization').scope, 'NGHIỆP VỤ');
  assert.equal(r.checks.find((c) => c.label === 'Cookie có access_token').scope, 'CHECK PERM');
});

test('verifyAuth bao dung kieu copy da nhan dang', () => {
  const token = makeJwt(VALID_PAYLOAD);
  const cmd = `curl ^"https://x.vn^" ^\n  -b ^"access_token=${token}^"`;
  const r = verifyAuth({ curlRaw: cmd, role: 'r' });
  assert.match(r.checks.find((c) => c.label === 'Đọc được header').detail, /cURL \(cmd\)/);
});

test('verifyAuth dung lai o check dau khi chua dan gi', () => {
  const r = verifyAuth({ curlRaw: '' });
  assert.equal(r.ok, false);
  assert.equal(r.checks.length, 1);
  assert.match(r.checks[0].detail, /Chưa dán cURL/);
});

test('authWarnings tra mang rong khi chua dan gi — de authIdentityErrors bao', () => {
  assert.deepEqual(authWarnings({ curlRaw: '' }), []);
  assert.deepEqual(authWarnings(undefined), []);
});
