import { parentPort, workerData } from 'node:worker_threads';
import { sendRequest } from './http-client.js';

const { timeoutMs, errorCodePaths } = workerData ?? {};
const controller = new AbortController();

parentPort.on('message', (msg) => {
  if (msg?.type === 'cancel') {
    controller.abort();
    return;
  }
  if (msg?.type !== 'run') return;

  const request = msg.request;
  sendRequest(request, { timeoutMs, signal: controller.signal, errorCodePaths })
    .then((record) => parentPort.postMessage({ type: 'result', index: request.index, record }));
});

