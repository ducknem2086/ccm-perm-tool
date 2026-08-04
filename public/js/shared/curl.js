// Sinh lenh cURL dung dang Postman xuat ra, de import nguoc lai qua
// Import > Raw text. Dung nhay don vi day la dang Postman parse chac nhat;
// nhay don trong gia tri phai dong lai bang '\'' theo quy tac shell.

const quote = (s) => `'${String(s ?? '').replace(/'/g, "'\\''")}'`;

// Dung cho ca request nghiep vu lan request oracle (checkPermission) — hai
// khoi dung chung mot hinh dang { method, url, headers, body }.
export function curlOf(request) {
  const req = request ?? {};
  const method = String(req.method || 'GET').toUpperCase();
  const parts = [`curl --location --request ${method} ${quote(req.url)}`];

  for (const [k, v] of Object.entries(req.headers ?? {})) {
    parts.push(`--header ${quote(`${k}: ${v}`)}`);
  }

  const { body } = req;
  if (body !== null && body !== undefined && body !== '') {
    parts.push(`--data-raw ${quote(typeof body === 'string' ? body : JSON.stringify(body))}`);
  }

  return parts.join(' \\\n  ');
}

export const toCurl = (rec) => curlOf(rec?.request);

// Bo dau tieng Viet roi thay moi cum ky tu la bang '-' de ten file an toan
// tren ca Windows lan Linux.
const slug = (s) => String(s ?? '')
  .normalize('NFD')
  .replace(/\p{M}/gu, '')
  .replace(/[đĐ]/g, 'd')
  .replace(/[^a-zA-Z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .toLowerCase();

export function curlFilename(rec, kind = 'business') {
  const parts = [
    `curl-${rec?.index ?? 0}`,
    slug(rec?.endpointName),
    slug(rec?.msisdn),
    slug(rec?.authName),
    kind === 'oracle' ? 'checkperm' : null,
  ];
  return `${parts.filter(Boolean).join('-')}.txt`;
}
