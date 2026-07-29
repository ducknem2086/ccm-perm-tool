import { randomUUID } from 'node:crypto';
import { sendRequest } from './http-client.js';

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

  const queue = [...run.requests];
  const workerCount = Math.max(1, Math.min(Number(run.options.concurrency) || 5, 50));

  const worker = async () => {
    while (queue.length > 0) {
      if (run.controller.signal.aborted) return;
      const req = queue.shift();
      const record = await sendRequest(req, {
        timeoutMs: run.options.timeoutMs,
        signal: run.controller.signal,
        errorCodePaths: run.options.errorCodePaths,
      });
      if (run.controller.signal.aborted && record.errorCode === 'ABORTED') return;
      run.results.push(record);
      emit(run, 'result', record);
      emit(run, 'progress', { done: run.results.length, total: run.total });
    }
  };

  await Promise.all(Array.from({ length: workerCount }, worker));

  run.status = run.controller.signal.aborted ? 'cancelled' : 'done';
  run.finishedAt = Date.now();
  emit(run, 'done', summarize(run));
  setTimeout(() => runs.delete(run.runId), TTL_MS).unref();
}

export function cancelRun(runId) {
  const run = runs.get(runId);
  if (!run) return false;
  run.controller.abort();
  return true;
}
