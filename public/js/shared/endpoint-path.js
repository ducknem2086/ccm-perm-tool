const STAR = '{*}';
const MSISDN_PLACEHOLDER = /:msisdn\b|\{\{\s*msisdn\s*\}\}/;

// "/a/b/{*}?x=1" -> { path: "/a/b", inlineQuery: "x=1" }
// Dau sao la ranh gioi: ben trai la path, ben phai la query rieng cua endpoint.
export function splitTemplate(template) {
  const text = String(template ?? '').trim();
  const at = text.indexOf(STAR);

  if (at === -1) {
    const q = text.indexOf('?');
    if (q === -1) return { path: text, inlineQuery: '' };
    return { path: text.slice(0, q), inlineQuery: text.slice(q + 1) };
  }

  return {
    path: text.slice(0, at).replace(/\/+$/, ''),
    inlineQuery: text.slice(at + STAR.length).replace(/^\?/, ''),
  };
}

// Khong decode gia tri vi no co the con chua {{fromDate}} chua resolve.
export function parseInlineQuery(qs) {
  const out = [];
  for (const part of String(qs ?? '').split('&')) {
    if (part === '') continue;
    const eq = part.indexOf('=');
    const key = eq === -1 ? part : part.slice(0, eq);
    if (key === '') continue;
    out.push({ key, value: eq === -1 ? '' : part.slice(eq + 1) });
  }
  return out;
}

export function hasMsisdnPlaceholder(path) {
  return MSISDN_PLACEHOLDER.test(String(path ?? ''));
}

// Cat tai dau ':' dau tien vi gia tri header co the chua ':' (URL, thoi gian...).
function splitHeaderLine(line) {
  const colon = line.indexOf(':');
  if (colon === -1) return null;
  const key = line.slice(0, colon).trim();
  const value = line.slice(colon + 1).trim();
  return key === '' ? null : { key, value };
}

const QUOTED = /^(?:'([^']*)'|"((?:[^"\\]|\\.)*)")$/;

function unquote(s) {
  const m = QUOTED.exec(s.trim());
  if (!m) return s.trim();
  return m[1] !== undefined ? m[1] : m[2].replace(/\\(.)/g, '$1');
}

// Chrome "Copy as cURL" xuong dong bang '\', Windows dung '^'. Chuan hoa ve
// mot dong roi quet co — chiu duoc ca hai kieu lan kieu dan het vao mot dong.
const CURL_HEADER_FLAG = /(?:^|\s)(-H|--header|-b|--cookie)\s+(?:'([^']*)'|"((?:[^"\\]|\\.)*)"|(\S+))/g;
const HAS_CURL_FLAG = /(?:^|\s)(?:-H|--header|-b|--cookie)\s/;

// Chrome tren Windows xuat "Copy as cURL (cmd)" boc chuoi bang ^" thay vi ",
// dau nhay long ben trong la \^". Doi ve dang nhay kep chuan roi de nguyen
// duong parse cu chay tiep — khong co buoc nay thi ten header doc ra thanh
// '^"Authorization', request di khong kem Bearer va API tra 401.
export function normalizeWindowsCmdQuotes(text) {
  if (!text.includes('^"')) return text;
  return text
    .replace(/\\\^"/g, '\\"')
    .replace(/\^"/g, '"')
    .replace(/\^\^/g, '^');
}

// Ten header hop le theo RFC 7230 (token). Loc bang cai nay de mot ban dan
// khong doc duoc KHONG am tham sinh ra header rac — tha tra ve rong de
// authIdentityErrors bao "khong doc duoc header nao".
const HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;
const validPair = (p) => p !== null && HEADER_NAME.test(p.key);

function parseCurlPaste(text) {
  const flat = normalizeWindowsCmdQuotes(text).replace(/[\\^]\r?\n/g, ' ');
  const out = [];

  for (const m of flat.matchAll(CURL_HEADER_FLAG)) {
    const flag = m[1];
    const raw = m[2] ?? (m[3] !== undefined ? m[3].replace(/\\(.)/g, '$1') : m[4]) ?? '';

    if (flag === '-b' || flag === '--cookie') {
      if (raw.trim() !== '') out.push({ key: 'Cookie', value: raw.trim() });
      continue;
    }
    const pair = splitHeaderLine(raw);
    if (validPair(pair)) out.push(pair);
  }
  return out;
}

const unescapeJs = (s) => s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/\\(.)/g, '$1');

// Lay khoi {...} can bang ngoac bat dau tu vi tri dau '{'.
function braceBlock(text, from) {
  const start = text.indexOf('{', from);
  if (start === -1) return '';
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start + 1, i);
    }
  }
  return text.slice(start + 1);
}

const KV_JSON = /"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;

// Chrome > Copy as fetch. README ban cu tung khuyen dung chinh kieu nay, nen
// no phai doc duoc: header nam trong object "headers": { "k": "v", ... }.
function parseFetchPaste(text) {
  const at = text.search(/["']?headers["']?\s*:\s*\{/);
  if (at === -1) return [];
  const block = braceBlock(text, at);
  const out = [];
  for (const m of block.matchAll(KV_JSON)) {
    const pair = { key: unescapeJs(m[1]).trim(), value: unescapeJs(m[2]).trim() };
    if (validPair(pair)) out.push(pair);
  }
  return out;
}

const PS_KV = /"((?:[^"\\]|\\.)*)"\s*=\s*"((?:[^"\\]|\\.)*)"/g;
const PS_COOKIE = /New-Object\s+System\.Net\.Cookie\s*\(\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"/gi;

// Chrome tren Windows > Copy as PowerShell: header o -Headers @{ "k"="v" },
// cookie o cac dong $session.Cookies.Add((New-Object System.Net.Cookie(...))).
function parsePowerShellPaste(text) {
  const out = [];
  const at = text.search(/-Headers\s*@\{/i);
  if (at !== -1) {
    for (const m of braceBlock(text, at).matchAll(PS_KV)) {
      const pair = { key: unescapeJs(m[1]).trim(), value: unescapeJs(m[2]).trim() };
      if (validPair(pair)) out.push(pair);
    }
  }

  const cookies = [...text.matchAll(PS_COOKIE)]
    .map((m) => `${unescapeJs(m[1]).trim()}=${unescapeJs(m[2]).trim()}`);
  if (cookies.length > 0 && !out.some((p) => p.key.toLowerCase() === 'cookie')) {
    out.push({ key: 'Cookie', value: cookies.join('; ') });
  }
  return out;
}

// Dong chi chua URL van co dau ':' (sau "https") nen phai loai truoc, khong thi
// dinh ra header ma ten la "https".
const URL_LINE = /^https?:\/\//i;

function parsePlainLines(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim().replace(/\s*[\\^]$/, '').trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    if (URL_LINE.test(trimmed)) continue;
    if (trimmed.startsWith('-')) continue;
    if (/^curl\b/i.test(trimmed)) continue;
    const pair = splitHeaderLine(unquote(trimmed));
    if (validPair(pair) && !URL_LINE.test(`${pair.key}:${pair.value}`)) out.push(pair);
  }
  return out;
}

const HAS_PWSH = /Invoke-WebRequest|Invoke-RestMethod|-Headers\s*@\{/i;
const HAS_FETCH = /\bfetch\s*\(|["']headers["']\s*:\s*\{/;

// Nhan MOI kieu Chrome xuat ra, vi nguoi dung khong chon duoc kieu nao tool
// hieu — bam nham la request di thieu Authorization va API tra 401:
//   1. Copy as cURL (bash)        -> co -H / -b
//   2. Copy as cURL (cmd, Windows) -> nhu tren nhung boc bang ^"
//   3. Copy as PowerShell (Windows) -> -Headers @{} + System.Net.Cookie
//   4. Copy as fetch               -> object "headers": { ... }
//   5. Go tay "Key: Value"         -> moi dong mot header
export function parseRawHeaders(text) {
  const s = String(text ?? '');
  if (HAS_CURL_FLAG.test(normalizeWindowsCmdQuotes(s))) return parseCurlPaste(s);
  if (HAS_PWSH.test(s)) return parsePowerShellPaste(s);
  if (HAS_FETCH.test(s)) return parseFetchPaste(s);
  return parsePlainLines(s);
}

const FORMAT_LABEL = {
  'curl-cmd': 'Copy as cURL (cmd) — Windows',
  'curl-bash': 'Copy as cURL (bash)',
  powershell: 'Copy as PowerShell',
  fetch: 'Copy as fetch',
  plain: 'gõ tay "Key: Value"',
  empty: 'chưa có nội dung',
};

// Cho nguoi dung biet tool hieu ban dan cua ho la kieu gi — bam nham kieu
// copy la nguyen nhan mat Authorization va an 401, nen phai hien ra chu
// khong doan.
export function detectPasteFormat(text) {
  const s = String(text ?? '');
  if (s.trim() === '') return { id: 'empty', label: FORMAT_LABEL.empty };
  const id = (() => {
    if (HAS_CURL_FLAG.test(normalizeWindowsCmdQuotes(s))) return s.includes('^"') ? 'curl-cmd' : 'curl-bash';
    if (HAS_PWSH.test(s)) return 'powershell';
    if (HAS_FETCH.test(s)) return 'fetch';
    return 'plain';
  })();
  return { id, label: FORMAT_LABEL[id] };
}
