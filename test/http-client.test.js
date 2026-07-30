import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendRequest } from '../src/server/http-client.js';
import { startMockServer } from './helpers/mock-server.js';

function req(over = {}) {
  return {
    index: 1, endpointId: 'ep_1', endpointName: '/x', msisdn: '0912345678',
    method: 'GET', url: 'http://127.0.0.1:1/x',
    headers: { Authorization: 'Bearer TOKEN123' },
    queryParams: {}, pathParams: { msisdn: '0912345678' }, body: null, unresolved: [],
    ...over,
  };
}

test('sendRequest tra ve status va body JSON da parse', async () => {
  const mock = await startMockServer((_, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: { name: 'abc' } }));
  });
  try {
    const rec = await sendRequest(req({ url: `${mock.base}/x` }));
    assert.equal(rec.response.status, 200);
    assert.deepEqual(rec.response.body, { data: { name: 'abc' } });
    assert.equal(rec.errorCode, null);
    assert.ok(rec.durationMs >= 0);
    assert.equal(rec.index, 1);
  } finally { await mock.close(); }
});

test('sendRequest giu nguyen token day du trong record', async () => {
  const mock = await startMockServer((_, res) => res.end('{}'));
  try {
    const rec = await sendRequest(req({ url: `${mock.base}/x` }));
    assert.equal(rec.request.headers.Authorization, 'Bearer TOKEN123');
  } finally { await mock.close(); }
});

test('sendRequest trich error code tu body loi', async () => {
  const mock = await startMockServer((_, res) => {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ errorCode: 'E0042', message: 'loi nghiep vu' }));
  });
  try {
    const rec = await sendRequest(req({ url: `${mock.base}/x` }));
    assert.equal(rec.response.status, 500);
    assert.equal(rec.errorCode, 'E0042');
  } finally { await mock.close(); }
});

test('sendRequest khong coi body khong phai JSON la loi', async () => {
  const mock = await startMockServer((_, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('khong phai json');
  });
  try {
    const rec = await sendRequest(req({ url: `${mock.base}/x` }));
    assert.equal(rec.response.status, 200);
    assert.equal(rec.response.body, null);
    assert.equal(rec.response.bodyText, 'khong phai json');
    assert.equal(rec.errorCode, null);
  } finally { await mock.close(); }
});

test('sendRequest bao ETIMEDOUT khi qua han', async () => {
  const mock = await startMockServer(() => { /* khong bao gio tra loi */ });
  try {
    const rec = await sendRequest(req({ url: `${mock.base}/x` }), { timeoutMs: 150 });
    assert.equal(rec.response.status, null);
    assert.equal(rec.errorCode, 'ETIMEDOUT');
    assert.ok(rec.durationMs >= 100);
  } finally { await mock.close(); }
});

test('sendRequest bao ECONNREFUSED khi khong ket noi duoc', async () => {
  const rec = await sendRequest(req({ url: 'http://127.0.0.1:1/x' }), { timeoutMs: 2000 });
  assert.equal(rec.response.status, null);
  assert.ok(['ECONNREFUSED', 'EFETCH'].includes(rec.errorCode));
  assert.ok(rec.errorMessage.length > 0);
});

test('sendRequest khong gui khi con bien chua resolve', async () => {
  const rec = await sendRequest(req({ url: 'http://127.0.0.1:1/x', unresolved: ['msisdn'] }));
  assert.equal(rec.errorCode, 'UNRESOLVED_VAR');
  assert.match(rec.errorMessage, /msisdn/);
  assert.equal(rec.response.status, null);
});

test('sendRequest bao ABORTED khi bi huy tu ngoai', async () => {
  const mock = await startMockServer(() => {});
  const ac = new AbortController();
  try {
    const p = sendRequest(req({ url: `${mock.base}/x` }), { timeoutMs: 5000, signal: ac.signal });
    ac.abort();
    const rec = await p;
    assert.equal(rec.errorCode, 'ABORTED');
  } finally { await mock.close(); }
});

test('sendRequest chuyen tiep pathTemplate xuong record', async () => {
  const mock = await startMockServer((_, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
  try {
    const rec = await sendRequest({
      index: 1, endpointId: 'ep_1', endpointName: 'Tra cuu TB',
      pathTemplate: '/query/white-list-ir-subscriber/{*}',
      msisdn: '0912345678', method: 'GET', url: `${mock.base}/x`,
      headers: {}, queryParams: {}, pathParams: {}, body: null, unresolved: [],
    });
    assert.equal(rec.pathTemplate, '/query/white-list-ir-subscriber/{*}');
    assert.equal(rec.endpointName, 'Tra cuu TB');
  } finally { await mock.close(); }
});


/* ---------- chan doan khi response khong phai JSON ---------- */

test('bi day ve trang dang nhap thi bao REDIRECTED kem URL chang cuoi', async () => {
  const mock = await startMockServer((r, res) => {
    if (r.url.startsWith('/api/')) {
      res.writeHead(302, { location: '/login' });
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!DOCTYPE html><html><body>login</body></html>');
  });
  try {
    const rec = await sendRequest(req({ url: `${mock.base}/api/query` }));

    // Ben ngoai van la 200 + text/html — day chinh la cho gay hieu nham.
    assert.equal(rec.response.status, 200);
    assert.equal(rec.response.headers['content-type'], 'text/html');

    assert.equal(rec.response.redirected, true);
    assert.match(rec.response.finalUrl, /\/login$/);
    assert.equal(rec.errorCode, 'REDIRECTED');
    assert.match(rec.errorMessage, /chuyển hướng/);
    assert.match(rec.errorMessage, /đăng nhập/);
  } finally { await mock.close(); }
});

test('server tra HTML ma khong redirect thi bao NOT_JSON', async () => {
  const mock = await startMockServer((_, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!DOCTYPE html><html><body>trang bat ky</body></html>');
  });
  try {
    const rec = await sendRequest(req({ url: `${mock.base}/x` }));
    assert.equal(rec.response.redirected, false);
    assert.equal(rec.errorCode, 'NOT_JSON');
    assert.match(rec.errorMessage, /text\/html/);
  } finally { await mock.close(); }
});

test('response JSON hop le thi khong gan ma chan doan nao', async () => {
  const mock = await startMockServer((_, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
  try {
    const rec = await sendRequest(req({ url: `${mock.base}/x` }));
    assert.equal(rec.errorCode, null);
    assert.equal(rec.errorMessage, null);
    assert.equal(rec.response.redirected, false);
    assert.equal(rec.response.finalUrl, `${mock.base}/x`);
  } finally { await mock.close(); }
});

test('status loi kem HTML thi khong de NOT_JSON che mat ma loi tu body', async () => {
  const mock = await startMockServer((_, res) => {
    res.writeHead(500, { 'content-type': 'text/html' });
    res.end('<html>Internal Server Error</html>');
  });
  try {
    const rec = await sendRequest(req({ url: `${mock.base}/x` }));
    assert.equal(rec.response.status, 500);
    assert.equal(rec.errorCode, null, 'status 500 da du noi len van de');
  } finally { await mock.close(); }
});

test('body rong khong bi coi la loi NOT_JSON', async () => {
  const mock = await startMockServer((_, res) => {
    res.writeHead(204, { 'content-type': 'text/html' });
    res.end('');
  });
  try {
    const rec = await sendRequest(req({ url: `${mock.base}/x` }));
    assert.equal(rec.errorCode, null);
  } finally { await mock.close(); }
});

test('redirect toi endpoint van tra JSON thi khong bao loi', async () => {
  const mock = await startMockServer((r, res) => {
    if (r.url === '/old') {
      res.writeHead(301, { location: '/new' });
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
  try {
    const rec = await sendRequest(req({ url: `${mock.base}/old` }));
    assert.equal(rec.response.redirected, true);
    assert.deepEqual(rec.response.body, { ok: true });
    assert.equal(rec.errorCode, null, 'redirect ma van ra JSON thi khong phai loi');
  } finally { await mock.close(); }
});

test('record mang lai authId va authName tu request', async () => {
  const mock = await startMockServer((_, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{}');
  });
  try {
    const rec = await sendRequest(req({ url: `${mock.base}/x`, authId: 'a1', authName: 'PROD' }));
    assert.equal(rec.authId, 'a1');
    assert.equal(rec.authName, 'PROD');
  } finally { await mock.close(); }
});

test('record dat authId/authName rong khi request khong co', async () => {
  const mock = await startMockServer((_, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{}');
  });
  try {
    const rec = await sendRequest(req({ url: `${mock.base}/x` }));
    assert.equal(rec.authId, '');
    assert.equal(rec.authName, '');
  } finally { await mock.close(); }
});

/* ---------- kiem tra statusPermission ---------- */

const samplePermissionFile = {
  filename: 'permissions.xlsx',
  headers: ['API Name', 'Sheet 1 - User', 'Sheet 1 - Admin'],
  rows: [
    ['Tra cuu TB', 'x', ''],
    ['Doi SIM', '', 'x'],
  ],
};

const samplePermissionMapping = {
  usecase1: [
    { endpointSheet: 'Sheet 1', permissionColumn: 'Sheet 1 - User', authProfileName: 'User Profile' },
    { endpointSheet: 'Sheet 1', permissionColumn: 'Sheet 1 - Admin', authProfileName: 'Admin Profile' },
  ],
  usecase2: {
    permissionColumn: 'API Name',
    targetSheet: 'all',
  },
};

test('statusPermission tra ve null khi khong bat permission check', async () => {
  const mock = await startMockServer((_, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{}');
  });
  try {
    const rec = await sendRequest(req({ url: `${mock.base}/x` }));
    assert.equal(rec.statusPermission, null);
  } finally { await mock.close(); }
});

test('statusPermission tra ve "true" khi status 200 va profile khop quyen', async () => {
  const mock = await startMockServer((_, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{}');
  });
  try {
    const rec = await sendRequest(
      req({ url: `${mock.base}/x`, endpointName: 'Tra cuu TB', sheetName: 'Sheet 1', authName: 'User Profile' }),
      { permissionFile: samplePermissionFile, permissionMapping: samplePermissionMapping },
    );
    assert.equal(rec.statusPermission, 'true');
  } finally { await mock.close(); }
});

test('statusPermission tra ve "true" khi status 403 va profile khong khop quyen', async () => {
  const mock = await startMockServer((_, res) => {
    res.writeHead(403, { 'content-type': 'application/json' });
    res.end('{}');
  });
  try {
    const rec = await sendRequest(
      req({ url: `${mock.base}/x`, endpointName: 'Tra cuu TB', sheetName: 'Sheet 1', authName: 'Admin Profile' }),
      { permissionFile: samplePermissionFile, permissionMapping: samplePermissionMapping },
    );
    assert.equal(rec.statusPermission, 'true');
  } finally { await mock.close(); }
});

test('statusPermission tra ve "false" khi status NOT 200 (500) ma profile khop quyen', async () => {
  const mock = await startMockServer((_, res) => {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end('{}');
  });
  try {
    const rec = await sendRequest(
      req({ url: `${mock.base}/x`, endpointName: 'Tra cuu TB', sheetName: 'Sheet 1', authName: 'User Profile' }),
      { permissionFile: samplePermissionFile, permissionMapping: samplePermissionMapping },
    );
    assert.equal(rec.statusPermission, 'false');
  } finally { await mock.close(); }
});

test('statusPermission tra ve "false" khi status NOT 403 (200) ma profile khong khop quyen', async () => {
  const mock = await startMockServer((_, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{}');
  });
  try {
    const rec = await sendRequest(
      req({ url: `${mock.base}/x`, endpointName: 'Tra cuu TB', sheetName: 'Sheet 1', authName: 'Admin Profile' }),
      { permissionFile: samplePermissionFile, permissionMapping: samplePermissionMapping },
    );
    assert.equal(rec.statusPermission, 'false');
  } finally { await mock.close(); }
});

test('statusPermission tra ve "empty" khi ten API khong co trong file quyen', async () => {
  const mock = await startMockServer((_, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{}');
  });
  try {
    const rec = await sendRequest(
      req({ url: `${mock.base}/x`, endpointName: 'API Khong Ton Tai', sheetName: 'Sheet 1', authName: 'User Profile' }),
      { permissionFile: samplePermissionFile, permissionMapping: samplePermissionMapping },
    );
    assert.equal(rec.statusPermission, 'empty');
  } finally { await mock.close(); }
});

