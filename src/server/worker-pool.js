import { Worker } from 'node:worker_threads';

export const MAX_INFLIGHT = 5;
export const MAX_WORKERS = 16;

const WORKER_URL = new URL('./request-worker.js', import.meta.url);
const CANCEL_GRACE_MS = 300;

const clampWorkers = (n) => Math.max(1, Math.min(Number(n) || 4, MAX_WORKERS));

function crashRecord(req) {
  const now = new Date().toISOString();
  return {
    index: req.index,
    endpointId: req.endpointId,
    endpointName: req.endpointName,
    pathTemplate: req.pathTemplate,
    msisdn: req.msisdn ?? null,
    request: {
      method: req.method, url: req.url, headers: req.headers,
      pathParams: req.pathParams ?? {}, queryParams: req.queryParams ?? {}, body: req.body ?? null,
    },
    response: { status: null, statusText: '', headers: {}, body: null, bodyText: '', sizeBytes: 0 },
    errorCode: 'WORKER_CRASH',
    errorMessage: 'Worker thread dừng bất thường',
    durationMs: 0,
    startedAt: now,
    finishedAt: now,
  };
}

export function runPool(requests, options = {}) {
  const {
    workerCount = 4, timeoutMs = 30000, errorCodePaths,
    signal, onRecord = () => {},
  } = options;

  const total = requests.length;
  if (total === 0) return Promise.resolve({ cancelled: false });

  return new Promise((resolve, reject) => {
    const queue = [...requests];
    const pool = [];
    const retried = new Set();
    let finished = 0;
    let cancelled = false;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      for (const slot of pool) slot.worker.terminate();
      resolve({ cancelled });
    };

    const maybeFinish = () => {
      if (cancelled || finished >= total) finish();
    };

    const pump = (slot) => {
      while (!cancelled && slot.inflight.size < MAX_INFLIGHT && queue.length > 0) {
        const req = queue.shift();
        slot.inflight.set(req.index, req);
        slot.worker.postMessage({ type: 'run', request: req });
      }
    };

    const recycle = (slot) => {
      const at = pool.indexOf(slot);
      if (at === -1) return;
      pool.splice(at, 1);

      // Request dang bay cua worker chet duoc tra lai hang doi dung 1 lan.
      for (const [index, req] of slot.inflight) {
        if (retried.has(index)) {
          finished += 1;
          onRecord(crashRecord(req));
        } else {
          retried.add(index);
          queue.unshift(req);
        }
      }
      slot.inflight.clear();

      if (cancelled) { maybeFinish(); return; }
      if (finished >= total) { maybeFinish(); return; }
      pump(spawn());
    };

    function spawn() {
      const worker = new Worker(WORKER_URL, { workerData: { timeoutMs, errorCodePaths } });
      const slot = { worker, inflight: new Map() };
      pool.push(slot);

      worker.on('message', (msg) => {
        if (msg?.type !== 'result') return;
        slot.inflight.delete(msg.index);
        finished += 1;
        onRecord(msg.record);
        if (finished >= total) { maybeFinish(); return; }
        pump(slot);
      });

      worker.on('error', () => recycle(slot));
      worker.on('exit', (code) => { if (code !== 0 && !settled) recycle(slot); });

      return slot;
    }

    if (signal) {
      if (signal.aborted) { cancelled = true; finish(); return; }
      signal.addEventListener('abort', () => {
        cancelled = true;
        queue.length = 0;
        for (const slot of pool) slot.worker.postMessage({ type: 'cancel' });
        setTimeout(finish, CANCEL_GRACE_MS).unref();
      }, { once: true });
    }

    try {
      for (let i = 0; i < clampWorkers(workerCount); i += 1) pump(spawn());
    } catch (err) {
      settled = true;
      for (const slot of pool) slot.worker.terminate();
      reject(err);
    }
  });
}
