import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRun,
  openStream,
  fetchRun,
  cancelRun,
  importFile,
  exportExcel
} from '../public/js/api.js';

class MockEventSource {
  constructor(url) {
    this.url = url;
    this.listeners = {};
    this.closed = false;
  }

  addEventListener(type, listener) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }

  emit(type, data) {
    const event = { data: JSON.stringify(data) };
    const handlers = this.listeners[type] || [];
    for (const h of handlers) h(event);
  }

  close() {
    this.closed = true;
  }
}

globalThis.location = { origin: 'http://localhost:9000' };

test('startRun goi POST /api/run voi config va tra ve res JSON khi thanh cong', async () => {
  let requestParams = null;
  globalThis.fetch = async (url, options) => {
    requestParams = { url, options };
    return {
      ok: true,
      text: async () => JSON.stringify({ runId: 'run-1', total: 10 })
    };
  };

  const res = await startRun({ domain: 'https://api.vn' });
  assert.equal(requestParams.url, '/api/run');
  assert.equal(requestParams.options.method, 'POST');
  assert.equal(requestParams.options.headers['content-type'], 'application/json');
  assert.equal(JSON.parse(requestParams.options.body).domain, 'https://api.vn');
  assert.deepEqual(res, { runId: 'run-1', total: 10 });
});

test('startRun kem origin cua tool de server dat Origin/Referer', async () => {
  let sent = null;
  globalThis.fetch = async (url, options) => {
    sent = JSON.parse(options.body);
    return { ok: true, text: async () => JSON.stringify({ runId: 'run-1', total: 1 }) };
  };

  await startRun({ domain: 'https://api.vn' });
  assert.equal(sent.origin, 'http://localhost:9000');
});

test('startRun nem Error co attribute .errors khi API res 400', async () => {
  globalThis.fetch = async () => ({
    ok: false,
    text: async () => JSON.stringify({ error: 'Config khong hop le', errors: ['domain missing'] })
  });

  await assert.rejects(
    async () => {
      await startRun({});
    },
    (err) => {
      assert.equal(err.message, 'Config khong hop le');
      assert.deepEqual(err.errors, ['domain missing']);
      return true;
    }
  );
});

test('openStream tao EventSource va xu ly cac event result, progress, done', () => {
  globalThis.EventSource = MockEventSource;

  const results = [];
  const progressList = [];
  let doneData = null;

  const es = openStream('run-1', {
    onResult: (r) => results.push(r),
    onProgress: (p) => progressList.push(p),
    onDone: (d) => { doneData = d; }
  });

  assert.equal(es.url, '/api/run/run-1/stream');

  es.emit('result', { index: 0, status: 200 });
  assert.equal(results.length, 1);
  assert.equal(results[0].status, 200);

  es.emit('progress', { completed: 1, total: 2 });
  assert.equal(progressList.length, 1);
  assert.equal(progressList[0].completed, 1);

  es.emit('done', { runId: 'run-1' });
  assert.deepEqual(doneData, { runId: 'run-1' });
  assert.equal(es.closed, true);
});

test('fetchRun lay chi tiet run thanh cong va bao loi khi status !ok', async () => {
  globalThis.fetch = async (url) => {
    if (url === '/api/run/run-1') {
      return {
        ok: true,
        json: async () => ({ summary: { total: 5 }, results: [] })
      };
    }
    return { ok: false };
  };

  const data = await fetchRun('run-1');
  assert.deepEqual(data, { summary: { total: 5 }, results: [] });

  await assert.rejects(
    async () => { await fetchRun('invalid-run'); },
    { message: 'Không tìm thấy run' }
  );
});

test('cancelRun goi POST /api/run/:id/cancel', async () => {
  let calledUrl = '';
  let calledMethod = '';
  globalThis.fetch = async (url, options) => {
    calledUrl = url;
    calledMethod = options.method;
    return { ok: true };
  };

  await cancelRun('run-99');
  assert.equal(calledUrl, '/api/run/run-99/cancel');
  assert.equal(calledMethod, 'POST');
});

test('importFile gui stream file voi cac headers dac biet', async () => {
  let fetchOptions = null;
  globalThis.fetch = async (url, options) => {
    fetchOptions = options;
    return {
      ok: true,
      text: async () => JSON.stringify({ values: ['0912345678'], total: 1, skipped: 0 })
    };
  };

  const file = {
    name: 'test data #1.txt',
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer
  };

  const res = await importFile(file, 'msisdn', true);

  assert.equal(fetchOptions.method, 'POST');
  assert.equal(fetchOptions.headers['content-type'], 'application/octet-stream');
  assert.equal(fetchOptions.headers['x-filename'], 'test_20data_20_231.txt');
  assert.equal(fetchOptions.headers['x-kind'], 'msisdn');
  assert.equal(fetchOptions.headers['x-dedupe'], 'true');
  assert.deepEqual(res, { values: ['0912345678'], total: 1, skipped: 0 });
});

test('exportExcel goi API export va kich hoat browser download file', async () => {
  let requestParams = null;
  let elementAppended = false;
  let clicked = false;
  let elementRemoved = false;
  let revokedUrl = null;

  globalThis.fetch = async (url, options) => {
    requestParams = { url, options };
    return {
      ok: true,
      headers: {
        get: (h) => (h === 'content-disposition' ? 'attachment; filename="report_result.xlsx"' : null)
      },
      blob: async () => ({ type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    };
  };

  globalThis.URL = {
    createObjectURL: () => 'blob:http://localhost/dummy-blob',
    revokeObjectURL: (url) => { revokedUrl = url; }
  };

  const dummyElement = {
    href: '',
    download: '',
    click: () => { clicked = true; },
    remove: () => { elementRemoved = true; }
  };

  globalThis.document = {
    createElement: (tag) => (tag === 'a' ? dummyElement : {}),
    body: {
      append: (el) => { if (el === dummyElement) elementAppended = true; }
    }
  };

  await exportExcel('run-1', [0, 1], true);

  assert.equal(requestParams.url, '/api/export/run-1');
  assert.deepEqual(JSON.parse(requestParams.options.body), { indexes: [0, 1], includeToken: true, layout: 'default' });
  assert.equal(dummyElement.download, 'report_result.xlsx');
  assert.equal(dummyElement.href, 'blob:http://localhost/dummy-blob');
  assert.equal(elementAppended, true);
  assert.equal(clicked, true);
  assert.equal(elementRemoved, true);
  assert.equal(revokedUrl, 'blob:http://localhost/dummy-blob');
});

test('exportExcel gui dung layout khi goi voi tham so thu tu', async () => {
  let requestParams = null;

  globalThis.fetch = async (url, options) => {
    requestParams = { url, options };
    return {
      ok: true,
      headers: { get: () => 'attachment; filename="report_result.xlsx"' },
      blob: async () => ({}),
    };
  };
  globalThis.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
  globalThis.document = {
    createElement: () => ({ click: () => {}, remove: () => {} }),
    body: { append: () => {} },
  };

  await exportExcel('run-2', [3], false, 'permission');

  assert.deepEqual(JSON.parse(requestParams.options.body), { indexes: [3], includeToken: false, layout: 'permission' });
});
