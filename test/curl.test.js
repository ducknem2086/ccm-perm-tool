import test from 'node:test';
import assert from 'node:assert/strict';
import { toCurl, curlFilename } from '../public/js/shared/curl.js';

function record(over = {}) {
  return {
    index: 3,
    endpointName: 'Tra cứu thuê bao',
    msisdn: '0912345678',
    request: {
      method: 'GET',
      url: 'https://abc.vn/query/abc-information/0912345678?fromDate=25032026',
      headers: { Authorization: 'Bearer abc.def', Accept: 'application/json' },
      pathParams: {}, queryParams: {}, body: null,
    },
    ...over,
  };
}

test('toCurl sinh lenh dung dinh dang Postman', () => {
  assert.equal(toCurl(record()), [
    "curl --location --request GET 'https://abc.vn/query/abc-information/0912345678?fromDate=25032026'",
    "  --header 'Authorization: Bearer abc.def'",
    "  --header 'Accept: application/json'",
  ].join(' \\\n'));
});

test('toCurl khong them --data-raw khi body rong', () => {
  assert.ok(!toCurl(record()).includes('--data-raw'));
  assert.ok(!toCurl(record({ request: { ...record().request, body: '' } })).includes('--data-raw'));
});

test('toCurl them --data-raw cho body chuoi', () => {
  const cmd = toCurl(record({
    request: { ...record().request, method: 'post', body: '{"msisdn":"0912345678"}' },
  }));
  assert.match(cmd, /--request POST/);
  assert.ok(cmd.includes(`--data-raw '{"msisdn":"0912345678"}'`));
});

test('toCurl stringify body dang object', () => {
  const cmd = toCurl(record({ request: { ...record().request, body: { a: 1 } } }));
  assert.ok(cmd.includes(`--data-raw '{"a":1}'`));
});

test('toCurl dong nhay don trong gia tri theo quy tac shell', () => {
  const cmd = toCurl(record({
    request: { ...record().request, headers: { 'X-Note': "it's ok" } },
  }));
  assert.ok(cmd.includes(`--header 'X-Note: it'\\''s ok'`));
});

test('toCurl chiu duoc record thieu request', () => {
  assert.equal(toCurl({}), "curl --location --request GET ''");
});

test('curlFilename bo dau tieng Viet va ky tu la', () => {
  assert.equal(curlFilename(record()), 'curl-3-tra-cuu-thue-bao-0912345678.txt');
});

test('curlFilename bo qua phan rong', () => {
  assert.equal(curlFilename({ index: 7, endpointName: '', msisdn: null }), 'curl-7.txt');
});

test('curlFilename xu ly chu d gach ngang', () => {
  assert.equal(curlFilename({ index: 1, endpointName: 'Đăng ký gói' }), 'curl-1-dang-ky-goi.txt');
});
