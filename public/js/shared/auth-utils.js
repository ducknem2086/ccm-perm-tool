import { parseRawHeaders } from './endpoint-path.js';
import { identityOf } from './auth-identity.js';

// Auth profile khong con mode — mot cURL la nguon danh tinh duy nhat, parse
// lai tu curlRaw moi lan dung giong cach globalHeaderRaw dang chay.
export function authHeaderPairs(auth) {
  return parseRawHeaders(auth?.curlRaw ?? '');
}

// Dung dung thu decide chay duoc hay khong: co access_token trong cookie,
// khong phai "co header Authorization" — checkPermission xac thuc bang
// cookie, khong bang Authorization (xem auth-identity.js).
export function hasToken(auth) {
  return identityOf(auth) !== null;
}

// Phan biet hoa thuong: 'PROD' va 'prod' la hai profile khac nhau, nguoi dung
// co the co y dat vay. Chi trim khoang trang thua.
export function findDuplicateNames(auths) {
  const seen = new Set();
  const dup = new Set();
  for (const a of auths ?? []) {
    const name = String(a?.name ?? '').trim();
    if (name === '') continue;
    if (seen.has(name)) dup.add(name);
    else seen.add(name);
  }
  return dup;
}
