import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig, buildRequests } from '../src/server/request-builder.js';

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function makeJwt(payload) {
  return `${b64url({ alg: 'RS256' })}.${b64url(payload)}.sig`;
}

function oracleAuth(over = {}) {
  const token = makeJwt({
    individual_id: 'ind-1', preferred_username: 'user@vnp.vn', exp: Math.floor(Date.now() / 1000) + 3600,
  });
  return {
    id: 'a1', name: 'PROD', role: 'core_donvixuly',
    curlRaw: `curl 'https://x.vn' -b 'access_token=${token}'`,
    ...over,
  };
}

function authOver(patch = {}) {
  return { id: 'a1', name: 'Default', curlRaw: '', role: '', ...patch };
}

function baseConfig(over = {}) {
  return {
    domain: 'https://abc.vn',
    auths: [authOver({ curlRaw: 'Authorization: Bearer TOKEN123' })],
    runFilter: { methods: [], msisdnPatterns: [], authIds: [] },
    dateRange: { from: '25/03/2026', to: '01/04/2026' },
    dateFormat: 'ddMMyyyy',
    msisdns: ['0912345678', '0913000111'],
    endpoints: [
      { id: 'ep_1', enabled: true, method: 'GET', attachMsisdn: true,
        pathTemplate: '/query/abc-information/{*}', queryParams: [], headers: [] }
    ],
    globalQueryParams: [
      { key: 'fromDate', value: '{{fromDate}}', enabled: true },
      { key: 'toDate', value: '{{toDate}}', enabled: true }
    ],
    globalHeaders: [],
    advanced: { workerCount: 4, timeoutMs: 30000 },
    ...over,
  };
}

test('validateConfig chap nhan config hop le', () => {
  assert.deepEqual(validateConfig(baseConfig()), []);
});

test('validateConfig bat domain sai', () => {
  const errs = validateConfig(baseConfig({ domain: 'abc.vn' }));
  assert.equal(errs.length, 1);
  assert.equal(errs[0].field, 'domain');
});

test('validateConfig bat khi danh sach endpoint rong', () => {
  const cfg = baseConfig();
  cfg.endpoints = [];
  cfg.commonEndpointList = [];
  const errs = validateConfig(cfg);
  assert.ok(errs.some((e) => e.field === 'endpoints'));
});

test('validateConfig KHONG bat khi endpoint bi bo tick — checkbox khong thu hep pham vi chay', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].enabled = false;
  const errs = validateConfig(cfg);
  assert.ok(!errs.some((e) => e.field === 'endpoints'));
});

test('validateConfig bat daterange sai', () => {
  const errs = validateConfig(baseConfig({ dateRange: { from: '01/04/2026', to: '25/03/2026' } }));
  assert.ok(errs.some((e) => e.field === 'dateRange'));
});

test('validateConfig bat path khong bat dau bang gach cheo', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].pathTemplate = 'query/abc';
  const errs = validateConfig(cfg);
  assert.ok(errs.some((e) => e.field === 'endpoint:ep_1'));
});

test('buildRequests sinh ma tran endpoint x msisdn', () => {
  const cfg = baseConfig();
  cfg.endpoints.push({ id: 'ep_2', enabled: true, method: 'GET', attachMsisdn: true,
    pathTemplate: '/query/other', queryParams: [], headers: [] });
  const reqs = buildRequests(cfg);
  assert.equal(reqs.length, 4);
  assert.deepEqual(reqs.map((r) => r.index), [1, 2, 3, 4]);
});

test('buildRequests van dung endpoint bi bo tick — checkbox khong thu hep pham vi chay', () => {
  const cfg = baseConfig();
  cfg.endpoints.push({ id: 'ep_2', enabled: false, method: 'GET', attachMsisdn: true,
    pathTemplate: '/query/other', queryParams: [], headers: [] });
  assert.equal(buildRequests(cfg).length, 4);
});

test('buildRequests dung URL day du dung thu tu query', () => {
  const reqs = buildRequests(baseConfig());
  assert.equal(
    reqs[0].url,
    'https://abc.vn/query/abc-information/0912345678?fromDate=25032026&toDate=01042026'
  );
});

test('buildRequests bo dau gach cheo thua o cuoi domain', () => {
  const reqs = buildRequests(baseConfig({ domain: 'https://abc.vn/' }));
  assert.match(reqs[0].url, /^https:\/\/abc\.vn\/query\//);
});

test('buildRequests tu them Authorization tu cURL cua auth profile', () => {
  const reqs = buildRequests(baseConfig());
  assert.equal(reqs[0].headers.Authorization, 'Bearer TOKEN123');
});

// Auth gio la mot cURL day du (khong con "mode fields" rieng), nen tham gia
// merge headers CUNG vi tri voi cach cURL luon hoat dong truoc day — header
// cua auth thang HEADERS chung neu trung ten. Endpoint van la cap cao nhat
// (xem test rieng ben duoi).
test('Authorization tu cURL cua auth thang Authorization khai o HEADERS chung', () => {
  const cfg = baseConfig({ globalHeaders: [{ key: 'Authorization', value: 'Basic abc', enabled: true }] });
  assert.equal(buildRequests(cfg)[0].headers.Authorization, 'Bearer TOKEN123');
});

test('Authorization khai rieng o endpoint van thang cURL cua auth', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].headers = [{ key: 'Authorization', value: 'Basic from-endpoint', enabled: true }];
  assert.equal(buildRequests(cfg)[0].headers.Authorization, 'Basic from-endpoint');
});

test('buildRequests cho endpoint param de len global param', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].queryParams = [{ key: 'fromDate', value: '01011999', enabled: true }];
  const reqs = buildRequests(cfg);
  assert.equal(reqs[0].queryParams.fromDate, '01011999');
  assert.equal(reqs[0].queryParams.toDate, '01042026');
});

test('buildRequests bo qua param bi tat', () => {
  const cfg = baseConfig();
  cfg.globalQueryParams[1].enabled = false;
  const reqs = buildRequests(cfg);
  assert.equal(reqs[0].queryParams.toDate, undefined);
});

test('buildRequests ghi lai bien khong resolve duoc', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].pathTemplate = '/query/{{unknownVar}}/abc';
  const reqs = buildRequests(cfg);
  assert.deepEqual(reqs[0].unresolved, ['unknownVar']);
});

test('buildRequests ap dung dateFormat khac', () => {
  const reqs = buildRequests(baseConfig({ dateFormat: 'yyyy-MM-dd' }));
  assert.equal(reqs[0].queryParams.fromDate, '2026-03-25');
});

test('buildRequests mang ca endpointName lan pathTemplate', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].name = 'Tra cuu thue bao';
  const reqs = buildRequests(cfg);
  assert.equal(reqs[0].endpointName, 'Tra cuu thue bao');
  assert.equal(reqs[0].pathTemplate, '/query/abc-information/{*}');
});

test('buildRequests de endpointName rong khi endpoint khong co ten', () => {
  const reqs = buildRequests(baseConfig());
  assert.equal(reqs[0].endpointName, '');
  assert.equal(reqs[0].pathTemplate, '/query/abc-information/{*}');
});

test('buildRequests chi gan msisdn va không gan globalQueryParams khi endpoint khong co {*}', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].pathTemplate = '/query/abc-information';
  const reqs = buildRequests(cfg);
  assert.equal(reqs.length, 2);
  assert.equal(
    reqs[0].url,
    'https://abc.vn/query/abc-information/0912345678',
  );
  assert.equal(reqs[1].msisdn, '0913000111');
});

test('buildRequests noi msisdn vao cuoi path va gan globalQueryParams khi path co {*}', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].pathTemplate = '/query/abc-information/{*}';
  assert.equal(
    buildRequests(cfg)[0].url,
    'https://abc.vn/query/abc-information/0912345678?fromDate=25032026&toDate=01042026',
  );
});

test('buildRequests ghep query rieng sau dau sao truoc query global', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].pathTemplate = '/query/abc-information/{*}?type=PREPAID&limit=10';
  assert.equal(
    buildRequests(cfg)[0].url,
    'https://abc.vn/query/abc-information/0912345678'
    + '?type=PREPAID&limit=10&fromDate=25032026&toDate=01042026',
  );
});

test('buildRequests cho query rieng de len query global khi trung key', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].pathTemplate = '/query/abc-information/{*}?fromDate=01011999';
  const reqs = buildRequests(cfg);
  assert.equal(reqs[0].queryParams.fromDate, '01011999');
  assert.equal(reqs[0].queryParams.toDate, '01042026');
});

test('buildRequests resolve bien trong query rieng', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].pathTemplate = '/query/abc-information/{*}?from={{fromDate}}';
  assert.equal(buildRequests(cfg)[0].queryParams.from, '25032026');
});

test('buildRequests giu cu phap msisdn cu va khong noi them o cuoi', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].pathTemplate = '/query/abc-information/:msisdn/detail';
  assert.equal(
    buildRequests(cfg)[0].url,
    'https://abc.vn/query/abc-information/0912345678/detail',
  );
});

test('buildRequests chay 1 request khi attachMsisdn false', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].attachMsisdn = false;
  cfg.endpoints[0].pathTemplate = '/system/health';
  const reqs = buildRequests(cfg);
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0].msisdn, null);
  assert.deepEqual(reqs[0].pathParams, {});
  assert.equal(reqs[0].url, 'https://abc.vn/system/health');
});

test('buildRequests coi endpoint thieu attachMsisdn la true', () => {
  const cfg = baseConfig();
  delete cfg.endpoints[0].attachMsisdn;
  assert.equal(buildRequests(cfg).length, 2);
});

test('validateConfig bat endpoint can msisdn nhung danh sach rong', () => {
  const errs = validateConfig(baseConfig({ msisdns: [] }));
  assert.ok(errs.some((e) => e.field === 'endpoint:ep_1'));
});

test('validateConfig cho qua endpoint attachMsisdn false du danh sach rong', () => {
  const cfg = baseConfig({ msisdns: [] });
  cfg.endpoints[0].attachMsisdn = false;
  assert.deepEqual(validateConfig(cfg), []);
});

test('validateConfig chi kiem tra phan path, bo qua query rieng', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].pathTemplate = '/query/abc/{*}?note=co dau cach';
  assert.deepEqual(validateConfig(cfg), []);
});

/* ---------- cau hinh rieng endpoint: query ---------- */

test('buildRequests bo qua queryParams chung khi ep.attachCommonQuery la false', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].attachCommonQuery = false;
  const reqs = buildRequests(cfg);
  assert.equal(reqs[0].url, 'https://abc.vn/query/abc-information/0912345678');
  assert.deepEqual(reqs[0].queryParams, {});
});

test('buildRequests query endpoint (kv) de len query dinh trong path', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].pathTemplate = '/query/abc-information/{*}?page=1';
  cfg.endpoints[0].queryParams = [{ key: 'page', value: '99', enabled: true }, { key: 'size', value: '50', enabled: true }];
  const reqs = buildRequests(cfg);
  assert.equal(reqs[0].queryParams.page, '99');
  assert.equal(reqs[0].queryParams.size, '50');
  assert.equal(reqs[0].queryParams.fromDate, '25032026');
});

test('buildRequests query endpoint mode raw duoc parse thanh cap roi tron nhu kv', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].queryMode = 'raw';
  cfg.endpoints[0].queryRaw = 'page=1&fromDate=01011999';
  const reqs = buildRequests(cfg);
  assert.equal(reqs[0].queryParams.page, '1');
  assert.equal(reqs[0].queryParams.fromDate, '01011999');
  assert.equal(reqs[0].queryParams.toDate, '01042026');
});

test('buildRequests query endpoint bo qua dong tat', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].queryParams = [{ key: 'page', value: '99', enabled: false }];
  const reqs = buildRequests(cfg);
  assert.equal(reqs[0].queryParams.page, undefined);
});

test('buildRequests endpoint khong cau hinh rieng cho URL y het truoc spec', () => {
  const reqs = buildRequests(baseConfig());
  assert.equal(
    reqs[0].url,
    'https://abc.vn/query/abc-information/0912345678?fromDate=25032026&toDate=01042026',
  );
});

/* ---------- cau hinh rieng endpoint: headers ---------- */

test('buildRequests headers endpoint (kv) de len headers chung', () => {
  const cfg = baseConfig({ globalHeaders: [{ key: 'X-App', value: 'ccm', enabled: true }] });
  cfg.endpoints[0].headers = [{ key: 'X-App', value: 'endpoint-value', enabled: true }];
  const reqs = buildRequests(cfg);
  assert.equal(reqs[0].headers['X-App'], 'endpoint-value');
});

test('buildRequests headers endpoint mode raw parse va tron dung', () => {
  const cfg = baseConfig({ globalHeaders: [{ key: 'Accept', value: 'text/plain', enabled: true }] });
  cfg.endpoints[0].headerMode = 'raw';
  cfg.endpoints[0].headerRaw = 'X-Note: ok\nAccept: application/json';
  const reqs = buildRequests(cfg);
  assert.equal(reqs[0].headers['X-Note'], 'ok');
  assert.equal(reqs[0].headers.Accept, 'application/json');
});

/* ---------- cau hinh rieng endpoint: body ---------- */

test('buildRequests mac dinh body la {} cho POST khi chua cau hinh body', () => {
  const cfg = baseConfig({
    endpoints: [{ id: 'e1', method: 'POST', pathTemplate: '/api/test/{*}', enabled: true }],
  });
  const reqs = buildRequests(cfg);
  assert.equal(reqs[0].body, '{}');
  assert.equal(reqs[0].headers['Content-Type'], 'application/json');
});

test('buildRequests body mode none khong gui body cho GET', () => {
  const cfg = baseConfig();
  assert.equal(buildRequests(cfg)[0].body, null);
});

test('buildRequests body mode json gui nguyen chuoi', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].method = 'POST';
  cfg.endpoints[0].bodyMode = 'json';
  cfg.endpoints[0].bodyRaw = '{"msisdn":"{{msisdn}}"}';
  const reqs = buildRequests(cfg);
  assert.equal(reqs[0].body, '{"msisdn":"0912345678"}');
});

test('buildRequests body mode text gui nguyen chuoi khong resolve JSON', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].method = 'POST';
  cfg.endpoints[0].bodyMode = 'text';
  cfg.endpoints[0].bodyRaw = 'hello {{msisdn}}';
  const reqs = buildRequests(cfg);
  assert.equal(reqs[0].body, 'hello 0912345678');
});

test('buildRequests body mode kv dung json object, bo dong tat, key trung lay dong sau', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].method = 'POST';
  cfg.endpoints[0].bodyMode = 'kv';
  cfg.endpoints[0].bodyParams = [
    { key: 'msisdn', value: '{{msisdn}}', enabled: true },
    { key: 'skip', value: 'x', enabled: false },
  ];
  const reqs = buildRequests(cfg);
  assert.equal(reqs[0].body, JSON.stringify({ msisdn: '0912345678' }));
});

test('buildRequests body ghi lai bien thieu vao unresolved', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].method = 'POST';
  cfg.endpoints[0].bodyMode = 'text';
  cfg.endpoints[0].bodyRaw = '{{unknownVar}}';
  const reqs = buildRequests(cfg);
  assert.deepEqual(reqs[0].unresolved, ['unknownVar']);
});

/* ---------- BODY CHUNG (fallback khi endpoint de None) ---------- */

test('buildRequests dung body chung (kv) khi endpoint de bodyMode none', () => {
  const cfg = baseConfig({
    globalBodyMode: 'kv',
    globalBodyParams: [{ key: 'msisdn', value: '{{msisdn}}', enabled: true }],
  });
  cfg.endpoints[0].method = 'POST';
  const reqs = buildRequests(cfg);
  assert.equal(reqs[0].body, JSON.stringify({ msisdn: '0912345678' }));
});

test('buildRequests dung body chung (raw) khi endpoint de bodyMode none', () => {
  const cfg = baseConfig({ globalBodyMode: 'raw', globalBodyRaw: 'hello {{msisdn}}' });
  cfg.endpoints[0].method = 'POST';
  const reqs = buildRequests(cfg);
  assert.equal(reqs[0].body, 'hello 0912345678');
});

test('buildRequests endpoint tu khai body thi bo qua body chung, khong cong don', () => {
  const cfg = baseConfig({ globalBodyMode: 'kv', globalBodyParams: [{ key: 'a', value: '1', enabled: true }] });
  cfg.endpoints[0].method = 'POST';
  cfg.endpoints[0].bodyMode = 'kv';
  cfg.endpoints[0].bodyParams = [{ key: 'msisdn', value: '{{msisdn}}', enabled: true }];
  const reqs = buildRequests(cfg);
  assert.equal(reqs[0].body, JSON.stringify({ msisdn: '0912345678' }));
});

test('buildRequests khong gui body chung cho method GET', () => {
  const cfg = baseConfig({ globalBodyMode: 'raw', globalBodyRaw: '{"a":1}' });
  const reqs = buildRequests(cfg);
  assert.equal(reqs[0].body, null);
});

test('buildRequests globalBodyMode none thi khong anh huong gi (mac dinh cu)', () => {
  const cfg = baseConfig();
  assert.equal(buildRequests(cfg)[0].body, null);
});

test('buildRequests Content-Type application/json khi dung body chung kv', () => {
  const cfg = baseConfig({
    globalBodyMode: 'kv',
    globalBodyParams: [{ key: 'a', value: '1', enabled: true }],
  });
  cfg.endpoints[0].method = 'POST';
  assert.equal(buildRequests(cfg)[0].headers['Content-Type'], 'application/json');
});

/* ---------- Content-Type tu dat ---------- */

test('buildRequests Content-Type tu dat application/json cho bodyMode json', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].method = 'POST';
  cfg.endpoints[0].bodyMode = 'json';
  cfg.endpoints[0].bodyRaw = '{}';
  assert.equal(buildRequests(cfg)[0].headers['Content-Type'], 'application/json');
});

test('buildRequests Content-Type tu dat application/json cho bodyMode kv', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].method = 'POST';
  cfg.endpoints[0].bodyMode = 'kv';
  cfg.endpoints[0].bodyParams = [{ key: 'a', value: '1', enabled: true }];
  assert.equal(buildRequests(cfg)[0].headers['Content-Type'], 'application/json');
});

test('buildRequests Content-Type tu dat text/plain cho bodyMode text', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].method = 'POST';
  cfg.endpoints[0].bodyMode = 'text';
  cfg.endpoints[0].bodyRaw = 'hello';
  assert.equal(buildRequests(cfg)[0].headers['Content-Type'], 'text/plain');
});

test('buildRequests Content-Type khong ghi de khi da khai o global', () => {
  const cfg = baseConfig({ globalHeaders: [{ key: 'content-type', value: 'application/xml', enabled: true }] });
  cfg.endpoints[0].method = 'POST';
  cfg.endpoints[0].bodyMode = 'json';
  cfg.endpoints[0].bodyRaw = '{}';
  assert.equal(buildRequests(cfg)[0].headers['content-type'], 'application/xml');
});

test('buildRequests Content-Type khong ghi de khi da khai o endpoint', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].method = 'POST';
  cfg.endpoints[0].bodyMode = 'json';
  cfg.endpoints[0].bodyRaw = '{}';
  cfg.endpoints[0].headers = [{ key: 'Content-Type', value: 'application/vnd.api+json', enabled: true }];
  assert.equal(buildRequests(cfg)[0].headers['Content-Type'], 'application/vnd.api+json');
});

test('buildRequests bodyMode none khong them Content-Type', () => {
  const reqs = buildRequests(baseConfig());
  assert.equal(reqs[0].headers['Content-Type'], undefined);
});

/* ---------- validateConfig: hai loi moi ---------- */

test('validateConfig bat body JSON sai cu phap', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].method = 'POST';
  cfg.endpoints[0].bodyMode = 'json';
  cfg.endpoints[0].bodyRaw = '{invalid';
  const errs = validateConfig(cfg);
  assert.ok(errs.some((e) => e.field === 'endpoint:ep_1' && /Body JSON/.test(e.message)));
});

test('validateConfig cho qua body JSON hop le du chua bien chua resolve', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].method = 'POST';
  cfg.endpoints[0].bodyMode = 'json';
  cfg.endpoints[0].bodyRaw = '{"m":"{{msisdn}}"}';
  assert.deepEqual(validateConfig(cfg), []);
});

test('validateConfig cho qua bodyMode json khi bodyRaw rong', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].method = 'POST';
  cfg.endpoints[0].bodyMode = 'json';
  cfg.endpoints[0].bodyRaw = '';
  assert.deepEqual(validateConfig(cfg), []);
});

test('validateConfig bat GET kem body', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].bodyMode = 'text';
  cfg.endpoints[0].bodyRaw = 'x';
  const errs = validateConfig(cfg);
  assert.ok(errs.some((e) => e.field === 'endpoint:ep_1' && /GET không gửi được body/.test(e.message)));
});

test('validateConfig cho qua POST kem body', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].method = 'POST';
  cfg.endpoints[0].bodyMode = 'text';
  cfg.endpoints[0].bodyRaw = 'x';
  assert.deepEqual(validateConfig(cfg), []);
});

/* ---------- cookie tu cURL cua auth ---------- */

test('buildRequests tu them Cookie tu cURL cua auth', () => {
  const cfg = baseConfig({ auths: [authOver({ curlRaw: 'Cookie: JSESSIONID=abc123; foo=bar' })] });
  assert.equal(buildRequests(cfg)[0].headers.Cookie, 'JSESSIONID=abc123; foo=bar');
});

test('buildRequests khong them Cookie khi cURL cua auth khong khai', () => {
  const reqs = buildRequests(baseConfig());
  assert.equal(reqs[0].headers.Cookie, undefined);
});

test('Cookie tu cURL cua auth thang Cookie khai o HEADERS chung', () => {
  const cfg = baseConfig({
    auths: [authOver({ curlRaw: 'Cookie: JSESSIONID=abc123' })],
    globalHeaders: [{ key: 'Cookie', value: 'session=from-global', enabled: true }],
  });
  assert.equal(buildRequests(cfg)[0].headers.Cookie, 'JSESSIONID=abc123');
});

test('Cookie khai rieng o endpoint van thang Cookie tu cURL cua auth', () => {
  const cfg = baseConfig({ auths: [authOver({ curlRaw: 'Cookie: JSESSIONID=abc123' })] });
  cfg.endpoints[0].headers = [{ key: 'cookie', value: 'session=from-endpoint', enabled: true }];
  assert.equal(buildRequests(cfg)[0].headers.cookie, 'session=from-endpoint');
});

/* ---------- header mac dinh kieu trinh duyet ---------- */

test('buildRequests tu them bo header trinh duyet', () => {
  const h = buildRequests(baseConfig())[0].headers;
  assert.equal(h.Accept, 'application/json, text/plain, */*');
  assert.equal(h['Accept-Language'], 'en,vi;q=0.9');
  assert.match(h['User-Agent'], /^Mozilla\/5\.0 /);
  assert.equal(h['Sec-Fetch-Dest'], 'empty');
  assert.equal(h['Sec-Fetch-Mode'], 'cors');
  assert.equal(h['Sec-Fetch-Site'], 'cross-site');
  assert.equal(h['Sec-Fetch-Storage-Access'], 'active');
  assert.equal(h['sec-ch-ua-mobile'], '?0');
});

test('buildRequests tu them refresh_token tu cURL cua auth', () => {
  const h = buildRequests(baseConfig({ auths: [authOver({ curlRaw: 'refresh_token: eyJrefresh.payload.sig' })] }))[0].headers;
  assert.equal(h.refresh_token, 'eyJrefresh.payload.sig');
});

test('buildRequests khong them refresh_token khi cURL cua auth khong khai', () => {
  assert.equal(buildRequests(baseConfig())[0].headers.refresh_token, undefined);
});

test('refresh_token tu cURL cua auth thang refresh_token khai o HEADERS chung', () => {
  const cfg = baseConfig({
    auths: [authOver({ curlRaw: 'refresh_token: tu-o-nhap' })],
    globalHeaders: [{ key: 'refresh_token', value: 'tu-bang-headers', enabled: true }],
  });
  assert.equal(buildRequests(cfg)[0].headers.refresh_token, 'tu-o-nhap');
});

test('buildRequests dat X-Current-Url theo origin cua tool', () => {
  const h = buildRequests(baseConfig({ origin: 'http://localhost:9000' }))[0].headers;
  assert.equal(h['X-Current-Url'], 'http://localhost:9000/');
});

/* ---------- HEADERS chung: che do dan cURL ---------- */

const CURL_PASTE = `curl 'https://api-x.abc.vn/Engine/query/ir/0888002716?fromDate=30062026' \\
  -H 'Accept: application/json, text/plain, */*' \\
  -H 'Authorization: Bearer tu-curl' \\
  -b 'access_token=aaa; id_token=bbb' \\
  -H 'Sec-Fetch-Storage-Access: active' \\
  -H 'X-Current-Url: http://localhost:9000/#/ccos/Phone=0888002716' \\
  -H 'refresh_token: eyJrefresh.sig'`;

test('buildRequests doc headers chung tu lenh cURL dan vao', () => {
  const cfg = baseConfig({ globalHeaderMode: 'raw', globalHeaderRaw: CURL_PASTE });
  const h = buildRequests(cfg)[0].headers;

  assert.equal(h.Accept, 'application/json, text/plain, */*');
  assert.equal(h.refresh_token, 'eyJrefresh.sig');
  assert.equal(h['Sec-Fetch-Storage-Access'], 'active');
  assert.equal(h['X-Current-Url'], 'http://localhost:9000/#/ccos/Phone=0888002716');
  assert.equal(h.Cookie, 'access_token=aaa; id_token=bbb');
});

test('URL trong lenh cURL dan vao khong bien thanh header', () => {
  const cfg = baseConfig({ globalHeaderMode: 'raw', globalHeaderRaw: CURL_PASTE });
  const keys = Object.keys(buildRequests(cfg)[0].headers).map((k) => k.toLowerCase());
  assert.ok(!keys.includes('https'), 'khong duoc co header ten https');
  assert.ok(!keys.includes('curl'));
});

test('Authorization tu cURL cua auth thang Authorization cua cURL dan o HEADERS chung', () => {
  const cfg = baseConfig({
    globalHeaderMode: 'raw', globalHeaderRaw: CURL_PASTE,
    auths: [authOver({ curlRaw: 'Authorization: Bearer TU-AUTH-PROFILE' })],
  });
  assert.equal(buildRequests(cfg)[0].headers.Authorization, 'Bearer TU-AUTH-PROFILE');
});

test('cURL dan o HEADERS chung dung khi auth profile khong khai Authorization', () => {
  const cfg = baseConfig({
    globalHeaderMode: 'raw', globalHeaderRaw: CURL_PASTE,
    auths: [authOver({ curlRaw: '' })],
  });
  assert.equal(buildRequests(cfg)[0].headers.Authorization, 'Bearer tu-curl');
});

test('che do raw bo qua bang key-value cua headers chung', () => {
  const cfg = baseConfig({
    globalHeaderMode: 'raw',
    globalHeaderRaw: 'X-Tu-Raw: 1',
    globalHeaders: [{ key: 'X-Tu-Bang', value: '1', enabled: true }],
  });
  const h = buildRequests(cfg)[0].headers;
  assert.equal(h['X-Tu-Raw'], '1');
  assert.equal(h['X-Tu-Bang'], undefined);
});

test('mac dinh khong khai globalHeaderMode van dung bang key-value', () => {
  const cfg = baseConfig({ globalHeaders: [{ key: 'X-Tu-Bang', value: '1', enabled: true }] });
  assert.equal(buildRequests(cfg)[0].headers['X-Tu-Bang'], '1');
});

test('headers rieng endpoint van de len headers chung che do raw', () => {
  const cfg = baseConfig({ globalHeaderMode: 'raw', globalHeaderRaw: 'Accept: application/json' });
  cfg.endpoints[0].headers = [{ key: 'Accept', value: 'text/csv', enabled: true }];
  assert.equal(buildRequests(cfg)[0].headers.Accept, 'text/csv');
});

test('buildRequests cho khai de X-Current-Url bang URL trang that', () => {
  const cfg = baseConfig({
    origin: 'http://localhost:9000',
    globalHeaders: [{ key: 'X-Current-Url', value: 'http://localhost:9000/#/ccos/widget', enabled: true }],
  });
  assert.equal(buildRequests(cfg)[0].headers['X-Current-Url'], 'http://localhost:9000/#/ccos/widget');
});

test('buildRequests dat Origin va Referer tu config.origin', () => {
  const h = buildRequests(baseConfig({ origin: 'http://localhost:9000' }))[0].headers;
  assert.equal(h.Origin, 'http://localhost:9000');
  assert.equal(h.Referer, 'http://localhost:9000/');
});

test('buildRequests cat dau gach cheo thua o cuoi origin', () => {
  const h = buildRequests(baseConfig({ origin: 'http://localhost:9000/' }))[0].headers;
  assert.equal(h.Origin, 'http://localhost:9000');
  assert.equal(h.Referer, 'http://localhost:9000/');
});

test('buildRequests khong dat Origin/Referer khi config.origin rong', () => {
  const h = buildRequests(baseConfig())[0].headers;
  assert.equal(h.Origin, undefined);
  assert.equal(h.Referer, undefined);
});

test('header nguoi dung khai de len header mac dinh, khong phan biet hoa thuong', () => {
  const cfg = baseConfig({
    origin: 'http://localhost:9000',
    globalHeaders: [
      { key: 'accept', value: 'application/xml', enabled: true },
      { key: 'user-agent', value: 'my-agent/1.0', enabled: true },
      { key: 'Origin', value: 'https://khac.vn', enabled: true },
    ],
  });
  const h = buildRequests(cfg)[0].headers;
  assert.equal(h.accept, 'application/xml');
  assert.equal(h.Accept, undefined, 'khong duoc them ban trung hoa thuong khac');
  assert.equal(h['user-agent'], 'my-agent/1.0');
  assert.equal(h['User-Agent'], undefined);
  assert.equal(h.Origin, 'https://khac.vn');
});

test('header rieng cua endpoint cung de len header mac dinh', () => {
  const cfg = baseConfig({ origin: 'http://localhost:9000' });
  cfg.endpoints[0].headers = [{ key: 'Accept', value: 'text/csv', enabled: true }];
  const h = buildRequests(cfg)[0].headers;
  assert.equal(h.Accept, 'text/csv');
});

/* ---------- nhieu auth profile ---------- */

const TWO_AUTHS = [
  { id: 'a1', name: 'PROD', curlRaw: 'Authorization: Bearer T1\nCookie: C1', role: '' },
  { id: 'a2', name: 'UAT', curlRaw: 'Authorization: Bearer T2\nCookie: C2', role: '' },
];

test('buildRequests nhan them so profile', () => {
  const reqs = buildRequests(baseConfig({ auths: TWO_AUTHS, runFilter: { methods: [], msisdnPatterns: [], authIds: ['a1', 'a2'] } }));
  assert.equal(reqs.length, 4);
  assert.deepEqual(reqs.map((r) => r.index), [1, 2, 3, 4]);
});

test('buildRequests xep request cung profile lien khoi', () => {
  const reqs = buildRequests(baseConfig({ auths: TWO_AUTHS, runFilter: { methods: [], msisdnPatterns: [], authIds: ['a1', 'a2'] } }));
  assert.deepEqual(reqs.map((r) => r.authName), ['PROD', 'PROD', 'UAT', 'UAT']);
});

test('buildRequests gan dung credential cua tung profile', () => {
  const reqs = buildRequests(baseConfig({ auths: TWO_AUTHS, runFilter: { methods: [], msisdnPatterns: [], authIds: ['a1', 'a2'] } }));
  assert.equal(reqs[0].headers.Authorization, 'Bearer T1');
  assert.equal(reqs[0].headers.Cookie, 'C1');
  assert.equal(reqs[2].headers.Authorization, 'Bearer T2');
  assert.equal(reqs[2].headers.Cookie, 'C2');
});

test('buildRequests gan authId va authName vao request', () => {
  const reqs = buildRequests(baseConfig({ auths: TWO_AUTHS, runFilter: { methods: [], msisdnPatterns: [], authIds: ['a1', 'a2'] } }));
  assert.equal(reqs[0].authId, 'a1');
  assert.equal(reqs[3].authName, 'UAT');
});

test('buildRequests dua het header trong chuoi cURL cua auth vao request', () => {
  const cfg = baseConfig({
    auths: [{
      id: 'a1', name: 'CURL',
      curlRaw: "curl 'https://api-abc.vn/x' -H 'Authorization: Bearer FROMCURL' -H 'X-Tenant: vnpt'",
    }],
  });
  const reqs = buildRequests(cfg);
  assert.equal(reqs[0].headers.Authorization, 'Bearer FROMCURL');
  assert.equal(reqs[0].headers['X-Tenant'], 'vnpt');
});

test('header rieng cua endpoint thang header cua profile', () => {
  const cfg = baseConfig({
    auths: [{ id: 'a1', name: 'C', curlRaw: "curl 'https://x' -H 'X-Tenant: from-profile'" }],
  });
  cfg.endpoints[0].headers = [{ key: 'X-Tenant', value: 'from-endpoint', enabled: true }];
  const reqs = buildRequests(cfg);
  assert.equal(reqs[0].headers['X-Tenant'], 'from-endpoint');
});

test('header cua profile thang HEADERS chung', () => {
  const cfg = baseConfig({
    auths: [{ id: 'a1', name: 'C', curlRaw: "curl 'https://x' -H 'X-Tenant: from-profile'" }],
    globalHeaders: [{ key: 'X-Tenant', value: 'from-global', enabled: true }],
  });
  const reqs = buildRequests(cfg);
  assert.equal(reqs[0].headers['X-Tenant'], 'from-profile');
});

test('buildRequests loc endpoint theo method', () => {
  const cfg = baseConfig({ runFilter: { methods: ['POST'], msisdnPatterns: [], authIds: [] } });
  cfg.endpoints.push({ id: 'ep_2', enabled: true, method: 'POST', attachMsisdn: true,
    pathTemplate: '/create', queryParams: [], headers: [] });
  const reqs = buildRequests(cfg);
  assert.equal(reqs.length, 2);
  assert.ok(reqs.every((r) => r.method === 'POST'));
});

test('buildRequests loc msisdn theo pattern include', () => {
  const cfg = baseConfig({ runFilter: { methods: [], msisdnPatterns: ['0913'], authIds: [] } });
  const reqs = buildRequests(cfg);
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0].msisdn, '0913000111');
});

test('buildRequests chi chay profile duoc chon', () => {
  const cfg = baseConfig({
    auths: TWO_AUTHS,
    runFilter: { methods: [], msisdnPatterns: [], authIds: ['a2'] },
  });
  const reqs = buildRequests(cfg);
  assert.equal(reqs.length, 2);
  assert.ok(reqs.every((r) => r.authName === 'UAT'));
});

test('filter loai het endpoint thi tra mang rong', () => {
  const cfg = baseConfig({ runFilter: { methods: ['DELETE'], msisdnPatterns: [], authIds: [] } });
  assert.deepEqual(buildRequests(cfg), []);
});

test('mot profile va filter rong cho ket qua y het truoc spec', () => {
  const reqs = buildRequests(baseConfig());
  assert.equal(reqs.length, 2);
  assert.equal(reqs[0].headers.Authorization, 'Bearer TOKEN123');
});

/* ---------- validateConfig: auth profile ---------- */

test('validateConfig bat khi khong co auth profile nao', () => {
  const errs = validateConfig(baseConfig({ auths: [] }));
  assert.ok(errs.some((e) => e.field === 'auths'));
});

test('validateConfig bat auth profile thieu ten', () => {
  const errs = validateConfig(baseConfig({
    auths: [{ id: 'a1', name: '', curlRaw: '' }],
  }));
  assert.ok(errs.some((e) => e.field === 'auth:a1'));
});

test('validateConfig coi ten chi co khoang trang la rong', () => {
  const errs = validateConfig(baseConfig({
    auths: [{ id: 'a1', name: '   ', curlRaw: '' }],
  }));
  assert.ok(errs.some((e) => e.field === 'auth:a1'));
});

test('validateConfig bat ten auth trung nhau', () => {
  const errs = validateConfig(baseConfig({ auths: [
    { id: 'a1', name: 'PROD', curlRaw: 'Authorization: Bearer T1' },
    { id: 'a2', name: 'PROD', curlRaw: 'Authorization: Bearer T2' },
  ] }));
  const dup = errs.filter((e) => e.message.includes('trùng'));
  assert.equal(dup.length, 2);
});

test('validateConfig khong coi PROD va prod la trung', () => {
  const errs = validateConfig(baseConfig({
    auths: [
      { id: 'a1', name: 'PROD', curlRaw: 'Authorization: Bearer T1' },
      { id: 'a2', name: 'prod', curlRaw: 'Authorization: Bearer T2' },
    ],
    runFilter: { methods: [], msisdnPatterns: [], authIds: ['a1', 'a2'] },
  }));
  assert.deepEqual(errs, []);
});

test('validateConfig bat filter khong khop endpoint nao', () => {
  const errs = validateConfig(baseConfig({
    runFilter: { methods: ['DELETE'], msisdnPatterns: [], authIds: [] },
  }));
  assert.ok(errs.some((e) => e.field === 'runFilter'));
});

test('validateConfig bat filter khong khop msisdn nao', () => {
  const errs = validateConfig(baseConfig({
    runFilter: { methods: [], msisdnPatterns: ['0777'], authIds: [] },
  }));
  assert.ok(errs.some((e) => e.field === 'runFilter'));
});

test('validateConfig bat filter khong khop auth nao', () => {
  const errs = validateConfig(baseConfig({
    auths: TWO_AUTHS,
    runFilter: { methods: [], msisdnPatterns: [], authIds: ['khong-ton-tai'] },
  }));
  assert.ok(errs.some((e) => e.field === 'runFilter'));
});

test('validateConfig khong bao loi khi authIds con it nhat mot id hop le', () => {
  const errs = validateConfig(baseConfig({
    runFilter: { methods: [], msisdnPatterns: [], authIds: ['a1', 'da-xoa'] },
  }));
  assert.deepEqual(errs, []);
});

test('buildRequests loc theo selectedSheet', () => {
  const cfg = baseConfig({
    selectedSheet: 'Sheet1',
    endpoints: [
      { id: 'ep_1', enabled: true, method: 'GET', attachMsisdn: true, pathTemplate: '/q1', sheetName: 'Sheet1' },
      { id: 'ep_2', enabled: true, method: 'GET', attachMsisdn: true, pathTemplate: '/q2', sheetName: 'Sheet2' },
    ]
  });
  const reqs = buildRequests(cfg);
  assert.equal(reqs.length, 2); // 2 msisdns for ep_1
  assert.ok(reqs.every((r) => r.endpointId === 'ep_1'));
});

test('buildRequests loc theo selectedSheet va cong them commonEndpoints', () => {
  const cfg = baseConfig({
    selectedSheet: 'Sheet1',
    endpoints: [
      { id: 'ep_1', enabled: true, method: 'GET', attachMsisdn: false, pathTemplate: '/q1/{*}', sheetName: 'Sheet1' },
      { id: 'ep_2', enabled: true, method: 'GET', attachMsisdn: false, pathTemplate: '/q2/{*}', sheetName: 'Sheet2' },
    ],
    commonEndpointList: [
      { kind: 'business', line: 'POST /common-post/{*}' },
      { kind: 'business', line: '/common-get/{*}' }
    ]
  });
  const reqs = buildRequests(cfg);
  // ep_1 (1 request) + common-post (1 request) + common-get (1 request) = 3 total requests
  assert.equal(reqs.length, 3);
  assert.equal(reqs[0].url, 'https://abc.vn/q1?fromDate=25032026&toDate=01042026');
  assert.equal(reqs[1].method, 'POST');
  assert.equal(reqs[1].url, 'https://abc.vn/common-post?fromDate=25032026&toDate=01042026');
  assert.equal(reqs[2].method, 'GET');
  assert.equal(reqs[2].url, 'https://abc.vn/common-get?fromDate=25032026&toDate=01042026');
});

test('buildRequests cho endpoint chung khong co msisdn placeholder chay 1 request duy nhat', () => {
  const cfg = baseConfig({
    selectedSheet: 'Sheet1',
    endpoints: [],
    commonEndpointList: [{ kind: 'business', line: 'GET /api/v1/health' }]
  });
  const reqs = buildRequests(cfg);
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0].url, 'https://abc.vn/api/v1/health');
});

test('validateConfig cho phep chi co commonEndpoints duoc nhap', () => {
  const cfg = baseConfig({
    endpoints: [],
    commonEndpointList: [{ kind: 'business', line: '/common-get' }]
  });
  const errs = validateConfig(cfg);
  // endpoints list is empty but commonEndpoints has valid path, so it should be valid
  assert.deepEqual(errs, []);
});

test('buildRequests bo qua commonEndpoints khi commonEndpointsEnabled la false', () => {
  const cfg = baseConfig({
    selectedSheet: 'Sheet1',
    endpoints: [
      { id: 'ep_1', enabled: true, method: 'GET', attachMsisdn: false, pathTemplate: '/q1/{*}', sheetName: 'Sheet1' },
      { id: 'ep_2', enabled: true, method: 'GET', attachMsisdn: false, pathTemplate: '/q2/{*}', sheetName: 'Sheet2' },
    ],
    commonEndpointList: [
      { kind: 'business', line: 'POST /common-post/{*}' },
      { kind: 'business', line: '/common-get/{*}' }
    ],
    commonEndpointsEnabled: false,
  });
  const reqs = buildRequests(cfg);
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0].url, 'https://abc.vn/q1?fromDate=25032026&toDate=01042026');
});

/* ---------- request oracle (checkPermission) — danh tinh tu cURL cua auth ---------- */

function oracleConfig(over = {}) {
  return baseConfig({
    auths: [oracleAuth()],
    endpoints: [{
      id: 'ep_1', enabled: true, method: 'GET', attachMsisdn: true,
      pathTemplate: '/query/abc-information/{*}', queryParams: [], headers: [],
      oracleFunction: '/ccm-troubleTicket-feedbackTicket',
    }],
    oracleTemplate: { line: 'POST /iam/engage/checkPermission' },
    ...over,
  });
}

test('buildOracleRequest dung body tu danh tinh cookie + role, khong co Authorization', () => {
  const reqs = buildRequests(oracleConfig());
  const { oracle } = reqs[0];

  assert.equal(oracle.error, undefined);
  assert.equal(oracle.method, 'POST');
  assert.equal(oracle.url, 'https://abc.vn/iam/engage/checkPermission');
  assert.equal(oracle.headers.Authorization, undefined);
  assert.match(oracle.headers.Cookie, /^access_token=/);

  const body = JSON.parse(oracle.body);
  assert.equal(body.permissionSpecification.function, '/ccm-troubleTicket-feedbackTicket');
  assert.equal(body.permissionSpecification.action, 'Read');
  assert.equal(body.user.role, 'core_donvixuly');
  assert.equal(body.user.id, 'ind-1');
  assert.equal(body.user.accountId, 'user@vnp.vn');
});

test('buildOracleRequest ACTION rong mac dinh Read', () => {
  const cfg = oracleConfig();
  const reqs = buildRequests(cfg);
  assert.equal(JSON.parse(reqs[0].oracle.body).permissionSpecification.action, 'Read');
});

test('buildOracleRequest ACTION co khai thi dung dung ACTION', () => {
  const cfg = oracleConfig();
  cfg.endpoints[0].oracleAction = 'Write';
  const reqs = buildRequests(cfg);
  assert.equal(JSON.parse(reqs[0].oracle.body).permissionSpecification.action, 'Write');
});

test('buildOracleRequest bao ORACLE_ROLE_MISSING khi auth chua khai role', () => {
  const cfg = oracleConfig({ auths: [oracleAuth({ role: '' })] });
  const reqs = buildRequests(cfg);
  assert.equal(reqs[0].oracle.error, 'ORACLE_ROLE_MISSING');
});

test('buildOracleRequest bao ORACLE_IDENTITY_MISSING khi cookie khong co access_token', () => {
  const cfg = oracleConfig({ auths: [oracleAuth({ curlRaw: "curl 'https://x.vn' -H 'X-Tenant: vnpt'" })] });
  const reqs = buildRequests(cfg);
  assert.equal(reqs[0].oracle.error, 'ORACLE_IDENTITY_MISSING');
});

test('endpoint khong khai oracleFunction thi khong sinh request oracle nao', () => {
  const cfg = oracleConfig();
  delete cfg.endpoints[0].oracleFunction;
  const reqs = buildRequests(cfg);
  assert.equal(reqs[0].oracle, null);
});

test('khong co oracleTemplate thi khong sinh request oracle du endpoint co function', () => {
  const cfg = oracleConfig({ oracleTemplate: null });
  const reqs = buildRequests(cfg);
  assert.equal(reqs[0].oracle, null);
});

test('oracleTemplate.line rong bao ORACLE_LINE_INVALID', () => {
  const cfg = oracleConfig({ oracleTemplate: { line: '' } });
  const reqs = buildRequests(cfg);
  assert.equal(reqs[0].oracle.error, 'ORACLE_LINE_INVALID');
});

test('request nghiep vu van chay binh thuong ngay ca khi oracle loi', () => {
  const cfg = oracleConfig({ auths: [oracleAuth({ role: '' })] });
  const reqs = buildRequests(cfg);
  assert.equal(reqs[0].oracle.error, 'ORACLE_ROLE_MISSING');
  assert.match(reqs[0].url, /^https:\/\/abc\.vn\/query\/abc-information\//);
});

/* ---------- cURL mau la KHUON: giu nguyen hinh dang request that ---------- */

// Tu dung request tu dau lam Origin/Referer/X-Current-Url roi ve origin cua
// chinh tool va Sec-Fetch-Site thanh 'cross-site' -> IAM sau WAF tra 401.
const ORACLE_CURL = `curl 'https://api-dev-oda.vnpt.vn/iam/engage/checkPermission' \\
  -H 'Accept-Language: en-US,en;q=0.9,vi;q=0.8' \\
  -H 'Connection: keep-alive' \\
  -H 'Origin: https://dev-oda.vnpt.vn' \\
  -H 'Referer: https://dev-oda.vnpt.vn/' \\
  -H 'Sec-Fetch-Site: same-site' \\
  -H 'X-Current-Url: https://dev-oda.vnpt.vn/#/ccos/coordination-management' \\
  -b 'access_token=CUA-NGUOI-DAN-KHUON; BIGipServerpool_x=1' \\
  --data-raw '{"@type":"CheckPermission","permissionSpecification":{"@type":"PermissionSpecification","function":"/cu","action":"Write"},"user":{"@type":"PartyRef","role":"role-cu","id":"id-cu","accountId":"acc-cu","extra":"giu-lai"}}'`;

const tplCfg = (over = {}) => oracleConfig({
  origin: 'http://localhost:9000',
  oracleTemplate: { line: 'POST /iam/engage/checkPermission', curlRaw: ORACLE_CURL },
  ...over,
});

test('cURL mau giu nguyen Origin/Referer/X-Current-Url/Sec-Fetch-Site cua app that', () => {
  const h = buildRequests(tplCfg())[0].oracle.headers;
  assert.equal(h.Origin, 'https://dev-oda.vnpt.vn');
  assert.equal(h.Referer, 'https://dev-oda.vnpt.vn/');
  assert.equal(h['X-Current-Url'], 'https://dev-oda.vnpt.vn/#/ccos/coordination-management');
  assert.equal(h['Sec-Fetch-Site'], 'same-site');
  assert.equal(h['Accept-Language'], 'en-US,en;q=0.9,vi;q=0.8');
  assert.equal(h.Connection, 'keep-alive');
});

test('cURL mau dung URL tuyet doi cua chinh no, khong ghep lai tu domain', () => {
  const o = buildRequests(tplCfg())[0].oracle;
  assert.equal(o.url, 'https://api-dev-oda.vnpt.vn/iam/engage/checkPermission');
  assert.equal(o.method, 'POST');
});

test('Cookie cua khuon bi thay bang danh tinh auth, khong giu cua nguoi dan', () => {
  const h = buildRequests(tplCfg())[0].oracle.headers;
  assert.ok(!h.Cookie.includes('CUA-NGUOI-DAN-KHUON'));
  assert.ok(h.Cookie.includes('access_token='));
});

test('khoi user cua khuon bi doi sang danh tinh auth, field la duoc giu', () => {
  const body = JSON.parse(buildRequests(tplCfg())[0].oracle.body);
  assert.equal(body.user.role, 'core_donvixuly');
  assert.equal(body.user.id, 'ind-1');
  assert.equal(body.user.accountId, 'user@vnp.vn');
  assert.equal(body.user.extra, 'giu-lai', 'field la trong khoi user phai giu');
  assert.equal(body.user['@type'], 'PartyRef');
});

test('cot ACTION rong thi giu nguyen action cua cURL mau', () => {
  const body = JSON.parse(buildRequests(tplCfg())[0].oracle.body);
  assert.equal(body.permissionSpecification.action, 'Write');
});

test('cot ACTION co khai thi de len action cua cURL mau', () => {
  const cfg = tplCfg();
  cfg.endpoints[0].oracleAction = 'Read';
  const body = JSON.parse(buildRequests(cfg)[0].oracle.body);
  assert.equal(body.permissionSpecification.action, 'Read');
});

test('khuon co Authorization thi van bi bo — cURL checkPermission that khong gui header nay', () => {
  const cfg = tplCfg({
    oracleTemplate: {
      line: 'POST /iam/engage/checkPermission',
      curlRaw: ORACLE_CURL.replace("-H 'Connection: keep-alive'", "-H 'Authorization: Bearer CUA-NGUOI-DAN'"),
    },
  });
  assert.equal(buildRequests(cfg)[0].oracle.headers.Authorization, undefined);
});

test('cURL mau hong bao ORACLE_TEMPLATE_INVALID', () => {
  const cfg = tplCfg({ oracleTemplate: { line: 'POST /x', curlRaw: 'khong phai curl' } });
  assert.equal(buildRequests(cfg)[0].oracle.error, 'ORACLE_TEMPLATE_INVALID');
});


