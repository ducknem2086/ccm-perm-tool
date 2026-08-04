import { parseRawHeaders, detectPasteFormat } from './endpoint-path.js';

// Cookie cua CCOS mang 5 khoa lien quan danh tinh; phan con lai la analytics
// (_ga*, _clck, _fbp, __hstc, hubspotutk, ajs_*) va sticky-session cua F5.
// Chi 5 khoa nay di sang request checkPermission — xem doi soat trong
// docs/superpowers/specs/2026-08-03-auth-single-cookie-design.md.
export const AUTH_CORE_KEYS = ['access_token', 'id_token', 'client_id', 'REDIRECT_AFTER_LOGIN'];
export const AUTH_CORE_PREFIX = 'claims_'; // ten doi theo moi truong: claims_dev, claims_uat...

const isCoreKey = (key) => AUTH_CORE_KEYS.includes(key) || key.startsWith(AUTH_CORE_PREFIX);

export function parseCookiePairs(cookieStr) {
  const out = [];
  for (const part of String(cookieStr ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === '') continue;
    out.push({ key, value });
  }
  return out;
}

// Cookie tho cua auth: header 'Cookie' trong curlRaw da dan, ca -b va -H
// 'cookie: ...' deu duoc parseRawHeaders gom chung thanh mot cap.
function rawCookieOf(auth) {
  const pair = parseRawHeaders(auth?.curlRaw ?? '').find((p) => p.key.toLowerCase() === 'cookie');
  return pair?.value ?? '';
}

// Chuoi Cookie da loc con lai loi auth, dung gui sang request checkPermission
// — xem buildOracleRequest (request-builder.js).
export function authCookieString(auth) {
  return parseCookiePairs(rawCookieOf(auth))
    .filter((p) => isCoreKey(p.key))
    .map((p) => `${p.key}=${p.value}`)
    .join('; ');
}

// Module nay chay ca o browser (auths-panel.js) lan o Node (request-builder.js
// qua http-client.js) — dung atob/TextDecoder (global tren ca hai tu Node 20)
// thay vi Buffer de khong phai re nhanh theo moi truong.
function base64UrlDecode(s) {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

// Doc payload JWT — KHONG xac minh chu ky, chi doc claim de hien thi/doi
// soat. Tra null khi token khong phai dang JWT hoac payload khong parse
// duoc JSON.
export function decodeJwtPayload(token) {
  const parts = String(token ?? '').split('.');
  if (parts.length < 2) return null;
  try {
    return JSON.parse(base64UrlDecode(parts[1]));
  } catch {
    return null;
  }
}

function cookieValue(jar, key) {
  return jar.find((p) => p.key === key)?.value;
}

// claims_<env> la MOT khoi base64 cua JSON (khong phai JWT — khong co hai
// dau cham), nhung khong loai tru gateway khac lai URL-encode no. Thu ca
// hai, tra null neu khong cai nao ra JSON.
function decodeClaimsCookie(value) {
  try {
    return JSON.parse(base64UrlDecode(value));
  } catch { /* thu duong con lai */ }
  try {
    return JSON.parse(decodeURIComponent(value));
  } catch {
    return null;
  }
}

function authorizationOf(auth) {
  const pair = parseRawHeaders(auth?.curlRaw ?? '').find((p) => p.key.toLowerCase() === 'authorization');
  const value = pair?.value ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(value.trim());
  return m ? m[1] : null;
}

// Danh tinh dung de dung body checkPermission: user.id = individual_id,
// user.accountId = preferred_username. claims_<env> la JSON thuan, uu tien
// doc no truoc — thieu thi roi ve payload cua access_token (cung gia tri,
// xem doi soat trong spec).
export function identityOf(auth) {
  const jar = parseCookiePairs(rawCookieOf(auth));
  const accessToken = cookieValue(jar, 'access_token');
  const accessPayload = accessToken ? decodeJwtPayload(accessToken) : null;

  const claimsPair = jar.find((p) => p.key.startsWith(AUTH_CORE_PREFIX));
  let claims = claimsPair ? decodeClaimsCookie(claimsPair.value) : null;
  let source = claims ? 'claims' : null;
  if (!claims && accessPayload) {
    claims = accessPayload;
    source = 'jwt';
  }
  if (!claims) return null;

  return {
    individualId: claims.individual_id ?? null,
    accountId: claims.preferred_username ?? null,
    exp: accessPayload?.exp ?? null,
    sid: accessPayload?.sid ?? null,
    azp: accessPayload?.azp ?? null,
    clientId: cookieValue(jar, 'client_id') ?? null,
    source,
  };
}

function fmtExp(exp) {
  if (!exp) return '';
  const d = new Date(exp * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

// Nguon su that DUY NHAT cho moi kiem tra auth. Nut Verify o tab AUTHS in
// nguyen danh sach `checks`; authIdentityErrors / authWarnings chi loc lai
// theo status — khong noi nao viet lai logic lan hai.
//
// Hai usecase xac thuc bang hai thu khac nhau, nen moi check ghi ro no anh
// huong duong nao:
//   NGHIEP VU  -> 'Authorization: Bearer'
//   CHECK PERM -> cookie access_token (cURL checkPermission that KHONG co
//                 Authorization, nen thieu Bearer chi hong duong nghiep vu)
export function verifyAuth(auth) {
  const checks = [];
  const add = (status, scope, label, detail) => checks.push({
    status, scope, label, detail,
  });
  const done = () => ({ ok: checks.every((c) => c.status !== 'fail'), checks });

  const curlRaw = String(auth?.curlRaw ?? '').trim();
  const format = detectPasteFormat(curlRaw);
  if (curlRaw === '') {
    add('fail', 'CẢ HAI', 'Đã dán cURL', 'Chưa dán cURL — tab AUTHS cần ít nhất 1 lệnh cURL của request đã đăng nhập');
    return done();
  }

  // Chap nhan ca nguyen lenh cURL lan dang go tay "Key: Value" moi dong (vd
  // cau hinh cu migrate sang) — khong doi hoi parseCurlRequest ra URL, chi
  // can co header nao doc duoc.
  const pairs = parseRawHeaders(curlRaw);
  if (pairs.length === 0) {
    add('fail', 'CẢ HAI', 'Đọc được header', 'cURL không đọc được header nào');
    return done();
  }
  add('pass', 'CẢ HAI', 'Đọc được header', `${pairs.length} header · nhận dạng: ${format.label}`);

  const hasAuthorization = pairs.some((p) => p.key.toLowerCase() === 'authorization');
  if (hasAuthorization) {
    add('pass', 'NGHIỆP VỤ', 'Có Authorization', 'Request nghiệp vụ sẽ đi kèm Bearer');
  } else {
    add('warn', 'NGHIỆP VỤ', 'Có Authorization',
      'cURL này không có Authorization — request nghiệp vụ sẽ đi không kèm Bearer, '
      + 'API nhiều khả năng trả 401. Dán cURL của một request NGHIỆP VỤ (không phải checkPermission).');
  }

  const jar = parseCookiePairs(rawCookieOf(auth));
  const accessToken = cookieValue(jar, 'access_token');
  if (!accessToken) {
    add('fail', 'CHECK PERM', 'Cookie có access_token', 'Cookie thiếu access_token — dán cURL của request đã đăng nhập');
    return done();
  }
  add('pass', 'CHECK PERM', 'Cookie có access_token', `Cookie lõi gửi đi: ${authCookieString(auth).length} ký tự`);

  const accessPayload = decodeJwtPayload(accessToken);
  if (accessPayload?.exp && accessPayload.exp * 1000 < Date.now()) {
    add('fail', 'CẢ HAI', 'Token còn hạn', `access_token hết hạn lúc ${fmtExp(accessPayload.exp)}`);
  } else if (accessPayload?.exp) {
    add('pass', 'CẢ HAI', 'Token còn hạn', `Hết hạn lúc ${fmtExp(accessPayload.exp)}`);
  }

  const id = identityOf(auth);
  if (id?.accountId && id?.individualId) {
    add('pass', 'CHECK PERM', 'Dựng được danh tính',
      `${id.accountId} · id ${id.individualId} · nguồn ${id.source === 'claims' ? 'claims_*' : 'access_token'}`);
  } else {
    add('fail', 'CHECK PERM', 'Dựng được danh tính', 'Không đọc được individual_id / preferred_username');
  }

  const claimsPair = jar.find((p) => p.key.startsWith(AUTH_CORE_PREFIX));
  const claims = claimsPair ? decodeClaimsCookie(claimsPair.value) : null;
  if (claims && accessPayload) {
    const claimsUser = claims.individual_id ?? null;
    const claimsName = claims.preferred_username ?? null;
    if ((claimsUser && claimsUser !== accessPayload.individual_id)
      || (claimsName && claimsName !== accessPayload.preferred_username)) {
      add('fail', 'CHECK PERM', 'claims_* khớp token', 'claims_* và access_token là hai người khác nhau — cookie ghép từ hai lần login');
    } else {
      add('pass', 'CHECK PERM', 'claims_* khớp token', 'Cùng một người');
    }
  }

  const bearer = authorizationOf(auth);
  const bearerPayload = bearer ? decodeJwtPayload(bearer) : null;
  if (bearerPayload && accessPayload) {
    if (bearerPayload.preferred_username !== accessPayload.preferred_username) {
      add('fail', 'CẢ HAI', 'Bearer khớp cookie', 'Authorization và cookie là hai user khác nhau');
    } else if (bearerPayload.sid !== accessPayload.sid) {
      add('fail', 'CẢ HAI', 'Bearer khớp cookie', 'Authorization và cookie thuộc hai phiên đăng nhập khác nhau — dán lại cả hai cùng một lần đăng nhập');
    } else {
      add('pass', 'CẢ HAI', 'Bearer khớp cookie', 'Cùng user, cùng phiên đăng nhập');
    }
  }

  const clientId = cookieValue(jar, 'client_id');
  if (clientId && accessPayload?.azp && clientId !== accessPayload.azp) {
    add('fail', 'CHECK PERM', 'client_id khớp azp', 'client_id trong cookie khác azp của token');
  }

  if (String(auth?.role ?? '').trim() === '') {
    add('warn', 'CHECK PERM', 'Đã khai role', 'Chưa khai role — CHECK PERM cần để dựng body checkPermission');
  } else {
    add('pass', 'CHECK PERM', 'Đã khai role', String(auth.role).trim());
  }

  return done();
}

// Loi CHAN CHECK PERM. Loc tu verifyAuth de khong co hai ban logic.
export const authIdentityErrors = (auth) => verifyAuth(auth).checks
  .filter((c) => c.status === 'fail').map((c) => c.detail);

// Canh bao KHONG chan chay — vd dan nham cURL checkPermission vao AUTHS.
export const authWarnings = (auth) => verifyAuth(auth).checks
  .filter((c) => c.status === 'warn').map((c) => c.detail);
