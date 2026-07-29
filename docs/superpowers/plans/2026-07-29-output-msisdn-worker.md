# Output viewer, msisdn mặc định, worker pool, filter theo cột — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gắn msisdn mặc định vào mọi request, đổi nghĩa `{*}` thành ranh giới query riêng, chạy request bằng worker pool, và dựng lại tab OUTPUT với viewer kiểu Postman + filter đặt dưới tiêu đề cột.

**Architecture:** Không có build step — `public/` là ES module chạy thẳng trên trình duyệt, `src/server/` là ES module Node. Logic thuần (dựng path, filter, đếm request) nằm ở `public/js/shared/` và được import từ cả hai phía, nên test được bằng `node --test` mà không cần DOM. Phần cần DOM thì test bằng MockElement như các file test hiện có.

**Tech Stack:** Node 20+, Express 5, ExcelJS, `node:worker_threads`, `node:test`, vanilla ES module + CSS thuần.

## Global Constraints

- Không thêm dependency mới. `package.json` giữ nguyên `exceljs` + `express`.
- Không có bundler. Mọi import trong `public/` phải là đường dẫn tương đối có đuôi `.js`.
- Chạy test bằng `npm test` (`node --test "test/**/*.test.js"`).
- Comment trong code viết tiếng Việt **không dấu** — theo đúng convention đang có trong repo.
- Tên biến, hàm, key JSON giữ tiếng Anh.
- Chuỗi hiển thị cho người dùng viết tiếng Việt **có dấu**.
- `MAX_INFLIGHT = 5` request đồng thời trên mỗi worker — con số cố định, không cấu hình được.
- Số worker `workerCount`: mặc định 4, min 1, max 16.
- Spec gốc: `docs/superpowers/specs/2026-07-29-output-msisdn-worker-design.md`.

## File Structure

**Tạo mới:**

| File | Trách nhiệm |
|---|---|
| `public/js/shared/endpoint-path.js` | Tách `pathTemplate` thành path + query riêng, nhận diện placeholder msisdn cũ |
| `public/js/shared/request-count.js` | Đếm số request từ state (dùng chung UI và test) |
| `src/server/request-worker.js` | Entry của worker thread, gọi `sendRequest` |
| `src/server/worker-pool.js` | Pool N worker × 5 request in-flight, hàng đợi, huỷ, hồi phục khi worker chết |
| `test/endpoint-path.test.js` | Test tách path |
| `test/request-count.test.js` | Test đếm request |
| `test/worker-pool.test.js` | Test pool |

**Sửa:**

| File | Thay đổi |
|---|---|
| `public/js/shared/variables.js` | Bỏ xử lý `{*}` |
| `public/js/shared/filter-logic.js` | Cột mới, model filter mới |
| `public/js/ui/endpoint-list.js` | Field + radio `attachMsisdn` |
| `public/js/ui/result-table.js` | Cột mới, thead cố định, hàng filter |
| `public/js/ui/filters.js` | Ô filter theo cột, filterbar chỉ còn msisdn |
| `public/js/ui/detail-drawer.js` | Bảng key-value + viewer Pretty/Raw/Preview |
| `public/js/main.js` | `countRequests`, `workerCount` |
| `public/js/state.js` | `workerCount` trong `advanced` |
| `public/index.html` | Layout INPUT 2 cột, filterbar mới, ô Advanced |
| `public/css/app.css` | Grid `1fr 2fr`, hàng filter, bảng kv, viewer, drawer rộng hơn |
| `src/server/request-builder.js` | Dựng path + msisdn + thứ tự query |
| `src/server/runner.js` | Chạy qua pool, fallback inline |
| `src/server/routes.js` | Truyền `workerCount` |
| `src/server/excel-export.js` | Thêm cột `Response Headers` |

---

### Task 1: Tách `{*}` khỏi pathTemplate

**Files:**
- Create: `public/js/shared/endpoint-path.js`
- Create: `test/endpoint-path.test.js`
- Modify: `public/js/shared/variables.js`

**Interfaces:**
- Consumes: không có.
- Produces:
  - `splitTemplate(template: string) => { path: string, inlineQuery: string }`
  - `parseInlineQuery(qs: string) => Array<{ key: string, value: string }>`
  - `hasMsisdnPlaceholder(path: string) => boolean`

- [ ] **Step 1: Viết test thất bại**

Tạo `test/endpoint-path.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitTemplate, parseInlineQuery, hasMsisdnPlaceholder } from '../public/js/shared/endpoint-path.js';

test('splitTemplate tach path va query rieng qua dau sao', () => {
  assert.deepEqual(
    splitTemplate('/query/abc-information/{*}?type=PREPAID&limit=10'),
    { path: '/query/abc-information', inlineQuery: 'type=PREPAID&limit=10' },
  );
});

test('splitTemplate bo dau gach cheo thua truoc dau sao', () => {
  assert.deepEqual(
    splitTemplate('/query/abc-information/{*}'),
    { path: '/query/abc-information', inlineQuery: '' },
  );
});

test('splitTemplate chap nhan dau sao khong co dau gach cheo', () => {
  assert.deepEqual(splitTemplate('/query/abc{*}'), { path: '/query/abc', inlineQuery: '' });
});

test('splitTemplate khong co dau sao thi tach o dau hoi', () => {
  assert.deepEqual(splitTemplate('/health?x=1'), { path: '/health', inlineQuery: 'x=1' });
});

test('splitTemplate khong co dau sao lan dau hoi', () => {
  assert.deepEqual(splitTemplate('/health'), { path: '/health', inlineQuery: '' });
});

test('splitTemplate xu ly gia tri rong', () => {
  assert.deepEqual(splitTemplate(''), { path: '', inlineQuery: '' });
  assert.deepEqual(splitTemplate(null), { path: '', inlineQuery: '' });
});

test('parseInlineQuery tra ve cap key value theo dung thu tu', () => {
  assert.deepEqual(
    parseInlineQuery('type=PREPAID&limit=10'),
    [{ key: 'type', value: 'PREPAID' }, { key: 'limit', value: '10' }],
  );
});

test('parseInlineQuery giu nguyen bien chua resolve', () => {
  assert.deepEqual(parseInlineQuery('from={{fromDate}}'), [{ key: 'from', value: '{{fromDate}}' }]);
});

test('parseInlineQuery cho key khong co gia tri', () => {
  assert.deepEqual(parseInlineQuery('debug'), [{ key: 'debug', value: '' }]);
});

test('parseInlineQuery bo qua doan rong', () => {
  assert.deepEqual(parseInlineQuery('&a=1&&'), [{ key: 'a', value: '1' }]);
  assert.deepEqual(parseInlineQuery(''), []);
});

test('hasMsisdnPlaceholder nhan dien cu phap cu', () => {
  assert.equal(hasMsisdnPlaceholder('/query/abc/:msisdn/detail'), true);
  assert.equal(hasMsisdnPlaceholder('/query/abc/{{msisdn}}'), true);
  assert.equal(hasMsisdnPlaceholder('/query/abc/{{ msisdn }}'), true);
  assert.equal(hasMsisdnPlaceholder('/query/abc'), false);
  assert.equal(hasMsisdnPlaceholder('/query/:accountId'), false);
});
```

- [ ] **Step 2: Chạy test cho chắc là hỏng**

Run: `npm test -- --test-name-pattern="splitTemplate"`
Expected: FAIL — `Cannot find module .../public/js/shared/endpoint-path.js`

- [ ] **Step 3: Viết implementation tối thiểu**

Tạo `public/js/shared/endpoint-path.js`:

```js
const STAR = '{*}';
const MSISDN_PLACEHOLDER = /:msisdn\b|\{\{\s*msisdn\s*\}\}/;

// "/a/b/{*}?x=1" -> { path: "/a/b", inlineQuery: "x=1" }
// Dau sao la ranh gioi: ben trai la path, ben phai la query rieng cua endpoint.
export function splitTemplate(template) {
  const text = String(template ?? '').trim();
  const at = text.indexOf(STAR);

  if (at === -1) {
    const q = text.indexOf('?');
    if (q === -1) return { path: text, inlineQuery: '' };
    return { path: text.slice(0, q), inlineQuery: text.slice(q + 1) };
  }

  return {
    path: text.slice(0, at).replace(/\/+$/, ''),
    inlineQuery: text.slice(at + STAR.length).replace(/^\?/, ''),
  };
}

// Khong decode gia tri vi no co the con chua {{fromDate}} chua resolve.
export function parseInlineQuery(qs) {
  const out = [];
  for (const part of String(qs ?? '').split('&')) {
    if (part === '') continue;
    const eq = part.indexOf('=');
    const key = eq === -1 ? part : part.slice(0, eq);
    if (key === '') continue;
    out.push({ key, value: eq === -1 ? '' : part.slice(eq + 1) });
  }
  return out;
}

export function hasMsisdnPlaceholder(path) {
  return MSISDN_PLACEHOLDER.test(String(path ?? ''));
}
```

- [ ] **Step 4: Chạy test cho chắc là xanh**

Run: `npm test -- --test-name-pattern="splitTemplate|parseInlineQuery|hasMsisdnPlaceholder"`
Expected: PASS, 11 test

- [ ] **Step 5: Gỡ xử lý `{*}` khỏi `variables.js`**

Sửa `public/js/shared/variables.js` — xoá `STAR_RE`, `STAR_NAME`, và mọi tham chiếu tới chúng. File sau khi sửa:

```js
const CURLY_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
const COLON_RE = /:([A-Za-z_][A-Za-z0-9_]*)/g;

export function extractVariables(template) {
  const names = new Set();
  const text = String(template ?? '');
  for (const m of text.matchAll(CURLY_RE)) names.add(m[1]);
  for (const m of text.matchAll(COLON_RE)) names.add(m[1]);
  return [...names];
}

export function resolve(template, scope = {}) {
  const missing = new Set();
  const text = String(template ?? '');

  const pick = (name) => {
    const v = scope[name];
    if (v === undefined || v === null || v === '') {
      missing.add(name);
      return '';
    }
    return String(v);
  };

  const value = text
    .replace(CURLY_RE, (_, name) => pick(name))
    .replace(COLON_RE, (_, name) => pick(name));

  return { value, missing: [...missing] };
}
```

- [ ] **Step 6: Chạy toàn bộ test**

Run: `npm test`
Expected: `test/request-builder.test.js` FAIL ở test `buildRequests nhan msisdn voi endpoint dung placeholder sao` — đúng như dự kiến, Task 2 sẽ sửa. Các file test khác PASS.

- [ ] **Step 7: Commit**

```bash
git add public/js/shared/endpoint-path.js public/js/shared/variables.js test/endpoint-path.test.js
git commit -m "feat: tach {*} thanh ranh gioi path va query rieng"
```

---

### Task 2: msisdn nối cuối path trong request-builder

**Files:**
- Modify: `src/server/request-builder.js`
- Test: `test/request-builder.test.js`

**Interfaces:**
- Consumes: `splitTemplate`, `parseInlineQuery`, `hasMsisdnPlaceholder` từ Task 1.
- Produces: `buildRequests(config)` và `validateConfig(config)` với hành vi mới; endpoint dùng field `attachMsisdn` (boolean, thiếu thì coi là `true`).

- [ ] **Step 1: Viết test thất bại**

Trong `test/request-builder.test.js`, thay hàm `baseConfig` để endpoint mặc định không còn placeholder:

```js
function baseConfig(over = {}) {
  return {
    domain: 'https://abc.vn',
    token: 'TOKEN123',
    dateRange: { from: '25/03/2026', to: '01/04/2026' },
    dateFormat: 'ddMMyyyy',
    msisdns: ['0912345678', '0913000111'],
    endpoints: [
      { id: 'ep_1', enabled: true, method: 'GET', attachMsisdn: true,
        pathTemplate: '/query/abc-information', queryParams: [], headers: [] }
    ],
    globalQueryParams: [
      { key: 'fromDate', value: '{{fromDate}}', enabled: true },
      { key: 'toDate', value: '{{toDate}}', enabled: true }
    ],
    globalHeaders: [],
    advanced: { workerCount: 4, timeoutMs: 30000 },
    ...over,
  };
}
```

Xoá test cũ `buildRequests nhan msisdn voi endpoint dung placeholder sao`, `buildRequests sinh 1 request cho endpoint khong dung msisdn` và `validateConfig bat endpoint dung msisdn nhung danh sach rong`. Thêm vào cuối file:

```js
test('buildRequests noi msisdn vao cuoi path khi khong co placeholder', () => {
  const reqs = buildRequests(baseConfig());
  assert.equal(reqs.length, 2);
  assert.equal(
    reqs[0].url,
    'https://abc.vn/query/abc-information/0912345678?fromDate=25032026&toDate=01042026',
  );
  assert.equal(reqs[1].msisdn, '0913000111');
});

test('buildRequests coi path co dau sao giong het path tran', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].pathTemplate = '/query/abc-information/{*}';
  assert.equal(
    buildRequests(cfg)[0].url,
    'https://abc.vn/query/abc-information/0912345678?fromDate=25032026&toDate=01042026',
  );
});

test('buildRequests ghep query rieng sau dau sao truoc query global', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].pathTemplate = '/query/abc-information/{*}?type=PREPAID&limit=10';
  assert.equal(
    buildRequests(cfg)[0].url,
    'https://abc.vn/query/abc-information/0912345678'
    + '?type=PREPAID&limit=10&fromDate=25032026&toDate=01042026',
  );
});

test('buildRequests cho query rieng de len query global khi trung key', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].pathTemplate = '/query/abc-information/{*}?fromDate=01011999';
  const reqs = buildRequests(cfg);
  assert.equal(reqs[0].queryParams.fromDate, '01011999');
  assert.equal(reqs[0].queryParams.toDate, '01042026');
});

test('buildRequests resolve bien trong query rieng', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].pathTemplate = '/query/abc-information/{*}?from={{fromDate}}';
  assert.equal(buildRequests(cfg)[0].queryParams.from, '25032026');
});

test('buildRequests giu cu phap msisdn cu va khong noi them o cuoi', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].pathTemplate = '/query/abc-information/:msisdn/detail';
  assert.equal(
    buildRequests(cfg)[0].url,
    'https://abc.vn/query/abc-information/0912345678/detail?fromDate=25032026&toDate=01042026',
  );
});

test('buildRequests chay 1 request khi attachMsisdn false', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].attachMsisdn = false;
  cfg.endpoints[0].pathTemplate = '/system/health';
  const reqs = buildRequests(cfg);
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0].msisdn, null);
  assert.deepEqual(reqs[0].pathParams, {});
  assert.equal(reqs[0].url, 'https://abc.vn/system/health?fromDate=25032026&toDate=01042026');
});

test('buildRequests coi endpoint thieu attachMsisdn la true', () => {
  const cfg = baseConfig();
  delete cfg.endpoints[0].attachMsisdn;
  assert.equal(buildRequests(cfg).length, 2);
});

test('validateConfig bat endpoint can msisdn nhung danh sach rong', () => {
  const errs = validateConfig(baseConfig({ msisdns: [] }));
  assert.ok(errs.some((e) => e.field === 'endpoint:ep_1'));
});

test('validateConfig cho qua endpoint attachMsisdn false du danh sach rong', () => {
  const cfg = baseConfig({ msisdns: [] });
  cfg.endpoints[0].attachMsisdn = false;
  assert.deepEqual(validateConfig(cfg), []);
});

test('validateConfig chi kiem tra phan path, bo qua query rieng', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].pathTemplate = '/query/abc/{*}?note=co dau cach';
  assert.deepEqual(validateConfig(cfg), []);
});
```

Sửa luôn hai test cũ còn tham chiếu `:msisdn`:

```js
test('buildRequests sinh ma tran endpoint x msisdn', () => {
  const cfg = baseConfig();
  cfg.endpoints.push({ id: 'ep_2', enabled: true, method: 'GET', attachMsisdn: true,
    pathTemplate: '/query/other', queryParams: [], headers: [] });
  const reqs = buildRequests(cfg);
  assert.equal(reqs.length, 4);
  assert.deepEqual(reqs.map((r) => r.index), [1, 2, 3, 4]);
});

test('buildRequests bo qua endpoint bi tat', () => {
  const cfg = baseConfig();
  cfg.endpoints.push({ id: 'ep_2', enabled: false, method: 'GET', attachMsisdn: true,
    pathTemplate: '/query/other', queryParams: [], headers: [] });
  assert.equal(buildRequests(cfg).length, 2);
});

test('buildRequests ghi lai bien khong resolve duoc', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].pathTemplate = '/query/{{unknownVar}}/abc';
  const reqs = buildRequests(cfg);
  assert.deepEqual(reqs[0].unresolved, ['unknownVar']);
});

test('buildRequests mang ca endpointName lan pathTemplate', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].name = 'Tra cuu thue bao';
  const reqs = buildRequests(cfg);
  assert.equal(reqs[0].endpointName, 'Tra cuu thue bao');
  assert.equal(reqs[0].pathTemplate, '/query/abc-information');
});

test('buildRequests de endpointName rong khi endpoint khong co ten', () => {
  const reqs = buildRequests(baseConfig());
  assert.equal(reqs[0].endpointName, '');
  assert.equal(reqs[0].pathTemplate, '/query/abc-information');
});
```

- [ ] **Step 2: Chạy test cho chắc là hỏng**

Run: `npm test -- --test-name-pattern="noi msisdn vao cuoi path"`
Expected: FAIL — URL ra `https://abc.vn/query/abc-information?fromDate=...` vì chưa nối msisdn.

- [ ] **Step 3: Viết implementation**

Thay toàn bộ `src/server/request-builder.js`:

```js
import { resolve } from './variables.js';
import { validateRange, formatDate } from './date-format.js';
import { isEndpointPath } from '../../public/js/shared/validators.js';
import { splitTemplate, parseInlineQuery, hasMsisdnPlaceholder } from '../../public/js/shared/endpoint-path.js';

// Endpoint cu chua co field nay thi mac dinh la co gan msisdn.
const wantsMsisdn = (ep) => ep?.attachMsisdn !== false;
const activeOnly = (list) => (list ?? []).filter((p) => p.enabled !== false);

export function validateConfig(config) {
  const errors = [];

  if (!/^https?:\/\/\S+$/i.test(String(config?.domain ?? '').trim())) {
    errors.push({ field: 'domain', message: 'Domain phải bắt đầu bằng http:// hoặc https://' });
  }

  const range = validateRange(config?.dateRange?.from, config?.dateRange?.to);
  if (!range.ok) errors.push({ field: 'dateRange', message: range.error });

  const enabled = (config?.endpoints ?? []).filter((e) => e.enabled);
  if (enabled.length === 0) {
    errors.push({ field: 'endpoints', message: 'Cần bật ít nhất 1 endpoint' });
  }

  const msisdns = config?.msisdns ?? [];
  for (const ep of enabled) {
    // Chi kiem tra phan path, query rieng sau {*} duoc phep chua dau cach.
    const { path } = splitTemplate(ep.pathTemplate);
    if (!isEndpointPath(path)) {
      errors.push({ field: `endpoint:${ep.id}`, message: `Path "${path}" phải bắt đầu bằng / và không chứa khoảng trắng` });
      continue;
    }
    if (wantsMsisdn(ep) && msisdns.length === 0) {
      errors.push({ field: `endpoint:${ep.id}`, message: 'Endpoint cần msisdn nhưng danh sách MSISDN đang rỗng' });
    }
  }

  return errors;
}

// Thu tu chen quyet dinh ca thu tu trong URL lan do uu tien: cai vao truoc thang.
function mergePairs(inlineList, endpointList, globalList) {
  const map = new Map();
  const put = (k, v) => { if (k && !map.has(k)) map.set(k, v); };
  for (const p of inlineList ?? []) put(p.key, p.value);
  for (const p of activeOnly(endpointList)) put(p.key, p.value);
  for (const p of activeOnly(globalList)) put(p.key, p.value);
  return map;
}

function buildOne({ config, endpoint, msisdn, scope, index }) {
  const missing = new Set();
  const take = (tpl) => {
    const r = resolve(tpl, scope);
    for (const m of r.missing) missing.add(m);
    return r.value;
  };

  const { path: rawPath, inlineQuery } = splitTemplate(endpoint.pathTemplate);
  let path = take(rawPath);
  if (msisdn && !hasMsisdnPlaceholder(rawPath)) {
    path = `${path.replace(/\/+$/, '')}/${msisdn}`;
  }

  const queryParams = {};
  for (const [k, v] of mergePairs(parseInlineQuery(inlineQuery), endpoint.queryParams, config.globalQueryParams)) {
    queryParams[take(k)] = take(v);
  }

  const headers = {};
  for (const [k, v] of mergePairs([], endpoint.headers, config.globalHeaders)) {
    headers[take(k)] = take(v);
  }

  const hasAuth = Object.keys(headers).some((k) => k.toLowerCase() === 'authorization');
  if (config.token && !hasAuth) headers.Authorization = `Bearer ${config.token}`;

  const base = String(config.domain).trim().replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  const qs = new URLSearchParams(queryParams).toString();

  return {
    index,
    endpointId: endpoint.id,
    endpointName: endpoint.name ?? '',
    pathTemplate: endpoint.pathTemplate,
    msisdn: msisdn ?? null,
    method: (endpoint.method || 'GET').toUpperCase(),
    url: `${base}${suffix}${qs ? `?${qs}` : ''}`,
    headers,
    queryParams,
    pathParams: msisdn ? { msisdn } : {},
    body: endpoint.body ?? null,
    unresolved: [...missing],
  };
}

export function buildRequests(config) {
  const range = validateRange(config?.dateRange?.from, config?.dateRange?.to);
  if (!range.ok) throw new Error(range.error);

  const fmt = config.dateFormat || 'ddMMyyyy';
  const baseScope = {
    fromDate: formatDate(range.from, fmt),
    toDate: formatDate(range.to, fmt),
  };

  const requests = [];
  let index = 0;

  for (const endpoint of (config.endpoints ?? []).filter((e) => e.enabled)) {
    const list = wantsMsisdn(endpoint) ? (config.msisdns ?? []) : [null];
    for (const msisdn of list) {
      index += 1;
      requests.push(buildOne({
        config, endpoint, msisdn, index,
        scope: { ...baseScope, msisdn },
      }));
    }
  }

  return requests;
}
```

Lưu ý: `mergePairs` giờ nhận 3 tham số theo thứ tự inline → endpoint → global, và trong `headers` truyền `[]` cho vị trí inline vì header không có phần inline.

- [ ] **Step 4: Chạy test cho chắc là xanh**

Run: `npm test -- --test-name-pattern="buildRequests|validateConfig"`
Expected: PASS toàn bộ

- [ ] **Step 5: Chạy toàn bộ test**

Run: `npm test`
Expected: PASS. Nếu `test/routes.test.js` hoặc `test/api.test.js` hỏng vì config mẫu trong đó dùng `:msisdn`, sửa config mẫu sang `attachMsisdn: true` + path trần giống `baseConfig` ở trên.

- [ ] **Step 6: Commit**

```bash
git add src/server/request-builder.js test/request-builder.test.js test/routes.test.js test/api.test.js
git commit -m "feat: msisdn noi cuoi path, query rieng ghep truoc query global"
```

---

### Task 3: Radio `attachMsisdn` trong UI và đếm request

**Files:**
- Create: `public/js/shared/request-count.js`
- Create: `test/request-count.test.js`
- Modify: `public/js/ui/endpoint-list.js`
- Modify: `public/js/main.js:73-77`

**Interfaces:**
- Consumes: không có.
- Produces: `countRequests(state) => number`. Endpoint object có thêm field `attachMsisdn: boolean`.

- [ ] **Step 1: Viết test thất bại**

Tạo `test/request-count.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countRequests } from '../public/js/shared/request-count.js';

const st = (endpoints, msisdns = ['0912345678', '0913000111']) => ({ endpoints, msisdns });

test('countRequests nhan endpoint voi so luong msisdn', () => {
  assert.equal(countRequests(st([{ enabled: true, attachMsisdn: true }])), 2);
});

test('countRequests dem 1 cho endpoint attachMsisdn false', () => {
  assert.equal(countRequests(st([{ enabled: true, attachMsisdn: false }])), 1);
});

test('countRequests coi thieu attachMsisdn la true', () => {
  assert.equal(countRequests(st([{ enabled: true }])), 2);
});

test('countRequests bo qua endpoint bi tat', () => {
  assert.equal(countRequests(st([{ enabled: false, attachMsisdn: true }])), 0);
});

test('countRequests cong don nhieu endpoint', () => {
  assert.equal(
    countRequests(st([{ enabled: true, attachMsisdn: true }, { enabled: true, attachMsisdn: false }])),
    3,
  );
});

test('countRequests tra 0 khi danh sach msisdn rong ma endpoint can msisdn', () => {
  assert.equal(countRequests(st([{ enabled: true, attachMsisdn: true }], [])), 0);
});

test('countRequests chiu duoc state rong', () => {
  assert.equal(countRequests({}), 0);
});
```

- [ ] **Step 2: Chạy test cho chắc là hỏng**

Run: `npm test -- --test-name-pattern="countRequests"`
Expected: FAIL — `Cannot find module .../public/js/shared/request-count.js`

- [ ] **Step 3: Viết implementation**

Tạo `public/js/shared/request-count.js`:

```js
export function countRequests(state) {
  const msisdnCount = (state?.msisdns ?? []).length;
  return (state?.endpoints ?? [])
    .filter((e) => e.enabled)
    .reduce((sum, ep) => sum + (ep.attachMsisdn !== false ? msisdnCount : 1), 0);
}
```

- [ ] **Step 4: Chạy test cho chắc là xanh**

Run: `npm test -- --test-name-pattern="countRequests"`
Expected: PASS, 7 test

- [ ] **Step 5: Dùng `countRequests` trong `main.js`**

Trong `public/js/main.js`, đổi import ở đầu file — bỏ dòng `import { extractVariables } from './shared/variables.js';`, thêm:

```js
import { countRequests } from './shared/request-count.js';
```

Xoá hàm `countRequests` cũ (dòng 73-77), và sửa `refreshRunButton`:

```js
function refreshRunButton() {
  const n = countRequests(state);
  btnRun.textContent = `▶ RUN ALL (${n})`;
  btnRun.disabled = n === 0 || running;
}
```

- [ ] **Step 6: Thêm field `attachMsisdn` vào endpoint**

Trong `public/js/ui/endpoint-list.js`, sửa `makeEndpoint`:

```js
function makeEndpoint(path) {
  return {
    id: nextId(), enabled: true, name: '', method: 'GET',
    pathTemplate: String(path ?? ''), attachMsisdn: true,
    queryParams: [], headers: [],
  };
}
```

Sửa dòng migration ở đầu `initEndpointList` để endpoint cũ được vá field mới:

```js
  // Du lieu cu trong localStorage co the la mang chuoi, thieu name hoac thieu attachMsisdn.
  state.endpoints = (state.endpoints ?? []).map((e) => (
    typeof e === 'string' ? makeEndpoint(e) : { name: '', attachMsisdn: true, ...e }
  ));
```

- [ ] **Step 7: Thêm radio vào dòng endpoint**

Trong `renderExtra` của `public/js/ui/endpoint-list.js`, thêm ngay trước `row.append(...)`:

```js
      const msisdnBox = document.createElement('span');
      msisdnBox.className = 'el-msisdn-toggle';
      msisdnBox.title = 'Gắn msisdn vào cuối path của endpoint này';

      const groupName = `attach_${ep.id}`;
      for (const opt of [{ v: true, label: 'Có' }, { v: false, label: 'Không' }]) {
        const wrap = document.createElement('label');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = groupName;
        radio.checked = (ep.attachMsisdn !== false) === opt.v;
        radio.addEventListener('change', () => {
          state.endpoints[index] = { ...state.endpoints[index], attachMsisdn: opt.v };
          persist();
          notify();
        });
        wrap.append(radio, document.createTextNode(opt.label));
        msisdnBox.append(wrap);
      }
```

Và đổi dòng cuối thành:

```js
      row.append(check, method, name, msisdnBox);
```

- [ ] **Step 8: Thêm CSS cho toggle**

Trong `public/css/app.css`, thêm vào cuối khối endpoint list (ngay trước `/* ---------- filterbar ---------- */`):

```css
.el-msisdn-toggle {
  display: inline-flex; align-items: center; gap: var(--sp-xs);
  font-size: var(--fs-caption); color: var(--muted); white-space: nowrap;
}
.el-msisdn-toggle label { display: inline-flex; align-items: center; gap: 2px; cursor: pointer; }
```

- [ ] **Step 9: Chạy toàn bộ test**

Run: `npm test`
Expected: PASS

- [ ] **Step 10: Kiểm tra bằng mắt**

Run: `npm start`, mở `http://localhost:2345`, thêm 2 endpoint, tắt radio msisdn ở endpoint thứ hai, nhập 3 số MSISDN.
Expected: nút RUN ALL hiện `▶ RUN ALL (4)` (3 + 1). Reload trang thì lựa chọn radio vẫn giữ nguyên.

- [ ] **Step 11: Commit**

```bash
git add public/js/shared/request-count.js public/js/ui/endpoint-list.js public/js/main.js public/css/app.css test/request-count.test.js
git commit -m "feat: radio gan msisdn tren tung endpoint"
```

---

### Task 4: Worker pool

**Files:**
- Create: `src/server/request-worker.js`
- Create: `src/server/worker-pool.js`
- Create: `test/worker-pool.test.js`

**Interfaces:**
- Consumes: `sendRequest(req, options)` từ `src/server/http-client.js`.
- Produces:
  - `runPool(requests, options) => Promise<{ cancelled: boolean }>` với `options = { workerCount, timeoutMs, errorCodePaths, signal, onRecord }`
  - Hằng số export: `MAX_INFLIGHT = 5`, `MAX_WORKERS = 16`
  - `onRecord(record)` nhận đúng shape record mà `finalize()` trong `http-client.js` trả về.

- [ ] **Step 1: Viết test thất bại**

Tạo `test/worker-pool.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPool, MAX_INFLIGHT } from '../src/server/worker-pool.js';
import { startMockServer } from './helpers/mock-server.js';

function mkReq(index, url) {
  return {
    index, endpointId: 'ep_1', endpointName: 'EP', pathTemplate: '/x',
    msisdn: `09120000${index}`, method: 'GET', url,
    headers: {}, queryParams: {}, pathParams: {}, body: null, unresolved: [],
  };
}

test('MAX_INFLIGHT la 5', () => {
  assert.equal(MAX_INFLIGHT, 5);
});

test('runPool chay het request va tra du record', async () => {
  const mock = await startMockServer((_, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
  try {
    const reqs = Array.from({ length: 12 }, (_, i) => mkReq(i + 1, `${mock.base}/x`));
    const seen = [];
    const out = await runPool(reqs, { workerCount: 2, timeoutMs: 5000, onRecord: (r) => seen.push(r) });
    assert.equal(out.cancelled, false);
    assert.equal(seen.length, 12);
    assert.deepEqual(
      seen.map((r) => r.index).sort((a, b) => a - b),
      Array.from({ length: 12 }, (_, i) => i + 1),
    );
    assert.equal(seen[0].response.status, 200);
  } finally { await mock.close(); }
});

test('runPool khong vuot qua workerCount nhan MAX_INFLIGHT', async () => {
  let inFlight = 0;
  let peak = 0;
  const mock = await startMockServer((_, res) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    setTimeout(() => { inFlight -= 1; res.end('{}'); }, 40);
  });
  try {
    const reqs = Array.from({ length: 40 }, (_, i) => mkReq(i + 1, `${mock.base}/x`));
    await runPool(reqs, { workerCount: 2, timeoutMs: 5000, onRecord: () => {} });
    assert.ok(peak <= 2 * MAX_INFLIGHT, `peak=${peak} vuot qua 2 x ${MAX_INFLIGHT}`);
  } finally { await mock.close(); }
});

test('runPool tra ve ngay khi danh sach rong', async () => {
  const out = await runPool([], { workerCount: 2, onRecord: () => {} });
  assert.deepEqual(out, { cancelled: false });
});

test('runPool dung khi signal bi abort', async () => {
  const mock = await startMockServer(() => { /* treo, khong tra loi */ });
  try {
    const reqs = Array.from({ length: 20 }, (_, i) => mkReq(i + 1, `${mock.base}/x`));
    const controller = new AbortController();
    const seen = [];
    setTimeout(() => controller.abort(), 80);
    const out = await runPool(reqs, {
      workerCount: 2, timeoutMs: 20000, signal: controller.signal,
      onRecord: (r) => seen.push(r),
    });
    assert.equal(out.cancelled, true);
    assert.ok(seen.length < 20, `phai dung som, moi nhan ${seen.length} record`);
  } finally { await mock.close(); }
});

test('runPool gioi han so worker toi da 16', async () => {
  const mock = await startMockServer((_, res) => res.end('{}'));
  try {
    const reqs = [mkReq(1, `${mock.base}/x`)];
    const out = await runPool(reqs, { workerCount: 999, timeoutMs: 5000, onRecord: () => {} });
    assert.equal(out.cancelled, false);
  } finally { await mock.close(); }
});

test('runPool van tra record khi request loi mang', async () => {
  // Cong 1 khong ai lang nghe, fetch nem loi ngay, worker van phai tra record.
  const seen = [];
  await runPool([mkReq(1, 'http://127.0.0.1:1/khong-ton-tai')], {
    workerCount: 1, timeoutMs: 2000, onRecord: (r) => seen.push(r),
  });
  assert.equal(seen.length, 1);
  assert.ok(seen[0].errorCode, 'phai co errorCode');
  assert.equal(seen[0].response.status, null);
});
```

- [ ] **Step 2: Chạy test cho chắc là hỏng**

Run: `npm test -- --test-name-pattern="runPool"`
Expected: FAIL — `Cannot find module .../src/server/worker-pool.js`

- [ ] **Step 3: Viết entry của worker**

Tạo `src/server/request-worker.js`:

```js
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

parentPort.postMessage({ type: 'ready' });
```

- [ ] **Step 4: Viết pool**

Tạo `src/server/worker-pool.js`:

```js
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
```

- [ ] **Step 5: Chạy test cho chắc là xanh**

Run: `npm test -- --test-name-pattern="runPool|MAX_INFLIGHT"`
Expected: PASS, 7 test

- [ ] **Step 6: Commit**

```bash
git add src/server/request-worker.js src/server/worker-pool.js test/worker-pool.test.js
git commit -m "feat: worker pool N luong x 5 request dong thoi"
```

---

### Task 5: Nối pool vào runner, thêm `workerCount` vào cấu hình

**Files:**
- Modify: `src/server/runner.js`
- Modify: `src/server/routes.js:17-23`
- Modify: `public/js/state.js:21-27`
- Modify: `public/js/main.js:51-68`
- Modify: `public/index.html:95-98`
- Test: `test/runner.test.js`

**Interfaces:**
- Consumes: `runPool`, `MAX_INFLIGHT` từ Task 4.
- Produces: `createRun(requests, options)` nhận `options.workerCount` thay cho `options.concurrency`. `state.advanced.workerCount` thay cho `state.advanced.concurrency`.

- [ ] **Step 1: Viết test thất bại**

Trong `test/runner.test.js`, đổi mọi `{ concurrency: N, ... }` thành `{ workerCount: N, ... }`, và thay test `startRun ton trong gioi han concurrency` bằng:

```js
test('startRun ton trong gioi han workerCount nhan 5', async () => {
  let inFlight = 0;
  let peak = 0;
  const mock = await startMockServer((_, res) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    setTimeout(() => { inFlight -= 1; res.end('{}'); }, 40);
  });
  try {
    const reqs = Array.from({ length: 30 }, (_, i) => mkReq(i + 1, `${mock.base}/x`));
    const run = createRun(reqs, { workerCount: 1, timeoutMs: 5000 });
    await startRun(run);
    assert.equal(run.results.length, 30);
    assert.ok(peak <= 5, `peak=${peak} vuot qua 1 worker x 5 request`);
  } finally { await mock.close(); }
});
```

- [ ] **Step 2: Chạy test cho chắc là hỏng**

Run: `npm test -- --test-name-pattern="workerCount nhan 5"`
Expected: FAIL — `peak` bằng 1 vì `runner.js` vẫn đọc `options.concurrency` và mặc định về 5 worker tuần tự.

- [ ] **Step 3: Viết implementation**

Trong `src/server/runner.js`, thêm import ở đầu file:

```js
import { runPool, MAX_INFLIGHT } from './worker-pool.js';
```

Thay toàn bộ hàm `startRun`:

```js
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
      });
      push(record);
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
}
```

- [ ] **Step 4: Truyền `workerCount` từ route**

Trong `src/server/routes.js`, sửa khối `createRun` trong handler `POST /api/run`:

```js
    const requests = buildRequests(config);
    const run = createRun(requests, {
      workerCount: config.advanced?.workerCount ?? config.advanced?.concurrency ?? 4,
      timeoutMs: config.advanced?.timeoutMs ?? 30000,
      errorCodePaths: config.advanced?.errorCodePaths?.length
        ? config.advanced.errorCodePaths
        : DEFAULT_ERROR_CODE_PATHS,
    });
```

- [ ] **Step 5: Đổi cấu hình phía client**

Trong `public/js/state.js`, sửa khối `advanced` của `defaultConfig()`:

```js
    advanced: {
      workerCount: 4,
      timeoutMs: 30000,
      errorCodePaths: ['errorCode', 'error_code', 'code', 'error.code'],
      dedupeOnImport: true,
    },
```

Và trong `load()`, sau `Object.assign(...)`, thêm migration:

```js
  // Cau hinh cu dung khoa concurrency, doc sang workerCount.
  if (saved.advanced?.workerCount === undefined && saved.advanced?.concurrency !== undefined) {
    state.advanced.workerCount = Number(saved.advanced.concurrency) || 4;
  }
  delete state.advanced.concurrency;
```

- [ ] **Step 6: Đổi ô Advanced trong HTML**

Trong `public/index.html`, thay khối `<div class="field-row">` trong `<details class="card">` (dòng 95-98) bằng:

```html
              <div class="field-row">
                <label class="field"><span class="label">Số luồng</span><input id="inp-worker-count" class="input mono" type="number" min="1" max="16" value="4" /></label>
                <label class="field"><span class="label">Timeout (ms)</span><input id="inp-timeout" class="input mono" type="number" min="1000" step="1000" value="30000" /></label>
              </div>
              <p class="hint">Mỗi luồng chạy tối đa 5 request cùng lúc.</p>
```

Task 11 sẽ dựng lại toàn bộ khối này lần nữa khi đổi layout — nội dung phải khớp giữa hai chỗ.

- [ ] **Step 7: Đổi wiring trong main.js**

Trong `public/js/main.js`, khối `/* ---------- advanced ---------- */`, thay hai dòng liên quan `concurrency`:

```js
const workerCount = document.getElementById('inp-worker-count');
```

```js
workerCount.value = state.advanced.workerCount;
```

```js
workerCount.addEventListener('input', () => {
  state.advanced.workerCount = Math.max(1, Math.min(Number(workerCount.value) || 4, 16));
  persist();
});
```

- [ ] **Step 8: Chạy toàn bộ test**

Run: `npm test`
Expected: PASS

- [ ] **Step 9: Kiểm tra bằng mắt**

Run: `npm start`, cấu hình 1 endpoint + 20 MSISDN trỏ vào domain thật hoặc `http://127.0.0.1:2345/api/health`, bấm RUN ALL.
Expected: progress chạy tới `20/20`, tab OUTPUT có đủ 20 dòng, nút Dừng cắt được giữa chừng và trạng thái báo `Đã dừng sau N/20 request`.

- [ ] **Step 10: Commit**

```bash
git add src/server/runner.js src/server/routes.js public/js/state.js public/js/main.js public/index.html test/runner.test.js
git commit -m "feat: runner chay qua worker pool, doi concurrency thanh workerCount"
```

---

### Task 6: Cột mới và model filter mới

**Files:**
- Modify: `public/js/shared/filter-logic.js`
- Test: `test/filter-logic.test.js`

**Interfaces:**
- Consumes: không có.
- Produces:
  - `ALL_COLUMNS` với key theo thứ tự `['index', 'status', 'name', 'path', 'request', 'responseBody', 'responseHeaders']`
  - `emptyFilter() => { msisdn: '', name: '', status: '', errorCode: '' }`
  - `matchesFilter(rec, filter) => boolean`, `applyFilter(records, filter) => Array`
  - `collectStatuses(records) => string[]`, `collectErrorCodes(records) => string[]` — không đổi
  - `STATUS_NA = 'N/A'`

- [ ] **Step 1: Viết test thất bại**

Thay toàn bộ `test/filter-logic.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyFilter, matchesFilter, applyFilter, collectStatuses, collectErrorCodes, ALL_COLUMNS, STATUS_NA,
} from '../public/js/shared/filter-logic.js';

function rec(over = {}) {
  const { status = 200, errorCode = null, durationMs = 100, ...rest } = over;
  return {
    index: 1, endpointName: 'Tra cuu thue bao', pathTemplate: '/query/abc', msisdn: '0912345678',
    request: { method: 'GET', url: 'https://abc.vn/x/0912345678', headers: {}, queryParams: {}, pathParams: {}, body: null },
    response: { status, statusText: '', headers: {}, body: null, bodyText: '{"ok":true}', sizeBytes: 11 },
    errorCode, errorMessage: null, durationMs,
    startedAt: '2026-07-29T03:12:44.001Z', finishedAt: '2026-07-29T03:12:44.101Z',
    ...rest,
  };
}

test('emptyFilter cho qua moi ban ghi', () => {
  assert.equal(matchesFilter(rec(), emptyFilter()), true);
});

test('emptyFilter chi co 4 truong', () => {
  assert.deepEqual(emptyFilter(), { msisdn: '', name: '', status: '', errorCode: '' });
});

test('loc theo status code', () => {
  const f = { ...emptyFilter(), status: '200' };
  assert.equal(matchesFilter(rec({ status: 200 }), f), true);
  assert.equal(matchesFilter(rec({ status: 500 }), f), false);
});

test('status null duoc dai dien bang N/A', () => {
  const f = { ...emptyFilter(), status: STATUS_NA };
  assert.equal(matchesFilter(rec({ status: null }), f), true);
  assert.equal(matchesFilter(rec({ status: 200 }), f), false);
});

test('loc theo error code', () => {
  const f = { ...emptyFilter(), errorCode: 'E0042' };
  assert.equal(matchesFilter(rec({ errorCode: 'E0042' }), f), true);
  assert.equal(matchesFilter(rec({ errorCode: null }), f), false);
});

test('loc theo name khop chuoi con khong phan biet hoa thuong', () => {
  assert.equal(matchesFilter(rec(), { ...emptyFilter(), name: 'thue bao' }), true);
  assert.equal(matchesFilter(rec(), { ...emptyFilter(), name: 'THUE BAO' }), true);
  assert.equal(matchesFilter(rec(), { ...emptyFilter(), name: 'khongcogi' }), false);
});

test('loc theo name voi ban ghi khong co ten', () => {
  assert.equal(matchesFilter(rec({ endpointName: '' }), { ...emptyFilter(), name: 'a' }), false);
});

test('loc theo msisdn khop chuoi con', () => {
  assert.equal(matchesFilter(rec(), { ...emptyFilter(), msisdn: '0912' }), true);
  assert.equal(matchesFilter(rec(), { ...emptyFilter(), msisdn: '0999' }), false);
});

test('loc theo msisdn voi ban ghi khong co msisdn', () => {
  assert.equal(matchesFilter(rec({ msisdn: null }), { ...emptyFilter(), msisdn: '09' }), false);
  assert.equal(matchesFilter(rec({ msisdn: null }), emptyFilter()), true);
});

test('to hop msisdn va status cung luc', () => {
  const f = { ...emptyFilter(), msisdn: '0912', status: '500' };
  assert.equal(matchesFilter(rec({ status: 500 }), f), true);
  assert.equal(matchesFilter(rec({ status: 200 }), f), false);
});

test('applyFilter sap xep theo index', () => {
  const out = applyFilter([rec({ index: 3 }), rec({ index: 1 }), rec({ index: 2 })], emptyFilter());
  assert.deepEqual(out.map((r) => r.index), [1, 2, 3]);
});

test('collectStatuses tra ve danh sach duy nhat da sap xep', () => {
  assert.deepEqual(
    collectStatuses([rec({ status: 500 }), rec({ status: 200 }), rec({ status: 200 }), rec({ status: null })]),
    ['200', '500', 'N/A'],
  );
});

test('collectErrorCodes bo qua ban ghi khong co ma loi', () => {
  assert.deepEqual(collectErrorCodes([rec({ errorCode: 'E2' }), rec({ errorCode: null }), rec({ errorCode: 'E1' })]), ['E1', 'E2']);
});

test('ALL_COLUMNS dat status ngay sau index va tach response thanh 2 cot', () => {
  assert.deepEqual(
    ALL_COLUMNS.map((c) => c.key),
    ['index', 'status', 'name', 'path', 'request', 'responseBody', 'responseHeaders'],
  );
  assert.ok(ALL_COLUMNS.every((c) => c.default === true));
});
```

- [ ] **Step 2: Chạy test cho chắc là hỏng**

Run: `npm test -- --test-name-pattern="ALL_COLUMNS dat status"`
Expected: FAIL — thứ tự key hiện tại vẫn là `['index', 'name', 'path', 'msisdn', 'request', 'response', 'status']`

- [ ] **Step 3: Viết implementation**

Thay toàn bộ `public/js/shared/filter-logic.js`:

```js
export const ALL_COLUMNS = [
  { key: 'index', header: '#', default: true },
  { key: 'status', header: 'Status · Error · Time', default: true },
  { key: 'name', header: 'Name', default: true },
  { key: 'path', header: 'Path', default: true },
  { key: 'request', header: 'Request', default: true },
  { key: 'responseBody', header: 'Response body', default: true },
  { key: 'responseHeaders', header: 'Response headers', default: true },
];

export const STATUS_NA = 'N/A';

export function emptyFilter() {
  return { msisdn: '', name: '', status: '', errorCode: '' };
}

const statusLabel = (rec) => (rec.response.status === null ? STATUS_NA : String(rec.response.status));
const contains = (hay, needle) => String(hay ?? '').toLowerCase().includes(needle.toLowerCase());

export function matchesFilter(rec, filter) {
  if (filter.status && statusLabel(rec) !== filter.status) return false;
  if (filter.errorCode && (rec.errorCode ?? '') !== filter.errorCode) return false;
  if (filter.name && !contains(rec.endpointName, filter.name)) return false;
  if (filter.msisdn && !contains(rec.msisdn, filter.msisdn)) return false;
  return true;
}

export function applyFilter(records, filter) {
  return records.filter((r) => matchesFilter(r, filter)).sort((a, b) => a.index - b.index);
}

export function collectStatuses(records) {
  const set = new Set(records.map(statusLabel));
  return [...set].sort((a, b) => {
    if (a === STATUS_NA) return 1;
    if (b === STATUS_NA) return -1;
    return Number(a) - Number(b);
  });
}

export function collectErrorCodes(records) {
  return [...new Set(records.map((r) => r.errorCode).filter(Boolean))].sort();
}
```

- [ ] **Step 4: Chạy test cho chắc là xanh**

Run: `npm test -- --test-name-pattern="loc theo|ALL_COLUMNS|collect|applyFilter|emptyFilter|status null|to hop"`
Expected: PASS, 14 test

- [ ] **Step 5: Commit**

```bash
git add public/js/shared/filter-logic.js test/filter-logic.test.js
git commit -m "feat: cot status len dau, tach response body va header, filter 4 truong"
```

---

### Task 7: Bảng kết quả — cột mới và hàng filter dưới tiêu đề

**Files:**
- Modify: `public/js/ui/result-table.js`
- Modify: `public/css/app.css`
- Test: `test/result-table.test.js`

**Interfaces:**
- Consumes: `ALL_COLUMNS`, `applyFilter` từ Task 6.
- Produces: `initResultTable({ getRecords, getFilter, getVisibleColumns, onRowClick, filterCell })` trả về `{ render(), getVisibleIndexes() }`.
  `filterCell(key: string) => Element | null` — callback tuỳ chọn, trả về node đặt vào ô filter của cột đó. Task 8 cung cấp.

- [ ] **Step 1: Viết test thất bại**

Trong `test/result-table.test.js`, sửa `makeRecord` để có header response:

```js
    response: {
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      body: { code: 0 },
      bodyText: '{"code":0}',
    },
```

Đổi mọi `getVisibleColumns` truyền `['index', 'name', 'path', 'msisdn', 'request', 'response', 'status']` thành `['index', 'status', 'name', 'path', 'request', 'responseBody', 'responseHeaders']`.

Thay test `initResultTable render danh sach duoi nguong VIRTUAL_THRESHOLD` phần kiểm ô:

```js
  // Check cells of row 0
  const tds0 = rows[0].children;
  assert.equal(tds0[0].textContent, '1');                                  // index
  assert.equal(tds0[1].textContent, '200 · 120ms');                        // status gom
  assert.equal(tds0[1].classList.contains('status-up'), true);
  assert.equal(tds0[2].textContent, 'Endpoint 1');                         // name
  assert.equal(tds0[3].textContent, '/query/abc-information/{*}');         // path
  assert.equal(tds0[4].textContent, 'GET https://api.example.com/test/1'); // request
  assert.equal(tds0[5].textContent, 'OK');                                 // response body
  assert.equal(tds0[6].textContent, 'content-type: application/json');     // response header

  // Check cells of row 1
  const tds1 = rows[1].children;
  assert.equal(tds1[1].textContent, '500 · ERR_500 · 120ms');
  assert.equal(tds1[1].classList.contains('status-down'), true);
```

Và hai record trong test đó phải có `headers` trong `response`:

```js
  const records = [
    makeRecord(1, { response: { status: 200, statusText: 'OK', headers: { 'content-type': 'application/json' }, body: {}, bodyText: 'OK' } }),
    makeRecord(2, { response: { status: 500, statusText: 'Error', headers: {}, body: null, bodyText: '' }, errorCode: 'ERR_500', errorMessage: 'Server Error' }),
  ];
```

Thay test `cot name va msisdn hien dau gach ngang khi rong` bằng:

```js
test('cot name va response header hien dau gach ngang khi rong', () => {
  const { table } = setupMockDOM();
  const records = [makeRecord(1, {
    endpointName: '',
    response: { status: 200, statusText: 'OK', headers: {}, body: null, bodyText: '' },
  })];

  const tableCtrl = initResultTable({
    getRecords: () => records,
    getFilter: () => emptyFilter(),
    getVisibleColumns: () => ['name', 'responseHeaders'],
  });
  tableCtrl.render();

  const tds = table.querySelector('tbody').children[0].children;
  assert.equal(tds[0].textContent, '—');
  assert.equal(tds[1].textContent, '—');
});
```

Sửa test `cot status hien dau gach ngang khi khong co status code` — thêm `headers: {}` vào response override.

Thêm hai test mới ở cuối file:

```js
test('thead giu nguyen node khi paint lai de khong mat focus o filter', () => {
  const { table } = setupMockDOM();
  const records = [makeRecord(1)];

  const tableCtrl = initResultTable({
    getRecords: () => records,
    getFilter: () => emptyFilter(),
    getVisibleColumns: () => ['index', 'status'],
  });

  tableCtrl.render();
  const firstHead = table.querySelector('thead');
  tableCtrl.render();
  assert.equal(table.querySelector('thead'), firstHead, 'thead phai la cung mot node');
});

test('filterCell duoc gan vao hang filter dung cot', () => {
  const { table } = setupMockDOM();
  const nameInput = new MockElement('input');
  nameInput.id = 'flt-col-name';

  const tableCtrl = initResultTable({
    getRecords: () => [makeRecord(1)],
    getFilter: () => emptyFilter(),
    getVisibleColumns: () => ['index', 'status', 'name'],
    filterCell: (key) => (key === 'name' ? nameInput : null),
  });
  tableCtrl.render();

  const thead = table.querySelector('thead');
  const filterRow = thead.children[1];
  assert.ok(filterRow.classList.contains('filter-row'));
  assert.equal(filterRow.children.length, 3);
  assert.equal(filterRow.children[2].children[0], nameInput);
});
```

- [ ] **Step 2: Chạy test cho chắc là hỏng**

Run: `npm test -- --test-name-pattern="filterCell duoc gan"`
Expected: FAIL — chưa có hàng filter, `thead.children[1]` là `undefined`

- [ ] **Step 3: Viết implementation**

Thay toàn bộ `public/js/ui/result-table.js`:

```js
import { ALL_COLUMNS, applyFilter } from '../shared/filter-logic.js';

const ROW_H = 34;              // khop --row-h trong tokens.css
const BUFFER = 10;
const VIRTUAL_THRESHOLD = 500; // duoi nguong nay render thang cho don gian

const truncate = (s, n = 120) => (s.length > n ? `${s.slice(0, n)}…` : s);

function statusText(rec) {
  const bits = [
    rec.response.status === null ? '—' : String(rec.response.status),
    rec.errorCode ?? '',
    `${rec.durationMs}ms`,
  ];
  return bits.filter(Boolean).join(' · ');
}

const headerLine = (headers) => Object.entries(headers ?? {})
  .map(([k, v]) => `${k}: ${v}`)
  .join(' · ');

function cellText(rec, key) {
  switch (key) {
    case 'index': return String(rec.index);
    case 'name': return rec.endpointName || '—';
    case 'path': return rec.pathTemplate || '—';
    case 'request': return `${rec.request.method} ${rec.request.url}`;
    case 'responseBody': return truncate(rec.response.bodyText || rec.errorMessage || '') || '—';
    case 'responseHeaders': return truncate(headerLine(rec.response.headers)) || '—';
    case 'status': return statusText(rec);
    default: return '';
  }
}

const NUMERIC = new Set(['index']);

export function initResultTable({ getRecords, getFilter, getVisibleColumns, onRowClick, filterCell }) {
  const viewport = document.getElementById('result-viewport');
  const table = document.getElementById('result-table');

  // thead va tbody duoc tao mot lan roi giu nguyen node. Neu paint lai ma thay
  // ca thead thi o input trong hang filter se mat focus giua luc dang go.
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');
  table.replaceChildren(thead, tbody);

  let rows = [];
  let scheduled = false;
  let headKeys = '';

  function columns() {
    const keys = getVisibleColumns();
    return ALL_COLUMNS.filter((c) => keys.includes(c.key));
  }

  function paintHead(cols) {
    const signature = cols.map((c) => c.key).join(',');
    if (signature === headKeys) return;
    headKeys = signature;

    const headRow = document.createElement('tr');
    const filterRow = document.createElement('tr');
    filterRow.className = 'filter-row';

    for (const col of cols) {
      const th = document.createElement('th');
      th.textContent = col.header;
      headRow.append(th);

      const ftd = document.createElement('th');
      ftd.className = 'filter-cell';
      const node = filterCell?.(col.key);
      if (node) ftd.append(node);
      filterRow.append(ftd);
    }

    thead.replaceChildren(headRow, filterRow);
  }

  function buildRow(rec, cols) {
    const tr = document.createElement('tr');
    tr.dataset.index = String(rec.index);
    for (const col of cols) {
      const td = document.createElement('td');
      td.textContent = cellText(rec, col.key);
      if (NUMERIC.has(col.key)) td.classList.add('num', 'mono');
      if (col.key === 'status') {
        const ok = rec.response.status !== null && rec.response.status < 400;
        td.classList.add(ok ? 'status-up' : 'status-down');
      }
      td.title = cellText(rec, col.key);
      tr.append(td);
    }
    tr.addEventListener('click', () => onRowClick?.(rec));
    return tr;
  }

  function spacer(height) {
    const tr = document.createElement('tr');
    tr.className = 'spacer-row';
    const td = document.createElement('td');
    td.colSpan = 99;
    td.style.height = `${height}px`;
    tr.append(td);
    return tr;
  }

  function paint() {
    scheduled = false;
    const cols = columns();
    paintHead(cols);

    const body = [];

    if (rows.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = cols.length;
      td.className = 'el-empty';
      td.textContent = 'Chưa có kết quả nào khớp bộ lọc.';
      tr.append(td);
      body.push(tr);
    } else if (rows.length <= VIRTUAL_THRESHOLD) {
      for (const rec of rows) body.push(buildRow(rec, cols));
    } else {
      const start = Math.max(0, Math.floor(viewport.scrollTop / ROW_H) - BUFFER);
      const visible = Math.ceil(viewport.clientHeight / ROW_H) + BUFFER * 2;
      const end = Math.min(rows.length, start + visible);
      if (start > 0) body.push(spacer(start * ROW_H));
      for (let i = start; i < end; i += 1) body.push(buildRow(rows[i], cols));
      if (end < rows.length) body.push(spacer((rows.length - end) * ROW_H));
    }

    tbody.replaceChildren(...body);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(paint);
  }

  viewport.addEventListener('scroll', () => {
    if (rows.length > VIRTUAL_THRESHOLD) schedule();
  });

  return {
    render() {
      rows = applyFilter(getRecords(), getFilter());
      schedule();
    },
    getVisibleIndexes() {
      return rows.map((r) => r.index);
    },
  };
}
```

- [ ] **Step 4: Chạy test cho chắc là xanh**

Run: `npm test -- --test-name-pattern="initResultTable|cot status|cot name va response|thead giu nguyen|filterCell"`
Expected: PASS

Nếu `MockElement` báo lỗi vì thiếu `replaceChildren` trên `tbody`, kiểm tra lại — lớp mock đã có sẵn hàm này ở dòng 75 của file test.

- [ ] **Step 5: Thêm CSS cho hàng filter**

Trong `public/css/app.css`, thêm ngay sau khối `.result-table thead th { ... }`:

```css
.result-table thead tr:first-child th { top: 0; }
.result-table thead tr.filter-row th {
  position: sticky; top: var(--row-h); z-index: 1;
  background: var(--surface);
  padding: var(--sp-xxs) var(--sp-xs);
  border-bottom: 1px solid var(--hairline);
  font-weight: 400; text-transform: none; letter-spacing: 0;
}
.filter-cell { min-width: 0; }
.filter-cell .input { width: 100%; min-width: 80px; }
.filter-cell .filter-pair { display: flex; gap: var(--sp-xxs); }
.filter-cell .filter-pair .input { flex: 1 1 0; min-width: 0; }
```

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/result-table.js public/css/app.css test/result-table.test.js
git commit -m "feat: bang ket qua co cot response header va hang filter duoi tieu de"
```

---

### Task 8: Ô filter theo cột và filterbar chỉ còn msisdn

**Files:**
- Modify: `public/js/ui/filters.js`
- Modify: `public/index.html:133-140`
- Modify: `public/js/main.js:43-49`

**Interfaces:**
- Consumes: `ALL_COLUMNS`, `emptyFilter`, `collectStatuses`, `collectErrorCodes` từ Task 6; `initResultTable({ filterCell })` từ Task 7.
- Produces: `initFilters({ onChange })` trả về `{ getFilter(), getVisibleColumns(), filterCell(key), refreshOptions(records) }`.

- [ ] **Step 1: Sửa filterbar trong HTML**

Trong `public/index.html`, thay toàn bộ khối `<div class="filterbar">` (dòng 133-140) bằng:

```html
        <div class="filterbar">
          <label class="filter grow"><span>🔍</span><input id="flt-msisdn" class="input input-sm mono" type="search" placeholder="tìm theo msisdn" /></label>
          <button id="btn-columns" class="btn btn-secondary btn-sm" type="button">⚙ cột</button>
        </div>
```

- [ ] **Step 2: Viết lại filters.js**

Thay toàn bộ `public/js/ui/filters.js`:

```js
import { ALL_COLUMNS, emptyFilter, collectStatuses, collectErrorCodes } from '../shared/filter-logic.js';

const COLUMNS_KEY = 'ccm-tool-columns';
const ANY = '';

function loadColumns() {
  const fallback = ALL_COLUMNS.filter((c) => c.default).map((c) => c.key);
  try {
    const saved = JSON.parse(localStorage.getItem(COLUMNS_KEY) ?? 'null');
    if (Array.isArray(saved)) {
      // Nguoi dung cu co the con luu key da bi bo (msisdn, response, errorCode...).
      const valid = saved.filter((k) => ALL_COLUMNS.some((c) => c.key === k));
      if (valid.length > 0) return valid;
    }
  } catch { /* bo qua */ }
  return fallback;
}

function makeSelect(title) {
  const select = document.createElement('select');
  select.className = 'input input-sm';
  select.title = title;
  return select;
}

// Giu lai lua chon hien tai neu no van con trong danh sach moi.
function fillSelect(select, values, emptyLabel) {
  const current = select.value;
  select.replaceChildren();

  const any = document.createElement('option');
  any.value = ANY;
  any.textContent = emptyLabel;
  select.append(any);

  for (const v of values) {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    select.append(opt);
  }

  select.value = values.includes(current) ? current : ANY;
}

export function initFilters({ onChange } = {}) {
  const msisdnInput = document.getElementById('flt-msisdn');
  const columnsBtn = document.getElementById('btn-columns');

  let visibleColumns = loadColumns();
  const filter = emptyFilter();

  const nameInput = document.createElement('input');
  nameInput.className = 'input input-sm';
  nameInput.type = 'search';
  nameInput.placeholder = 'gõ tìm';
  nameInput.title = 'Lọc theo tên endpoint';

  const statusSelect = makeSelect('Lọc theo status code');
  const errorSelect = makeSelect('Lọc theo error code');
  fillSelect(statusSelect, [], '(tất cả)');
  fillSelect(errorSelect, [], '(tất cả)');

  const statusPair = document.createElement('div');
  statusPair.className = 'filter-pair';
  statusPair.append(statusSelect, errorSelect);

  function syncFilter() {
    filter.msisdn = msisdnInput.value.trim();
    filter.name = nameInput.value.trim();
    filter.status = statusSelect.value;
    filter.errorCode = errorSelect.value;
    onChange?.();
  }

  for (const el of [msisdnInput, nameInput, statusSelect, errorSelect]) {
    el.addEventListener('change', syncFilter);
    el.addEventListener('input', syncFilter);
  }

  columnsBtn.addEventListener('click', () => {
    const picked = prompt(
      'Cột hiển thị — liệt kê các key, cách nhau bởi dấu phẩy.\n'
      + `Có thể chọn: ${ALL_COLUMNS.map((c) => c.key).join(', ')}`,
      visibleColumns.join(', '),
    );
    if (picked === null) return;
    const keys = picked.split(',').map((s) => s.trim()).filter((s) => ALL_COLUMNS.some((c) => c.key === s));
    if (keys.length === 0) {
      window.ccmToast?.('Phải chọn ít nhất 1 cột hợp lệ', 'error');
      return;
    }
    visibleColumns = keys;
    localStorage.setItem(COLUMNS_KEY, JSON.stringify(keys));
    onChange?.();
  });

  return {
    getFilter: () => filter,
    getVisibleColumns: () => visibleColumns,
    filterCell(key) {
      if (key === 'name') return nameInput;
      if (key === 'status') return statusPair;
      return null;
    },
    refreshOptions(records) {
      fillSelect(statusSelect, collectStatuses(records), '(tất cả)');
      fillSelect(errorSelect, collectErrorCodes(records), '(tất cả)');
    },
  };
}
```

- [ ] **Step 3: Nối `filterCell` vào bảng**

Trong `public/js/main.js`, sửa lời gọi `initResultTable`:

```js
const resultTable = initResultTable({
  getRecords: () => results,
  getFilter: () => filters.getFilter(),
  getVisibleColumns: () => filters.getVisibleColumns(),
  filterCell: (key) => filters.filterCell(key),
  onRowClick: (rec) => drawer.open(rec),
});
```

- [ ] **Step 4: Chạy toàn bộ test**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Kiểm tra bằng mắt**

Run: `npm start`, chạy một run có ít nhất 1 request lỗi và 1 request thành công.
Expected:
- Filterbar chỉ còn ô `🔍 tìm theo msisdn` và nút `⚙ cột`.
- Dưới tiêu đề cột Status có 2 select, mỗi cái mở ra thấy option `(tất cả)` cộng giá trị thật.
- Dưới tiêu đề cột Name có ô gõ tìm; gõ liên tục không bị mất focus sau mỗi ký tự.
- Chọn status `500` thì bảng chỉ còn dòng 500.

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/filters.js public/index.html public/js/main.js
git commit -m "feat: filter theo cot, filterbar chi con o tim msisdn"
```

---

### Task 9: Drawer chi tiết kiểu Postman

**Files:**
- Modify: `public/js/ui/detail-drawer.js`
- Modify: `public/css/app.css`
- Test: `test/detail-drawer.test.js`

**Interfaces:**
- Consumes: không có.
- Produces: `initDetailDrawer()` trả về `{ open(rec), close() }` — không đổi chữ ký, chỉ đổi nội dung dựng ra.

- [ ] **Step 1: Viết test thất bại**

Trong `test/detail-drawer.test.js`, sửa `MockElement.set innerHTML` để nhận thêm nút tab (giữ nguyên phần `data-close`):

```js
  set innerHTML(html) {
    this._innerHTML = html;
    this.children = [];
    if (!html) return;

    if (html.includes('data-close')) {
      const closeBtn = new MockElement('button');
      closeBtn.attributes['data-close'] = '';
      this.children.push(closeBtn);
    }
    for (const m of html.matchAll(/data-tab="(\w+)"/g)) {
      const btn = new MockElement('button');
      btn.attributes['data-tab'] = m[1];
      this.children.push(btn);
    }
    for (const m of html.matchAll(/data-pane="(\w+)"/g)) {
      const pane = new MockElement('div');
      pane.attributes['data-pane'] = m[1];
      this.children.push(pane);
    }
  }
```

Và mở rộng `querySelector` / thêm `querySelectorAll`:

```js
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const m = /^\[([\w-]+)(?:="(\w+)")?\]$/.exec(selector);
    if (!m) return [];
    const [, attr, value] = m;
    return this.children.filter((c) => (
      c.attributes[attr] !== undefined && (value === undefined || c.attributes[attr] === value)
    ));
  }
```

`MockElement` của file này chưa có `classList` — trình xử lý click tab cần nó. Thêm vào cuối `constructor`:

```js
    this._classList = new Set();
    const self = this;
    this.classList = {
      add(...cs) { cs.forEach((c) => self._classList.add(c)); },
      remove(...cs) { cs.forEach((c) => self._classList.delete(c)); },
      contains(c) { return self._classList.has(c); },
      toggle(c, on) { if (on) self._classList.add(c); else self._classList.delete(c); },
    };
```

Sửa assertion trong test `initDetailDrawer open mo drawer va hien thi thong tin request`:

```js
  assert.ok(drawer.innerHTML.includes('Request #42'));
  assert.ok(drawer.innerHTML.includes('POST · 200 OK'));
  assert.ok(drawer.innerHTML.includes('https://example.com/api/test?foo=bar'));
  assert.ok(drawer.innerHTML.includes('<td class="kv-k mono">Authorization</td>'));
  assert.ok(drawer.innerHTML.includes('<td class="kv-v mono">Bearer token123</td>'));
  assert.ok(drawer.innerHTML.includes('<td class="kv-k mono">content-type</td>'));
  assert.ok(drawer.innerHTML.includes('tok-key'));
```

Thêm các test mới ở cuối file:

```js
test('drawer dung bang key-value cho ca request va response header', () => {
  const { drawer } = setupMockDOM();
  initDetailDrawer().open(makeRecord());

  const kvTables = drawer.innerHTML.match(/<table class="kv">/g) ?? [];
  assert.ok(kvTables.length >= 4, `phai co it nhat 4 bang kv, dang co ${kvTables.length}`);
  assert.ok(drawer.innerHTML.includes('REQUEST HEADERS'));
  assert.ok(drawer.innerHTML.includes('RESPONSE HEADERS'));
});

test('bang key-value rong hien thi dong khong co', () => {
  const { drawer } = setupMockDOM();
  const rec = makeRecord();
  rec.request.pathParams = {};
  initDetailDrawer().open(rec);
  assert.ok(drawer.innerHTML.includes('(không có)'));
});

test('tab Preview bi tat khi content-type khong phai html', () => {
  const { drawer } = setupMockDOM();
  initDetailDrawer().open(makeRecord());
  assert.match(drawer.innerHTML, /data-tab="preview"[^>]*disabled/);
});

test('tab Preview duoc bat va dung iframe sandbox khi content-type la html', () => {
  const { drawer } = setupMockDOM();
  const rec = makeRecord();
  rec.response.headers = { 'content-type': 'text/html; charset=utf-8' };
  rec.response.body = null;
  rec.response.bodyText = '<h1>Xin chào</h1>';
  initDetailDrawer().open(rec);

  assert.doesNotMatch(drawer.innerHTML, /data-tab="preview"[^>]*disabled/);
  assert.ok(drawer.innerHTML.includes('<iframe class="preview-frame" sandbox srcdoc='));
  assert.ok(drawer.innerHTML.includes('&lt;h1&gt;Xin chào&lt;/h1&gt;'));
});

test('body rong co errorMessage thi mo tab Raw va tat Pretty', () => {
  const { drawer } = setupMockDOM();
  const rec = makeRecord();
  rec.response = { status: null, statusText: '', headers: {}, body: null, bodyText: '' };
  rec.errorCode = 'ETIMEDOUT';
  rec.errorMessage = 'Quá thời gian chờ';
  initDetailDrawer().open(rec);

  assert.match(drawer.innerHTML, /data-tab="pretty"[^>]*disabled/);
  assert.ok(drawer.innerHTML.includes('Quá thời gian chờ'));
});

test('bam tab Raw thi doi pane dang hien', () => {
  const { drawer } = setupMockDOM();
  initDetailDrawer().open(makeRecord());

  const rawTab = drawer.querySelector('[data-tab="raw"]');
  const prettyPane = drawer.querySelector('[data-pane="pretty"]');
  const rawPane = drawer.querySelector('[data-pane="raw"]');

  rawTab.click();

  assert.equal(rawTab.classList.contains('is-active'), true);
  assert.equal(rawPane.hidden, false);
  assert.equal(prettyPane.hidden, true);
});

test('to mau JSON khong lam ro ri the HTML tu body', () => {
  const { drawer } = setupMockDOM();
  const rec = makeRecord();
  rec.response.body = { note: '<script>alert(1)</script>' };
  rec.response.bodyText = JSON.stringify(rec.response.body);
  initDetailDrawer().open(rec);

  assert.ok(!drawer.innerHTML.includes('<script>'));
  assert.ok(drawer.innerHTML.includes('&lt;script&gt;'));
});
```

- [ ] **Step 2: Chạy test cho chắc là hỏng**

Run: `npm test -- --test-name-pattern="bang key-value|tab Preview|to mau JSON"`
Expected: FAIL — drawer hiện dựng bằng `<pre>`, không có `<table class="kv">` hay tab nào.

- [ ] **Step 3: Viết implementation**

Thay toàn bộ `public/js/ui/detail-drawer.js`:

```js
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const JSON_TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

// To mau tren chuoi goc roi escape tung manh — an toan hon la escape truoc roi
// bam regex vao chuoi da co &quot;.
function highlightJson(json) {
  let out = '';
  let last = 0;
  for (const m of json.matchAll(JSON_TOKEN)) {
    out += escapeHtml(json.slice(last, m.index));
    const [full, str, colon, lit, num] = m;
    if (str) {
      out += `<span class="tok-${colon ? 'key' : 'str'}">${escapeHtml(str)}</span>${colon ? escapeHtml(colon) : ''}`;
    } else if (lit) {
      out += `<span class="tok-lit">${escapeHtml(lit)}</span>`;
    } else {
      out += `<span class="tok-num">${escapeHtml(num)}</span>`;
    }
    last = m.index + full.length;
  }
  return out + escapeHtml(json.slice(last));
}

function kvTable(obj) {
  const rows = Object.entries(obj ?? {});
  if (rows.length === 0) {
    return '<table class="kv"><tbody><tr><td class="el-empty" colspan="2">(không có)</td></tr></tbody></table>';
  }
  const body = rows
    .map(([k, v]) => `<tr><td class="kv-k mono">${escapeHtml(k)}</td><td class="kv-v mono">${escapeHtml(v)}</td></tr>`)
    .join('');
  return `<table class="kv"><tbody>${body}</tbody></table>`;
}

function contentType(rec) {
  const headers = rec.response.headers ?? {};
  const key = Object.keys(headers).find((k) => k.toLowerCase() === 'content-type');
  return String(key ? headers[key] : '');
}

const canPretty = (rec) => rec.response.body !== null;
const canPreview = (rec) => /text\/html|xml/i.test(contentType(rec));

function prettyHtml(rec) {
  if (!canPretty(rec)) return '';
  try {
    return highlightJson(JSON.stringify(rec.response.body, null, 2));
  } catch {
    return escapeHtml(rec.response.bodyText ?? '');
  }
}

const rawText = (rec) => rec.response.bodyText || rec.errorMessage || '(rỗng)';

function bodyPanes(rec) {
  const active = canPretty(rec) ? 'pretty' : 'raw';
  const pane = (name, inner) => (
    `<div class="body-pane" data-pane="${name}"${name === active ? '' : ' hidden'}>${inner}</div>`
  );

  return [
    pane('pretty', `<pre class="body-view">${prettyHtml(rec)}</pre>`),
    pane('raw', `<pre class="body-view">${escapeHtml(rawText(rec))}</pre>`),
    pane('preview', canPreview(rec)
      ? `<iframe class="preview-frame" sandbox srcdoc="${escapeHtml(rec.response.bodyText ?? '')}"></iframe>`
      : '<p class="hint">Response không phải HTML/XML nên không xem trước được.</p>'),
  ].join('');
}

function tabBar(rec) {
  const active = canPretty(rec) ? 'pretty' : 'raw';
  const tab = (name, label, enabled) => (
    `<button type="button" class="body-tab${name === active ? ' is-active' : ''}" `
    + `data-tab="${name}"${enabled ? '' : ' disabled'}>${label}</button>`
  );
  return '<div class="body-tabs">'
    + tab('pretty', 'Pretty', canPretty(rec))
    + tab('raw', 'Raw', true)
    + tab('preview', 'Preview', canPreview(rec))
    + '</div>';
}

export function initDetailDrawer() {
  const drawer = document.getElementById('drawer');

  function close() {
    drawer.hidden = true;
    drawer.setAttribute('aria-hidden', 'true');
    drawer.innerHTML = '';
  }

  function open(rec) {
    const ok = rec.response.status !== null && rec.response.status < 400;
    drawer.innerHTML = `
      <div class="el-head">
        <h2 class="card-title">Request #${rec.index}</h2>
        <button type="button" class="btn btn-secondary btn-sm" data-close>Đóng</button>
      </div>
      <p class="mono ${ok ? 'status-up' : 'status-down'}">
        ${rec.request.method} · ${rec.response.status ?? '—'} ${rec.response.statusText ?? ''}
        · ${rec.durationMs}ms ${rec.errorCode ? `· ${rec.errorCode}` : ''}
      </p>
      <span class="label">URL</span>
      <pre>${escapeHtml(rec.request.url)}</pre>
      <div class="kv-grid">
        <div><span class="label">REQUEST HEADERS</span>${kvTable(rec.request.headers)}</div>
        <div><span class="label">RESPONSE HEADERS</span>${kvTable(rec.response.headers)}</div>
        <div><span class="label">PATH PARAMS</span>${kvTable(rec.request.pathParams)}</div>
        <div><span class="label">QUERY PARAMS</span>${kvTable(rec.request.queryParams)}</div>
      </div>
      <span class="label">RESPONSE BODY${rec.errorMessage ? ' / lỗi' : ''}</span>
      ${tabBar(rec)}
      ${bodyPanes(rec)}
    `;
    drawer.hidden = false;
    drawer.setAttribute('aria-hidden', 'false');

    for (const btn of drawer.querySelectorAll('[data-tab]')) {
      btn.addEventListener('click', () => {
        if (btn.attributes?.disabled !== undefined || btn.disabled) return;
        const name = btn.getAttribute('data-tab');
        for (const other of drawer.querySelectorAll('[data-tab]')) {
          other.classList.toggle('is-active', other === btn);
        }
        for (const pane of drawer.querySelectorAll('[data-pane]')) {
          pane.hidden = pane.getAttribute('data-pane') !== name;
        }
      });
    }

    drawer.querySelector('[data-close]').addEventListener('click', close);
    drawer.querySelector('[data-close]').focus();
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !drawer.hidden) close();
  });

  document.addEventListener('click', (e) => {
    if (drawer.hidden) return;
    if (!drawer.contains(e.target) && e.target.closest('#result-table tbody tr') === null) close();
  });

  return { open, close };
}
```

- [ ] **Step 4: Chạy test cho chắc là xanh**

Run: `npm test -- --test-name-pattern="initDetailDrawer|drawer dung bang|bang key-value|tab Preview|bam tab Raw|body rong|to mau JSON|detailDrawer close|Escape key|Click"`
Expected: PASS

- [ ] **Step 5: Thêm CSS cho drawer**

Trong `public/css/app.css`, sửa `.drawer` cho rộng hơn:

```css
.drawer {
  position: fixed; top: 0; right: 0; bottom: 0; width: min(1040px, 95vw);
  background: var(--surface); border-left: 1px solid var(--hairline);
  padding: var(--sp-lg); overflow: auto; z-index: 10;
  display: flex; flex-direction: column; gap: var(--sp-sm);
  box-shadow: -4px 0 24px rgba(0, 0, 0, .4);
}
```

Và thêm vào cuối khối drawer (sau `.drawer pre { ... }`):

```css
.kv-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-sm) var(--sp-md); }
@media (max-width: 900px) { .kv-grid { grid-template-columns: 1fr; } }

table.kv {
  width: 100%; border-collapse: collapse; display: block;
  max-height: 30vh; overflow: auto;
  background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--radius-lg);
}
table.kv td {
  padding: 2px var(--sp-sm); font-size: var(--fs-caption);
  border-bottom: 1px solid var(--hairline); vertical-align: top;
}
table.kv tr:last-child td { border-bottom: none; }
.kv-k { color: var(--muted); white-space: nowrap; width: 1%; }
.kv-v { word-break: break-all; }

.body-tabs { display: flex; gap: var(--sp-xxs); }
.body-tab {
  background: transparent; border: 1px solid var(--hairline); color: var(--muted);
  border-radius: var(--radius-lg); padding: 2px var(--sp-sm);
  font-size: var(--fs-caption); cursor: pointer;
}
.body-tab.is-active { color: var(--body); border-color: var(--body); }
.body-tab:disabled { opacity: .4; cursor: not-allowed; }
.body-pane[hidden] { display: none; }
.body-view {
  margin: 0; background: var(--canvas); border: 1px solid var(--hairline);
  border-radius: var(--radius-lg); padding: var(--sp-sm);
  font-family: var(--font-num); font-size: var(--fs-caption);
  white-space: pre-wrap; word-break: break-all; max-height: 45vh; overflow: auto;
}
.preview-frame {
  width: 100%; height: 45vh; background: #fff;
  border: 1px solid var(--hairline); border-radius: var(--radius-lg);
}
.tok-key { color: var(--up); }
.tok-str { color: var(--body); }
.tok-num { color: #f0b90b; }
.tok-lit { color: var(--muted); }
```

- [ ] **Step 6: Chạy toàn bộ test**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Kiểm tra bằng mắt**

Run: `npm start`, chạy 1 run trả JSON và 1 run trả lỗi mạng, click từng dòng.
Expected:
- Bốn bảng key-value hiện đúng cặp key/value, cuộn được khi header dài.
- Tab `Pretty` mặc định sáng với JSON có tô màu; `Raw` hiện chuỗi gốc.
- Với response JSON, tab `Preview` bị mờ và bấm không ăn.
- Với dòng lỗi mạng, `Pretty` mờ, `Raw` hiện thông báo lỗi.

- [ ] **Step 8: Commit**

```bash
git add public/js/ui/detail-drawer.js public/css/app.css test/detail-drawer.test.js
git commit -m "feat: drawer kieu Postman voi bang key-value va viewer Pretty/Raw/Preview"
```

---

### Task 10: Cột Response Headers trong file Excel

**Files:**
- Modify: `src/server/excel-export.js`
- Test: `test/excel-export.test.js`

**Interfaces:**
- Consumes: `serializeHeaders(headers, includeToken)` — đã có trong cùng file.
- Produces: `EXPORT_COLUMNS` có thêm `{ header: 'Response Headers', key: 'responseHeaders', width: 45 }`.

- [ ] **Step 1: Viết test thất bại**

Thêm vào cuối `test/excel-export.test.js`:

```js
test('EXPORT_COLUMNS giu cot MSISDN va them cot Response Headers', () => {
  const keys = EXPORT_COLUMNS.map((c) => c.key);
  assert.ok(keys.includes('msisdn'), 'van phai co cot msisdn');
  assert.ok(keys.includes('responseHeaders'), 'phai co cot responseHeaders');
  assert.equal(keys.indexOf('responseHeaders'), keys.indexOf('bodyText') + 1);
});
```

Nếu file test chưa import `EXPORT_COLUMNS`, thêm vào dòng import ở đầu file.

- [ ] **Step 2: Chạy test cho chắc là hỏng**

Run: `npm test -- --test-name-pattern="EXPORT_COLUMNS giu cot MSISDN"`
Expected: FAIL — `phai co cot responseHeaders`

- [ ] **Step 3: Viết implementation**

Trong `src/server/excel-export.js`, thêm một dòng vào `EXPORT_COLUMNS` ngay sau `Response Body`:

```js
  { header: 'Response Body', key: 'bodyText', width: 80 },
  { header: 'Response Headers', key: 'responseHeaders', width: 45 },
  { header: 'Error Message', key: 'errorMessage', width: 40 },
```

Và trong `toRow`, thêm sau dòng `bodyText`:

```js
    bodyText: rec.response.bodyText ?? '',
    responseHeaders: serializeHeaders(rec.response.headers, true),
    errorMessage: rec.errorMessage ?? '',
```

Response header không mang bearer token nên truyền `true` để không bị che.

- [ ] **Step 4: Chạy test cho chắc là xanh**

Run: `npm test -- --test-name-pattern="EXPORT_COLUMNS"`
Expected: PASS

- [ ] **Step 5: Chạy toàn bộ test**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/server/excel-export.js test/excel-export.test.js
git commit -m "feat: them cot Response Headers vao file Excel"
```

---

### Task 11: Bố cục tab INPUT theo grid 1fr 2fr

**Files:**
- Modify: `public/index.html:28-106`
- Modify: `public/css/app.css:70-79`
- Test: `test/layout.test.js`

**Interfaces:**
- Consumes: không có.
- Produces: `.input-grid` chứa đúng 2 `div.col`; cột hai chứa một `div.col-row` với HEADERS + ADVANCED.

- [ ] **Step 1: Viết test thất bại**

Thay toàn bộ `test/layout.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readHtml = () => fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const readCss = () => fs.readFileSync(path.join(__dirname, '../public/css/app.css'), 'utf8');

test('HTML co dung 2 cot trong input-grid', () => {
  const html = readHtml();
  const gridMatch = html.match(/<div class="input-grid">([\s\S]*?)<div class="actionbar">/);
  assert.ok(gridMatch, 'phai tim thay the <div class="input-grid">');
  const colCount = (gridMatch[1].match(/class="col col-(narrow|wide)"/g) || []).length;
  assert.equal(colCount, 2, 'phai co dung 2 cot trong input-grid');
});

test('CSS dinh nghia grid 1fr 2fr cho input-grid', () => {
  assert.match(readCss(), /grid-template-columns:\s*1fr\s+2fr/);
});

test('cot hep chua CONNECTION, MSISDN, DATE RANGE, QUERY PARAMS theo dung thu tu', () => {
  const html = readHtml();
  const col = html.match(/<div class="col col-narrow">([\s\S]*?)<div class="col col-wide">/);
  assert.ok(col, 'phai tim thay cot hep');
  const order = [...col[1].matchAll(/>(CONNECTION|MSISDN|DATE RANGE|QUERY PARAMS)/g)].map((m) => m[1]);
  assert.deepEqual(order, ['CONNECTION', 'MSISDN', 'DATE RANGE', 'QUERY PARAMS']);
});

test('cot rong co col-row chua HEADERS va ADVANCED, roi den ENDPOINTS', () => {
  const html = readHtml();
  const col = html.match(/<div class="col col-wide">([\s\S]*?)<div class="actionbar">/);
  assert.ok(col, 'phai tim thay cot rong');
  assert.ok(col[1].includes('class="col-row"'), 'phai co div col-row');
  assert.ok(col[1].includes('>HEADERS'), 'phai co card HEADERS');
  assert.ok(col[1].includes('>ADVANCED'), 'phai co card ADVANCED');
  assert.ok(col[1].includes('id="list-endpoint"'), 'phai co card ENDPOINTS');
  assert.ok(col[1].indexOf('class="col-row"') < col[1].indexOf('id="list-endpoint"'));
});

test('CSS dinh nghia col-row hai cot', () => {
  assert.match(readCss(), /\.col-row\s*\{[^}]*grid-template-columns:\s*1fr\s+1fr/);
});
```

- [ ] **Step 2: Chạy test cho chắc là hỏng**

Run: `npm test -- --test-name-pattern="input-grid|cot hep|cot rong|col-row"`
Expected: FAIL — HTML hiện có 3 `class="col"`, CSS là `1fr 1fr 1fr`

- [ ] **Step 3: Dựng lại HTML**

Trong `public/index.html`, thay toàn bộ khối từ `<div class="input-grid">` đến thẻ đóng `</div>` ngay trước `<div class="actionbar">` bằng:

```html
        <div class="input-grid">
          <div class="col col-narrow">
            <section class="card">
              <h2 class="card-title">CONNECTION</h2>
              <label class="field">
                <span class="label">Domain</span>
                <input id="inp-domain" class="input" type="text" placeholder="https://abc.vn" spellcheck="false" />
              </label>
              <label class="field">
                <span class="label">Bearer token</span>
                <input id="inp-token" class="input mono" type="text" placeholder="dán token vào đây" spellcheck="false" />
              </label>
            </section>

            <section class="card" id="card-msisdn">
              <h2 class="card-title">
                <span>MSISDN <span class="el-count" id="msisdn-count">(0)</span></span>
              </h2>
              <label class="field">
                <span class="label">Số điện thoại chính</span>
                <input id="inp-single-msisdn" class="input mono" type="text" placeholder="0912345678" spellcheck="false" />
              </label>
              <div class="el-actions">
                <button id="btn-open-msisdn-drawer" type="button" class="btn btn-secondary btn-sm" style="width: 100%;">⚙ Quản lý danh sách &amp; Import (0)</button>
              </div>
            </section>

            <section class="card">
              <h2 class="card-title">DATE RANGE</h2>
              <label class="field">
                <span class="label">dd/mm/yyyy-dd/mm/yyyy</span>
                <input id="inp-daterange" class="input mono" type="text" placeholder="25/03/2026-01/04/2026" spellcheck="false" />
              </label>
              <div class="field-row">
                <label class="field"><span class="label">Từ</span><input id="inp-date-from" class="input" type="date" /></label>
                <label class="field"><span class="label">Đến</span><input id="inp-date-to" class="input" type="date" /></label>
              </div>
              <label class="field">
                <span class="label">Định dạng gửi đi</span>
                <select id="sel-date-format" class="input">
                  <option value="ddMMyyyy">ddMMyyyy</option>
                  <option value="dd/MM/yyyy">dd/MM/yyyy</option>
                  <option value="yyyy-MM-dd">yyyy-MM-dd</option>
                </select>
              </label>
              <p id="date-preview" class="preview mono"></p>
            </section>

            <section class="card">
              <h2 class="card-title">QUERY PARAMS <button class="btn-icon" data-add-param="query" type="button" title="Thêm dòng">＋</button></h2>
              <div id="tbl-query-params" class="param-table"></div>
            </section>
          </div>

          <div class="col col-wide">
            <div class="col-row">
              <section class="card">
                <h2 class="card-title">HEADERS <button class="btn-icon" data-add-param="header" type="button" title="Thêm dòng">＋</button></h2>
                <div id="tbl-headers" class="param-table"></div>
                <p class="hint">Authorization được tự thêm từ token ở trên, trừ khi bạn tự khai đè ở đây.</p>
              </section>

              <details class="card">
                <summary class="card-title">ADVANCED</summary>
                <div class="field-row">
                  <label class="field"><span class="label">Số luồng</span><input id="inp-worker-count" class="input mono" type="number" min="1" max="16" value="4" /></label>
                  <label class="field"><span class="label">Timeout (ms)</span><input id="inp-timeout" class="input mono" type="number" min="1000" step="1000" value="30000" /></label>
                </div>
                <p class="hint">Mỗi luồng chạy tối đa 5 request cùng lúc.</p>
                <label class="field">
                  <span class="label">Đường dẫn tìm error code (cách nhau bởi dấu phẩy)</span>
                  <input id="inp-error-paths" class="input mono" type="text" value="errorCode, error_code, code, error.code" spellcheck="false" />
                </label>
                <label class="check"><input id="chk-dedupe" type="checkbox" checked /> Loại trùng khi import</label>
              </details>
            </div>

            <section class="card" id="list-endpoint"></section>
          </div>
        </div>
```

- [ ] **Step 4: Sửa CSS**

Trong `public/css/app.css`, thay khối `.input-grid` và các media query của nó (dòng 70-79):

```css
.input-grid {
  flex: 1 1 auto; min-height: 0; overflow: auto;
  display: grid; grid-template-columns: 1fr 2fr;
  gap: var(--sp-md); padding: var(--sp-md);
  align-items: start;
  max-height: calc(100vh - var(--topbar-h) - 45px - 60px);
}
.col { display: flex; flex-direction: column; gap: var(--sp-md); min-width: 0; }
.col-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-md); align-items: start; }
@media (max-width: 1280px) {
  .input-grid { grid-template-columns: 1fr; max-height: none; }
  .col-row { grid-template-columns: 1fr; }
}
```

- [ ] **Step 5: Chạy test cho chắc là xanh**

Run: `npm test -- --test-name-pattern="input-grid|cot hep|cot rong|col-row"`
Expected: PASS, 5 test

- [ ] **Step 6: Chạy toàn bộ test**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Kiểm tra bằng mắt**

Run: `npm start`, mở ở màn hình rộng rồi thu nhỏ dần cửa sổ.
Expected:
- Trên 1280px: hai cột, cột trái hẹp có CONNECTION / MSISDN / DATE RANGE / QUERY PARAMS xếp dọc; cột phải rộng có HEADERS và ADVANCED cạnh nhau, ENDPOINTS bên dưới chiếm hết chiều rộng.
- Dưới 1280px: tất cả xếp dọc một cột.
- Ô `Số luồng` mặc định 4 và có dòng gợi ý `Mỗi luồng chạy tối đa 5 request cùng lúc.`

- [ ] **Step 8: Commit**

```bash
git add public/index.html public/css/app.css test/layout.test.js
git commit -m "feat: bo cuc tab INPUT theo grid 1fr 2fr"
```

---

## Kiểm tra cuối

- [ ] **Chạy toàn bộ test**

Run: `npm test`
Expected: PASS, không có test nào bị bỏ qua.

- [ ] **Chạy thử đầu-cuối**

Run: `npm start`, rồi:
1. Nhập domain + token, chọn date range.
2. Import 50 MSISDN.
3. Thêm 2 endpoint: một cái `/query/abc-information/{*}?type=PREPAID` bật msisdn, một cái `/system/health` tắt msisdn.
4. Đặt `Số luồng` = 3.
5. Bấm RUN ALL.

Expected: nút hiện `▶ RUN ALL (51)`. Chạy xong, bảng có 51 dòng, cột Status ở ngay sau `#`. Filter status `200` lọc đúng. Gõ msisdn vào ô search lọc đúng. Click một dòng mở drawer đủ 4 bảng key-value và JSON có tô màu. Export Excel ra file có cột `Response Headers`.
