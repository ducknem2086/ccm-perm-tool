# Auth profiles + filter trước RUN ALL — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép tool chạy một loạt request trên nhiều bộ credential cùng lúc, và thu hẹp tập request theo method / msisdn / profile trước khi bấm RUN ALL.

**Architecture:** Ba hàm lọc thuần trong `public/js/shared/run-filter.js` được dùng chung bởi cả nút đếm ở client lẫn `buildRequests()` ở server, nên con số trên nút RUN ALL không thể lệch với số request thật. Credential chuyển từ ba khóa phẳng trong `state` sang mảng `state.auths[]`; `buildRequests()` sinh tích ba chiều `auth × endpoint × msisdn`. Tiện thể gỡ tab bar trong drawer cấu hình endpoint để QUERY / HEADERS / BODY hiện cùng một màn hình.

**Tech Stack:** Node ≥20, ESM thuần, `node:test` + `node:assert/strict`, Express 5, ExcelJS. Không bundler, không framework front-end — sửa file trong `public/` là refresh trình duyệt thấy ngay.

**Spec:** `docs/superpowers/specs/2026-07-30-auth-profiles-run-filter-design.md`

## Global Constraints

- **Comment trong code viết tiếng Việt KHÔNG dấu** (`// Cau hinh cu dung khoa concurrency`). Chuỗi hiển thị cho người dùng thì viết **CÓ dấu** đầy đủ. Tên test viết không dấu. Đây là quy ước đang chạy khắp repo.
- **Không có build step.** Mọi import phải là đường dẫn tương đối kèm đuôi `.js`.
- Server import được module trong `public/js/shared/` — đã có tiền lệ ở `src/server/request-builder.js:3-6`. Chiều ngược lại không được: `public/` không import từ `src/`.
- Chạy test: `npm test` (toàn bộ), hoặc `node --test test/<file>.test.js` (một file), hoặc `node --test --test-name-pattern="<chuỗi>"` (lọc theo tên).
- Mọi thay đổi state ở UI đi theo cùng một khuôn: ghi thẳng vào `state` → `persist()` → `notify()`. Không có nút Lưu.
- **Rỗng nghĩa là tất cả** trên cả ba trục filter. Không ngoại lệ.
- `git commit` sau mỗi task. Không `--no-verify`.

---

### Task 1: Module lọc dùng chung `run-filter.js`

**Files:**
- Create: `public/js/shared/run-filter.js`
- Test: `test/run-filter.test.js`

**Interfaces:**
- Consumes: không có (module lá, không phụ thuộc gì)
- Produces:
  - `filterEndpoints(endpoints, runFilter) => Array` — lọc theo `enabled` và `runFilter.methods`
  - `filterMsisdns(msisdns, runFilter) => Array` — lọc theo `runFilter.msisdnPatterns`, khớp OR bằng `String.includes`
  - `selectedAuths(auths, runFilter) => Array` — lọc theo `runFilter.authIds`
  - Cả ba nhận `runFilter` có thể `undefined`, trả mảng rỗng thay vì ném lỗi khi đầu vào rỗng.

- [ ] **Step 1: Viết test thất bại**

Tạo `test/run-filter.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterEndpoints, filterMsisdns, selectedAuths } from '../public/js/shared/run-filter.js';

const eps = [
  { id: 'e1', enabled: true, method: 'GET' },
  { id: 'e2', enabled: true, method: 'POST' },
  { id: 'e3', enabled: false, method: 'GET' },
  { id: 'e4', enabled: true },
];
const msisdns = ['0912345678', '0912000111', '0988123999'];
const auths = [{ id: 'a1', name: 'A' }, { id: 'a2', name: 'B' }];

const ids = (list) => list.map((x) => x.id);

test('filterEndpoints methods rong tra moi endpoint dang bat', () => {
  assert.deepEqual(ids(filterEndpoints(eps, { methods: [] })), ['e1', 'e2', 'e4']);
});

test('filterEndpoints loai endpoint bi tat ke ca khi method khop', () => {
  assert.deepEqual(ids(filterEndpoints(eps, { methods: ['GET'] })), ['e1', 'e4']);
});

test('filterEndpoints khong phan biet hoa thuong', () => {
  assert.deepEqual(ids(filterEndpoints(eps, { methods: ['get', 'post'] })), ['e1', 'e2', 'e4']);
});

test('filterEndpoints coi endpoint thieu method la GET', () => {
  assert.deepEqual(ids(filterEndpoints(eps, { methods: ['POST'] })), ['e2']);
});

test('filterEndpoints chiu duoc runFilter undefined', () => {
  assert.deepEqual(ids(filterEndpoints(eps, undefined)), ['e1', 'e2', 'e4']);
});

test('filterMsisdns patterns rong tra tat ca', () => {
  assert.deepEqual(filterMsisdns(msisdns, { msisdnPatterns: [] }), msisdns);
});

test('filterMsisdns khop include chu khong phai bang tuyet doi', () => {
  assert.deepEqual(filterMsisdns(msisdns, { msisdnPatterns: ['0912'] }), ['0912345678', '0912000111']);
});

test('filterMsisdns nhieu pattern khop kieu OR', () => {
  assert.deepEqual(
    filterMsisdns(msisdns, { msisdnPatterns: ['345678', '0988'] }),
    ['0912345678', '0988123999'],
  );
});

test('filterMsisdns bo qua pattern chi co khoang trang', () => {
  assert.deepEqual(filterMsisdns(msisdns, { msisdnPatterns: ['   '] }), msisdns);
});

test('filterMsisdns khong khop gi tra mang rong', () => {
  assert.deepEqual(filterMsisdns(msisdns, { msisdnPatterns: ['0777'] }), []);
});

test('selectedAuths authIds rong tra tat ca profile', () => {
  assert.deepEqual(ids(selectedAuths(auths, { authIds: [] })), ['a1', 'a2']);
});

test('selectedAuths loc dung profile duoc chon', () => {
  assert.deepEqual(ids(selectedAuths(auths, { authIds: ['a2'] })), ['a2']);
});

test('selectedAuths bo qua id khong con ton tai', () => {
  assert.deepEqual(ids(selectedAuths(auths, { authIds: ['a2', 'a-da-xoa'] })), ['a2']);
});

test('selectedAuths toan id khong ton tai tra mang rong chu khong tra tat ca', () => {
  assert.deepEqual(selectedAuths(auths, { authIds: ['x'] }), []);
});

test('ba ham chiu duoc dau vao undefined', () => {
  assert.deepEqual(filterEndpoints(undefined, {}), []);
  assert.deepEqual(filterMsisdns(undefined, {}), []);
  assert.deepEqual(selectedAuths(undefined, {}), []);
});
```

- [ ] **Step 2: Chạy test để xác nhận nó thất bại**

Run: `node --test test/run-filter.test.js`
Expected: FAIL — `Cannot find module .../public/js/shared/run-filter.js`

- [ ] **Step 3: Viết implementation tối thiểu**

Tạo `public/js/shared/run-filter.js`:

```js
// Ba truc loc dung chung cho ca nut dem o client lan buildRequests o server.
// Quy uoc xuyen suot: danh sach dieu kien rong nghia la lay tat ca.

export function filterEndpoints(endpoints, runFilter) {
  const wanted = new Set((runFilter?.methods ?? []).map((m) => String(m).toUpperCase()));
  return (endpoints ?? []).filter(
    (e) => e.enabled && (wanted.size === 0 || wanted.has(String(e.method || 'GET').toUpperCase())),
  );
}

export function filterMsisdns(msisdns, runFilter) {
  const pats = (runFilter?.msisdnPatterns ?? []).map((p) => String(p).trim()).filter(Boolean);
  if (pats.length === 0) return msisdns ?? [];
  return (msisdns ?? []).filter((m) => pats.some((p) => String(m).includes(p)));
}

export function selectedAuths(auths, runFilter) {
  const ids = new Set(runFilter?.authIds ?? []);
  if (ids.size === 0) return auths ?? [];
  return (auths ?? []).filter((a) => ids.has(a.id));
}
```

- [ ] **Step 4: Chạy test để xác nhận nó xanh**

Run: `node --test test/run-filter.test.js`
Expected: PASS — 15 test

- [ ] **Step 5: Commit**

```bash
git add public/js/shared/run-filter.js test/run-filter.test.js
git commit -m "feat: them module loc theo method / msisdn / auth"
```

---

### Task 2: Tiện ích profile `auth-utils.js`

**Files:**
- Create: `public/js/shared/auth-utils.js`
- Test: `test/auth-utils.test.js`

**Interfaces:**
- Consumes: `parseRawHeaders` từ `public/js/shared/endpoint-path.js`
- Produces:
  - `authHeaderPairs(auth) => [{ key, value }]` — mode `curl` thì parse `curlRaw`, mode `fields` trả `[]`
  - `hasToken(auth) => boolean`
  - `findDuplicateNames(auths) => Set<string>`

Ba hàm này đặt ở `shared/` chứ không nhét vào `request-builder.js` như spec §4.4 phác: `authHeaderPairs` dùng ở server, `hasToken` dùng ở `connection-panel` và `auths-panel`, `findDuplicateNames` dùng ở `validateConfig` và `auths-panel`. Cùng một logic ở ba nơi thì phải có một chỗ để sửa.

- [ ] **Step 1: Viết test thất bại**

Tạo `test/auth-utils.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authHeaderPairs, hasToken, findDuplicateNames } from '../public/js/shared/auth-utils.js';

const CURL = `curl 'https://api-abc.vn/x' \\
  -H 'Authorization: Bearer eyJabc' \\
  -H 'X-Tenant: vnpt' \\
  -b 'BIGipServerpool=1.2.3'`;

test('authHeaderPairs mode fields tra mang rong', () => {
  assert.deepEqual(authHeaderPairs({ mode: 'fields', token: 'x' }), []);
});

test('authHeaderPairs mode curl tra het header parse duoc', () => {
  const pairs = authHeaderPairs({ mode: 'curl', curlRaw: CURL });
  assert.deepEqual(pairs.map((p) => p.key), ['Authorization', 'X-Tenant', 'Cookie']);
  assert.equal(pairs[0].value, 'Bearer eyJabc');
  assert.equal(pairs[2].value, 'BIGipServerpool=1.2.3');
});

test('authHeaderPairs coi thieu mode la fields', () => {
  assert.deepEqual(authHeaderPairs({ curlRaw: CURL }), []);
});

test('authHeaderPairs chiu duoc auth undefined', () => {
  assert.deepEqual(authHeaderPairs(undefined), []);
});

test('hasToken mode fields dua vao o token', () => {
  assert.equal(hasToken({ mode: 'fields', token: 'eyJ' }), true);
  assert.equal(hasToken({ mode: 'fields', token: '   ' }), false);
});

test('hasToken mode curl tim header Authorization khong phan biet hoa thuong', () => {
  assert.equal(hasToken({ mode: 'curl', curlRaw: CURL }), true);
  assert.equal(hasToken({ mode: 'curl', curlRaw: "curl 'https://x' -H 'authorization: Bearer z'" }), true);
  assert.equal(hasToken({ mode: 'curl', curlRaw: "curl 'https://x' -H 'Accept: */*'" }), false);
});

test('findDuplicateNames tra ten bi trung', () => {
  const dup = findDuplicateNames([{ name: 'A' }, { name: 'B' }, { name: 'A' }]);
  assert.deepEqual([...dup], ['A']);
});

test('findDuplicateNames so sanh sau khi trim', () => {
  const dup = findDuplicateNames([{ name: 'A' }, { name: '  A  ' }]);
  assert.deepEqual([...dup], ['A']);
});

test('findDuplicateNames phan biet hoa thuong', () => {
  assert.equal(findDuplicateNames([{ name: 'PROD' }, { name: 'prod' }]).size, 0);
});

test('findDuplicateNames bo qua ten rong', () => {
  assert.equal(findDuplicateNames([{ name: '' }, { name: '   ' }]).size, 0);
});
```

- [ ] **Step 2: Chạy test để xác nhận nó thất bại**

Run: `node --test test/auth-utils.test.js`
Expected: FAIL — `Cannot find module .../public/js/shared/auth-utils.js`

- [ ] **Step 3: Viết implementation tối thiểu**

Tạo `public/js/shared/auth-utils.js`:

```js
import { parseRawHeaders } from './endpoint-path.js';

// Mode 'curl' khong luu mang header da parse — parse lai tu curlRaw moi lan
// dung, giong cach globalHeaderRaw dang chay. Mot nguon su that duy nhat.
export function authHeaderPairs(auth) {
  return (auth?.mode ?? 'fields') === 'curl' ? parseRawHeaders(auth?.curlRaw ?? '') : [];
}

export function hasToken(auth) {
  if ((auth?.mode ?? 'fields') === 'curl') {
    return authHeaderPairs(auth).some((p) => p.key.toLowerCase() === 'authorization');
  }
  return String(auth?.token ?? '').trim() !== '';
}

// Phan biet hoa thuong: 'PROD' va 'prod' la hai profile khac nhau, nguoi dung
// co the co y dat vay. Chi trim khoang trang thua.
export function findDuplicateNames(auths) {
  const seen = new Set();
  const dup = new Set();
  for (const a of auths ?? []) {
    const name = String(a?.name ?? '').trim();
    if (name === '') continue;
    if (seen.has(name)) dup.add(name);
    else seen.add(name);
  }
  return dup;
}
```

- [ ] **Step 4: Chạy test để xác nhận nó xanh**

Run: `node --test test/auth-utils.test.js`
Expected: PASS — 10 test

- [ ] **Step 5: Commit**

```bash
git add public/js/shared/auth-utils.js test/auth-utils.test.js
git commit -m "feat: tien ich doc credential tu auth profile"
```

---

### Task 3: `state.js` — `auths`, `runFilter`, migration

**Files:**
- Modify: `public/js/state.js`
- Test: `test/state.test.js:36-55` (sửa), `test/state.test.js:84-111` (sửa), thêm test mới

**Interfaces:**
- Consumes: không có
- Produces:
  - `makeAuth(over = {}) => { id, name, mode, token, cookie, refreshToken, curlRaw }` — export mới
  - `state.auths: Array` — luôn có ít nhất 1 phần tử sau `load()` / `applyConfig()`
  - `state.runFilter: { methods: [], msisdnPatterns: [], authIds: [] }`
  - `state.token` / `state.cookie` / `state.refreshToken` **không còn tồn tại**

- [ ] **Step 1: Viết test thất bại**

Trong `test/state.test.js`, sửa test `defaultConfig tra ve cau hinh mac dinh dung chuuan` — xóa ba dòng khẳng định `cfg.token` / `cfg.cookie` / `cfg.refreshToken` (dòng 39-41), thay bằng:

```js
  assert.equal(cfg.token, undefined);
  assert.equal(cfg.cookie, undefined);
  assert.equal(cfg.refreshToken, undefined);
  assert.equal(cfg.auths.length, 1);
  assert.equal(cfg.auths[0].name, 'Default');
  assert.equal(cfg.auths[0].mode, 'fields');
  assert.deepEqual(cfg.runFilter, { methods: [], msisdnPatterns: [], authIds: [] });
```

Sửa test `persist luu state vao localStorage va load doc lai merge voi defaultConfig`: thay `token: 'my-token'` trong lời gọi `applyConfig` bằng `auths: [{ id: 'a1', name: 'P', mode: 'fields', token: 'my-token', cookie: '', refreshToken: '', curlRaw: '' }]`, và thay hai dòng `assert.equal(state.token, 'my-token')` bằng `assert.equal(state.auths[0].token, 'my-token')`.

Thêm vào cuối file:

```js
test('makeAuth sinh id khac nhau moi lan goi', () => {
  const a = makeAuth();
  const b = makeAuth();
  assert.notEqual(a.id, b.id);
  assert.ok(a.id.startsWith('auth_'));
});

test('load goi config cu thanh auths[0] ten Default', () => {
  setupMockLocalStorage();
  localStorage.setItem('ccm-tool-config', JSON.stringify({
    domain: 'https://api-abc.vn', token: 'TOK', cookie: 'CK', refreshToken: 'RF',
  }));
  Object.assign(state, defaultConfig());
  load();

  assert.equal(state.auths.length, 1);
  assert.equal(state.auths[0].name, 'Default');
  assert.equal(state.auths[0].mode, 'fields');
  assert.equal(state.auths[0].token, 'TOK');
  assert.equal(state.auths[0].cookie, 'CK');
  assert.equal(state.auths[0].refreshToken, 'RF');
});

test('load xoa ba khoa credential cu khoi state', () => {
  setupMockLocalStorage();
  localStorage.setItem('ccm-tool-config', JSON.stringify({ token: 'TOK', cookie: 'CK', refreshToken: 'RF' }));
  Object.assign(state, defaultConfig());
  load();

  assert.equal(state.token, undefined);
  assert.equal(state.cookie, undefined);
  assert.equal(state.refreshToken, undefined);
});

test('load van sinh Default khi ba o credential cu deu rong', () => {
  setupMockLocalStorage();
  localStorage.setItem('ccm-tool-config', JSON.stringify({ domain: 'https://x.vn' }));
  Object.assign(state, defaultConfig());
  load();

  assert.equal(state.auths.length, 1);
  assert.equal(state.auths[0].name, 'Default');
  assert.equal(state.auths[0].token, '');
});

test('load khong dung vao auths da co san', () => {
  setupMockLocalStorage();
  localStorage.setItem('ccm-tool-config', JSON.stringify({
    auths: [
      { id: 'a1', name: 'PROD', mode: 'fields', token: 'T1', cookie: '', refreshToken: '', curlRaw: '' },
      { id: 'a2', name: 'UAT', mode: 'curl', token: '', cookie: '', refreshToken: '', curlRaw: 'curl -H "a: b"' },
    ],
  }));
  Object.assign(state, defaultConfig());
  load();

  assert.equal(state.auths.length, 2);
  assert.deepEqual(state.auths.map((a) => a.name), ['PROD', 'UAT']);
});

test('load bu truong con thieu cho auth luu tu ban cu', () => {
  setupMockLocalStorage();
  localStorage.setItem('ccm-tool-config', JSON.stringify({
    auths: [{ id: 'a1', name: 'PROD', token: 'T1' }],
  }));
  Object.assign(state, defaultConfig());
  load();

  assert.equal(state.auths[0].mode, 'fields');
  assert.equal(state.auths[0].curlRaw, '');
  assert.equal(state.auths[0].cookie, '');
});

test('load bu runFilter con thieu', () => {
  setupMockLocalStorage();
  localStorage.setItem('ccm-tool-config', JSON.stringify({ runFilter: { methods: ['GET'] } }));
  Object.assign(state, defaultConfig());
  load();

  assert.deepEqual(state.runFilter, { methods: ['GET'], msisdnPatterns: [], authIds: [] });
});

test('applyConfig migrate config cu giong load', () => {
  setupMockLocalStorage();
  applyConfig({ domain: 'https://api-abc.vn', token: 'TOK' });

  assert.equal(state.auths[0].name, 'Default');
  assert.equal(state.auths[0].token, 'TOK');
  assert.equal(state.token, undefined);
});
```

Thêm `makeAuth` vào danh sách import ở đầu file (dòng 3-15).

- [ ] **Step 2: Chạy test để xác nhận nó thất bại**

Run: `node --test test/state.test.js`
Expected: FAIL — `makeAuth is not a function`, và các khẳng định về `cfg.auths` báo `Cannot read properties of undefined`

- [ ] **Step 3: Viết implementation tối thiểu**

Trong `public/js/state.js`, thêm ngay dưới dòng `const STORAGE_KEY`:

```js
let authSeq = 0;

export function makeAuth(over = {}) {
  authSeq += 1;
  return {
    id: `auth_${Date.now().toString(36)}_${authSeq}`,
    name: '',
    mode: 'fields',
    token: '',
    cookie: '',
    refreshToken: '',
    curlRaw: '',
    ...over,
  };
}
```

Trong `defaultConfig()`, xóa ba dòng `token: ''`, `cookie: ''`, `refreshToken: ''`, thay bằng:

```js
    auths: [makeAuth({ name: 'Default' })],
    runFilter: { methods: [], msisdnPatterns: [], authIds: [] },
```

Thêm hàm migration, đặt trên `load()`:

```js
// Ban cu luu credential o ba khoa phang cua state. Goi chung lai thanh mot
// profile ten 'Default' de cau hinh cu mo len chay y het truoc.
function migrateAuths(target, incoming) {
  const saved = Array.isArray(incoming?.auths) ? incoming.auths : [];
  target.auths = saved.length > 0
    ? saved.map((a) => ({ ...makeAuth(), ...a }))
    : [makeAuth({
      name: 'Default',
      token: String(incoming?.token ?? ''),
      cookie: String(incoming?.cookie ?? ''),
      refreshToken: String(incoming?.refreshToken ?? ''),
    })];

  delete target.token;
  delete target.cookie;
  delete target.refreshToken;
}
```

Trong `load()`, thêm `runFilter` vào object merge sâu và gọi `migrateAuths` sau `Object.assign`:

```js
  const base = defaultConfig();
  Object.assign(state, base, saved, {
    dateRange: { ...base.dateRange, ...(saved.dateRange ?? {}) },
    advanced: { ...base.advanced, ...(saved.advanced ?? {}) },
    runFilter: { ...base.runFilter, ...(saved.runFilter ?? {}) },
  });
  migrateAuths(state, saved);
```

Làm y hệt trong `applyConfig()` với biến `incoming`, đặt `migrateAuths(state, incoming)` ngay trước `persist()`.

- [ ] **Step 4: Chạy test để xác nhận nó xanh**

Run: `node --test test/state.test.js`
Expected: PASS

- [ ] **Step 5: Chạy toàn bộ test để xem file nào vỡ**

Run: `npm test`
Expected: FAIL ở `test/request-count.test.js` và `test/request-builder.test.js` — hai file đó là Task 4 và Task 5. Ghi lại danh sách file đỏ để đối chiếu; **không** file nào khác được đỏ.

- [ ] **Step 6: Commit**

```bash
git add public/js/state.js test/state.test.js
git commit -m "feat: chuyen credential vao state.auths, them state.runFilter"
```

---

### Task 4: `request-count.js` nhân thêm trục auth

**Files:**
- Modify: `public/js/shared/request-count.js`
- Test: `test/request-count.test.js:5` (sửa helper), thêm test mới

**Interfaces:**
- Consumes: `filterEndpoints`, `filterMsisdns`, `selectedAuths` từ Task 1
- Produces: `countRequests(state) => number` — chữ ký không đổi, nay nhân thêm số profile được chọn

- [ ] **Step 1: Sửa helper và viết test thất bại**

Trong `test/request-count.test.js`, sửa dòng 5:

```js
const st = (endpoints, msisdns = ['0912345678', '0913000111'], over = {}) => ({
  endpoints,
  msisdns,
  auths: [{ id: 'a1', name: 'A' }],
  runFilter: { methods: [], msisdnPatterns: [], authIds: [] },
  ...over,
});
```

Thêm vào cuối file:

```js
test('countRequests nhan them so profile duoc chon', () => {
  const s = st([{ enabled: true, attachMsisdn: true }], ['0912345678', '0913000111'], {
    auths: [{ id: 'a1', name: 'A' }, { id: 'a2', name: 'B' }],
  });
  assert.equal(countRequests(s), 4);
});

test('countRequests chi dem profile duoc chon trong runFilter', () => {
  const s = st([{ enabled: true, attachMsisdn: true }], ['0912345678', '0913000111'], {
    auths: [{ id: 'a1', name: 'A' }, { id: 'a2', name: 'B' }],
    runFilter: { methods: [], msisdnPatterns: [], authIds: ['a1'] },
  });
  assert.equal(countRequests(s), 2);
});

test('countRequests loc theo method', () => {
  const s = st(
    [{ enabled: true, attachMsisdn: true, method: 'GET' }, { enabled: true, attachMsisdn: true, method: 'POST' }],
    ['0912345678', '0913000111'],
    { runFilter: { methods: ['GET'], msisdnPatterns: [], authIds: [] } },
  );
  assert.equal(countRequests(s), 2);
});

test('countRequests loc theo pattern msisdn', () => {
  const s = st([{ enabled: true, attachMsisdn: true }], ['0912345678', '0913000111'], {
    runFilter: { methods: [], msisdnPatterns: ['0913'], authIds: [] },
  });
  assert.equal(countRequests(s), 1);
});

test('countRequests khong nhan msisdn cho endpoint attachMsisdn false', () => {
  const s = st([{ enabled: true, attachMsisdn: false }], ['0912345678', '0913000111'], {
    auths: [{ id: 'a1', name: 'A' }, { id: 'a2', name: 'B' }],
    runFilter: { methods: [], msisdnPatterns: ['0913'], authIds: [] },
  });
  assert.equal(countRequests(s), 2);
});
```

- [ ] **Step 2: Chạy test để xác nhận nó thất bại**

Run: `node --test test/request-count.test.js`
Expected: FAIL — test `countRequests nhan them so profile duoc chon` báo `4 !== 2` vì hàm cũ chưa biết trục auth

- [ ] **Step 3: Viết implementation tối thiểu**

Thay toàn bộ `public/js/shared/request-count.js`:

```js
import { filterEndpoints, filterMsisdns, selectedAuths } from './run-filter.js';

export function countRequests(state) {
  const runFilter = state?.runFilter ?? {};
  const auths = selectedAuths(state?.auths, runFilter);
  const msisdnCount = filterMsisdns(state?.msisdns, runFilter).length;

  const perAuth = filterEndpoints(state?.endpoints, runFilter)
    .reduce((sum, ep) => sum + (ep.attachMsisdn !== false ? msisdnCount : 1), 0);

  return auths.length * perAuth;
}
```

- [ ] **Step 4: Chạy test để xác nhận nó xanh**

Run: `node --test test/request-count.test.js`
Expected: PASS — 12 test

- [ ] **Step 5: Commit**

```bash
git add public/js/shared/request-count.js test/request-count.test.js
git commit -m "feat: dem request theo ca ba truc filter"
```

---

### Task 5: `buildRequests()` sinh tích ba chiều

**Files:**
- Modify: `src/server/request-builder.js:131-223`
- Test: `test/request-builder.test.js:5-24` (sửa helper), thêm test mới

**Interfaces:**
- Consumes: `filterEndpoints` / `filterMsisdns` / `selectedAuths` (Task 1), `authHeaderPairs` (Task 2)
- Produces: mỗi phần tử của `buildRequests(config)` thêm hai trường `authId: string` và `authName: string`

- [ ] **Step 1: Sửa helper và viết test thất bại**

Trong `test/request-builder.test.js`, sửa `baseConfig()` — bỏ dòng `token: 'TOKEN123'`, thêm:

```js
    auths: [{
      id: 'a1', name: 'Default', mode: 'fields',
      token: 'TOKEN123', cookie: '', refreshToken: '', curlRaw: '',
    }],
    runFilter: { methods: [], msisdnPatterns: [], authIds: [] },
```

Ba test đang truyền `baseConfig({ token: ... })` phải đổi sang `baseConfig({ auths: [{ id: 'a1', name: 'Default', mode: 'fields', token: '...', cookie: '', refreshToken: '', curlRaw: '' }] })`. Tìm chúng bằng `grep -n "token:" test/request-builder.test.js`.

Thêm vào cuối file:

```js
const TWO_AUTHS = [
  { id: 'a1', name: 'PROD', mode: 'fields', token: 'T1', cookie: 'C1', refreshToken: '', curlRaw: '' },
  { id: 'a2', name: 'UAT', mode: 'fields', token: 'T2', cookie: 'C2', refreshToken: '', curlRaw: '' },
];

test('buildRequests nhan them so profile', () => {
  const reqs = buildRequests(baseConfig({ auths: TWO_AUTHS }));
  assert.equal(reqs.length, 4);
  assert.deepEqual(reqs.map((r) => r.index), [1, 2, 3, 4]);
});

test('buildRequests xep request cung profile lien khoi', () => {
  const reqs = buildRequests(baseConfig({ auths: TWO_AUTHS }));
  assert.deepEqual(reqs.map((r) => r.authName), ['PROD', 'PROD', 'UAT', 'UAT']);
});

test('buildRequests gan dung credential cua tung profile', () => {
  const reqs = buildRequests(baseConfig({ auths: TWO_AUTHS }));
  assert.equal(reqs[0].headers.Authorization, 'Bearer T1');
  assert.equal(reqs[0].headers.Cookie, 'C1');
  assert.equal(reqs[2].headers.Authorization, 'Bearer T2');
  assert.equal(reqs[2].headers.Cookie, 'C2');
});

test('buildRequests gan authId va authName vao request', () => {
  const reqs = buildRequests(baseConfig({ auths: TWO_AUTHS }));
  assert.equal(reqs[0].authId, 'a1');
  assert.equal(reqs[3].authName, 'UAT');
});

test('buildRequests mode curl dua header trong chuoi curl vao request', () => {
  const cfg = baseConfig({
    auths: [{
      id: 'a1', name: 'CURL', mode: 'curl', token: '', cookie: '', refreshToken: '',
      curlRaw: "curl 'https://api-abc.vn/x' -H 'Authorization: Bearer FROMCURL' -H 'X-Tenant: vnpt'",
    }],
  });
  const reqs = buildRequests(cfg);
  assert.equal(reqs[0].headers.Authorization, 'Bearer FROMCURL');
  assert.equal(reqs[0].headers['X-Tenant'], 'vnpt');
});

test('header rieng cua endpoint thang header cua profile', () => {
  const cfg = baseConfig({
    auths: [{
      id: 'a1', name: 'C', mode: 'curl', token: '', cookie: '', refreshToken: '',
      curlRaw: "curl 'https://x' -H 'X-Tenant: from-profile'",
    }],
  });
  cfg.endpoints[0].headers = [{ key: 'X-Tenant', value: 'from-endpoint', enabled: true }];
  const reqs = buildRequests(cfg);
  assert.equal(reqs[0].headers['X-Tenant'], 'from-endpoint');
});

test('header cua profile thang HEADERS chung', () => {
  const cfg = baseConfig({
    auths: [{
      id: 'a1', name: 'C', mode: 'curl', token: '', cookie: '', refreshToken: '',
      curlRaw: "curl 'https://x' -H 'X-Tenant: from-profile'",
    }],
    globalHeaders: [{ key: 'X-Tenant', value: 'from-global', enabled: true }],
  });
  const reqs = buildRequests(cfg);
  assert.equal(reqs[0].headers['X-Tenant'], 'from-profile');
});

test('buildRequests loc endpoint theo method', () => {
  const cfg = baseConfig({ runFilter: { methods: ['POST'], msisdnPatterns: [], authIds: [] } });
  cfg.endpoints.push({ id: 'ep_2', enabled: true, method: 'POST', attachMsisdn: true,
    pathTemplate: '/create', queryParams: [], headers: [] });
  const reqs = buildRequests(cfg);
  assert.equal(reqs.length, 2);
  assert.ok(reqs.every((r) => r.method === 'POST'));
});

test('buildRequests loc msisdn theo pattern include', () => {
  const cfg = baseConfig({ runFilter: { methods: [], msisdnPatterns: ['0913'], authIds: [] } });
  const reqs = buildRequests(cfg);
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0].msisdn, '0913000111');
});

test('buildRequests chi chay profile duoc chon', () => {
  const cfg = baseConfig({
    auths: TWO_AUTHS,
    runFilter: { methods: [], msisdnPatterns: [], authIds: ['a2'] },
  });
  const reqs = buildRequests(cfg);
  assert.equal(reqs.length, 2);
  assert.ok(reqs.every((r) => r.authName === 'UAT'));
});

test('filter loai het endpoint thi tra mang rong', () => {
  const cfg = baseConfig({ runFilter: { methods: ['DELETE'], msisdnPatterns: [], authIds: [] } });
  assert.deepEqual(buildRequests(cfg), []);
});

test('mot profile va filter rong cho ket qua y het truoc spec', () => {
  const reqs = buildRequests(baseConfig());
  assert.equal(reqs.length, 2);
  assert.equal(reqs[0].headers.Authorization, 'Bearer TOKEN123');
});
```

- [ ] **Step 2: Chạy test để xác nhận nó thất bại**

Run: `node --test test/request-builder.test.js`
Expected: FAIL — nhiều test đỏ, trong đó `buildRequests nhan them so profile` báo `2 !== 4`

- [ ] **Step 3: Viết implementation tối thiểu**

Trong `src/server/request-builder.js`, thêm vào khối import ở đầu file:

```js
import { filterEndpoints, filterMsisdns, selectedAuths } from '../../public/js/shared/run-filter.js';
import { authHeaderPairs } from '../../public/js/shared/auth-utils.js';
```

Đổi chữ ký `buildOne` để nhận thêm `auth` (dòng 131):

```js
function buildOne({ config, auth, endpoint, msisdn, scope, index }) {
```

Trong `buildOne`, đổi dòng `mergePairs` của headers (dòng 154):

```js
  for (const [k, v] of mergePairs(
    effectiveHeaderPairs(endpoint), authHeaderPairs(auth), globalHeaderPairs(config),
  )) {
    headers[take(k)] = take(v);
  }
```

Đổi ba dòng credential (dòng 160-162) từ `config` sang `auth`:

```js
  putIfAbsent(headers, 'Authorization', auth?.token ? `Bearer ${auth.token}` : '');
  putIfAbsent(headers, 'Cookie', auth?.cookie);
  putIfAbsent(headers, 'refresh_token', auth?.refreshToken);
```

Trong object trả về của `buildOne`, thêm hai trường ngay sau `endpointName`:

```js
    authId: auth?.id ?? '',
    authName: auth?.name ?? '',
```

Thay toàn bộ thân vòng lặp của `buildRequests` (dòng 208-222):

```js
  const runFilter = config.runFilter ?? {};
  // Loc mot lan roi dung lai — de trong vong lap thi filterMsisdns chay lai
  // auths.length x endpoints.length lan vo ich.
  const auths = selectedAuths(config.auths, runFilter);
  const eps = filterEndpoints(config.endpoints, runFilter);
  const msisdns = filterMsisdns(config.msisdns, runFilter);

  const requests = [];
  let index = 0;

  // Auth o vong ngoai cung: request cua cung mot profile nam lien khoi.
  for (const auth of auths) {
    for (const endpoint of eps) {
      const list = wantsMsisdn(endpoint) ? msisdns : [null];
      for (const msisdn of list) {
        index += 1;
        requests.push(buildOne({
          config, auth, endpoint, msisdn, index,
          scope: { ...baseScope, msisdn },
        }));
      }
    }
  }

  return requests;
```

- [ ] **Step 4: Chạy test để xác nhận nó xanh**

Run: `node --test test/request-builder.test.js`
Expected: PASS — 83 test

- [ ] **Step 5: Commit**

```bash
git add src/server/request-builder.js test/request-builder.test.js
git commit -m "feat: sinh request theo tich auth x endpoint x msisdn"
```

---

### Task 6: `validateConfig()` — bốn lỗi mới

**Files:**
- Modify: `src/server/request-builder.js:13-57`
- Test: `test/request-builder.test.js` (thêm test)

**Interfaces:**
- Consumes: `findDuplicateNames` (Task 2), `filterEndpoints` / `filterMsisdns` / `selectedAuths` (Task 1)
- Produces: `validateConfig(config)` trả thêm lỗi với `field` là `'auths'`, `'auth:<id>'`, hoặc `'runFilter'`

- [ ] **Step 1: Viết test thất bại**

Thêm vào cuối `test/request-builder.test.js`:

```js
test('validateConfig bat khi khong co auth profile nao', () => {
  const errs = validateConfig(baseConfig({ auths: [] }));
  assert.ok(errs.some((e) => e.field === 'auths'));
});

test('validateConfig bat auth profile thieu ten', () => {
  const errs = validateConfig(baseConfig({
    auths: [{ id: 'a1', name: '', mode: 'fields', token: 'T', cookie: '', refreshToken: '', curlRaw: '' }],
  }));
  assert.ok(errs.some((e) => e.field === 'auth:a1'));
});

test('validateConfig coi ten chi co khoang trang la rong', () => {
  const errs = validateConfig(baseConfig({
    auths: [{ id: 'a1', name: '   ', mode: 'fields', token: 'T', cookie: '', refreshToken: '', curlRaw: '' }],
  }));
  assert.ok(errs.some((e) => e.field === 'auth:a1'));
});

test('validateConfig bat ten auth trung nhau', () => {
  const errs = validateConfig(baseConfig({ auths: [
    { id: 'a1', name: 'PROD', mode: 'fields', token: 'T1', cookie: '', refreshToken: '', curlRaw: '' },
    { id: 'a2', name: 'PROD', mode: 'fields', token: 'T2', cookie: '', refreshToken: '', curlRaw: '' },
  ] }));
  const dup = errs.filter((e) => e.message.includes('trùng'));
  assert.equal(dup.length, 2);
});

test('validateConfig khong coi PROD va prod la trung', () => {
  const errs = validateConfig(baseConfig({ auths: [
    { id: 'a1', name: 'PROD', mode: 'fields', token: 'T1', cookie: '', refreshToken: '', curlRaw: '' },
    { id: 'a2', name: 'prod', mode: 'fields', token: 'T2', cookie: '', refreshToken: '', curlRaw: '' },
  ] }));
  assert.deepEqual(errs, []);
});

test('validateConfig bat filter khong khop endpoint nao', () => {
  const errs = validateConfig(baseConfig({
    runFilter: { methods: ['DELETE'], msisdnPatterns: [], authIds: [] },
  }));
  assert.ok(errs.some((e) => e.field === 'runFilter'));
});

test('validateConfig bat filter khong khop msisdn nao', () => {
  const errs = validateConfig(baseConfig({
    runFilter: { methods: [], msisdnPatterns: ['0777'], authIds: [] },
  }));
  assert.ok(errs.some((e) => e.field === 'runFilter'));
});

test('validateConfig bat filter khong khop auth nao', () => {
  const errs = validateConfig(baseConfig({
    runFilter: { methods: [], msisdnPatterns: [], authIds: ['khong-ton-tai'] },
  }));
  assert.ok(errs.some((e) => e.field === 'runFilter'));
});

test('validateConfig khong bao loi khi authIds con it nhat mot id hop le', () => {
  const errs = validateConfig(baseConfig({
    runFilter: { methods: [], msisdnPatterns: [], authIds: ['a1', 'da-xoa'] },
  }));
  assert.deepEqual(errs, []);
});
```

- [ ] **Step 2: Chạy test để xác nhận nó thất bại**

Run: `node --test --test-name-pattern="validateConfig bat" test/request-builder.test.js`
Expected: FAIL — các test mới đỏ, `errs` rỗng

- [ ] **Step 3: Viết implementation tối thiểu**

Trong `src/server/request-builder.js`, thêm `findDuplicateNames` vào import từ `auth-utils.js`.

Trong `validateConfig()`, chèn ngay sau khối kiểm tra `domain`:

```js
  const auths = config?.auths ?? [];
  if (auths.length === 0) {
    errors.push({ field: 'auths', message: 'Cần ít nhất 1 auth profile' });
  }

  const dupNames = findDuplicateNames(auths);
  auths.forEach((a, i) => {
    const name = String(a?.name ?? '').trim();
    if (name === '') {
      errors.push({ field: `auth:${a?.id ?? i}`, message: `Auth profile thứ ${i + 1} chưa có tên` });
    } else if (dupNames.has(name)) {
      errors.push({ field: `auth:${a?.id ?? i}`, message: `Tên auth profile "${name}" bị trùng` });
    }
  });
```

Chèn ngay trước `return errors;`:

```js
  // Filter loc sach thi khong co gi de chay — bao ngay chu khong chay 0 request
  // roi bao "xong".
  const runFilter = config?.runFilter ?? {};
  const hasRows = selectedAuths(auths, runFilter).length > 0
    && filterEndpoints(config?.endpoints, runFilter).length > 0
    && (filterMsisdns(msisdns, runFilter).length > 0
      || filterEndpoints(config?.endpoints, runFilter).every((e) => !wantsMsisdn(e)));

  if (enabled.length > 0 && auths.length > 0 && !hasRows) {
    errors.push({ field: 'runFilter', message: 'Filter không khớp dòng nào — không có request để chạy' });
  }
```

Điều kiện `enabled.length > 0 && auths.length > 0` tránh báo hai lỗi chồng nhau khi người dùng chưa bật endpoint nào hoặc chưa có profile nào — lúc đó lỗi gốc đã được báo rồi.

- [ ] **Step 4: Chạy test để xác nhận nó xanh**

Run: `node --test test/request-builder.test.js`
Expected: PASS — 92 test

- [ ] **Step 5: Chạy toàn bộ test**

Run: `npm test`
Expected: PASS toàn bộ. Phần server đã xong; phần UI từ Task 7 trở đi.

- [ ] **Step 6: Commit**

```bash
git add src/server/request-builder.js test/request-builder.test.js
git commit -m "feat: chan cau hinh auth thieu ten, trung ten, va filter rong"
```

---

### Task 7: Tab AUTHS trong `tabs.js` và `index.html`

**Files:**
- Modify: `public/js/ui/tabs.js:1`
- Modify: `public/index.html:19-24` (thanh tab), thêm `<section id="panel-auths">` sau `#panel-input`
- Test: `test/tabs.test.js:72-85` (sửa `setupMockDOM`), thêm test mới

**Interfaces:**
- Consumes: không có
- Produces: `initTabs()` nhận thêm id `'auths'`; `tabs.select('auths')` mở panel AUTHS

- [ ] **Step 1: Sửa mock và viết test thất bại**

Trong `test/tabs.test.js`, sửa `setupMockDOM()` để có đủ 6 phần tử:

```js
function setupMockDOM() {
  const elements = {
    'tab-input': new MockElement('tab-input'),
    'tab-auths': new MockElement('tab-auths'),
    'tab-output': new MockElement('tab-output'),
    'panel-input': new MockElement('panel-input'),
    'panel-auths': new MockElement('panel-auths'),
    'panel-output': new MockElement('panel-output')
  };

  globalThis.document = {
    getElementById: (id) => elements[id] || null
  };

  return elements;
}
```

Trong test `dieu huong ban phim mui ten trai/phai, home/end`, ArrowRight từ `tab-input` nay sang `tab-auths` chứ không sang `tab-output`. Sửa khối đó thành:

```js
  const prevented = elements['tab-input'].keydown('ArrowRight');
  assert.equal(prevented, true);
  assert.equal(elements['tab-auths'].classList.contains('is-active'), true);
  assert.equal(elements['tab-auths'].focused, true);

  elements['tab-auths'].keydown('ArrowLeft');
  assert.equal(elements['tab-input'].classList.contains('is-active'), true);

  elements['tab-input'].keydown('End');
  assert.equal(elements['tab-output'].classList.contains('is-active'), true);

  elements['tab-output'].keydown('Home');
  assert.equal(elements['tab-input'].classList.contains('is-active'), true);
```

Trong test `initTabs khoi tao tab input active theo mac dinh`, thêm:

```js
  assert.equal(elements['tab-auths'].getAttribute('aria-selected'), 'false');
  assert.equal(elements['panel-auths'].hidden, true);
```

Thêm test mới:

```js
test('select auths mo panel auths va dong hai panel kia', () => {
  const elements = setupMockDOM();
  const { select } = initTabs();

  select('auths');

  assert.equal(elements['panel-auths'].hidden, false);
  assert.equal(elements['panel-input'].hidden, true);
  assert.equal(elements['panel-output'].hidden, true);
  assert.equal(elements['tab-auths'].classList.contains('is-active'), true);
});
```

- [ ] **Step 2: Chạy test để xác nhận nó thất bại**

Run: `node --test test/tabs.test.js`
Expected: FAIL — `select auths` không đổi gì vì `'auths'` chưa có trong `TAB_IDS`

- [ ] **Step 3: Viết implementation tối thiểu**

`public/js/ui/tabs.js` dòng 1:

```js
const TAB_IDS = ['input', 'auths', 'output'];
```

Trong `public/index.html`, thêm nút vào giữa hai tab hiện có:

```html
      <button id="tab-auths" class="tab" role="tab" aria-controls="panel-auths" aria-selected="false" tabindex="-1">
        AUTHS <span id="tab-auths-badge" class="tab-badge">1</span>
      </button>
```

Thêm panel rỗng ngay sau `</section>` đóng `#panel-input`:

```html
      <section id="panel-auths" class="panel" role="tabpanel" aria-labelledby="tab-auths" tabindex="0" hidden>
        <div class="auths-head">
          <h2 class="card-title">AUTHS</h2>
          <button id="btn-add-auth" type="button" class="btn btn-secondary btn-sm">＋ Thêm profile</button>
        </div>
        <div id="auths-list" class="auths-list"></div>
        <p class="hint">Mỗi profile là một bộ credential. Filter trước RUN ALL chọn profile nào sẽ chạy; không chọn gì thì chạy tất cả.</p>
      </section>
```

- [ ] **Step 4: Chạy test để xác nhận nó xanh**

Run: `node --test test/tabs.test.js`
Expected: PASS — 5 test

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/tabs.js public/index.html test/tabs.test.js
git commit -m "feat: them tab AUTHS vao thanh tab"
```

---

### Task 8: Helper DOM giả dùng chung cho test UI mới

**Files:**
- Create: `test/helpers/mock-dom.js`
- Test: không có test riêng — helper được chứng minh qua Task 9 và Task 10

**Interfaces:**
- Consumes: không có
- Produces:
  - `class MockElement` — API giống bản trong `test/endpoint-drawer.test.js:6-105`
  - `installMockDocument(elementsById = {}) => { elements, docListeners }` — cài `globalThis.document` và `globalThis.localStorage`

Chín file test hiện có mỗi file tự chép một bản `MockElement`. Không đụng vào chúng — đây chỉ là chỗ dùng chung cho ba file test **mới**, để không chép thêm lần thứ mười.

- [ ] **Step 1: Tạo helper**

Tạo `test/helpers/mock-dom.js` — chép nguyên `class MockElement` và `function matchesSelector` từ `test/endpoint-drawer.test.js:6-120`, thêm `export` trước `class`, rồi thêm ở cuối:

```js
export function installMockDocument(elementsById = {}) {
  const elements = { ...elementsById };
  const docListeners = {};

  globalThis.document = {
    getElementById: (id) => elements[id] ?? null,
    createElement: (tagName) => new MockElement(tagName),
    addEventListener: (type, fn) => {
      if (!docListeners[type]) docListeners[type] = [];
      docListeners[type].push(fn);
    },
    dispatchEvent: (event) => {
      for (const fn of docListeners[event.type] ?? []) fn(event);
    },
  };

  globalThis.localStorage = {
    getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {},
  };

  return { elements, docListeners };
}
```

Thêm hai method vào `MockElement` mà ba test mới cần nhưng bản gốc chưa có:

```js
  keydown(key) {
    let defaultPrevented = false;
    this.dispatchEvent({ type: 'keydown', key, preventDefault: () => { defaultPrevented = true; } });
    return defaultPrevented;
  }

  remove() {
    const parent = this.parentElement;
    if (!parent) return;
    parent.children = parent.children.filter((c) => c !== this);
    this.parentElement = null;
  }
```

- [ ] **Step 2: Xác nhận helper import được**

Run: `node --input-type=module -e "import('./test/helpers/mock-dom.js').then((m) => console.log(typeof m.MockElement, typeof m.installMockDocument))"`
Expected: in ra `function function`

- [ ] **Step 3: Commit**

```bash
git add test/helpers/mock-dom.js
git commit -m "test: helper DOM gia dung chung cho test UI moi"
```

---

### Task 9: Panel AUTHS

**Files:**
- Create: `public/js/ui/auths-panel.js`
- Modify: `public/css/app.css` (thêm khối style cuối file)
- Test: `test/auths-panel.test.js`

**Interfaces:**
- Consumes: `state` / `persist` / `notify` / `subscribe` / `makeAuth` (Task 3), `hasToken` / `findDuplicateNames` / `authHeaderPairs` (Task 2), `installMockDocument` (Task 8)
- Produces: `initAuthsPanel() => { render }`

- [ ] **Step 1: Viết test thất bại**

Tạo `test/auths-panel.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { MockElement, installMockDocument } from './helpers/mock-dom.js';
import { state, defaultConfig, makeAuth } from '../public/js/state.js';
import { initAuthsPanel } from '../public/js/ui/auths-panel.js';

function setup(auths) {
  const list = new MockElement('div', 'auths-list');
  const addBtn = new MockElement('button', 'btn-add-auth');
  const badge = new MockElement('span', 'tab-auths-badge');
  installMockDocument({ 'auths-list': list, 'btn-add-auth': addBtn, 'tab-auths-badge': badge });

  Object.assign(state, defaultConfig());
  state.auths = auths ?? [makeAuth({ name: 'PROD', token: 'T1' })];
  state.runFilter = { methods: [], msisdnPatterns: [], authIds: [] };

  const panel = initAuthsPanel();
  return { list, addBtn, badge, panel };
}

const cards = (list) => list.querySelectorAll('.auth-card');

test('render mot the cho moi profile', () => {
  const { list } = setup([makeAuth({ name: 'A' }), makeAuth({ name: 'B' })]);
  assert.equal(cards(list).length, 2);
});

test('them profile sinh id khac nhau', () => {
  const { list, addBtn } = setup();
  addBtn.click();
  assert.equal(state.auths.length, 2);
  assert.notEqual(state.auths[0].id, state.auths[1].id);
  assert.equal(cards(list).length, 2);
});

test('sua o ten ghi vao state', () => {
  const { list } = setup();
  list.querySelector('.auth-name').input('UAT');
  assert.equal(state.auths[0].name, 'UAT');
});

test('ten rong danh dau is-invalid', () => {
  const { list } = setup();
  const input = list.querySelector('.auth-name');
  input.input('   ');
  assert.equal(list.querySelector('.auth-name').classList.contains('is-invalid'), true);
});

test('ten trung danh dau is-invalid o ca hai the', () => {
  const { list } = setup([makeAuth({ name: 'A' }), makeAuth({ name: 'A' })]);
  const names = list.querySelectorAll('.auth-name');
  assert.equal(names[0].classList.contains('is-invalid'), true);
  assert.equal(names[1].classList.contains('is-invalid'), true);
});

test('nhan ban giu credential va them hau to copy', () => {
  const { list } = setup([makeAuth({ name: 'PROD', token: 'T1', cookie: 'C1' })]);
  list.querySelector('.auth-dup').click();

  assert.equal(state.auths.length, 2);
  assert.equal(state.auths[1].name, 'PROD (copy)');
  assert.equal(state.auths[1].token, 'T1');
  assert.equal(state.auths[1].cookie, 'C1');
  assert.notEqual(state.auths[1].id, state.auths[0].id);
});

test('khong xoa duoc profile cuoi cung', () => {
  const { list } = setup([makeAuth({ name: 'A' })]);
  const del = list.querySelector('.auth-del');
  assert.equal(del.disabled, true);
  del.click();
  assert.equal(state.auths.length, 1);
});

test('xoa profile go luon id khoi runFilter.authIds', () => {
  const a = makeAuth({ name: 'A' });
  const b = makeAuth({ name: 'B' });
  const { list } = setup([a, b]);
  state.runFilter.authIds = [a.id, b.id];

  list.querySelectorAll('.auth-del')[0].click();

  assert.equal(state.auths.length, 1);
  assert.deepEqual(state.runFilter.authIds, [b.id]);
});

test('doi sang mode curl hien textarea va an ba o rieng', () => {
  const { list } = setup();
  list.querySelector('.auth-card').querySelector('[data-mode=curl]').click();

  assert.equal(state.auths[0].mode, 'curl');
  const card = list.querySelector('.auth-card');
  assert.ok(card.querySelector('textarea'));
  assert.equal(card.querySelector('.auth-token'), null);
});

test('doi mode qua lai khong mat du lieu o mode kia', () => {
  const { list } = setup([makeAuth({ name: 'A', token: 'T1', curlRaw: "curl -H 'a: b'" })]);
  const card = () => list.querySelector('.auth-card');

  card().querySelector('[data-mode=curl]').click();
  assert.equal(state.auths[0].token, 'T1');

  card().querySelector('[data-mode=fields]').click();
  assert.equal(state.auths[0].curlRaw, "curl -H 'a: b'");
});

test('mode curl dem so header parse duoc', () => {
  const { list } = setup([makeAuth({
    name: 'A', mode: 'curl',
    curlRaw: "curl 'https://x' -H 'Authorization: Bearer z' -H 'X-Tenant: vnpt'",
  })]);
  assert.ok(list.querySelector('.auth-curl-count').textContent.includes('2'));
});

test('badge tren tab hien so profile', () => {
  const { badge } = setup([makeAuth({ name: 'A' }), makeAuth({ name: 'B' })]);
  assert.equal(badge.textContent, '2');
});
```

- [ ] **Step 2: Chạy test để xác nhận nó thất bại**

Run: `node --test test/auths-panel.test.js`
Expected: FAIL — `Cannot find module .../public/js/ui/auths-panel.js`

- [ ] **Step 3: Viết implementation tối thiểu**

Tạo `public/js/ui/auths-panel.js`:

```js
import { state, persist, notify, makeAuth } from '../state.js';
import { hasToken, findDuplicateNames, authHeaderPairs } from '../shared/auth-utils.js';

const MODES = [
  { value: 'fields', label: '3 ô riêng' },
  { value: 'curl', label: 'Dán cURL' },
];

const FIELDS = [
  { key: 'token', label: 'Bearer token', cls: 'auth-token', placeholder: 'dán token vào đây' },
  { key: 'cookie', label: 'Cookie', cls: 'auth-cookie', placeholder: 'BIGipServerpool_...=...' },
  { key: 'refreshToken', label: 'Refresh token', cls: 'auth-refresh', placeholder: 'để trống trừ khi API đòi' },
];

function textInput(cls, value, placeholder, onInput) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = `input mono ${cls}`;
  input.spellcheck = false;
  input.value = value ?? '';
  input.placeholder = placeholder;
  input.addEventListener('input', () => onInput(input.value));
  return input;
}

function labelled(text, control) {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  const span = document.createElement('span');
  span.className = 'label';
  span.textContent = text;
  wrap.append(span, control);
  return wrap;
}

export function initAuthsPanel() {
  const host = document.getElementById('auths-list');
  const addBtn = document.getElementById('btn-add-auth');
  const badge = document.getElementById('tab-auths-badge');

  function update(index, patch) {
    state.auths[index] = { ...state.auths[index], ...patch };
    persist();
    notify();
    render();
  }

  function remove(index) {
    if (state.auths.length <= 1) return;
    const [gone] = state.auths.splice(index, 1);
    state.runFilter.authIds = (state.runFilter.authIds ?? []).filter((id) => id !== gone.id);
    persist();
    notify();
    render();
  }

  function duplicate(index) {
    // Bo id ra khoi ban sao truoc khi goi makeAuth: makeAuth spread `over` sau
    // `id`, nen de nguyen id cu (hay id: undefined) deu ghi de mat id moi.
    const { id, ...rest } = state.auths[index];
    state.auths.splice(index + 1, 0, makeAuth({ ...rest, name: `${rest.name} (copy)` }));
    persist();
    notify();
    render();
  }

  function modeRow(auth, index) {
    const row = document.createElement('div');
    row.className = 'auth-mode-row';
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = 'Cách nhập:';
    row.append(label);

    for (const m of MODES) {
      const wrap = document.createElement('label');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = `authmode_${auth.id}`;
      radio.dataset.mode = m.value;
      radio.checked = (auth.mode ?? 'fields') === m.value;
      // Dung 'click' chu khong 'change': DOM gia trong test khong tu ban change.
      radio.addEventListener('click', () => update(index, { mode: m.value }));
      wrap.append(radio, document.createTextNode(m.label));
      row.append(wrap);
    }
    return row;
  }

  function bodyFor(auth, index) {
    const box = document.createElement('div');
    box.className = 'auth-body';

    if ((auth.mode ?? 'fields') === 'curl') {
      const ta = document.createElement('textarea');
      ta.className = 'input mono ed-textarea';
      ta.spellcheck = false;
      ta.placeholder = 'Dán nguyên lệnh Copy as cURL vào đây — dòng URL và các cờ khác tự bị bỏ qua.';
      ta.value = auth.curlRaw ?? '';
      ta.addEventListener('input', () => {
        state.auths[index] = { ...state.auths[index], curlRaw: ta.value };
        persist();
        notify();
        count.textContent = countText(state.auths[index]);
      });

      const count = document.createElement('p');
      count.className = 'hint auth-curl-count';
      count.textContent = countText(auth);

      box.append(ta, count);
      return box;
    }

    for (const f of FIELDS) {
      box.append(labelled(f.label, textInput(f.cls, auth[f.key], f.placeholder, (v) => {
        state.auths[index] = { ...state.auths[index], [f.key]: v.trim() };
        persist();
        notify();
      })));
    }
    return box;
  }

  function countText(auth) {
    const pairs = authHeaderPairs(auth);
    if (pairs.length === 0) return 'Chưa nhận được header nào.';
    const names = pairs.map((p) => p.key.toLowerCase());
    const bits = [];
    if (names.includes('authorization')) bits.push('Authorization');
    if (names.includes('cookie')) bits.push('Cookie');
    return `Đã nhận ${pairs.length} header${bits.length > 0 ? `, có ${bits.join(' và ')}` : ''}.`;
  }

  function card(auth, index, dupNames) {
    const box = document.createElement('details');
    box.className = 'card auth-card';
    box.open = index === 0;

    const head = document.createElement('summary');
    head.className = 'auth-head';

    const name = textInput('auth-name', auth.name, 'tên profile — bắt buộc', (v) => {
      state.auths[index] = { ...state.auths[index], name: v };
      persist();
      notify();
      refreshNameValidity();
    });
    // O ten nam trong <summary>: khong chan thi moi cu click deu gap/mo the.
    name.addEventListener('click', (e) => e.stopPropagation?.());
    const trimmed = String(auth.name ?? '').trim();
    name.classList.toggle('is-invalid', trimmed === '' || dupNames.has(trimmed));

    const status = document.createElement('span');
    status.className = `token-indicator ${hasToken(auth) ? '' : 'is-off'}`;
    status.textContent = hasToken(auth) ? '● token ok' : '○ chưa có token';

    const dup = document.createElement('button');
    dup.type = 'button';
    dup.className = 'btn btn-secondary btn-sm auth-dup';
    dup.textContent = '⧉';
    dup.title = 'Nhân bản profile này';
    dup.addEventListener('click', () => duplicate(index));

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn btn-secondary btn-sm auth-del';
    del.textContent = '✕';
    del.disabled = state.auths.length <= 1;
    del.title = del.disabled ? 'Phải giữ lại ít nhất 1 profile' : 'Xóa profile này';
    del.addEventListener('click', () => remove(index));

    head.append(name, status, dup, del);
    box.append(head, modeRow(auth, index), bodyFor(auth, index));
    return box;
  }

  // Chi to do / bo do o ten. Render lai ca danh sach giua luc dang go se lam
  // o nhap mat focus sau moi ky tu.
  function refreshNameValidity() {
    const dupNames = findDuplicateNames(state.auths);
    const inputs = host.querySelectorAll('.auth-name');
    state.auths.forEach((a, i) => {
      const trimmed = String(a.name ?? '').trim();
      inputs[i]?.classList.toggle('is-invalid', trimmed === '' || dupNames.has(trimmed));
    });
  }

  function render() {
    const dupNames = findDuplicateNames(state.auths);
    host.replaceChildren(...state.auths.map((a, i) => card(a, i, dupNames)));
    if (badge) badge.textContent = String(state.auths.length);
  }

  addBtn.addEventListener('click', () => {
    state.auths.push(makeAuth({ name: `Profile ${state.auths.length + 1}` }));
    persist();
    notify();
    render();
  });

  render();
  return { render };
}
```

- [ ] **Step 4: Chạy test để xác nhận nó xanh**

Run: `node --test test/auths-panel.test.js`
Expected: PASS — 12 test

- [ ] **Step 5: Thêm CSS**

Thêm vào cuối `public/css/app.css`:

```css
/* ---------- tab AUTHS ---------- */
.auths-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.auths-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 900px;
}

.auth-card > .auth-head {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  list-style: none;
}

.auth-head .auth-name { flex: 1 1 220px; max-width: 260px; }
.auth-head .token-indicator { margin-left: auto; }

.auth-mode-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 10px 0;
}

.auth-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
```

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/auths-panel.js public/css/app.css test/auths-panel.test.js
git commit -m "feat: panel quan ly nhieu auth profile"
```

---

### Task 10: Filter bar trước RUN ALL

**Files:**
- Create: `public/js/ui/run-filter-bar.js`
- Modify: `public/index.html:128-132` (`.actionbar`)
- Modify: `public/css/app.css`
- Test: `test/run-filter-bar.test.js`

**Interfaces:**
- Consumes: `state` / `persist` / `notify` (Task 3), `filterEndpoints` / `filterMsisdns` / `selectedAuths` (Task 1)
- Produces: `initRunFilterBar() => { render }`

Spec §6.4 mô tả method là một nút mở dropdown chứa 5 checkbox. Plan render thẳng 5 checkbox trong bar: chúng chiếm chưa tới 300px, luôn thấy được trạng thái đang tick mà không phải mở gì, và bỏ được một popup thứ hai phải lo đóng/mở. Ô msisdn vẫn có popup vì danh sách của nó dài không giới hạn.

- [ ] **Step 1: Viết test thất bại**

Tạo `test/run-filter-bar.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { MockElement, installMockDocument } from './helpers/mock-dom.js';
import { state, defaultConfig, makeAuth } from '../public/js/state.js';
import { initRunFilterBar } from '../public/js/ui/run-filter-bar.js';

function setup(over = {}) {
  const host = new MockElement('div', 'run-filter-bar');
  const breakdown = new MockElement('span', 'run-breakdown');
  installMockDocument({ 'run-filter-bar': host, 'run-breakdown': breakdown });

  Object.assign(state, defaultConfig());
  state.msisdns = ['0912345678', '0912000111', '0988123999'];
  state.endpoints = [
    { id: 'e1', enabled: true, method: 'GET', attachMsisdn: true },
    { id: 'e2', enabled: true, method: 'POST', attachMsisdn: true },
  ];
  state.auths = [makeAuth({ name: 'PROD' }), makeAuth({ name: 'UAT' })];
  Object.assign(state, over);

  const bar = initRunFilterBar();
  return { host, breakdown, bar };
}

test('tick method ghi vao runFilter.methods', () => {
  const { host } = setup();
  host.querySelector('[data-method=GET]').click();
  assert.deepEqual(state.runFilter.methods, ['GET']);
});

test('bo tick method go khoi runFilter.methods', () => {
  const { host } = setup();
  host.querySelector('[data-method=GET]').click();
  host.querySelector('[data-method=GET]').click();
  assert.deepEqual(state.runFilter.methods, []);
});

test('moi method hien so endpoint dang bat', () => {
  const { host } = setup();
  const rows = host.querySelectorAll('.rf-method').map((n) => n.textContent);
  assert.deepEqual(rows, ['GET (1)', 'POST (1)', 'PUT (0)', 'PATCH (0)', 'DELETE (0)']);
});

test('go vao o msisdn hien goi y cac so chua chuoi do', () => {
  const { host } = setup();
  host.querySelector('.rf-msisdn-input').input('0912');
  const items = host.querySelectorAll('.rf-suggest-item');
  assert.equal(items.length, 2);
  assert.ok(items[0].textContent.includes('0912345678'));
});

test('bam goi y tao chip la so day du', () => {
  const { host } = setup();
  host.querySelector('.rf-msisdn-input').input('0912');
  host.querySelectorAll('.rf-suggest-item')[0].click();
  assert.deepEqual(state.runFilter.msisdnPatterns, ['0912345678']);
});

test('Enter khong tro goi y tao chip la chuoi dang go', () => {
  const { host } = setup();
  const input = host.querySelector('.rf-msisdn-input');
  input.value = '0912';
  input.keydown('Enter');
  assert.deepEqual(state.runFilter.msisdnPatterns, ['0912']);
});

test('chip trung khong them hai lan', () => {
  const { host } = setup();
  const input = () => host.querySelector('.rf-msisdn-input');
  input().value = '0912';
  input().keydown('Enter');
  input().value = '0912';
  input().keydown('Enter');
  assert.deepEqual(state.runFilter.msisdnPatterns, ['0912']);
});

test('chip mau hien so khop khi khop nhieu hon mot', () => {
  const { host } = setup();
  const input = host.querySelector('.rf-msisdn-input');
  input.value = '0912';
  input.keydown('Enter');
  assert.ok(host.querySelector('.rf-chip').textContent.includes('(2)'));
});

test('Backspace o o rong xoa chip cuoi', () => {
  const { host } = setup({ runFilter: { methods: [], msisdnPatterns: ['0912', '0988'], authIds: [] } });
  const input = host.querySelector('.rf-msisdn-input');
  input.value = '';
  input.keydown('Backspace');
  assert.deepEqual(state.runFilter.msisdnPatterns, ['0912']);
});

test('bam x tren chip xoa dung chip do', () => {
  const { host } = setup({ runFilter: { methods: [], msisdnPatterns: ['0912', '0988'], authIds: [] } });
  host.querySelectorAll('.rf-chip-del')[0].click();
  assert.deepEqual(state.runFilter.msisdnPatterns, ['0988']);
});

test('chon auth luu id chu khong luu name', () => {
  const { host } = setup();
  const id = state.auths[1].id;
  host.querySelector(`[data-auth="${id}"]`).click();
  assert.deepEqual(state.runFilter.authIds, [id]);
});

test('chua chon auth nao thi hien chip mo tat ca', () => {
  const { host } = setup();
  assert.ok(host.querySelector('.rf-auth-all').textContent.includes('tất cả (2)'));
});

test('dong phan ra hien dung ba thua so', () => {
  const { breakdown } = setup();
  assert.equal(breakdown.textContent, '2 endpoint × 3 msisdn × 2 auth');
});

test('dong phan ra cap nhat sau khi loc', () => {
  const { host, breakdown } = setup();
  host.querySelector('[data-method=GET]').click();
  assert.equal(breakdown.textContent, '1 endpoint × 3 msisdn × 2 auth');
});
```

- [ ] **Step 2: Chạy test để xác nhận nó thất bại**

Run: `node --test test/run-filter-bar.test.js`
Expected: FAIL — `Cannot find module .../public/js/ui/run-filter-bar.js`

- [ ] **Step 3: Viết implementation tối thiểu**

Tạo `public/js/ui/run-filter-bar.js`:

```js
import { state, persist, notify } from '../state.js';
import { filterEndpoints, filterMsisdns, selectedAuths } from '../shared/run-filter.js';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const MAX_SUGGEST = 20;

function chip(label, onDelete, extraClass = '') {
  const box = document.createElement('span');
  box.className = `rf-chip ${extraClass}`;
  const text = document.createElement('span');
  text.textContent = label;
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'rf-chip-del';
  del.textContent = '×';
  del.addEventListener('click', onDelete);
  box.append(text, del);
  return box;
}

export function initRunFilterBar() {
  const host = document.getElementById('run-filter-bar');
  const breakdown = document.getElementById('run-breakdown');

  const filter = () => {
    if (!state.runFilter) state.runFilter = { methods: [], msisdnPatterns: [], authIds: [] };
    return state.runFilter;
  };

  function commit() {
    persist();
    notify();
    render();
  }

  function toggleInList(key, value) {
    const list = filter()[key] ?? [];
    filter()[key] = list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
    commit();
  }

  function methodGroup() {
    const box = document.createElement('div');
    box.className = 'rf-group rf-methods';
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = 'method';
    box.append(label);

    const enabled = (state.endpoints ?? []).filter((e) => e.enabled);
    for (const m of METHODS) {
      const count = enabled.filter((e) => String(e.method || 'GET').toUpperCase() === m).length;
      const wrap = document.createElement('label');
      wrap.className = 'rf-method';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.dataset.method = m;
      cb.checked = (filter().methods ?? []).includes(m);
      cb.addEventListener('click', () => toggleInList('methods', m));

      wrap.append(cb, document.createTextNode(`${m} (${count})`));
      box.append(wrap);
    }
    return box;
  }

  // render() dung lai o nhap moi nen con tro se van ra ngoai — tra focus lai
  // de go duoc nhieu so lien tiep.
  function refocusMsisdn() {
    host.querySelector('.rf-msisdn-input')?.focus();
  }

  function addPattern(value) {
    const v = String(value ?? '').trim();
    if (v === '') return;
    const list = filter().msisdnPatterns ?? [];
    if (list.includes(v)) {
      refocusMsisdn();
      return;
    }
    filter().msisdnPatterns = [...list, v];
    commit();
    refocusMsisdn();
  }

  function msisdnGroup() {
    const box = document.createElement('div');
    box.className = 'rf-group rf-msisdns';
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = 'msisdn';
    box.append(label);

    const all = state.msisdns ?? [];
    for (const p of filter().msisdnPatterns ?? []) {
      const hits = all.filter((m) => String(m).includes(p)).length;
      box.append(chip(hits > 1 ? `${p} (${hits})` : p, () => {
        filter().msisdnPatterns = filter().msisdnPatterns.filter((x) => x !== p);
        commit();
      }));
    }

    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'input input-sm mono rf-msisdn-input';
    input.placeholder = (filter().msisdnPatterns ?? []).length === 0 ? 'mọi msisdn' : '';

    const popup = document.createElement('ul');
    popup.className = 'rf-suggest';
    popup.hidden = true;

    function refreshSuggest() {
      const q = input.value.trim();
      popup.replaceChildren();
      if (q === '') {
        popup.hidden = true;
        return;
      }
      const hits = all.filter((m) => String(m).includes(q));
      for (const m of hits.slice(0, MAX_SUGGEST)) {
        const li = document.createElement('li');
        li.className = 'rf-suggest-item';
        li.textContent = m;
        li.addEventListener('click', () => addPattern(m));
        popup.append(li);
      }
      if (hits.length > MAX_SUGGEST) {
        const more = document.createElement('li');
        more.className = 'rf-suggest-more';
        more.textContent = `… và ${hits.length - MAX_SUGGEST} số nữa`;
        popup.append(more);
      }
      popup.hidden = hits.length === 0;
    }

    input.addEventListener('input', refreshSuggest);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault?.();
        addPattern(input.value);
        return;
      }
      if (e.key === 'Backspace' && input.value === '') {
        const list = filter().msisdnPatterns ?? [];
        if (list.length === 0) return;
        filter().msisdnPatterns = list.slice(0, -1);
        commit();
      }
    });

    box.append(input, popup);
    return box;
  }

  function authGroup() {
    const box = document.createElement('div');
    box.className = 'rf-group rf-auths';
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = 'auth';
    box.append(label);

    const chosen = filter().authIds ?? [];
    if (chosen.length === 0) {
      const all = document.createElement('span');
      all.className = 'rf-chip rf-auth-all';
      all.textContent = `tất cả (${(state.auths ?? []).length})`;
      box.append(all);
    }

    for (const a of state.auths ?? []) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn btn-secondary btn-sm rf-auth${chosen.includes(a.id) ? ' is-active' : ''}`;
      btn.dataset.auth = a.id;
      btn.textContent = a.name || '(chưa đặt tên)';
      btn.addEventListener('click', () => toggleInList('authIds', a.id));
      box.append(btn);
    }
    return box;
  }

  function render() {
    host.replaceChildren(methodGroup(), msisdnGroup(), authGroup());
    if (!breakdown) return;
    const f = filter();
    const e = filterEndpoints(state.endpoints, f).length;
    const m = filterMsisdns(state.msisdns, f).length;
    const a = selectedAuths(state.auths, f).length;
    breakdown.textContent = `${e} endpoint × ${m} msisdn × ${a} auth`;
  }

  render();
  return { render };
}
```

- [ ] **Step 4: Chạy test để xác nhận nó xanh**

Run: `node --test test/run-filter-bar.test.js`
Expected: PASS — 14 test

- [ ] **Step 5: Nối vào `index.html` và thêm CSS**

Trong `public/index.html`, thay khối `.actionbar` (dòng 128-132) bằng:

```html
        <div id="run-filter-bar" class="run-filter-bar"></div>

        <div class="actionbar">
          <button id="btn-run" class="btn btn-primary" type="button">▶ RUN ALL (0)</button>
          <span id="run-breakdown" class="hint mono"></span>
          <button id="btn-export-config" class="btn btn-secondary" type="button">⤒ Export config</button>
          <button id="btn-import-config" class="btn btn-secondary" type="button">⤓ Import config</button>
        </div>
```

Thêm vào cuối `public/css/app.css`:

```css
/* ---------- filter truoc RUN ALL ---------- */
.run-filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  padding: 8px 0;
}

.rf-group {
  display: flex;
  align-items: center;
  gap: 6px;
  position: relative;
}

.rf-method { display: inline-flex; align-items: center; gap: 3px; }

.rf-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 12px;
  background: var(--surface-2, #2b3139);
  font-size: 12px;
}

.rf-auth-all { opacity: 0.6; }

.rf-chip-del {
  border: 0;
  background: none;
  color: inherit;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.rf-msisdn-input { width: 160px; }

.rf-suggest {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 20;
  margin: 2px 0 0;
  padding: 4px 0;
  list-style: none;
  max-height: 240px;
  overflow-y: auto;
  min-width: 180px;
  background: var(--surface, #1e2329);
  border: 1px solid var(--border, #2b3139);
  border-radius: 6px;
}

.rf-suggest-item { padding: 4px 10px; cursor: pointer; font-family: monospace; }
.rf-suggest-item:hover { background: var(--surface-2, #2b3139); }
.rf-suggest-more { padding: 4px 10px; opacity: 0.6; font-size: 12px; }

.rf-auth.is-active { border-color: var(--info, #4a90d9); }
```

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/run-filter-bar.js public/index.html public/css/app.css test/run-filter-bar.test.js
git commit -m "feat: filter theo method / msisdn / auth truoc khi chay"
```

---

### Task 11: `connection-panel.js` bỏ ba ô credential

**Files:**
- Modify: `public/js/ui/connection-panel.js`
- Modify: `public/index.html:37-49` (bỏ ba ô, thêm dòng nhắc)
- Test: `test/input-panels.test.js` (sửa phần CONNECTION)

**Interfaces:**
- Consumes: `hasToken` (Task 2), `state.auths` (Task 3)
- Produces: `initConnectionPanel() => { refresh }` — chữ ký không đổi; nay chỉ quản Domain và indicator

- [ ] **Step 1: Sửa test hiện có và viết test thất bại**

Trong `test/input-panels.test.js`, `setupMockDOM()` ở dòng 212-218 dựng sáu phần tử. Xóa ba dòng `'inp-token'`, `'inp-cookie'`, `'inp-refresh-token'`, thêm `'tab-auths-badge': new MockElement('span', 'tab-auths-badge')`.

Test `Connection Panel - bindings and token load/reload` (dòng 283) khẳng định cả ba ô. Thay toàn bộ thân test bằng phần chỉ còn domain:

```js
test('Connection Panel - domain binding va validate', () => {
  const elements = setupMockDOM();
  Object.assign(state, defaultConfig());
  initConnectionPanel();

  assert.equal(elements['inp-domain'].value, '');

  elements['inp-domain'].value = 'http://test.com';
  elements['inp-domain'].dispatchEvent({ type: 'input' });
  assert.equal(state.domain, 'http://test.com');
  assert.equal(elements['inp-domain'].classList.contains('is-invalid'), false);

  elements['inp-domain'].value = 'invalid-domain';
  elements['inp-domain'].dispatchEvent({ type: 'input' });
  assert.equal(elements['inp-domain'].classList.contains('is-invalid'), true);
});
```

Thêm hai test mới:

```js
test('indicator dem so profile co token', () => {
  const elements = setupMockDOM();
  Object.assign(state, defaultConfig());
  state.auths = [
    { id: 'a1', name: 'A', mode: 'fields', token: 'T', cookie: '', refreshToken: '', curlRaw: '' },
    { id: 'a2', name: 'B', mode: 'fields', token: '', cookie: '', refreshToken: '', curlRaw: '' },
    { id: 'a3', name: 'C', mode: 'curl', token: '', cookie: '', refreshToken: '', curlRaw: "curl -H 'Authorization: Bearer z'" },
  ];

  initConnectionPanel();

  assert.equal(elements['token-indicator'].textContent, '● 2/3 auth có token');
  assert.equal(elements['token-indicator'].classList.contains('is-off'), false);
});

test('indicator bao is-off khi khong profile nao co token', () => {
  const elements = setupMockDOM();
  Object.assign(state, defaultConfig());
  state.auths = [{ id: 'a1', name: 'A', mode: 'fields', token: '', cookie: '', refreshToken: '', curlRaw: '' }];

  initConnectionPanel();

  assert.equal(elements['token-indicator'].textContent, '○ 0/1 auth có token');
  assert.equal(elements['token-indicator'].classList.contains('is-off'), true);
});
```

Hai test mới dùng cùng `setupMockDOM()` của file, nên đổi `setupConnectionDOM()` trong đoạn trên thành `setupMockDOM()` và đọc phần tử qua `elements['token-indicator']`.

- [ ] **Step 2: Chạy test để xác nhận nó thất bại**

Run: `node --test test/input-panels.test.js`
Expected: FAIL — indicator vẫn in `● token ok`

- [ ] **Step 3: Viết implementation tối thiểu**

Thay `public/js/ui/connection-panel.js` từ dòng 19 trở xuống:

```js
export function initConnectionPanel() {
  const domain = document.getElementById('inp-domain');
  const indicator = document.getElementById('token-indicator');
  const reload = document.getElementById('btn-reload-token');

  function refresh() {
    domain.value = state.domain;

    const auths = state.auths ?? [];
    const withToken = auths.filter(hasToken).length;
    indicator.textContent = `${withToken > 0 ? '●' : '○'} ${withToken}/${auths.length} auth có token`;
    indicator.classList.toggle('is-off', withToken === 0);

    domain.classList.toggle('is-invalid', Boolean(domain.value) && !/^https?:\/\/\S+$/i.test(domain.value));
  }

  domain.addEventListener('input', () => { state.domain = domain.value.trim(); persist(); refresh(); notify(); });

  // Ghi vao profile dau tien dang duoc chon, khong chon gi thi profile dau danh sach.
  function targetAuth() {
    const chosen = state.runFilter?.authIds ?? [];
    return (state.auths ?? []).find((a) => chosen.includes(a.id)) ?? state.auths?.[0] ?? null;
  }

  reload.addEventListener('click', () => {
    const found = tryLoadToken();
    const auth = targetAuth();
    if (found && auth) {
      auth.token = found;
      auth.mode = 'fields';
      persist();
      refresh();
      notify();
      window.ccmToast?.(`Đã nạp token vào profile "${auth.name}"`, 'ok');
    } else {
      window.ccmToast?.(
        'Không đọc được access_token ở origin này. Trình duyệt chặn đọc cookie của domain khác — dán token thủ công vào tab AUTHS.',
        'error',
      );
    }
  });

  refresh();
  return { refresh };
}
```

Thêm `import { hasToken } from '../shared/auth-utils.js';` ở đầu file.

Trong `public/index.html`, xóa ba khối `<label class="field">` chứa `inp-token`, `inp-cookie`, `inp-refresh-token` (dòng 37-48) và đoạn hint dài ở dòng 49, thay bằng:

```html
              <p class="hint">Bearer token, Cookie và Refresh token nằm ở tab <b>AUTHS</b> — mỗi profile một bộ.</p>
```

- [ ] **Step 4: Chạy test để xác nhận nó xanh**

Run: `node --test test/input-panels.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/connection-panel.js public/index.html test/input-panels.test.js
git commit -m "feat: CONNECTION chi con domain, indicator dem profile co token"
```

---

### Task 12: Nối dây trong `main.js`

**Files:**
- Modify: `public/js/main.js:1-16` (import), `:46-57` (khởi tạo)
- Test: chạy tay trong trình duyệt — `main.js` không có test đơn vị (nó là lớp nối dây)

**Interfaces:**
- Consumes: `initAuthsPanel` (Task 9), `initRunFilterBar` (Task 10)
- Produces: không có

- [ ] **Step 1: Thêm import**

Trong `public/js/main.js`, thêm hai dòng vào khối import:

```js
import { initAuthsPanel } from './ui/auths-panel.js';
import { initRunFilterBar } from './ui/run-filter-bar.js';
```

- [ ] **Step 2: Khởi tạo hai module**

Ngay sau `initMsisdnDrawer();` (dòng 49), thêm:

```js
const authsPanel = initAuthsPanel();
const runFilterBar = initRunFilterBar();

// Xoa endpoint, doi method, import msisdn deu lam so lieu tren filter bar cu
// di — ve lai bar moi lan state doi.
subscribe(() => {
  authsPanel.render();
  runFilterBar.render();
});
```

`subscribe` đã có trong khối import ở dòng 1.

- [ ] **Step 3: Chạy tool và kiểm bằng mắt**

Run: `npm start` rồi mở `http://localhost:9000`

Kiểm tra theo thứ tự:
1. Thanh tab có ba mục `INPUT | AUTHS | OUTPUT`, badge cạnh AUTHS hiện `1`.
2. Tab AUTHS có một profile tên `Default`; gõ tên, bấm `⧉`, bấm `✕` đều chạy; nút `✕` mờ khi chỉ còn một profile.
3. Đổi sang `Dán cURL`, dán một lệnh `Copy as cURL` — dòng đếm header hiện đúng số.
4. Tab INPUT: card CONNECTION chỉ còn Domain; indicator ở topbar hiện `● 1/1 auth có token` sau khi nhập token.
5. Filter bar hiện trên nút RUN ALL; tick `GET` thì số trên nút và dòng phân rã đổi theo.
6. Gõ vài số vào ô msisdn, chọn từ gợi ý, bấm `×` trên chip.
7. Bấm RUN ALL với 2 profile — bảng OUTPUT ra gấp đôi số dòng.

- [ ] **Step 4: Commit**

```bash
git add public/js/main.js
git commit -m "feat: noi panel AUTHS va filter bar vao man hinh chinh"
```

---

### Task 13: Cột Auth trong bảng OUTPUT

**Files:**
- Modify: `public/js/shared/filter-logic.js`
- Modify: `public/js/ui/result-table.js:23-34` (`cellText`)
- Modify: `public/js/ui/filters.js`
- Modify: `public/js/ui/detail-drawer.js:99-121`
- Modify: `public/js/shared/curl.js:34-37`
- Test: `test/filter-logic.test.js`, `test/curl.test.js`, `test/result-table.test.js`, `test/filters.test.js`

**Interfaces:**
- Consumes: record có `authName` (Task 5)
- Produces:
  - `ALL_COLUMNS` thêm `{ key: 'auth', header: 'Auth', default: true }`
  - `emptyFilter()` thêm khóa `auth: ''`
  - `collectAuthNames(records) => string[]`

- [ ] **Step 1: Viết test thất bại**

Thêm vào `test/filter-logic.test.js`:

```js
test('ALL_COLUMNS co cot auth va bat mac dinh', () => {
  const col = ALL_COLUMNS.find((c) => c.key === 'auth');
  assert.ok(col);
  assert.equal(col.header, 'Auth');
  assert.equal(col.default, true);
});

test('emptyFilter co khoa auth rong', () => {
  assert.equal(emptyFilter().auth, '');
});

test('matchesFilter loc theo authName khop chinh xac', () => {
  const rec = { authName: 'PROD', endpointName: '', msisdn: '', errorCode: '', response: { status: 200 } };
  assert.equal(matchesFilter(rec, { ...emptyFilter(), auth: 'PROD' }), true);
  assert.equal(matchesFilter(rec, { ...emptyFilter(), auth: 'PRO' }), false);
  assert.equal(matchesFilter(rec, { ...emptyFilter(), auth: 'UAT' }), false);
});

test('collectAuthNames tra danh sach khong trung da sap xep', () => {
  const recs = [{ authName: 'UAT' }, { authName: 'PROD' }, { authName: 'UAT' }, { authName: '' }];
  assert.deepEqual(collectAuthNames(recs), ['PROD', 'UAT']);
});
```

Thêm `collectAuthNames` vào import ở đầu file.

Thêm vào `test/curl.test.js`:

```js
test('curlFilename chen ten profile de hai profile khong trung ten file', () => {
  const rec = { index: 3, endpointName: 'Tra cứu', msisdn: '0912345678', authName: 'PROD-A' };
  assert.equal(curlFilename(rec), 'curl-3-tra-cuu-0912345678-prod-a.txt');
});

test('curlFilename bo qua authName rong', () => {
  const rec = { index: 1, endpointName: 'X', msisdn: '', authName: '' };
  assert.equal(curlFilename(rec), 'curl-1-x.txt');
});
```

- [ ] **Step 2: Chạy test để xác nhận nó thất bại**

Run: `node --test test/filter-logic.test.js test/curl.test.js`
Expected: FAIL — `collectAuthNames is not a function`, `curlFilename` thiếu hậu tố

- [ ] **Step 3: Viết implementation tối thiểu**

Trong `public/js/shared/filter-logic.js`:

```js
export const ALL_COLUMNS = [
  { key: 'index', header: '#', default: true },
  { key: 'status', header: 'Status · Error · Time', default: true },
  { key: 'name', header: 'Name', default: true },
  { key: 'auth', header: 'Auth', default: true },
  { key: 'path', header: 'Path', default: true },
  { key: 'request', header: 'Request', default: true },
  { key: 'responseBody', header: 'Response body', default: true },
  { key: 'responseHeaders', header: 'Response headers', default: true },
];

export function emptyFilter() {
  return { msisdn: '', name: '', status: '', errorCode: '', auth: '' };
}
```

Trong `matchesFilter`, thêm ngay trước `return true`:

```js
  if (filter.auth && (rec.authName ?? '') !== filter.auth) return false;
```

Thêm ở cuối file:

```js
export function collectAuthNames(records) {
  return [...new Set(records.map((r) => r.authName).filter(Boolean))].sort();
}
```

Trong `public/js/ui/result-table.js`, thêm một nhánh vào `cellText`:

```js
    case 'auth': return rec.authName || '—';
```

Trong `public/js/ui/filters.js`:
- thêm `collectAuthNames` vào import từ `filter-logic.js`
- tạo select mới cạnh `statusSelect`:

```js
  const authSelect = makeSelect('Lọc theo auth profile');
  fillSelect(authSelect, [], '(tất cả)');
```

- thêm `authSelect` vào mảng gắn listener ở dòng 76
- trong `syncFilter()` thêm `filter.auth = authSelect.value;`
- trong `filterCell(key)` thêm `if (key === 'auth') return authSelect;`
- trong `refreshOptions(records)` thêm `fillSelect(authSelect, collectAuthNames(records), '(tất cả)');`

Trong `public/js/ui/detail-drawer.js`, đổi dòng tiêu đề (dòng 101):

```js
        <h2 class="card-title">Request #${rec.index}${rec.authName ? ` · ${escapeHtml(rec.authName)}` : ''}</h2>
```

và thêm một ô vào `.kv-grid` (sau dòng 116):

```js
        <div><span class="label">AUTH</span>${kvTable({ profile: rec.authName ?? '—' })}</div>
```

Trong `public/js/shared/curl.js`, đổi `curlFilename`:

```js
export function curlFilename(rec) {
  const parts = [
    `curl-${rec?.index ?? 0}`,
    slug(rec?.endpointName),
    slug(rec?.msisdn),
    slug(rec?.authName),
  ];
  return `${parts.filter(Boolean).join('-')}.txt`;
}
```

- [ ] **Step 4: Chạy test để xác nhận nó xanh**

Run: `npm test`
Expected: PASS toàn bộ. `test/result-table.test.js:425` và `test/filters.test.js` đều truyền `getVisibleColumns` cố định chứ không đọc `ALL_COLUMNS`, nên thêm cột không đụng tới chúng — nếu chúng đỏ thì là dấu hiệu sửa nhầm chỗ khác.

- [ ] **Step 5: Commit**

```bash
git add public/js/shared/filter-logic.js public/js/shared/curl.js public/js/ui/result-table.js public/js/ui/filters.js public/js/ui/detail-drawer.js test/
git commit -m "feat: cot Auth trong bang ket qua, drawer va ten file cURL"
```

---

### Task 14: Cột Auth trong file Excel

**Files:**
- Modify: `src/server/excel-export.js:8-24` (`EXPORT_COLUMNS`), `:73-91` (`toRow`)
- Modify: `public/index.html:151` (chữ cảnh báo)
- Test: `test/excel-export.test.js`

**Interfaces:**
- Consumes: record có `authName` (Task 5)
- Produces: `EXPORT_COLUMNS` thêm `{ header: 'Auth', key: 'auth', width: 18 }` ngay sau MSISDN

- [ ] **Step 1: Viết test thất bại**

Thêm vào `test/excel-export.test.js`:

```js
test('EXPORT_COLUMNS co cot Auth ngay sau MSISDN', () => {
  const keys = EXPORT_COLUMNS.map((c) => c.key);
  assert.equal(keys[keys.indexOf('msisdn') + 1], 'auth');
  assert.equal(EXPORT_COLUMNS.find((c) => c.key === 'auth').header, 'Auth');
});

test('serializeHeaders che token cua tung dong doc lap', () => {
  const a = serializeHeaders({ Authorization: 'Bearer AAAAAAAAAAAAAAAA' }, false);
  const b = serializeHeaders({ Authorization: 'Bearer BBBBBBBBBBBBBBBB' }, false);

  assert.ok(a.includes('AAAAAA'));
  assert.ok(!a.includes('BBBBBB'));
  assert.ok(b.includes('BBBBBB'));
  assert.ok(!b.includes('AAAAAA'));
});
```

Thêm `EXPORT_COLUMNS` vào import nếu chưa có.

- [ ] **Step 2: Chạy test để xác nhận nó thất bại**

Run: `node --test test/excel-export.test.js`
Expected: FAIL — `keys[indexOf('msisdn') + 1]` là `'method'` chứ không phải `'auth'`

- [ ] **Step 3: Viết implementation tối thiểu**

Trong `src/server/excel-export.js`, thêm vào `EXPORT_COLUMNS` ngay sau dòng MSISDN:

```js
  { header: 'Auth', key: 'auth', width: 18 },
```

Trong `toRow()`, thêm ngay sau `msisdn`:

```js
    auth: rec.authName ?? '',
```

Trong `public/index.html` dòng 151, đổi chữ cảnh báo:

```html
        <p id="token-warning" class="warning" hidden>File sẽ chứa bearer token và cookie session còn hạn của <b>mọi</b> auth profile — cân nhắc trước khi chia sẻ.</p>
```

- [ ] **Step 4: Chạy test để xác nhận nó xanh**

Run: `node --test test/excel-export.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/excel-export.js public/index.html test/excel-export.test.js
git commit -m "feat: cot Auth trong file Excel"
```

---

### Task 15: Gỡ tab bar khỏi drawer cấu hình endpoint

**Files:**
- Modify: `public/js/ui/endpoint-drawer.js:12-16` (xóa `TABS`), `:197-249` (`open`)
- Modify: `public/css/app.css`
- Test: `test/endpoint-drawer.test.js` (sửa 6 test dùng `[data-tab=...]`)

**Interfaces:**
- Consumes: không có
- Produces: `initEndpointDrawer()` giữ nguyên chữ ký `{ open, close }`; drawer không còn phần tử `.body-tabs`

- [ ] **Step 1: Sửa test hiện có và thêm test mới**

Trong `test/endpoint-drawer.test.js`:

- Xóa test `doi tab hien dung pane` (dòng 199-206).
- Trong test `open hien thi tieu de va tab query mac dinh`, đổi tên thành `open hien ca ba muc cung luc` và thay hai khẳng định cuối bằng:

```js
  assert.equal(drawer.querySelector('[data-pane=query]').hidden, false);
  assert.equal(drawer.querySelector('[data-pane=headers]').hidden, false);
  assert.equal(drawer.querySelector('[data-pane=body]').hidden, false);
```

- Trong 5 test còn lại có dòng `drawer.querySelector('[data-tab=headers]').click();` hoặc `[data-tab=body]`, **xóa** dòng đó — pane đã hiện sẵn, không cần bấm gì.
- Thêm hai test mới:

```js
test('drawer khong con thanh tab', () => {
  const { drawer, drawerCtrl } = setup();
  drawerCtrl.open(0);
  assert.equal(drawer.querySelector('.body-tabs'), null);
});

test('moi muc co tieu de rieng', () => {
  const { drawer, drawerCtrl } = setup();
  drawerCtrl.open(0);
  const titles = drawer.querySelectorAll('.ed-section-title').map((n) => n.textContent);
  assert.deepEqual(titles, ['QUERY', 'HEADERS', 'BODY']);
});
```

`MockElement.querySelectorAll` trả mảng thật nên `.map` dùng được.

- [ ] **Step 2: Chạy test để xác nhận nó thất bại**

Run: `node --test test/endpoint-drawer.test.js`
Expected: FAIL — `drawer khong con thanh tab` đỏ vì `.body-tabs` vẫn còn; các test bỏ dòng click đỏ vì pane vẫn `hidden`

- [ ] **Step 3: Viết implementation tối thiểu**

Trong `public/js/ui/endpoint-drawer.js`, xóa hằng `TABS` (dòng 12-16) và thay bằng:

```js
const SECTIONS = [
  { key: 'query', label: 'QUERY' },
  { key: 'headers', label: 'HEADERS' },
  { key: 'body', label: 'BODY' },
];
```

Trong `open(index)`, thay toàn bộ đoạn từ `const tabBar = ...` đến `selectTab('query');` bằng:

```js
    const panesHost = document.createElement('div');
    panesHost.className = 'drawer-panes';

    for (const s of SECTIONS) {
      const title = document.createElement('h3');
      title.className = 'card-title ed-section-title';
      title.textContent = s.label;

      const pane = document.createElement('div');
      pane.className = 'body-pane';
      pane.dataset.pane = s.key;
      RENDERERS[s.key](pane);

      panesHost.append(title, pane);
    }

    drawer.append(head, panesHost);
```

Xóa biến `panes` và hàm `selectTab` — không còn ai gọi.

- [ ] **Step 4: Chạy test để xác nhận nó xanh**

Run: `node --test test/endpoint-drawer.test.js`
Expected: PASS

- [ ] **Step 5: Thêm CSS**

Thêm vào cuối `public/css/app.css`:

```css
/* ---------- drawer cau hinh endpoint: ba muc xep doc ---------- */
.drawer-panes { overflow-y: auto; }

.ed-section-title {
  margin: 16px 0 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border, #2b3139);
}

.ed-section-title:first-child { margin-top: 0; padding-top: 0; border-top: 0; }
```

- [ ] **Step 6: Chạy toàn bộ test lần cuối**

Run: `npm test`
Expected: PASS toàn bộ, không file nào đỏ.

- [ ] **Step 7: Commit**

```bash
git add public/js/ui/endpoint-drawer.js public/css/app.css test/endpoint-drawer.test.js
git commit -m "feat: drawer endpoint hien QUERY HEADERS BODY cung mot man"
```

---

### Task 16: Cập nhật README

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: mọi thứ ở trên
- Produces: không có

- [ ] **Step 1: Sửa mục "Dùng"**

Trong `README.md`, mục **Tab INPUT**, xóa dòng 2 (`Bearer token — dán vào...`) và đánh số lại. Thêm sau danh sách:

```markdown
Tab **AUTHS**: mỗi profile là một bộ credential (Bearer token, Cookie, Refresh token). Nhập theo ba ô riêng, hoặc dán nguyên lệnh `Copy as cURL` — khi dán cURL thì **mọi** header trong lệnh đó được gửi kèm, không chỉ ba credential.

Trước khi bấm RUN ALL, thanh **FILTER** thu hẹp tập request theo ba trục: method, msisdn (gõ vào để chọn từ gợi ý, hoặc gõ một đoạn số để khớp mọi số chứa đoạn đó), và auth profile. Không chọn gì ở một trục nghĩa là lấy tất cả. Dòng cạnh nút cho biết `N endpoint × M msisdn × K auth`.
```

- [ ] **Step 2: Sửa mục "Ba ô phải dán tay"**

Đổi tiêu đề thành `## Credential phải dán tay`, và đổi câu mở đầu:

```markdown
Ba giá trị này hết hạn theo phiên đăng nhập nên nằm ở tab AUTHS, mỗi profile một bộ:
```

Giữ nguyên bảng và đoạn hướng dẫn `Copy as fetch` phía dưới.

- [ ] **Step 3: Sửa mục "Token"**

Đổi câu về nút Reload Token:

```markdown
Nút `⟳ Reload Token` chỉ đọc được `access_token` ở **cùng origin với tool**, và ghi vào profile đang được chọn ở filter (không chọn gì thì ghi vào profile đầu danh sách). Ở `localhost:9000` trình duyệt chặn đọc cookie của domain khác — đây là giới hạn của trình duyệt, không phải lỗi. Khi đó dán token thủ công vào tab AUTHS.
```

Trong đoạn về Excel, đổi thành: `... quyết định file có mang theo credential đầy đủ của mọi profile hay chỉ mang bản đã che.`

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: mo ta tab AUTHS va filter truoc RUN ALL"
```

---

## Thứ tự phụ thuộc

```
Task 1 (run-filter) ──┬─> Task 4 (request-count)
                      ├─> Task 5 (buildRequests) ──> Task 6 (validateConfig)
                      └─> Task 10 (filter bar)

Task 2 (auth-utils) ──┼─> Task 5, Task 6, Task 9, Task 11

Task 3 (state) ───────┼─> Task 9 (auths panel), Task 10, Task 11

Task 7 (tabs) ────────┴─> Task 9

Task 8 (mock-dom) ──────> Task 9, Task 10

Task 12 (main.js) cần: Task 9, Task 10
Task 13, 14, 15, 16 độc lập với nhau, chỉ cần Task 5 đã xong
```

Chạy tuần tự 1 → 16 là an toàn nhất. Task 13, 14, 15 có thể làm song song nếu muốn.
