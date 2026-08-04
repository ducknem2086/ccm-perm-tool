import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRun, startRun, getRun, cancelRun, subscribe, summarize } from '../src/server/runner.js';
import { startMockServer } from './helpers/mock-server.js';

function mkReq(index, url) {
  return {
    index, endpointId: 'ep_1', endpointName: '/x', msisdn: `09120000${index}`,
    method: 'GET', url, headers: {}, queryParams: {}, pathParams: {}, body: null, unresolved: [],
  };
}

test('startRun chay het request va giu du ket qua', async () => {
  const mock = await startMockServer((_, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
  try {
    const reqs = [1, 2, 3, 4, 5].map((i) => mkReq(i, `${mock.base}/x`));
    const run = createRun(reqs, { workerCount: 2, timeoutMs: 5000 });
    await startRun(run);
    assert.equal(run.status, 'done');
    assert.equal(run.results.length, 5);
    assert.deepEqual(run.results.map((r) => r.index).sort((a, b) => a - b), [1, 2, 3, 4, 5]);
  } finally { await mock.close(); }
});

test('subscribe nhan du event result, progress va done', async () => {
  const mock = await startMockServer((_, res) => res.end('{}'));
  try {
    const run = createRun([mkReq(1, `${mock.base}/x`), mkReq(2, `${mock.base}/x`)], { workerCount: 1 });
    const seen = { result: 0, progress: 0, done: 0 };
    subscribe(run.runId, (event) => { seen[event] += 1; });
    await startRun(run);
    assert.equal(seen.result, 2);
    assert.equal(seen.progress, 2);
    assert.equal(seen.done, 1);
  } finally { await mock.close(); }
});

test('getRun tra ve run theo runId', async () => {
  const run = createRun([], { workerCount: 1 });
  assert.equal(getRun(run.runId), run);
  assert.equal(getRun('khong-ton-tai'), undefined);
});

test('cancelRun dung run dang chay', async () => {
  const mock = await startMockServer(() => { /* treo */ });
  try {
    const reqs = [1, 2, 3, 4].map((i) => mkReq(i, `${mock.base}/x`));
    const run = createRun(reqs, { workerCount: 2, timeoutMs: 10000 });
    const p = startRun(run);
    setTimeout(() => cancelRun(run.runId), 50);
    await p;
    assert.equal(run.status, 'cancelled');
    assert.ok(run.results.length < 4);
  } finally { await mock.close(); }
});

test('cancelRun tra false voi runId la', () => {
  assert.equal(cancelRun('khong-ton-tai'), false);
});

test('summarize dem dung so ok va failed', async () => {
  let n = 0;
  const mock = await startMockServer((_, res) => {
    n += 1;
    res.writeHead(n === 1 ? 200 : 500, { 'content-type': 'application/json' });
    res.end('{}');
  });
  try {
    const run = createRun([mkReq(1, `${mock.base}/x`), mkReq(2, `${mock.base}/x`)], { workerCount: 1 });
    await startRun(run);
    const s = summarize(run);
    assert.equal(s.total, 2);
    assert.equal(s.done, 2);
    assert.equal(s.ok, 1);
    assert.equal(s.failed, 1);
    assert.ok(s.elapsedMs >= 0);
  } finally { await mock.close(); }
});

test('startRun ton trong gioi han workerCount nhan 5', async () => {
  let inFlight = 0;
  let peak = 0;
  const mock = await startMockServer((_, res) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    setTimeout(() => { inFlight -= 1; res.end('{}'); }, 40);
  });
  try {
    const reqs = Array.from({ length: 30 }, (_, i) => mkReq(i + 1, `${mock.base}/x`));
    const run = createRun(reqs, { workerCount: 1, timeoutMs: 5000 });
    await startRun(run);
    assert.equal(run.results.length, 30);
    assert.ok(peak <= 5, `peak=${peak} vuot qua 1 worker x 5 request`);
  } finally { await mock.close(); }
});

test('startRun danh sach rong thi hoan tat ngay', async () => {
  const run = createRun([], { workerCount: 2 });
  await startRun(run);
  assert.equal(run.status, 'done');
  assert.equal(run.results.length, 0);
});

test('startRun clamp workerCount 0 ve 1', async () => {
  let inFlight = 0;
  let peak = 0;
  const mock = await startMockServer((_, res) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    setTimeout(() => { inFlight -= 1; res.end('{}'); }, 30);
  });
  try {
    const reqs = Array.from({ length: 10 }, (_, i) => mkReq(i + 1, `${mock.base}/x`));
    const run = createRun(reqs, { workerCount: 0, timeoutMs: 5000 });
    await startRun(run);
    assert.equal(run.results.length, 10);
    assert.ok(peak <= 5, `peak=${peak} vuot qua 1 slot x 5 request (workerCount 0 phai clamp ve 1)`);
  } finally { await mock.close(); }
});

test('startRun lam tron xuong workerCount khong nguyen', async () => {
  let inFlight = 0;
  let peak = 0;
  const mock = await startMockServer((_, res) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    setTimeout(() => { inFlight -= 1; res.end('{}'); }, 30);
  });
  try {
    const reqs = Array.from({ length: 20 }, (_, i) => mkReq(i + 1, `${mock.base}/x`));
    const run = createRun(reqs, { workerCount: 2.7, timeoutMs: 5000 });
    await startRun(run);
    assert.equal(run.results.length, 20);
    assert.ok(peak <= 10, `peak=${peak} vuot qua 2 slot x 5 request (2.7 phai lam tron xuong 2)`);
  } finally { await mock.close(); }
});

test('startRun clamp workerCount qua lon ve toi da 16 slot, khong treo', async () => {
  const mock = await startMockServer((_, res) => res.end('{}'));
  try {
    const run = createRun([mkReq(1, `${mock.base}/x`)], { workerCount: 999, timeoutMs: 5000 });
    await startRun(run);
    assert.equal(run.status, 'done');
    assert.equal(run.results.length, 1);
  } finally { await mock.close(); }
});

test('startRun van tra ve record khi request loi mang', async () => {
  const run = createRun([mkReq(1, 'http://127.0.0.1:1/khong-ton-tai')], { workerCount: 1, timeoutMs: 2000 });
  await startRun(run);
  assert.equal(run.results.length, 1);
  assert.ok(run.results[0].errorCode, 'phai co errorCode');
  assert.equal(run.results[0].response.status, null);
});
