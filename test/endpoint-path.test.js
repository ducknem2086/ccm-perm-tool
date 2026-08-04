import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  splitTemplate, parseInlineQuery, hasMsisdnPlaceholder, parseRawHeaders,
} from '../public/js/shared/endpoint-path.js';

test('splitTemplate tach path va query rieng qua dau sao', () => {
  assert.deepEqual(
    splitTemplate('/query/abc-information/{*}?type=PREPAID&limit=10'),
    { path: '/query/abc-information', inlineQuery: 'type=PREPAID&limit=10' },
  );
});

test('splitTemplate bo dau gach cheo thua truoc dau sao', () => {
  assert.deepEqual(
    splitTemplate('/query/abc-information/{*}'),
    { path: '/query/abc-information', inlineQuery: '' },
  );
});

test('splitTemplate chap nhan dau sao khong co dau gach cheo', () => {
  assert.deepEqual(splitTemplate('/query/abc{*}'), { path: '/query/abc', inlineQuery: '' });
});

test('splitTemplate khong co dau sao thi tach o dau hoi', () => {
  assert.deepEqual(splitTemplate('/health?x=1'), { path: '/health', inlineQuery: 'x=1' });
});

test('splitTemplate khong co dau sao lan dau hoi', () => {
  assert.deepEqual(splitTemplate('/health'), { path: '/health', inlineQuery: '' });
});

test('splitTemplate xu ly gia tri rong', () => {
  assert.deepEqual(splitTemplate(''), { path: '', inlineQuery: '' });
  assert.deepEqual(splitTemplate(null), { path: '', inlineQuery: '' });
});

test('parseInlineQuery tra ve cap key value theo dung thu tu', () => {
  assert.deepEqual(
    parseInlineQuery('type=PREPAID&limit=10'),
    [{ key: 'type', value: 'PREPAID' }, { key: 'limit', value: '10' }],
  );
});

test('parseInlineQuery giu nguyen bien chua resolve', () => {
  assert.deepEqual(parseInlineQuery('from={{fromDate}}'), [{ key: 'from', value: '{{fromDate}}' }]);
});

test('parseInlineQuery cho key khong co gia tri', () => {
  assert.deepEqual(parseInlineQuery('debug'), [{ key: 'debug', value: '' }]);
});

test('parseInlineQuery bo qua doan rong', () => {
  assert.deepEqual(parseInlineQuery('&a=1&&'), [{ key: 'a', value: '1' }]);
  assert.deepEqual(parseInlineQuery(''), []);
});

test('hasMsisdnPlaceholder nhan dien cu phap cu', () => {
  assert.equal(hasMsisdnPlaceholder('/query/abc/:msisdn/detail'), true);
  assert.equal(hasMsisdnPlaceholder('/query/abc/{{msisdn}}'), true);
  assert.equal(hasMsisdnPlaceholder('/query/abc/{{ msisdn }}'), true);
  assert.equal(hasMsisdnPlaceholder('/query/abc'), false);
  assert.equal(hasMsisdnPlaceholder('/query/:accountId'), false);
});

test('parseRawHeaders tach key value tai dau hai cham dau tien', () => {
  assert.deepEqual(
    parseRawHeaders('Accept: application/json'),
    [{ key: 'Accept', value: 'application/json' }],
  );
});

test('parseRawHeaders giu nguyen dau hai cham con lai trong gia tri', () => {
  assert.deepEqual(
    parseRawHeaders('X-Url: https://a.vn:8080/x'),
    [{ key: 'X-Url', value: 'https://a.vn:8080/x' }],
  );
});

test('parseRawHeaders bo dong rong, dong khong co hai cham, dong ghi chu', () => {
  const text = [
    'Accept: application/json',
    '',
    '   ',
    'khong-co-hai-cham',
    '# day la ghi chu',
    'X-Note:  ok  ',
  ].join('\n');
  assert.deepEqual(parseRawHeaders(text), [
    { key: 'Accept', value: 'application/json' },
    { key: 'X-Note', value: 'ok' },
  ]);
});

test('parseRawHeaders xu ly gia tri rong', () => {
  assert.deepEqual(parseRawHeaders(''), []);
  assert.deepEqual(parseRawHeaders(null), []);
});

test('parseRawHeaders bo dong chi chua URL, khong dinh ra header ten "https"', () => {
  const text = 'https://api.vn/query/abc?a=1\nAccept: application/json';
  assert.deepEqual(parseRawHeaders(text), [{ key: 'Accept', value: 'application/json' }]);
});

/* ---------- dan nguyen lenh cURL ---------- */

const CURL_PASTE = `curl 'https://api-x.abc.vn/Engine/query/ir-information/0888002716?fromDate=30062026&toDate=29072026' \\
  -H 'Accept: application/json, text/plain, */*' \\
  -H 'Accept-Language: en,vi;q=0.9' \\
  -H 'Authorization: Bearer eyJhbGci.payload.sig' \\
  -H 'Connection: keep-alive' \\
  -b 'client_id=tmf-api; access_token=aaa; id_token=bbb' \\
  -H 'Origin: http://localhost:9000' \\
  -H 'Sec-Fetch-Storage-Access: active' \\
  -H 'X-Current-Url: http://localhost:9000/#/ccos/custom360widget/Phone=0888002716' \\
  -H 'refresh_token: eyJrefresh.sig' \\
  -H 'sec-ch-ua: "Not;A=Brand";v="8", "Chromium";v="150"' \\
  -H 'sec-ch-ua-platform: "Android"'`;

test('parseRawHeaders doc duoc lenh cURL dan nguyen va bo dong URL', () => {
  const pairs = parseRawHeaders(CURL_PASTE);
  const byKey = Object.fromEntries(pairs.map((p) => [p.key, p.value]));

  assert.equal(byKey.Accept, 'application/json, text/plain, */*');
  assert.equal(byKey.Authorization, 'Bearer eyJhbGci.payload.sig');
  assert.equal(byKey.refresh_token, 'eyJrefresh.sig');
  assert.equal(byKey['Sec-Fetch-Storage-Access'], 'active');
  assert.equal(byKey['sec-ch-ua-platform'], '"Android"');

  // URL trong dong 'curl ...' khong duoc bien thanh header
  assert.ok(!pairs.some((p) => p.key.toLowerCase() === 'https'), 'khong duoc co header ten https');
  assert.ok(!pairs.some((p) => p.key.toLowerCase() === 'curl'), 'khong duoc co header ten curl');
});

test('parseRawHeaders doi -b thanh header Cookie', () => {
  const byKey = Object.fromEntries(parseRawHeaders(CURL_PASTE).map((p) => [p.key, p.value]));
  assert.equal(byKey.Cookie, 'client_id=tmf-api; access_token=aaa; id_token=bbb');
});

test('parseRawHeaders giu nguyen dau hai cham trong X-Current-Url', () => {
  const byKey = Object.fromEntries(parseRawHeaders(CURL_PASTE).map((p) => [p.key, p.value]));
  assert.equal(byKey['X-Current-Url'], 'http://localhost:9000/#/ccos/custom360widget/Phone=0888002716');
});

test('parseRawHeaders doc duoc cURL dan het vao mot dong', () => {
  const oneLine = `curl 'https://a.vn/x' -H 'Accept: application/json' -H 'X-A: 1' -b 'k=v'`;
  assert.deepEqual(parseRawHeaders(oneLine), [
    { key: 'Accept', value: 'application/json' },
    { key: 'X-A', value: '1' },
    { key: 'Cookie', value: 'k=v' },
  ]);
});

test('parseRawHeaders doc duoc cURL kieu Windows noi dong bang dau mu', () => {
  const win = 'curl "https://a.vn/x" ^\r\n  -H "Accept: application/json" ^\r\n  -H "X-A: 1"';
  assert.deepEqual(parseRawHeaders(win), [
    { key: 'Accept', value: 'application/json' },
    { key: 'X-A', value: '1' },
  ]);
});

test('parseRawHeaders bo cac co cURL khong phai header', () => {
  const text = `curl --location --compressed 'https://a.vn' -X POST --data-raw '{"a":1}' -H 'Accept: x'`;
  assert.deepEqual(parseRawHeaders(text), [{ key: 'Accept', value: 'x' }]);
});

/* ---------- moi kieu "Copy as ..." cua Chrome deu phai doc duoc ---------- */

// Bam nham kieu copy la request di THIEU Authorization -> API tra 401, va
// truoc khi sua no con im lang: parser sinh ra header ten '^"Authorization'
// nen khong cho nao bao loi.

test('parseRawHeaders doc duoc Copy as cURL (cmd) tren Windows — boc bang ^"', () => {
  const text = 'curl ^"https://a.vn/x^" ^\n'
    + '  -H ^"Accept: application/json^" ^\n'
    + '  -H ^"Authorization: Bearer eyJabc^" ^\n'
    + '  -b ^"access_token=T1; client_id=tmf-api^"';
  assert.deepEqual(parseRawHeaders(text), [
    { key: 'Accept', value: 'application/json' },
    { key: 'Authorization', value: 'Bearer eyJabc' },
    { key: 'Cookie', value: 'access_token=T1; client_id=tmf-api' },
  ]);
});

test('parseRawHeaders doc duoc Copy as PowerShell — -Headers @{} va System.Net.Cookie', () => {
  const text = '$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession\n'
    + '$session.Cookies.Add((New-Object System.Net.Cookie("access_token", "T1", "/", "vnpt.vn")))\n'
    + '$session.Cookies.Add((New-Object System.Net.Cookie("client_id", "tmf-api", "/", "vnpt.vn")))\n'
    + 'Invoke-WebRequest -UseBasicParsing -Uri "https://a.vn/x" `\n'
    + '-WebSession $session `\n'
    + '-Headers @{\n'
    + '  "Accept"="application/json"\n'
    + '  "Authorization"="Bearer eyJabc"\n'
    + '}';
  assert.deepEqual(parseRawHeaders(text), [
    { key: 'Accept', value: 'application/json' },
    { key: 'Authorization', value: 'Bearer eyJabc' },
    { key: 'Cookie', value: 'access_token=T1; client_id=tmf-api' },
  ]);
});

test('parseRawHeaders doc duoc Copy as fetch — object "headers"', () => {
  const text = 'fetch("https://a.vn/x", {\n'
    + '  "headers": {\n'
    + '    "accept": "application/json",\n'
    + '    "authorization": "Bearer eyJabc",\n'
    + '    "cookie": "access_token=T1"\n'
    + '  },\n'
    + '  "body": null,\n'
    + '  "method": "GET"\n'
    + '});';
  assert.deepEqual(parseRawHeaders(text), [
    { key: 'accept', value: 'application/json' },
    { key: 'authorization', value: 'Bearer eyJabc' },
    { key: 'cookie', value: 'access_token=T1' },
  ]);
});

test('parseRawHeaders bo qua ten header khong hop le thay vi sinh header rac', () => {
  assert.deepEqual(parseRawHeaders('"khong phai ten": v'), []);
});

test('parseRawHeaders khong nham cac khoa khac trong Copy as fetch thanh header', () => {
  const text = 'fetch("https://a.vn/x", { "headers": { "accept": "x" }, "method": "GET", "mode": "cors" });';
  assert.deepEqual(parseRawHeaders(text), [{ key: 'accept', value: 'x' }]);
});
