import { parentPort, workerData } from 'node:worker_threads';
import { sendPair } from './http-client.js';

const {
  timeoutMs, errorCodePaths, permissionFile, permissionMapping,
} = workerData ?? {};
const controller = new AbortController();

parentPort.on('message', (msg) => {
  if (msg?.type === 'cancel') {
    controller.abort();
    return;
  }
  if (msg?.type !== 'run') return;

  const request = msg.request;
  sendPair(request, {
    timeoutMs, signal: controller.signal, errorCodePaths, permissionFile, permissionMapping,
  })
    .then((record) => parentPort.postMessage({ type: 'result', index: request.index, record }));
});
