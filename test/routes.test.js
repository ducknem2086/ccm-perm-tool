import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { createApp } from '../server.js';
import { startMockServer } from './helpers/mock-server.js';

async function listen(app) {
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}` };
}

test('GET / tra ve trang HTML', async () => {
  const { server, base } = await listen(createApp());
  try {
    const res = await fetch(`${base}/`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /CCM TOOL/);
  } finally {
    server.close();
  }
});

test('GET /api/health tra ve ok', async () => {
  const { server, base } = await listen(createApp());
  try {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  } finally {
    server.close();
  }
});

function config(base) {
  return {
    domain: base,
    auths: [{ id: 'a1', name: 'Default', curlRaw: 'Authorization: Bearer TOKEN123' }],
    runFilter: { methods: [], msisdnPatterns: [], authIds: [] },
    dateRange: { from: '25/03/2026', to: '01/04/2026' },
    dateFormat: 'ddMMyyyy',
    msisdns: ['0912345678', '0913000111'],
    endpoints: [{ id: 'ep_1', enabled: true, method: 'GET', pathTemplate: '/x/:msisdn', queryParams: [], headers: [] }],
    globalQueryParams: [{ key: 'fromDate', value: '{{fromDate}}', enabled: true }],
    globalHeaders: [],
    advanced: { concurrency: 2, timeoutMs: 5000 },
  };
}

test('POST /api/run tu choi config sai', async () => {
  const { server, base } = await listen(createApp());
  try {
    const res = await fetch(`${base}/api/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ domain: 'sai' }),
    });
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.ok(Array.isArray(json.errors) && json.errors.length > 0);
  } finally { server.close(); }
});

test('POST /api/run chay va GET /api/run/:runId tra ket qua', async () => {
  const mock = await startMockServer((_, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
  const { server, base } = await listen(createApp());
  try {
    const started = await fetch(`${base}/api/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(config(mock.base)),
    });
    assert.equal(started.status, 201);
    const { runId, total } = await started.json();
    assert.equal(total, 2);

    let json;
    for (let i = 0; i < 50; i += 1) {
      json = await (await fetch(`${base}/api/run/${runId}`)).json();
      if (json.summary.status === 'done') break;
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(json.summary.status, 'done');
    assert.equal(json.results.length, 2);
    assert.equal(json.results[0].request.headers.Authorization, 'Bearer TOKEN123');
  } finally { server.close(); await mock.close(); }
});

test('GET /api/run/:runId tra 404 voi runId la', async () => {
  const { server, base } = await listen(createApp());
  try {
    assert.equal((await fetch(`${base}/api/run/khong-ton-tai`)).status, 404);
  } finally { server.close(); }
});

test('GET /api/run/:runId/stream day su kien SSE', async () => {
  const mock = await startMockServer((_, res) => res.end('{}'));
  const { server, base } = await listen(createApp());
  try {
    const { runId } = await (await fetch(`${base}/api/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(config(mock.base)),
    })).json();

    const res = await fetch(`${base}/api/run/${runId}/stream`);
    assert.equal(res.headers.get('content-type'), 'text/event-stream');

    let text = '';
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (!text.includes('event: done')) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    assert.match(text, /event: result/);
    assert.match(text, /event: done/);
    reader.cancel();
  } finally { server.close(); await mock.close(); }
});

test('POST /api/import doc file txt gui dang raw', async () => {
  const { server, base } = await listen(createApp());
  try {
    const res = await fetch(`${base}/api/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', 'x-filename': 'p.txt', 'x-kind': 'msisdn' },
      body: '0912345678\n0913000111',
    });
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).values, ['0912345678', '0913000111']);
  } finally { server.close(); }
});

test('POST /api/export/:runId tra ve file xlsx', async () => {
  const mock = await startMockServer((_, res) => res.end('{}'));
  const { server, base } = await listen(createApp());
  try {
    const { runId } = await (await fetch(`${base}/api/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(config(mock.base)),
    })).json();

    for (let i = 0; i < 50; i += 1) {
      const j = await (await fetch(`${base}/api/run/${runId}`)).json();
      if (j.summary.status === 'done') break;
      await new Promise((r) => setTimeout(r, 50));
    }

    const res = await fetch(`${base}/api/export/${runId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ indexes: [1], includeToken: false }),
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-disposition'), /ccm-result-.*\.xlsx/);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.equal(buf.subarray(0, 2).toString(), 'PK', 'file xlsx bat dau bang chu ky ZIP');
  } finally { server.close(); await mock.close(); }
});

test('POST /api/run/:runId/cancel tra 404 voi runId la', async () => {
  const { server, base } = await listen(createApp());
  try {
    const res = await fetch(`${base}/api/run/khong-ton-tai/cancel`, { method: 'POST' });
    assert.equal(res.status, 404);
  } finally { server.close(); }
});

test('POST /api/import/grid tra ve header va rows', async () => {
  const { server, base } = await listen(createApp());
  try {
    const res = await fetch(`${base}/api/import/grid`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', 'x-filename': 'apis.csv' },
      body: 'name,method,endpoint\nTra cuu,GET,/query/abc/{*}',
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.deepEqual(json.headers, ['name', 'method', 'endpoint']);
    assert.deepEqual(json.rows, [['Tra cuu', 'GET', '/query/abc/{*}']]);
  } finally { server.close(); }
});

test('POST /api/import/grid tra 400 voi duoi file la', async () => {
  const { server, base } = await listen(createApp());
  try {
    const res = await fetch(`${base}/api/import/grid`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', 'x-filename': 'apis.pdf' },
      body: 'x',
    });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /không hỗ trợ/);
  } finally { server.close(); }
});

test('POST /api/import/grid tra ve mieu ta sheets voi multi-sheet va loc theo X-Sheets', async () => {
  const { server, base } = await listen(createApp());
  try {
    const wb = new ExcelJS.Workbook();
    const ws1 = wb.addWorksheet('SheetA');
    ws1.addRow(['name', 'method', 'endpoint']);
    ws1.addRow(['Api A', 'GET', '/a/{*}']);
    const ws2 = wb.addWorksheet('SheetB');
    ws2.addRow(['name', 'method', 'endpoint']);
    ws2.addRow(['Api B', 'POST', '/b/{*}']);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());

    const res = await fetch(`${base}/api/import/grid`, {
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        'x-filename': 'multi.xlsx',
        'x-sheets': encodeURIComponent('SheetB'),
      },
      body: buffer,
    });

    const json = await res.json();
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(json.sheets));
    assert.equal(json.sheets.length, 1);
    assert.equal(json.sheets[0].name, 'SheetB');
  } finally { server.close(); }
});


