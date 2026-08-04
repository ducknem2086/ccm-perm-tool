import { parseRawHeaders, normalizeWindowsCmdQuotes } from './endpoint-path.js';

// Dong dau tien cua mot lenh cURL copy-as-cURL luon la URL, truoc moi co -H/-b.
// Khong parse header value co the chua 'https://' (Referer, Origin...) nham
// thanh URL chinh vi chi lay MATCH DAU TIEN, va URL chinh luon dung truoc.
const URL_MATCH = /'(https?:\/\/[^']+)'|"(https?:\/\/[^"]+)"|(https?:\/\/\S+)/;

function firstFlagValue(text, flagPattern) {
  const re = new RegExp(`(?:^|\\s)(?:${flagPattern})\\s+(?:'([^']*)'|"((?:[^"\\\\]|\\\\.)*)"|(\\S+))`);
  const m = re.exec(text);
  if (!m) return null;
  if (m[1] !== undefined) return m[1];
  if (m[2] !== undefined) return m[2].replace(/\\(.)/g, '$1');
  return m[3] ?? null;
}

// Tach mot lenh cURL thanh request day du: method, url, headers, body.
// Tai su dung parseRawHeaders cho phan header/cookie — mot nguon su that duy
// nhat, khong viet lai logic quote/xuong dong.
export function parseCurlRequest(text) {
  // Chuan hoa ^" cua "Copy as cURL (cmd)" tren Windows truoc, khong thi URL
  // doc ra con dinh dau ^ va moi header lech ten — xem normalizeWindowsCmdQuotes.
  const flat = normalizeWindowsCmdQuotes(String(text ?? '')).replace(/[\\^]\r?\n/g, ' ');
  if (flat.trim() === '') return null;

  const urlMatch = URL_MATCH.exec(flat);
  const url = urlMatch ? (urlMatch[1] ?? urlMatch[2] ?? urlMatch[3]).replace(/[),'"]+$/, '') : null;
  if (!url) return null;

  const headers = {};
  for (const { key, value } of parseRawHeaders(flat)) headers[key] = value;

  const body = firstFlagValue(flat, '--data-raw|--data-binary|--data|-d');
  const method = firstFlagValue(flat, '-X|--request');

  return {
    method: (method || (body ? 'POST' : 'GET')).toUpperCase(),
    url,
    headers,
    body: body ?? null,
  };
}
