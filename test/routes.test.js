import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.js';

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
