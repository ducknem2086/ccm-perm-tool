import { randomUUID } from 'node:crypto';
import { sendRequest } from './http-client.js';
import { runPool, MAX_INFLIGHT } from './worker-pool.js';

const runs = new Map();
const TTL_MS = 60 * 60 * 1000;

export function createRun(requests, options = {}) {
  const run = {
    runId: randomUUID(),
    total: requests.length,
    requests,
    options,
    results: [],
    listeners: new Set(),
    controller: new AbortController(),
    status: 'pending',
    startedAt: null,
    finishedAt: null,
  };
  runs.set(run.runId, run);
  return run;
}

export function getRun(runId) {
  return runs.get(runId);
}

export function subscribe(runId, listener) {
  const run = runs.get(runId);
  if (!run) return () => {};
  run.listeners.add(listener);
  return () => run.listeners.delete(listener);
}

function emit(run, event, data) {
  for (const listener of run.listeners) {
    try { listener(event, data); } catch { /* mot listener hong khong duoc lam sap run */ }
  }
}

export function summarize(run) {
  const ok = run.results.filter(
    (r) => r.response.status !== null && r.response.status < 400,
  ).length;
  return {
    runId: run.runId,
    status: run.status,
    total: run.total,
    done: run.results.length,
    ok,
    failed: run.results.length - ok,
    elapsedMs: (run.finishedAt ?? Date.now()) - (run.startedAt ?? Date.now()),
  };
}

export async function startRun(run) {
  if (run.status !== 'pending') return;
  run.status = 'running';
  run.startedAt = Date.now();

  const push = (record) => {
    if (run.controller.signal.aborted && record.errorCode === 'ABORTED') return;
    run.results.push(record);
    emit(run, 'result', record);
    emit(run, 'progress', { done: run.results.length, total: run.total });
  };

  const workerCount = run.options.workerCount ?? 4;

  try {
    await runPool(run.requests, {
      workerCount,
      timeoutMs: run.options.timeoutMs,
      errorCodePaths: run.options.errorCodePaths,
      permissionFile: run.options.permissionFile,
      permissionMapping: run.options.permissionMapping,
      signal: run.controller.signal,
      onRecord: push,
    });
  } catch (err) {
    // Moi truong chan worker_threads thi chay thang tren main thread.
    console.error('Worker pool that bai, chay inline:', err);
    await runInline(run, push, workerCount * MAX_INFLIGHT);
  }

  run.status = run.controller.signal.aborted ? 'cancelled' : 'done';
  run.finishedAt = Date.now();
  emit(run, 'done', summarize(run));
  setTimeout(() => runs.delete(run.runId), TTL_MS).unref();
}

async function runInline(run, push, concurrency) {
  const queue = [...run.requests];
  const done = new Set(run.results.map((r) => r.index));

  const worker = async () => {
    while (queue.length > 0) {
      if (run.controller.signal.aborted) return;
      const req = queue.shift();
      if (done.has(req.index)) continue;
      const record = await sendRequest(req, {
        timeoutMs: run.options.timeoutMs,
        signal: run.controller.signal,
        errorCodePaths: run.options.errorCodePaths,
        permissionFile: run.options.permissionFile,
        permissionMapping: run.options.permissionMapping,
      });
      push(record);
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
}

export function cancelRun(runId) {
  const run = runs.get(runId);
  if (!run) return false;
  run.controller.abort();
  return true;
}
