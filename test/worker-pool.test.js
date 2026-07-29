import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { runPool, MAX_INFLIGHT } from '../src/server/worker-pool.js';
import { startMockServer } from './helpers/mock-server.js';

function mkReq(index, url) {
  return {
    index, endpointId: 'ep_1', endpointName: 'EP', pathTemplate: '/x',
    msisdn: `09120000${index}`, method: 'GET', url,
    headers: {}, queryParams: {}, pathParams: {}, body: null, unresolved: [],
  };
}

test('MAX_INFLIGHT la 5', () => {
  assert.equal(MAX_INFLIGHT, 5);
});

test('runPool chay het request va tra du record', async () => {
  const mock = await startMockServer((_, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
  try {
    const reqs = Array.from({ length: 12 }, (_, i) => mkReq(i + 1, `${mock.base}/x`));
    const seen = [];
    const out = await runPool(reqs, { workerCount: 2, timeoutMs: 5000, onRecord: (r) => seen.push(r) });
    assert.equal(out.cancelled, false);
    assert.equal(seen.length, 12);
    assert.deepEqual(
      seen.map((r) => r.index).sort((a, b) => a - b),
      Array.from({ length: 12 }, (_, i) => i + 1),
    );
    assert.equal(seen[0].response.status, 200);
  } finally { await mock.close(); }
});

test('runPool khong vuot qua workerCount nhan MAX_INFLIGHT', async () => {
  let inFlight = 0;
  let peak = 0;
  const mock = await startMockServer((_, res) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    setTimeout(() => { inFlight -= 1; res.end('{}'); }, 40);
  });
  try {
    const reqs = Array.from({ length: 40 }, (_, i) => mkReq(i + 1, `${mock.base}/x`));
    await runPool(reqs, { workerCount: 2, timeoutMs: 5000, onRecord: () => {} });
    assert.ok(peak <= 2 * MAX_INFLIGHT, `peak=${peak} vuot qua 2 x ${MAX_INFLIGHT}`);
  } finally { await mock.close(); }
});

test('runPool tra ve ngay khi danh sach rong', async () => {
  const out = await runPool([], { workerCount: 2, onRecord: () => {} });
  assert.deepEqual(out, { cancelled: false });
});

test('runPool dung khi signal bi abort', async () => {
  const mock = await startMockServer(() => { /* treo, khong tra loi */ });
  try {
    const reqs = Array.from({ length: 20 }, (_, i) => mkReq(i + 1, `${mock.base}/x`));
    const controller = new AbortController();
    const seen = [];
    setTimeout(() => controller.abort(), 80);
    const out = await runPool(reqs, {
      workerCount: 2, timeoutMs: 20000, signal: controller.signal,
      onRecord: (r) => seen.push(r),
    });
    assert.equal(out.cancelled, true);
    assert.ok(seen.length < 20, `phai dung som, moi nhan ${seen.length} record`);
  } finally { await mock.close(); }
});

test('runPool gioi han so worker toi da 16', async () => {
  const mock = await startMockServer((_, res) => res.end('{}'));
  try {
    const reqs = [mkReq(1, `${mock.base}/x`)];
    const out = await runPool(reqs, { workerCount: 999, timeoutMs: 5000, onRecord: () => {} });
    assert.equal(out.cancelled, false);
  } finally { await mock.close(); }
});

test('runPool van tra record khi request loi mang', async () => {
  // Cong 1 khong ai lang nghe, fetch nem loi ngay, worker van phai tra record.
  const seen = [];
  await runPool([mkReq(1, 'http://127.0.0.1:1/khong-ton-tai')], {
    workerCount: 1, timeoutMs: 2000, onRecord: (r) => seen.push(r),
  });
  assert.equal(seen.length, 1);
  assert.ok(seen[0].errorCode, 'phai co errorCode');
  assert.equal(seen[0].response.status, null);
});

test('runPool tu dong retry khi worker crash va tra ve WORKER_CRASH khi that bai lan 2', async () => {
  const activeWorkers = [];
  class TestWorker extends Worker {
    constructor(url, opts) {
      super(url, opts);
      activeWorkers.push(this);
    }
  }

  let requestCount = 0;
  const mock = await startMockServer((req, res) => {
    requestCount++;
    for (const w of activeWorkers) {
      w.terminate();
    }
  });

  try {
    const reqs = [mkReq(1, `${mock.base}/crash`)];
    const seen = [];
    const out = await runPool(reqs, {
      workerCount: 1,
      timeoutMs: 5000,
      _Worker: TestWorker,
      onRecord: (r) => seen.push(r),
    });

    assert.equal(out.cancelled, false);
    assert.equal(requestCount, 2);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].index, 1);
    assert.equal(seen[0].errorCode, 'WORKER_CRASH');
    assert.equal(seen[0].errorMessage, 'Worker thread dừng bất thường');
  } finally {
    await mock.close();
  }
});

test('runPool clamp workerCount 0 ve 1', async () => {
  let spawnedCount = 0;
  class TestWorker extends Worker {
    constructor(url, opts) {
      super(url, opts);
      spawnedCount++;
    }
  }

  const mock = await startMockServer((req, res) => res.end('{}'));
  try {
    const reqs = [mkReq(1, `${mock.base}/x`)];
    await runPool(reqs, {
      workerCount: 0,
      timeoutMs: 5000,
      _Worker: TestWorker,
      onRecord: () => {},
    });
    assert.equal(spawnedCount, 1);
  } finally {
    await mock.close();
  }
});

