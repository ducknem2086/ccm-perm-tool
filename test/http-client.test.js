import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendRequest } from '../src/server/http-client.js';
import { startMockServer } from './helpers/mock-server.js';

function req(over = {}) {
  return {
    index: 1, endpointId: 'ep_1', endpointName: '/x', msisdn: '0912345678',
    method: 'GET', url: 'http://127.0.0.1:1/x',
    headers: { Authorization: 'Bearer TOKEN123' },
    queryParams: {}, pathParams: { msisdn: '0912345678' }, body: null, unresolved: [],
    ...over,
  };
}

test('sendRequest tra ve status va body JSON da parse', async () => {
  const mock = await startMockServer((_, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: { name: 'abc' } }));
  });
  try {
    const rec = await sendRequest(req({ url: `${mock.base}/x` }));
    assert.equal(rec.response.status, 200);
    assert.deepEqual(rec.response.body, { data: { name: 'abc' } });
    assert.equal(rec.errorCode, null);
    assert.ok(rec.durationMs >= 0);
    assert.equal(rec.index, 1);
  } finally { await mock.close(); }
});

test('sendRequest giu nguyen token day du trong record', async () => {
  const mock = await startMockServer((_, res) => res.end('{}'));
  try {
    const rec = await sendRequest(req({ url: `${mock.base}/x` }));
    assert.equal(rec.request.headers.Authorization, 'Bearer TOKEN123');
  } finally { await mock.close(); }
});

test('sendRequest trich error code tu body loi', async () => {
  const mock = await startMockServer((_, res) => {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ errorCode: 'E0042', message: 'loi nghiep vu' }));
  });
  try {
    const rec = await sendRequest(req({ url: `${mock.base}/x` }));
    assert.equal(rec.response.status, 500);
    assert.equal(rec.errorCode, 'E0042');
  } finally { await mock.close(); }
});

test('sendRequest khong coi body khong phai JSON la loi', async () => {
  const mock = await startMockServer((_, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('khong phai json');
  });
  try {
    const rec = await sendRequest(req({ url: `${mock.base}/x` }));
    assert.equal(rec.response.status, 200);
    assert.equal(rec.response.body, null);
    assert.equal(rec.response.bodyText, 'khong phai json');
    assert.equal(rec.errorCode, null);
  } finally { await mock.close(); }
});

test('sendRequest bao ETIMEDOUT khi qua han', async () => {
  const mock = await startMockServer(() => { /* khong bao gio tra loi */ });
  try {
    const rec = await sendRequest(req({ url: `${mock.base}/x` }), { timeoutMs: 150 });
    assert.equal(rec.response.status, null);
    assert.equal(rec.errorCode, 'ETIMEDOUT');
    assert.ok(rec.durationMs >= 100);
  } finally { await mock.close(); }
});

test('sendRequest bao ECONNREFUSED khi khong ket noi duoc', async () => {
  const rec = await sendRequest(req({ url: 'http://127.0.0.1:1/x' }), { timeoutMs: 2000 });
  assert.equal(rec.response.status, null);
  assert.ok(['ECONNREFUSED', 'EFETCH'].includes(rec.errorCode));
  assert.ok(rec.errorMessage.length > 0);
});

test('sendRequest khong gui khi con bien chua resolve', async () => {
  const rec = await sendRequest(req({ url: 'http://127.0.0.1:1/x', unresolved: ['msisdn'] }));
  assert.equal(rec.errorCode, 'UNRESOLVED_VAR');
  assert.match(rec.errorMessage, /msisdn/);
  assert.equal(rec.response.status, null);
});

test('sendRequest bao ABORTED khi bi huy tu ngoai', async () => {
  const mock = await startMockServer(() => {});
  const ac = new AbortController();
  try {
    const p = sendRequest(req({ url: `${mock.base}/x` }), { timeoutMs: 5000, signal: ac.signal });
    ac.abort();
    const rec = await p;
    assert.equal(rec.errorCode, 'ABORTED');
  } finally { await mock.close(); }
});

test('sendRequest chuyen tiep pathTemplate xuong record', async () => {
  const mock = await startMockServer((_, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
  try {
    const rec = await sendRequest({
      index: 1, endpointId: 'ep_1', endpointName: 'Tra cuu TB',
      pathTemplate: '/query/white-list-ir-subscriber/{*}',
      msisdn: '0912345678', method: 'GET', url: `${mock.base}/x`,
      headers: {}, queryParams: {}, pathParams: {}, body: null, unresolved: [],
    });
    assert.equal(rec.pathTemplate, '/query/white-list-ir-subscriber/{*}');
    assert.equal(rec.endpointName, 'Tra cuu TB');
  } finally { await mock.close(); }
});

