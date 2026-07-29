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
    const run = createRun(reqs, { concurrency: 2, timeoutMs: 5000 });
    await startRun(run);
    assert.equal(run.status, 'done');
    assert.equal(run.results.length, 5);
    assert.deepEqual(run.results.map((r) => r.index).sort((a, b) => a - b), [1, 2, 3, 4, 5]);
  } finally { await mock.close(); }
});

test('subscribe nhan du event result, progress va done', async () => {
  const mock = await startMockServer((_, res) => res.end('{}'));
  try {
    const run = createRun([mkReq(1, `${mock.base}/x`), mkReq(2, `${mock.base}/x`)], { concurrency: 1 });
    const seen = { result: 0, progress: 0, done: 0 };
    subscribe(run.runId, (event) => { seen[event] += 1; });
    await startRun(run);
    assert.equal(seen.result, 2);
    assert.equal(seen.progress, 2);
    assert.equal(seen.done, 1);
  } finally { await mock.close(); }
});

test('getRun tra ve run theo runId', async () => {
  const run = createRun([], { concurrency: 1 });
  assert.equal(getRun(run.runId), run);
  assert.equal(getRun('khong-ton-tai'), undefined);
});

test('cancelRun dung run dang chay', async () => {
  const mock = await startMockServer(() => { /* treo */ });
  try {
    const reqs = [1, 2, 3, 4].map((i) => mkReq(i, `${mock.base}/x`));
    const run = createRun(reqs, { concurrency: 2, timeoutMs: 10000 });
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
    const run = createRun([mkReq(1, `${mock.base}/x`), mkReq(2, `${mock.base}/x`)], { concurrency: 1 });
    await startRun(run);
    const s = summarize(run);
    assert.equal(s.total, 2);
    assert.equal(s.done, 2);
    assert.equal(s.ok, 1);
    assert.equal(s.failed, 1);
    assert.ok(s.elapsedMs >= 0);
  } finally { await mock.close(); }
});

test('startRun ton trong gioi han concurrency', async () => {
  let inFlight = 0;
  let peak = 0;
  const mock = await startMockServer((_, res) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    setTimeout(() => { inFlight -= 1; res.end('{}'); }, 40);
  });
  try {
    const reqs = [1, 2, 3, 4, 5, 6].map((i) => mkReq(i, `${mock.base}/x`));
    const run = createRun(reqs, { concurrency: 2, timeoutMs: 5000 });
    await startRun(run);
    assert.ok(peak <= 2, `peak=${peak} vuot qua concurrency=2`);
  } finally { await mock.close(); }
});
