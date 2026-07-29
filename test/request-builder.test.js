import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig, buildRequests } from '../src/server/request-builder.js';

function baseConfig(over = {}) {
  return {
    domain: 'https://abc.vn',
    token: 'TOKEN123',
    dateRange: { from: '25/03/2026', to: '01/04/2026' },
    dateFormat: 'ddMMyyyy',
    msisdns: ['0912345678', '0913000111'],
    endpoints: [
      { id: 'ep_1', enabled: true, method: 'GET',
        pathTemplate: '/query/abc-information/:msisdn', queryParams: [], headers: [] }
    ],
    globalQueryParams: [
      { key: 'fromDate', value: '{{fromDate}}', enabled: true },
      { key: 'toDate', value: '{{toDate}}', enabled: true }
    ],
    globalHeaders: [],
    advanced: { concurrency: 5, timeoutMs: 30000 },
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

test('validateConfig bat khi khong co endpoint nao bat', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].enabled = false;
  const errs = validateConfig(cfg);
  assert.ok(errs.some((e) => e.field === 'endpoints'));
});

test('validateConfig bat daterange sai', () => {
  const errs = validateConfig(baseConfig({ dateRange: { from: '01/04/2026', to: '25/03/2026' } }));
  assert.ok(errs.some((e) => e.field === 'dateRange'));
});

test('validateConfig bat endpoint dung msisdn nhung danh sach rong', () => {
  const errs = validateConfig(baseConfig({ msisdns: [] }));
  assert.ok(errs.some((e) => e.field === 'endpoint:ep_1'));
});

test('validateConfig bat path khong bat dau bang gach cheo', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].pathTemplate = 'query/abc';
  const errs = validateConfig(cfg);
  assert.ok(errs.some((e) => e.field === 'endpoint:ep_1'));
});

test('buildRequests sinh ma tran endpoint x msisdn', () => {
  const cfg = baseConfig();
  cfg.endpoints.push({ id: 'ep_2', enabled: true, method: 'GET',
    pathTemplate: '/query/other/:msisdn', queryParams: [], headers: [] });
  const reqs = buildRequests(cfg);
  assert.equal(reqs.length, 4);
  assert.deepEqual(reqs.map((r) => r.index), [1, 2, 3, 4]);
});

test('buildRequests bo qua endpoint bi tat', () => {
  const cfg = baseConfig();
  cfg.endpoints.push({ id: 'ep_2', enabled: false, method: 'GET',
    pathTemplate: '/query/other/:msisdn', queryParams: [], headers: [] });
  assert.equal(buildRequests(cfg).length, 2);
});

test('buildRequests sinh 1 request cho endpoint khong dung msisdn', () => {
  const cfg = baseConfig({ endpoints: [
    { id: 'ep_x', enabled: true, method: 'GET', pathTemplate: '/health', queryParams: [], headers: [] }
  ] });
  const reqs = buildRequests(cfg);
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0].msisdn, null);
  assert.deepEqual(reqs[0].pathParams, {});
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

test('buildRequests tu them Authorization tu token', () => {
  const reqs = buildRequests(baseConfig());
  assert.equal(reqs[0].headers.Authorization, 'Bearer TOKEN123');
});

test('buildRequests khong de token de len Authorization do nguoi dung khai', () => {
  const cfg = baseConfig({ globalHeaders: [{ key: 'Authorization', value: 'Basic abc', enabled: true }] });
  assert.equal(buildRequests(cfg)[0].headers.Authorization, 'Basic abc');
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
  cfg.endpoints[0].pathTemplate = '/query/{{unknownVar}}/:msisdn';
  const reqs = buildRequests(cfg);
  assert.deepEqual(reqs[0].unresolved, ['unknownVar']);
});

test('buildRequests ap dung dateFormat khac', () => {
  const reqs = buildRequests(baseConfig({ dateFormat: 'yyyy-MM-dd' }));
  assert.equal(reqs[0].queryParams.fromDate, '2026-03-25');
});
