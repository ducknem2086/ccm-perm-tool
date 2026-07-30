import { parseRawHeaders } from './endpoint-path.js';

// Mode 'curl' khong luu mang header da parse — parse lai tu curlRaw moi lan
// dung, giong cach globalHeaderRaw dang chay. Mot nguon su that duy nhat.
export function authHeaderPairs(auth) {
  return (auth?.mode ?? 'fields') === 'curl' ? parseRawHeaders(auth?.curlRaw ?? '') : [];
}

export function hasToken(auth) {
  if ((auth?.mode ?? 'fields') === 'curl') {
    return authHeaderPairs(auth).some((p) => p.key.toLowerCase() === 'authorization');
  }
  return String(auth?.token ?? '').trim() !== '';
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
