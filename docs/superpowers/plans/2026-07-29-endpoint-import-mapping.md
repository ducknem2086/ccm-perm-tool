# Import endpoint nhiều cột và cập nhật bảng kết quả — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import file Excel/CSV nhiều cột để sinh endpoint kèm đúng method và tên, đồng thời gom `status`/`error`/`time` thành một cột và thêm `Name`, `Path`, `MSISDN` vào bảng kết quả.

**Architecture:** Server chỉ parse file thành lưới thô (`headers` + `rows`) rồi trả về; client map cột theo template người dùng tự khai, bằng một module hàm thuần trong `public/js/shared/` — cùng chỗ với `validators.js`, `variables.js`, `filter-logic.js`. Placeholder `{*}` trong path được xử lý ở tầng `variables.js` nên `request-builder.js` không phải đổi logic nhân request.

**Tech Stack:** Node 20+, ESM (`"type": "module"`), Express 5, ExcelJS, `node:test` + `node:assert/strict`. Không có framework frontend — DOM thuần, module ES.

## Global Constraints

- Chạy test bằng `npm test` (tương đương `node --test "test/**/*.test.js"`). Không có test runner nào khác.
- Toàn bộ mã nguồn là ESM. Import phải ghi đủ đuôi `.js`.
- Comment trong code viết tiếng Việt **không dấu** (theo đúng code hiện có). Chuỗi hiển thị cho người dùng viết tiếng Việt **có dấu**.
- `public/js/shared/*` phải chạy được ở cả Node lẫn trình duyệt: không `import` module Node, không đụng DOM, không đụng `localStorage`.
- Không thêm dependency mới vào `package.json`.
- Mọi test cũ phải xanh sau mỗi task, trừ những test được sửa có chủ đích và ghi rõ trong task đó.
- Placeholder `{*}` luôn ứng với biến `msisdn`.
- Cột `path` hiển thị chuỗi gốc còn nguyên `{*}`, không thay số, không kèm domain, không kèm query string.

---

### Task 1: Placeholder `{*}` trong variables.js

**Files:**
- Modify: `public/js/shared/variables.js:1-30`
- Test: `test/variables.test.js`

**Interfaces:**
- Consumes: không có.
- Produces: `extractVariables(template)` nhận thêm `{*}` và trả `'msisdn'`; `resolve(template, scope)` thay `{*}` bằng `scope.msisdn`. `src/server/variables.js` đã re-export sẵn nên phía server tự có.

- [ ] **Step 1: Viết test thất bại**

Thêm vào cuối `test/variables.test.js`:

```js
test('extractVariables nhan dien placeholder sao', () => {
  assert.deepEqual(extractVariables('/query/white-list-ir-subscriber/{*}'), ['msisdn']);
});

test('extractVariables khong nhan doi msisdn khi co ca {*} va :msisdn', () => {
  assert.deepEqual(extractVariables('/x/{*}/:msisdn'), ['msisdn']);
});

test('resolve thay the placeholder sao bang msisdn', () => {
  const r = resolve('/query/white-list-ir-subscriber/{*}', { msisdn: '0912345678' });
  assert.equal(r.value, '/query/white-list-ir-subscriber/0912345678');
  assert.deepEqual(r.missing, []);
});

test('resolve bao thieu msisdn khi placeholder sao khong co gia tri', () => {
  const r = resolve('/x/{*}', {});
  assert.deepEqual(r.missing, ['msisdn']);
});
```

- [ ] **Step 2: Chạy test để xác nhận nó fail**

Run: `npm test -- --test-name-pattern="placeholder sao"`
Expected: FAIL — `extractVariables('/query/…/{*}')` trả `[]` chứ không phải `['msisdn']`.

- [ ] **Step 3: Sửa `public/js/shared/variables.js`**

```js
const CURLY_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
const COLON_RE = /:([A-Za-z_][A-Za-z0-9_]*)/g;
const STAR_RE = /\{\*\}/g;

// Placeholder {*} trong file import ung voi path param dau tien, luon la msisdn.
const STAR_NAME = 'msisdn';

export function extractVariables(template) {
  const names = new Set();
  const text = String(template ?? '');
  for (const m of text.matchAll(CURLY_RE)) names.add(m[1]);
  for (const m of text.matchAll(COLON_RE)) names.add(m[1]);
  if (STAR_RE.test(text)) names.add(STAR_NAME);
  STAR_RE.lastIndex = 0;
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
    .replace(STAR_RE, () => pick(STAR_NAME))
    .replace(COLON_RE, (_, name) => pick(name));

  return { value, missing: [...missing] };
}
```

`STAR_RE` có cờ `g` nên `.test()` giữ trạng thái `lastIndex` giữa các lần gọi — phải reset về `0` ngay sau đó, nếu không lần gọi thứ hai với cùng chuỗi sẽ trả `false`.

`.replace(STAR_RE, …)` đặt trước `COLON_RE` để thứ tự thay thế không phụ thuộc vào nhau; `{*}` không chứa dấu hai chấm nên thực tế thứ tự nào cũng đúng, đặt vậy cho dễ đọc.

- [ ] **Step 4: Chạy toàn bộ test**

Run: `npm test`
Expected: PASS toàn bộ. Test cũ `extractVariables bo qua port trong URL` vẫn xanh vì `{*}` không xuất hiện trong `http://localhost:2345/api`.

- [ ] **Step 5: Commit**

```bash
git add public/js/shared/variables.js test/variables.test.js
git commit -m "feat: nhan dien placeholder {*} trong path la bien msisdn"
```

---

### Task 2: Đọc file thành lưới thô trong file-import.js

**Files:**
- Modify: `src/server/file-import.js:1-52`
- Test: `test/file-import.test.js`

**Interfaces:**
- Consumes: không có.
- Produces:
  - `parseTxtGrid(text) → string[][]`
  - `parseCsvGrid(text) → string[][]`
  - `parseXlsxGrid(buffer) → Promise<string[][]>`
  - `parseGrid({ filename, buffer }) → Promise<{ headers: string[], rows: string[][] }>`
  - `parseTxt`, `parseCsv`, `parseXlsx`, `parseImport` giữ nguyên chữ ký và hành vi cũ.

- [ ] **Step 1: Viết test thất bại**

Thêm vào cuối `test/file-import.test.js`:

```js
test('parseCsvGrid giu du moi cot', () => {
  assert.deepEqual(
    parseCsvGrid('name,method,endpoint\nTra cuu,GET,/query/abc/{*}'),
    [['name', 'method', 'endpoint'], ['Tra cuu', 'GET', '/query/abc/{*}']],
  );
});

test('parseCsvGrid go dau nhay kep tung o', () => {
  assert.deepEqual(parseCsvGrid('"Tra cuu","GET"'), [['Tra cuu', 'GET']]);
});

test('parseTxtGrid coi moi dong la mot o', () => {
  assert.deepEqual(parseTxtGrid('/a\n/b'), [['/a'], ['/b']]);
});

test('parseXlsxGrid giu du moi cot', async () => {
  const buffer = await xlsxBuffer([['name', 'method', 'endpoint'], ['Tra cuu', 'GET', '/query/abc/{*}']]);
  assert.deepEqual(
    await parseXlsxGrid(buffer),
    [['name', 'method', 'endpoint'], ['Tra cuu', 'GET', '/query/abc/{*}']],
  );
});

test('parseGrid tach dong dau lam header', async () => {
  const buffer = await xlsxBuffer([['name', 'method', 'endpoint'], ['Tra cuu', 'GET', '/a/{*}'], ['Cap nhat', 'POST', '/b/{*}']]);
  const g = await parseGrid({ filename: 'apis.xlsx', buffer });
  assert.deepEqual(g.headers, ['name', 'method', 'endpoint']);
  assert.equal(g.rows.length, 2);
  assert.deepEqual(g.rows[1], ['Cap nhat', 'POST', '/b/{*}']);
});

test('parseGrid tra ve rong khi file khong co dong nao', async () => {
  const g = await parseGrid({ filename: 'p.txt', buffer: Buffer.from('') });
  assert.deepEqual(g.headers, []);
  assert.deepEqual(g.rows, []);
});

test('parseGrid bao loi voi duoi file la', async () => {
  await assert.rejects(
    () => parseGrid({ filename: 'p.pdf', buffer: Buffer.from('') }),
    /không hỗ trợ/,
  );
});
```

Sửa dòng `import` ở đầu file test cho khớp:

```js
import {
  parseTxt, parseCsv, parseImport,
  parseTxtGrid, parseCsvGrid, parseXlsxGrid, parseGrid,
} from '../src/server/file-import.js';
```

- [ ] **Step 2: Chạy test để xác nhận nó fail**

Run: `npm test -- --test-name-pattern="Grid"`
Expected: FAIL — `parseCsvGrid is not a function`.

- [ ] **Step 3: Viết lại `src/server/file-import.js`**

```js
import ExcelJS from 'exceljs';
import { VALIDATORS } from '../../public/js/shared/validators.js';

const unquote = (s) => String(s ?? '').trim().replace(/^"(.*)"$/, '$1');

export function parseTxtGrid(text) {
  return String(text).split(/\r?\n/).map((line) => [line.trim()]);
}

export function parseCsvGrid(text) {
  return String(text)
    .split(/\r?\n/)
    .map((line) => line.split(/[,;\t]/).map(unquote));
}

function cellToString(cell) {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'object' && 'text' in cell) return String(cell.text);
  if (typeof cell === 'object' && 'result' in cell) return String(cell.result);
  return String(cell);
}

export async function parseXlsxGrid(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const out = [];
  ws.eachRow((row) => {
    const cells = [];
    // row.cellCount bo qua o trong o cuoi dong, nhung du de doc het cac cot co du lieu.
    for (let i = 1; i <= row.cellCount; i += 1) cells.push(cellToString(row.getCell(i).value).trim());
    out.push(cells);
  });
  return out;
}

export async function parseGrid({ filename, buffer }) {
  const ext = String(filename ?? '').toLowerCase().split('.').pop();

  let grid;
  if (ext === 'txt') grid = parseTxtGrid(buffer.toString('utf8'));
  else if (ext === 'csv') grid = parseCsvGrid(buffer.toString('utf8'));
  else if (ext === 'xlsx' || ext === 'xls') grid = await parseXlsxGrid(buffer);
  else throw new Error(`Đuôi file không hỗ trợ: .${ext}`);

  const nonEmpty = grid.filter((row) => row.some((c) => c !== ''));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };
  return { headers: nonEmpty[0], rows: nonEmpty.slice(1) };
}

export function parseTxt(text) {
  return String(text).split(/\r?\n/);
}

export function parseCsv(text) {
  return parseCsvGrid(text).map((row) => row[0] ?? '').filter((v) => v !== '');
}

export async function parseXlsx(buffer) {
  return (await parseXlsxGrid(buffer)).map((row) => row[0] ?? '');
}

function stripHeaderRow(values, kind) {
  const validate = VALIDATORS[kind];
  if (!validate || values.length < 2) return values;
  if (!validate(values[0]) && values.slice(1).some(validate)) return values.slice(1);
  return values;
}

export async function parseImport({ filename, buffer, kind, dedupe = true }) {
  const ext = String(filename ?? '').toLowerCase().split('.').pop();

  let raw;
  if (ext === 'txt') raw = parseTxt(buffer.toString('utf8'));
  else if (ext === 'csv') raw = parseCsv(buffer.toString('utf8'));
  else if (ext === 'xlsx' || ext === 'xls') raw = await parseXlsx(buffer);
  else throw new Error(`Đuôi file không hỗ trợ: .${ext}`);

  const trimmed = raw.map((v) => String(v).trim()).filter((v) => v !== '');
  const withoutHeader = stripHeaderRow(trimmed, kind);
  const values = dedupe ? [...new Set(withoutHeader)] : withoutHeader;

  return { values, total: trimmed.length, skipped: trimmed.length - values.length };
}
```

`parseXlsx` cũ trả `''` cho ô rỗng, `parseXlsxGrid(...).map((row) => row[0] ?? '')` giữ đúng hành vi đó. `parseTxt` giữ nguyên bản cũ vì test cũ mong nó **không** lọc dòng rỗng (`['0912345678', '0913000111', '']`).

- [ ] **Step 4: Chạy toàn bộ test**

Run: `npm test`
Expected: PASS toàn bộ, kể cả 11 test cũ trong `file-import.test.js`.

- [ ] **Step 5: Commit**

```bash
git add src/server/file-import.js test/file-import.test.js
git commit -m "feat: doc file import thanh luoi tho giu du moi cot"
```

---

### Task 3: Route POST /api/import/grid

**Files:**
- Modify: `src/server/routes.js:1-114`
- Test: `test/routes.test.js`

**Interfaces:**
- Consumes: `parseGrid({ filename, buffer })` từ Task 2.
- Produces: `POST /api/import/grid` — header `X-Filename`, body raw file, trả `200 { headers, rows }` hoặc `400 { error }`.

- [ ] **Step 1: Viết test thất bại**

Thêm vào cuối `test/routes.test.js`:

```js
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
```

- [ ] **Step 2: Chạy test để xác nhận nó fail**

Run: `npm test -- --test-name-pattern="import/grid"`
Expected: FAIL — status 404 chứ không phải 200.

- [ ] **Step 3: Thêm route**

Sửa dòng import ở đầu `src/server/routes.js`:

```js
import { parseImport, parseGrid } from './file-import.js';
```

Chèn khối sau ngay dưới route `app.post('/api/import', …)` (kết thúc ở dòng 90):

```js
  app.post('/api/import/grid',
    express.raw({ type: '*/*', limit: '20mb' }),
    async (req, res) => {
      try {
        const grid = await parseGrid({
          filename: req.get('X-Filename') || 'unknown.txt',
          buffer: req.body,
        });
        res.json(grid);
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });
```

- [ ] **Step 4: Chạy toàn bộ test**

Run: `npm test`
Expected: PASS. Route `/api/import` cũ không đổi nên test `POST /api/import doc file txt gui dang raw` vẫn xanh.

- [ ] **Step 5: Commit**

```bash
git add src/server/routes.js test/routes.test.js
git commit -m "feat: route POST /api/import/grid tra luoi tho cua file"
```

---

### Task 4: Module map cột endpoint-mapping.js

**Files:**
- Create: `public/js/shared/endpoint-mapping.js`
- Test: `test/endpoint-mapping.test.js`

**Interfaces:**
- Consumes: không có.
- Produces:
  - `TARGETS = ['name', 'method', 'endpoint']`
  - `METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']`
  - `resolveColumns(headers, template) → { columns, errors }` với `columns` là object `{ name?: number, method?: number, endpoint?: number }` (index 0-based vào mảng ô của một dòng) và `errors` là `string[]`.
  - `mapRows(grid, template, opts) → { records, errors, skipped }` với `grid = { headers, rows }`, `opts = { dedupe?: boolean }`, `records` là `[{ name, method, endpoint }]`, `errors` là `[{ row, reason }]` (`row` là số dòng trong file, tính cả dòng header), `skipped` là số bản ghi bị loại vì trùng.

Một dòng template gồm `{ id, type: 'name' | 'index', selector: string, target: 'name' | 'method' | 'endpoint' }`.

- [ ] **Step 1: Viết test thất bại**

Tạo `test/endpoint-mapping.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TARGETS, METHODS, resolveColumns, mapRows } from '../public/js/shared/endpoint-mapping.js';

const HEADERS = ['Tên API', 'HTTP Method', 'Đường dẫn'];

function tpl(over = []) {
  return over.length > 0 ? over : [
    { id: 't1', type: 'name', selector: 'Tên API', target: 'name' },
    { id: 't2', type: 'name', selector: 'HTTP Method', target: 'method' },
    { id: 't3', type: 'name', selector: 'Đường dẫn', target: 'endpoint' },
  ];
}

const grid = (rows, headers = HEADERS) => ({ headers, rows });

test('TARGETS va METHODS dung danh sach da chot', () => {
  assert.deepEqual(TARGETS, ['name', 'method', 'endpoint']);
  assert.deepEqual(METHODS, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
});

test('resolveColumns khop cot theo ten', () => {
  const r = resolveColumns(HEADERS, tpl());
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.columns, { name: 0, method: 1, endpoint: 2 });
});

test('resolveColumns bo qua hoa thuong va khoang trang thua', () => {
  const r = resolveColumns(['  tên   api  ', 'HTTP METHOD', 'đường dẫn'], tpl());
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.columns, { name: 0, method: 1, endpoint: 2 });
});

test('resolveColumns khop cot theo index 1-based', () => {
  const r = resolveColumns(HEADERS, [
    { id: 't1', type: 'index', selector: '3', target: 'endpoint' },
  ]);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.columns, { endpoint: 2 });
});

test('resolveColumns bao loi khi index ngoai khoang', () => {
  const r = resolveColumns(HEADERS, [
    { id: 't1', type: 'index', selector: '9', target: 'endpoint' },
  ]);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /9/);
});

test('resolveColumns bao loi kem danh sach header khi khong tim thay ten cot', () => {
  const r = resolveColumns(HEADERS, [
    { id: 't1', type: 'name', selector: 'Verb', target: 'endpoint' },
  ]);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /Verb/);
  assert.match(r.errors[0], /Tên API \| HTTP Method \| Đường dẫn/);
});

test('resolveColumns bao loi khi template thieu dong endpoint', () => {
  const r = resolveColumns(HEADERS, [
    { id: 't1', type: 'name', selector: 'Tên API', target: 'name' },
  ]);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /endpoint/);
});

test('resolveColumns bo qua dong template co selector rong', () => {
  const r = resolveColumns(HEADERS, [
    { id: 't1', type: 'name', selector: '   ', target: 'name' },
    { id: 't2', type: 'name', selector: 'Đường dẫn', target: 'endpoint' },
  ]);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.columns, { endpoint: 2 });
});

test('mapRows doc dung ba truong', () => {
  const r = mapRows(grid([['Tra cứu TB', 'GET', '/query/abc/{*}']]), tpl());
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.records, [{ name: 'Tra cứu TB', method: 'GET', endpoint: '/query/abc/{*}' }]);
});

test('mapRows viet hoa method va mac dinh GET khi o rong', () => {
  const r = mapRows(grid([['A', 'post', '/a/{*}'], ['B', '', '/b/{*}']]), tpl());
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.records.map((x) => x.method), ['POST', 'GET']);
});

test('mapRows bo dong co method la', () => {
  const r = mapRows(grid([['A', 'FETCH', '/a/{*}'], ['B', 'GET', '/b/{*}']]), tpl());
  assert.equal(r.records.length, 1);
  assert.equal(r.records[0].endpoint, '/b/{*}');
  assert.deepEqual(r.errors, [{ row: 2, reason: 'method "FETCH" không hợp lệ' }]);
});

test('mapRows tu them dau gach cheo khi path thieu', () => {
  const r = mapRows(grid([['A', 'GET', 'query/abc/{*}']]), tpl());
  assert.equal(r.records[0].endpoint, '/query/abc/{*}');
});

test('mapRows bo dong co path rong', () => {
  const r = mapRows(grid([['A', 'GET', '  ']]), tpl());
  assert.deepEqual(r.records, []);
  assert.deepEqual(r.errors, [{ row: 2, reason: 'đường dẫn để trống' }]);
});

test('mapRows bo qua dong rong hoan toan ma khong bao loi', () => {
  const r = mapRows(grid([['', '', ''], ['A', 'GET', '/a/{*}']]), tpl());
  assert.equal(r.records.length, 1);
  assert.deepEqual(r.errors, []);
});

test('mapRows giu ca hai khi cung path khac method', () => {
  const r = mapRows(grid([['A', 'GET', '/a/{*}'], ['B', 'POST', '/a/{*}']]), tpl());
  assert.equal(r.records.length, 2);
  assert.equal(r.skipped, 0);
});

test('mapRows loai trung theo cap method va path', () => {
  const r = mapRows(grid([['A', 'GET', '/a/{*}'], ['A lan hai', 'get', '/a/{*}']]), tpl());
  assert.equal(r.records.length, 1);
  assert.equal(r.skipped, 1);
});

test('mapRows giu ban ghi trung khi tat dedupe', () => {
  const r = mapRows(grid([['A', 'GET', '/a/{*}'], ['A', 'GET', '/a/{*}']]), tpl(), { dedupe: false });
  assert.equal(r.records.length, 2);
  assert.equal(r.skipped, 0);
});

test('mapRows khong nap gi khi cot khong khop', () => {
  const r = mapRows(grid([['A', 'GET', '/a/{*}']]), [
    { id: 't1', type: 'name', selector: 'Verb', target: 'endpoint' },
  ]);
  assert.deepEqual(r.records, []);
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].row, 1);
});

test('mapRows de trong name khi template khong khai dong name', () => {
  const r = mapRows(grid([['A', 'GET', '/a/{*}']]), [
    { id: 't2', type: 'name', selector: 'HTTP Method', target: 'method' },
    { id: 't3', type: 'name', selector: 'Đường dẫn', target: 'endpoint' },
  ]);
  assert.deepEqual(r.records, [{ name: '', method: 'GET', endpoint: '/a/{*}' }]);
});
```

- [ ] **Step 2: Chạy test để xác nhận nó fail**

Run: `npm test -- test/endpoint-mapping.test.js`
Expected: FAIL — không tìm thấy module `../public/js/shared/endpoint-mapping.js`.

- [ ] **Step 3: Tạo `public/js/shared/endpoint-mapping.js`**

```js
export const TARGETS = ['name', 'method', 'endpoint'];
export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export function resolveColumns(headers, template) {
  const list = Array.isArray(headers) ? headers : [];
  const columns = {};
  const errors = [];
  const seen = new Set();

  for (const rule of template ?? []) {
    const selector = String(rule?.selector ?? '').trim();
    if (selector === '') continue;
    if (!TARGETS.includes(rule?.target)) continue;

    seen.add(rule.target);

    if (rule.type === 'index') {
      const n = Number(selector);
      if (!Number.isInteger(n) || n < 1 || n > list.length) {
        errors.push(`Cột số ${selector} không tồn tại — file chỉ có ${list.length} cột.`);
        continue;
      }
      columns[rule.target] = n - 1;
      continue;
    }

    const at = list.findIndex((h) => norm(h) === norm(selector));
    if (at === -1) {
      errors.push(`Không tìm thấy cột "${selector}". Header trong file: ${list.join(' | ')}`);
      continue;
    }
    columns[rule.target] = at;
  }

  if (!seen.has('endpoint')) {
    errors.push('Template thiếu dòng cho trường endpoint — không dựng được request nào.');
  }

  return { columns, errors };
}

export function mapRows(grid, template, { dedupe = true } = {}) {
  const { headers = [], rows = [] } = grid ?? {};
  const { columns, errors: columnErrors } = resolveColumns(headers, template);

  // Cot khong khop thi khong nap dong nao — nap mot nua con kho go hon.
  if (columnErrors.length > 0) {
    return { records: [], errors: columnErrors.map((reason) => ({ row: 1, reason })), skipped: 0 };
  }

  const records = [];
  const errors = [];
  const keys = new Set();
  let skipped = 0;

  rows.forEach((cells, i) => {
    const rowNumber = i + 2;               // +1 vi 0-based, +1 vi dong header
    const at = (key) => String(cells[columns[key]] ?? '').trim();

    if (cells.every((c) => String(c ?? '').trim() === '')) return;

    const method = at('method') === '' ? 'GET' : at('method').toUpperCase();
    if (!METHODS.includes(method)) {
      errors.push({ row: rowNumber, reason: `method "${at('method')}" không hợp lệ` });
      return;
    }

    const raw = at('endpoint');
    if (raw === '') {
      errors.push({ row: rowNumber, reason: 'đường dẫn để trống' });
      return;
    }
    const endpoint = raw.startsWith('/') ? raw : `/${raw}`;

    if (dedupe) {
      const key = `${method} ${endpoint}`;
      if (keys.has(key)) { skipped += 1; return; }
      keys.add(key);
    }

    records.push({ name: at('name'), method, endpoint });
  });

  return { records, errors, skipped };
}
```

`at('name')` trả `''` khi `columns.name` là `undefined` vì `cells[undefined]` là `undefined` — đúng hành vi mong muốn khi template không khai dòng `name`.

- [ ] **Step 4: Chạy test**

Run: `npm test -- test/endpoint-mapping.test.js`
Expected: PASS cả 18 test. Sau đó `npm test` toàn bộ cũng PASS.

- [ ] **Step 5: Commit**

```bash
git add public/js/shared/endpoint-mapping.js test/endpoint-mapping.test.js
git commit -m "feat: module map cot file import thanh cap method-path"
```

---

### Task 5: request-builder và http-client mang endpointName cùng pathTemplate

**Files:**
- Modify: `src/server/request-builder.js:73-85`
- Modify: `src/server/http-client.js:10-14`
- Test: `test/request-builder.test.js`, `test/http-client.test.js`

**Interfaces:**
- Consumes: `extractVariables` đã nhận `{*}` từ Task 1.
- Produces: mỗi request và mỗi record kết quả mang hai trường tách bạch — `endpointName` (tên lấy từ file Excel, rỗng nếu không có) và `pathTemplate` (chuỗi path gốc còn nguyên `{*}`).

- [ ] **Step 1: Viết test thất bại**

Thêm vào cuối `test/request-builder.test.js`:

```js
test('buildRequests nhan msisdn voi endpoint dung placeholder sao', () => {
  const cfg = baseConfig({ endpoints: [
    { id: 'ep_1', enabled: true, method: 'GET', name: 'Tra cuu TB',
      pathTemplate: '/query/white-list-ir-subscriber/{*}', queryParams: [], headers: [] },
    { id: 'ep_2', enabled: true, method: 'POST', name: 'Cap nhat goi',
      pathTemplate: '/command/subscriber/{*}', queryParams: [], headers: [] },
  ] });
  const reqs = buildRequests(cfg);
  assert.equal(reqs.length, 4);
  assert.equal(
    reqs[0].url,
    'https://abc.vn/query/white-list-ir-subscriber/0912345678?fromDate=25032026&toDate=01042026',
  );
  assert.equal(reqs[1].msisdn, '0913000111');
  assert.equal(reqs[2].method, 'POST');
});

test('buildRequests mang ca endpointName lan pathTemplate', () => {
  const cfg = baseConfig();
  cfg.endpoints[0].name = 'Tra cuu thue bao';
  const reqs = buildRequests(cfg);
  assert.equal(reqs[0].endpointName, 'Tra cuu thue bao');
  assert.equal(reqs[0].pathTemplate, '/query/abc-information/:msisdn');
});

test('buildRequests de endpointName rong khi endpoint khong co ten', () => {
  const reqs = buildRequests(baseConfig());
  assert.equal(reqs[0].endpointName, '');
  assert.equal(reqs[0].pathTemplate, '/query/abc-information/:msisdn');
});
```

Thêm vào cuối `test/http-client.test.js`:

```js
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
```

- [ ] **Step 2: Chạy test để xác nhận nó fail**

Run: `npm test -- --test-name-pattern="pathTemplate|placeholder sao"`
Expected: FAIL — `reqs[0].endpointName` đang là `'/query/abc-information/:msisdn'`, và `rec.pathTemplate` là `undefined`.

- [ ] **Step 3: Sửa hai file**

Trong `src/server/request-builder.js`, khối `return` của `buildOne` (dòng 73-85) đổi hai dòng:

```js
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
```

Trong `src/server/http-client.js`, hàm `finalize` thêm một dòng ngay dưới `endpointName`:

```js
    endpointName: req.endpointName,
    pathTemplate: req.pathTemplate,
```

- [ ] **Step 4: Chạy toàn bộ test**

Run: `npm test`
Expected: PASS. Không test cũ nào khẳng định `endpointName === pathTemplate`, nên không có test nào đỏ.

- [ ] **Step 5: Commit**

```bash
git add src/server/request-builder.js src/server/http-client.js test/request-builder.test.js test/http-client.test.js
git commit -m "feat: request mang endpointName va pathTemplate tach bach"
```

---

### Task 6: state.js — importTemplate và endpoint.name

**Files:**
- Modify: `public/js/state.js:3-23`
- Test: `test/state.test.js`

**Interfaces:**
- Consumes: không có.
- Produces: `defaultConfig()` trả thêm `importTemplate` — mảng 3 phần tử `{ id, type, selector, target }` như dưới. `load()` và `applyConfig()` giữ nguyên `importTemplate` của người dùng nếu có.

- [ ] **Step 1: Viết test thất bại**

Thêm vào cuối `test/state.test.js`:

```js
test('defaultConfig co san template map cot khi import endpoint', () => {
  assert.deepEqual(defaultConfig().importTemplate, [
    { id: 'tpl_name', type: 'name', selector: 'name', target: 'name' },
    { id: 'tpl_method', type: 'name', selector: 'method', target: 'method' },
    { id: 'tpl_endpoint', type: 'name', selector: 'endpoint', target: 'endpoint' },
  ]);
});

test('load giu nguyen importTemplate nguoi dung da sua', () => {
  setupMockLocalStorage();
  applyConfig({ importTemplate: [{ id: 'x', type: 'index', selector: '3', target: 'endpoint' }] });
  Object.assign(state, defaultConfig());
  load();
  assert.deepEqual(state.importTemplate, [
    { id: 'x', type: 'index', selector: '3', target: 'endpoint' },
  ]);
});
```

- [ ] **Step 2: Chạy test để xác nhận nó fail**

Run: `npm test -- --test-name-pattern="template map cot khi import"`
Expected: FAIL — `defaultConfig().importTemplate` là `undefined`.

- [ ] **Step 3: Thêm `importTemplate` vào `defaultConfig()`**

Trong `public/js/state.js`, chèn ngay sau dòng `endpoints: [],`:

```js
    importTemplate: [
      { id: 'tpl_name', type: 'name', selector: 'name', target: 'name' },
      { id: 'tpl_method', type: 'name', selector: 'method', target: 'method' },
      { id: 'tpl_endpoint', type: 'name', selector: 'endpoint', target: 'endpoint' },
    ],
```

`load()` và `applyConfig()` dùng `Object.assign(state, base, saved, …)` nên `importTemplate` của người dùng tự đè lên mặc định — không phải sửa gì thêm.

- [ ] **Step 4: Chạy toàn bộ test**

Run: `npm test`
Expected: PASS. Test cũ `defaultConfig tra ve cau hinh mac dinh dung chuuan` không dùng `deepEqual` trên cả object nên không đỏ.

- [ ] **Step 5: Commit**

```bash
git add public/js/state.js test/state.test.js
git commit -m "feat: them importTemplate mac dinh vao cau hinh"
```

---

### Task 7: editable-list nhận onImport và extraActions

**Files:**
- Modify: `public/js/ui/editable-list.js:6-33,132-171`
- Test: `test/editable-list.test.js`

**Interfaces:**
- Consumes: không có.
- Produces: `createEditableList(opts)` nhận thêm hai option không bắt buộc:
  - `onImport(file)` — có thì thay hẳn luồng import mặc định; hàm này tự lo toast và tự gọi `commit`. Nhận lại `{ render }` qua giá trị trả về của `createEditableList` nên phải gọi qua `setItems` + `onChange` như luồng cũ.
  - `extraActions: [{ label, title, onClick }]` — nút phụ chèn vào cuối `.el-actions`.

- [ ] **Step 1: Viết test thất bại**

Thêm vào cuối `test/editable-list.test.js`:

```js
test('extraActions chen them nut vao thanh hanh dong', () => {
  setupDOMMock();
  const host = new MockElement('section');
  let items = [];
  let clicked = 0;

  createEditableList({
    host,
    title: 'Endpoints',
    kind: 'endpoint',
    getItems: () => items,
    setItems: (v) => { items = v; },
    extraActions: [{ label: '⊢ Template', title: 'Map cột', onClick: () => { clicked += 1; } }],
  });

  const btn = host.querySelector('[data-extra-action]');
  assert.ok(btn);
  assert.equal(btn.textContent, '⊢ Template');
  btn.click();
  assert.equal(clicked, 1);
});

test('onImport thay the luong import mac dinh', async () => {
  setupDOMMock();
  const host = new MockElement('section');
  let items = [];
  let got = null;

  createEditableList({
    host,
    title: 'Endpoints',
    kind: 'endpoint',
    getItems: () => items,
    setItems: (v) => { items = v; },
    onImport: async (file) => { got = file; },
  });

  const fileInput = host.querySelector('[data-file]');
  fileInput.files = [{ name: 'apis.xlsx' }];
  await Promise.all(fileInput.dispatchEvent({ type: 'change' }));

  assert.equal(got.name, 'apis.xlsx');
});
```

Handler `change` là hàm `async`, nên `dispatchEvent` phải trả về mảng promise để test chờ được. Sửa `dispatchEvent` của `MockElement` (dòng 140-145) thành:

```js
  dispatchEvent(event) {
    const handlers = this.listeners[event.type] || [];
    return handlers.map((fn) => fn(event));
  }
```

`click()` gọi `dispatchEvent` rồi bỏ giá trị trả về, nên các test cũ không đổi.

Mock `innerHTML` trong file test dựng cây cố định, chưa biết nút `data-extra-action`. Sửa khối `if (html.includes('data-body'))` — thay đoạn `actions.append(btnAdd, btnImport, btnClear, inputFile);` bằng:

```js
      actions.append(btnAdd, btnImport, btnClear, inputFile);
      const extraCount = (html.match(/data-extra-action/g) || []).length;
      for (let i = 0; i < extraCount; i += 1) {
        const btnExtra = new MockElement('button');
        btnExtra.className = 'btn btn-secondary btn-sm';
        btnExtra.attributes['data-extra-action'] = String(i);
        actions.append(btnExtra);
      }
```

- [ ] **Step 2: Chạy test để xác nhận nó fail**

Run: `npm test -- test/editable-list.test.js`
Expected: FAIL — `host.querySelector('[data-extra-action]')` trả `null`.

- [ ] **Step 3: Sửa `public/js/ui/editable-list.js`**

Thêm hai option vào khối destructure ở đầu hàm:

```js
    renderExtra = null,
    onImport = null,
    extraActions = [],
```

Đổi phần `host.innerHTML` để dựng nút phụ:

```js
  const extraButtons = extraActions
    .map((a, i) => `<button type="button" class="btn btn-secondary btn-sm" data-extra-action="${i}" title="${a.title ?? ''}">${a.label}</button>`)
    .join('');

  host.innerHTML = `
    <h2 class="card-title">
      <span>${title} <span class="el-count" data-count>(0)</span></span>
    </h2>
    <div class="el-body" data-body></div>
    <div class="el-actions">
      <button type="button" class="btn btn-secondary btn-sm" data-add>+ Thêm</button>
      <button type="button" class="btn btn-secondary btn-sm" data-import>⤓ Import</button>
      <button type="button" class="btn btn-secondary btn-sm" data-clear>Xóa hết</button>
      ${extraButtons}
      <input type="file" accept="${ACCEPT}" hidden data-file />
    </div>
  `;
```

Nối sự kiện cho nút phụ, đặt ngay dưới khối `host.querySelector('[data-import]')`. Dùng `getAttribute` chứ không dùng `dataset` — mock trong test không dựng `dataset` từ thuộc tính HTML:

```js
  host.querySelectorAll('[data-extra-action]').forEach((btn) => {
    const action = extraActions[Number(btn.getAttribute('data-extra-action'))];
    btn.addEventListener('click', () => action?.onClick?.());
  });
```

Đổi handler `change` của input file để nhường quyền cho `onImport`:

```js
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    if (onImport) {
      await onImport(file);
      render();
      return;
    }

    try {
      const { values, skipped } = await importFile(file, kind, true);
      const current = getItems();
      let next;
      if (current.length === 0) {
        next = values.map(makeItem);
      } else {
        const append = confirm(
          `Danh sách "${title}" đang có ${current.length} dòng.\n\n`
          + 'OK = Nối thêm vào cuối\nCancel = Thay thế toàn bộ'
        );
        next = append ? [...current, ...values.map(makeItem)] : values.map(makeItem);
      }
      commit(next);
      window.ccmToast?.(`Đã nạp ${values.length} dòng từ ${file.name}`
        + (skipped > 0 ? ` (bỏ ${skipped} dòng trùng/rỗng)` : ''), 'ok');
    } catch (err) {
      window.ccmToast?.(`Import thất bại: ${err.message}`, 'error');
    }
  });
```

- [ ] **Step 4: Chạy toàn bộ test**

Run: `npm test`
Expected: PASS. Bảy test cũ của `editable-list` không truyền `onImport` nên chạy nhánh cũ, `extraActions` mặc định rỗng nên `extraButtons` là chuỗi rỗng.

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/editable-list.js test/editable-list.test.js
git commit -m "feat: editable-list nhan onImport va extraActions"
```

---

### Task 8: Ô Name và luồng import endpoint

**Files:**
- Modify: `public/js/api.js:39-53`
- Modify: `public/js/ui/endpoint-list.js:1-58`
- Modify: `public/css/app.css:164-188`

**Interfaces:**
- Consumes: `importGrid` (định nghĩa ở task này), `mapRows` từ Task 4, `state.importTemplate` từ Task 6, `onImport` và `extraActions` từ Task 7.
- Produces:
  - `importGrid(file) → Promise<{ headers, rows }>` trong `public/js/api.js`.
  - `initEndpointList({ onOpenTemplate })` — nhận callback mở drawer template, Task 9 truyền vào.
  - `makeEndpoint(path)` trả object có thêm `name: ''`.

Task này không có test tự động: `endpoint-list.js` đụng `state`, `localStorage` và DOM thật, chưa có test nào cho nó trong repo, và dựng mock đủ dùng sẽ tốn hơn giá trị nhận lại. Kiểm bằng tay ở Step 4.

- [ ] **Step 1: Thêm `importGrid` vào `public/js/api.js`**

Chèn ngay dưới hàm `importFile`:

```js
export async function importGrid(file) {
  const res = await fetch('/api/import/grid', {
    method: 'POST',
    headers: {
      'content-type': 'application/octet-stream',
      'x-filename': encodeURIComponent(file.name).replace(/%/g, '_'),
    },
    body: await file.arrayBuffer(),
  });
  const json = await asJson(res);
  if (!res.ok) throw new Error(json.error ?? 'Import thất bại');
  return json;
}
```

- [ ] **Step 2: Viết lại `public/js/ui/endpoint-list.js`**

```js
import { state, persist, notify } from '../state.js';
import { createEditableList } from './editable-list.js';
import { mapRows } from '../shared/endpoint-mapping.js';
import { importGrid } from '../api.js';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const MAX_SHOWN_ERRORS = 10;
let seq = 0;
const nextId = () => `ep_${Date.now().toString(36)}_${(seq += 1)}`;

function makeEndpoint(path) {
  return {
    id: nextId(), enabled: true, name: '', method: 'GET',
    pathTemplate: String(path ?? ''), queryParams: [], headers: [],
  };
}

function fromRecord(rec) {
  return { ...makeEndpoint(rec.endpoint), name: rec.name, method: rec.method };
}

export function initEndpointList({ onOpenTemplate } = {}) {
  // Du lieu cu trong localStorage co the la mang chuoi hoac thieu truong name.
  state.endpoints = (state.endpoints ?? []).map((e) => (
    typeof e === 'string' ? makeEndpoint(e) : { name: '', ...e }
  ));

  const host = document.getElementById('list-endpoint');

  function showErrors(errors) {
    host.querySelector('.el-errors')?.remove();
    if (errors.length === 0) return;

    const box = document.createElement('div');
    box.className = 'el-errors';

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'el-del';
    close.textContent = '✕';
    close.title = 'Ẩn danh sách lỗi';
    close.addEventListener('click', () => box.remove());
    box.append(close);

    for (const e of errors.slice(0, MAX_SHOWN_ERRORS)) {
      const line = document.createElement('div');
      line.textContent = `Dòng ${e.row}: ${e.reason}`;
      box.append(line);
    }
    if (errors.length > MAX_SHOWN_ERRORS) {
      const more = document.createElement('div');
      more.textContent = `… và ${errors.length - MAX_SHOWN_ERRORS} dòng lỗi nữa`;
      box.append(more);
    }
    host.append(box);
  }

  async function handleImport(file) {
    try {
      const grid = await importGrid(file);
      const { records, errors, skipped } = mapRows(
        grid, state.importTemplate, { dedupe: state.advanced.dedupeOnImport },
      );

      showErrors(errors);

      if (records.length === 0) {
        window.ccmToast?.(`Không nạp được endpoint nào từ ${file.name}`, 'error');
        return;
      }

      const current = state.endpoints;
      const incoming = records.map(fromRecord);
      let next;
      if (current.length === 0) {
        next = incoming;
      } else {
        const append = confirm(
          `Danh sách "ENDPOINTS" đang có ${current.length} dòng.\n\n`
          + 'OK = Nối thêm vào cuối\nCancel = Thay thế toàn bộ'
        );
        next = append ? [...current, ...incoming] : incoming;
      }

      state.endpoints = next;
      persist();
      notify();

      const bits = [];
      if (skipped > 0) bits.push(`bỏ ${skipped} dòng trùng`);
      if (errors.length > 0) bits.push(`${errors.length} dòng lỗi`);
      window.ccmToast?.(
        `Đã nạp ${records.length} endpoint từ ${file.name}`
        + (bits.length > 0 ? ` (${bits.join(', ')})` : ''),
        errors.length > 0 ? 'error' : 'ok',
      );
    } catch (err) {
      window.ccmToast?.(`Import thất bại: ${err.message}`, 'error');
    }
  }

  const list = createEditableList({
    host,
    title: 'ENDPOINTS',
    kind: 'endpoint',
    placeholder: '/DataAggregationEngine/query/abc-information/{*}',
    getItems: () => state.endpoints,
    setItems: (v) => { state.endpoints = v; persist(); },
    onChange: notify,
    getValue: (ep) => ep.pathTemplate,
    setValue: (ep, v) => ({ ...ep, pathTemplate: v }),
    makeItem: makeEndpoint,
    onImport: handleImport,
    extraActions: onOpenTemplate
      ? [{ label: '⊢ Template', title: 'Cấu hình cột khi import', onClick: onOpenTemplate }]
      : [],
    renderExtra: (ep, index, row) => {
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = ep.enabled !== false;
      check.title = 'Bật/tắt endpoint này';
      check.addEventListener('change', () => {
        state.endpoints[index] = { ...state.endpoints[index], enabled: check.checked };
        persist();
        notify();
      });

      const method = document.createElement('select');
      method.className = 'el-method';
      for (const m of METHODS) {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        method.append(opt);
      }
      method.value = ep.method ?? 'GET';
      method.addEventListener('change', () => {
        state.endpoints[index] = { ...state.endpoints[index], method: method.value };
        persist();
        notify();
      });

      const name = document.createElement('input');
      name.className = 'el-input el-name';
      name.type = 'text';
      name.spellcheck = false;
      name.placeholder = 'Tên API';
      name.value = ep.name ?? '';
      name.addEventListener('input', () => {
        state.endpoints[index] = { ...state.endpoints[index], name: name.value };
        persist();
        notify();
      });

      row.append(check, method, name);
    },
  });

  return list;
}
```

- [ ] **Step 3: Thêm CSS cho ô Name và vùng lỗi**

Chèn vào `public/css/app.css` ngay sau khối `.el-method` (dòng 182-188):

```css
.el-name { flex: 0 0 26%; min-width: 0; }
.el-errors {
  position: relative;
  margin-top: var(--sp-xs);
  padding: var(--sp-xs);
  border: 1px solid var(--down);
  border-radius: 4px;
  font-size: var(--fs-caption);
  color: var(--down);
  line-height: 1.6;
}
.el-errors .el-del { position: absolute; top: 2px; right: 2px; }
```

- [ ] **Step 4: Kiểm bằng tay**

```bash
npm start
```

Mở `http://localhost:2345`, rồi:

1. Card ENDPOINTS phải có nút `⊢ Template` — bấm chưa có tác dụng gì (Task 9 mới nối drawer).
2. Bấm `+ Thêm` — dòng mới có checkbox, dropdown method, ô `Tên API`, ô path.
3. Gõ vào ô `Tên API`, tải lại trang — giá trị còn nguyên (đã persist).
4. Tạo file `apis.csv` với nội dung sau rồi bấm `⤓ Import`:

```
name,method,endpoint
Tra cứu thuê bao,GET,/DataAggregationEngine/query/abc-information/{*}
Cập nhật gói,POST,/command/subscriber/{*}
Sai method,FETCH,/x/{*}
```

Kỳ vọng: toast `Đã nạp 2 endpoint từ apis.csv (1 dòng lỗi)`, danh sách có 2 dòng đúng tên và đúng method, vùng lỗi đỏ hiện `Dòng 4: method "FETCH" không hợp lệ`.

5. Nhập domain `https://abc.vn`, mở drawer MSISDN thêm 2 số, chọn date range — nút `▶ RUN ALL` phải hiện `(4)`.

- [ ] **Step 5: Chạy test rồi commit**

Run: `npm test`
Expected: PASS toàn bộ (không test nào chạm `endpoint-list.js`).

```bash
git add public/js/api.js public/js/ui/endpoint-list.js public/css/app.css
git commit -m "feat: o Name cho endpoint va luong import file nhieu cot"
```

---

### Task 9: Drawer template map cột

**Files:**
- Create: `public/js/ui/template-drawer.js`
- Modify: `public/index.html:148-150`
- Modify: `public/js/main.js:1-37`
- Modify: `public/css/app.css`

**Interfaces:**
- Consumes: `TARGETS` từ Task 4, `state.importTemplate` từ Task 6, `initEndpointList({ onOpenTemplate })` từ Task 8.
- Produces: `initTemplateDrawer() → { open, close }`.

- [ ] **Step 1: Thêm phần tử drawer vào `public/index.html`**

Chèn ngay dưới `<aside id="msisdn-drawer" …></aside>` (dòng 149):

```html
    <aside id="template-drawer" class="drawer" hidden aria-hidden="true" aria-label="Template map cột khi import endpoint"></aside>
```

- [ ] **Step 2: Tạo `public/js/ui/template-drawer.js`**

```js
import { state, persist } from '../state.js';
import { TARGETS } from '../shared/endpoint-mapping.js';

const TYPES = [
  { value: 'name', label: 'name', placeholder: 'Tên cột trong file' },
  { value: 'index', label: 'index', placeholder: '1' },
];

const TARGET_LABEL = { name: 'name', method: 'method', endpoint: 'endpoint' };

let seq = 0;
const nextId = () => `tpl_${Date.now().toString(36)}_${(seq += 1)}`;

function select(options, value, onChange, className) {
  const el = document.createElement('select');
  el.className = className;
  for (const o of options) {
    const opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.label;
    el.append(opt);
  }
  el.value = value;
  el.addEventListener('change', () => onChange(el.value));
  return el;
}

export function initTemplateDrawer() {
  const drawer = document.getElementById('template-drawer');

  function update(index, patch) {
    state.importTemplate[index] = { ...state.importTemplate[index], ...patch };
    persist();
  }

  function renderRows(host) {
    host.innerHTML = '';
    const rules = state.importTemplate ?? [];

    if (rules.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'el-empty';
      empty.textContent = 'Chưa có dòng nào. Bấm "+ Thêm dòng".';
      host.append(empty);
      return;
    }

    rules.forEach((rule, index) => {
      const row = document.createElement('div');
      row.className = 'pt-row';

      const value = document.createElement('input');
      value.className = 'input pt-val mono';
      value.type = 'text';
      value.spellcheck = false;

      const syncPlaceholder = (type) => {
        value.placeholder = TYPES.find((t) => t.value === type)?.placeholder ?? '';
      };

      const type = select(TYPES, rule.type ?? 'name', (v) => {
        update(index, { type: v });
        syncPlaceholder(v);
      }, 'el-method');

      syncPlaceholder(rule.type ?? 'name');
      value.value = rule.selector ?? '';
      value.addEventListener('input', () => update(index, { selector: value.value }));

      const arrow = document.createElement('span');
      arrow.className = 'tpl-arrow';
      arrow.textContent = '→';

      const target = select(
        TARGETS.map((t) => ({ value: t, label: TARGET_LABEL[t] })),
        rule.target ?? 'endpoint',
        (v) => update(index, { target: v }),
        'el-method tpl-target',
      );

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'el-del';
      del.textContent = '✕';
      del.title = 'Xóa dòng';
      del.addEventListener('click', () => {
        state.importTemplate.splice(index, 1);
        persist();
        renderRows(host);
      });

      row.append(type, value, arrow, target, del);
      host.append(row);
    });
  }

  function close() {
    drawer.hidden = true;
    drawer.setAttribute('aria-hidden', 'true');
    drawer.innerHTML = '';
  }

  function open() {
    drawer.innerHTML = `
      <div class="el-head" style="margin-bottom: 12px;">
        <h2 class="card-title" style="font-size: 16px; color: var(--body);">TEMPLATE MAP CỘT</h2>
        <button type="button" class="btn btn-secondary btn-sm" data-close>✕ Đóng</button>
      </div>
      <section class="card">
        <p class="hint">Khai cột trong file ứng với trường nào. Kiểu <code>name</code> khớp theo tên header ở dòng đầu, kiểu <code>index</code> khớp theo số thứ tự cột.</p>
        <div class="param-table" data-rows></div>
        <div class="el-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-add>+ Thêm dòng</button>
        </div>
      </section>
    `;
    drawer.hidden = false;
    drawer.setAttribute('aria-hidden', 'false');

    const host = drawer.querySelector('[data-rows]');
    renderRows(host);

    drawer.querySelector('[data-close]').addEventListener('click', close);
    drawer.querySelector('[data-add]').addEventListener('click', () => {
      state.importTemplate = [
        ...(state.importTemplate ?? []),
        { id: nextId(), type: 'name', selector: '', target: 'endpoint' },
      ];
      persist();
      renderRows(host);
    });

    drawer.querySelector('[data-close]').focus();
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !drawer.hidden) close();
  });

  return { open, close };
}
```

Khác `msisdn-drawer.js` một điểm có chủ đích: không đóng khi click ra ngoài. Drawer này chứa nhiều ô nhập, click nhầm mà mất cả form là khó chịu; Esc và nút ✕ là đủ.

- [ ] **Step 3: Nối vào `public/js/main.js`**

Thêm dòng import cạnh các import UI khác:

```js
import { initTemplateDrawer } from './ui/template-drawer.js';
```

Thay dòng `initEndpointList();` (dòng 36) bằng:

```js
const templateDrawer = initTemplateDrawer();
initEndpointList({ onOpenTemplate: () => templateDrawer.open() });
```

- [ ] **Step 4: Thêm CSS**

Chèn vào `public/css/app.css` sau khối `.pt-val`:

```css
.tpl-arrow { flex: 0 0 auto; color: var(--muted); font-size: var(--fs-caption); }
.tpl-target { flex: 0 0 84px; }
```

- [ ] **Step 5: Kiểm bằng tay**

```bash
npm start
```

1. Bấm `⊢ Template` — drawer trượt ra, 3 dòng mặc định `name`/`method`/`endpoint`.
2. Đổi dòng thứ ba sang kiểu `index`, gõ `3` — placeholder ô giữa đổi thành `1`.
3. Đóng bằng phím Esc, tải lại trang, mở lại — cấu hình còn nguyên.
4. Bấm `+ Thêm dòng` rồi `✕` — thêm và xóa chạy đúng.
5. Chuẩn bị file `apis-vi.csv` có header tiếng Việt:

```
Tên API,HTTP Method,Đường dẫn
Tra cứu thuê bao,GET,/DataAggregationEngine/query/abc-information/{*}
Cập nhật gói,POST,/command/subscriber/{*}
```

Sửa template thành `Tên API` / `HTTP Method` / `Đường dẫn`, bấm `⤓ Import` — nạp đủ 2 dòng.

6. Đổi dòng `method` thành `Verb` rồi import lại — không nạp dòng nào, vùng lỗi hiện `Dòng 1: Không tìm thấy cột "Verb". Header trong file: Tên API | HTTP Method | Đường dẫn`.

- [ ] **Step 6: Chạy test rồi commit**

Run: `npm test`
Expected: PASS toàn bộ.

```bash
git add public/js/ui/template-drawer.js public/js/main.js public/index.html public/css/app.css
git commit -m "feat: drawer cau hinh template map cot khi import endpoint"
```

---

### Task 10: Gom cột status và thêm Name, Path vào bảng kết quả

**Files:**
- Modify: `public/js/shared/filter-logic.js:1-39`
- Modify: `public/js/ui/result-table.js:9-53`
- Test: `test/filter-logic.test.js`, `test/result-table.test.js`

**Interfaces:**
- Consumes: `rec.pathTemplate` và `rec.endpointName` từ Task 5.
- Produces: `ALL_COLUMNS` gồm 7 key `index`, `name`, `path`, `msisdn`, `request`, `response`, `status` — tất cả `default: true`. Key `errorCode`, `durationMs`, `endpoint` không còn.

Gộp hai file vào một task vì đổi `ALL_COLUMNS` làm đỏ ngay test của `result-table` — tách ra sẽ để lại một task có test đỏ.

- [ ] **Step 1: Viết test thất bại**

Trong `test/filter-logic.test.js`, thay test cuối cùng bằng:

```js
test('ALL_COLUMNS gom status error time va them Name, Path, MSISDN', () => {
  assert.deepEqual(
    ALL_COLUMNS.map((c) => c.key),
    ['index', 'name', 'path', 'msisdn', 'request', 'response', 'status'],
  );
  assert.ok(ALL_COLUMNS.every((c) => c.default === true));
});

test('tim kiem tu do quet ca pathTemplate', () => {
  const r = rec({ pathTemplate: '/query/white-list-ir-subscriber/{*}' });
  assert.equal(matchesFilter(r, { ...emptyFilter(), search: 'white-list' }), true);
});
```

Trong `test/result-table.test.js`:

1. Thêm `pathTemplate: '/query/abc-information/{*}'` vào `makeRecord` ngay dưới `endpointName`.
2. Thay `getVisibleColumns` của hai test đầu bằng `() => ['index', 'name', 'path', 'msisdn', 'request', 'response', 'status']`.
3. Thay khối kiểm ô của test `render danh sach duoi nguong VIRTUAL_THRESHOLD` (từ `// Check cells of row 0` tới trước `// Test row click`) bằng:

```js
  // Check cells of row 0
  const tds0 = rows[0].children;
  assert.equal(tds0[0].textContent, '1');                                  // index
  assert.equal(tds0[1].textContent, 'Endpoint 1');                         // name
  assert.equal(tds0[2].textContent, '/query/abc-information/{*}');         // path
  assert.equal(tds0[3].textContent, '0912345678');                         // msisdn
  assert.equal(tds0[4].textContent, 'GET https://api.example.com/test/1'); // request
  assert.equal(tds0[5].textContent, 'OK');                                 // response
  assert.equal(tds0[6].textContent, '200 · 120ms');                        // status gom
  assert.equal(tds0[6].classList.contains('status-up'), true);

  // Check cells of row 1
  const tds1 = rows[1].children;
  assert.equal(tds1[6].textContent, '500 · ERR_500 · 120ms');
  assert.equal(tds1[6].classList.contains('status-down'), true);
```

4. Thêm hai test mới vào cuối file:

```js
test('cot status hien dau gach ngang khi khong co status code', () => {
  const { table } = setupMockDOM();
  const records = [makeRecord(1, {
    response: { status: null, statusText: '', body: null, bodyText: '' },
    errorCode: 'ETIMEDOUT', errorMessage: 'timeout', durationMs: 30000,
  })];

  const tableCtrl = initResultTable({
    getRecords: () => records,
    getFilter: () => emptyFilter(),
    getVisibleColumns: () => ['status'],
  });
  tableCtrl.render();

  const td = table.querySelector('tbody').children[0].children[0];
  assert.equal(td.textContent, '— · ETIMEDOUT · 30000ms');
  assert.equal(td.classList.contains('status-down'), true);
});

test('cot name va msisdn hien dau gach ngang khi rong', () => {
  const { table } = setupMockDOM();
  const records = [makeRecord(1, { endpointName: '', msisdn: null })];

  const tableCtrl = initResultTable({
    getRecords: () => records,
    getFilter: () => emptyFilter(),
    getVisibleColumns: () => ['name', 'msisdn'],
  });
  tableCtrl.render();

  const tds = table.querySelector('tbody').children[0].children;
  assert.equal(tds[0].textContent, '—');
  assert.equal(tds[1].textContent, '—');
});
```

- [ ] **Step 2: Chạy test để xác nhận nó fail**

Run: `npm test -- test/filter-logic.test.js test/result-table.test.js`
Expected: FAIL — `ALL_COLUMNS.map(c => c.key)` vẫn là danh sách cũ, và ô status vẫn là `'200'`.

- [ ] **Step 3: Sửa `public/js/shared/filter-logic.js`**

Thay khối `ALL_COLUMNS`:

```js
export const ALL_COLUMNS = [
  { key: 'index', header: '#', default: true },
  { key: 'name', header: 'Name', default: true },
  { key: 'path', header: 'Path', default: true },
  { key: 'msisdn', header: 'MSISDN', default: true },
  { key: 'request', header: 'Request', default: true },
  { key: 'response', header: 'Response body / error', default: true },
  { key: 'status', header: 'Status · Error · Time', default: true },
];
```

Trong `matchesFilter`, thêm `rec.pathTemplate` vào mảng `haystack`, ngay dưới `rec.endpointName ?? ''`:

```js
      rec.pathTemplate ?? '',
```

- [ ] **Step 4: Sửa `public/js/ui/result-table.js`**

Thay hàm `cellText` và hằng `NUMERIC`:

```js
function statusText(rec) {
  const bits = [
    rec.response.status === null ? '—' : String(rec.response.status),
    rec.errorCode ?? '',
    `${rec.durationMs}ms`,
  ];
  return bits.filter(Boolean).join(' · ');
}

function cellText(rec, key) {
  switch (key) {
    case 'index': return String(rec.index);
    case 'name': return rec.endpointName || '—';
    case 'path': return rec.pathTemplate || '—';
    case 'msisdn': return rec.msisdn ?? '—';
    case 'request': return `${rec.request.method} ${rec.request.url}`;
    case 'response': return truncate(rec.response.bodyText || rec.errorMessage || '');
    case 'status': return statusText(rec);
    default: return '';
  }
}

const NUMERIC = new Set(['index', 'msisdn']);
```

Trong `buildRow`, thay khối tô màu:

```js
      if (col.key === 'status') {
        const ok = rec.response.status !== null && rec.response.status < 400;
        td.classList.add(ok ? 'status-up' : 'status-down');
      }
```

- [ ] **Step 5: Chạy toàn bộ test**

Run: `npm test`
Expected: PASS toàn bộ.

- [ ] **Step 6: Commit**

```bash
git add public/js/shared/filter-logic.js public/js/ui/result-table.js test/filter-logic.test.js test/result-table.test.js
git commit -m "feat: gom status, error, time thanh mot cot va them Name, Path, MSISDN"
```

---

### Task 11: filters.js lọc bỏ key cột đã biến mất

**Files:**
- Modify: `public/js/ui/filters.js:5-11`

**Interfaces:**
- Consumes: `ALL_COLUMNS` mới từ Task 10.
- Produces: `loadColumns()` chỉ trả những key còn tồn tại trong `ALL_COLUMNS`; rỗng thì rơi về danh sách mặc định.

Không có test tự động cho `filters.js` trong repo (nó đụng `document.getElementById` ngay ở dòng đầu của `initFilters`). Đổi ở đây là ba dòng thuần logic — kiểm bằng tay ở Step 3.

- [ ] **Step 1: Sửa `loadColumns`**

```js
function loadColumns() {
  const fallback = ALL_COLUMNS.filter((c) => c.default).map((c) => c.key);
  try {
    const saved = JSON.parse(localStorage.getItem(COLUMNS_KEY) ?? 'null');
    if (Array.isArray(saved)) {
      // Nguoi dung cu co the con luu key da bi bo (errorCode, durationMs, endpoint).
      const valid = saved.filter((k) => ALL_COLUMNS.some((c) => c.key === k));
      if (valid.length > 0) return valid;
    }
  } catch { /* bo qua */ }
  return fallback;
}
```

- [ ] **Step 2: Chạy test**

Run: `npm test`
Expected: PASS toàn bộ.

- [ ] **Step 3: Kiểm bằng tay**

```bash
npm start
```

1. Mở `http://localhost:2345`, mở DevTools Console, chạy:

```js
localStorage.setItem('ccm-tool-columns', JSON.stringify(['index', 'errorCode', 'durationMs']));
```

2. Tải lại trang, chạy một run bất kỳ, sang tab OUTPUT — bảng phải hiện đúng một cột `#`, không trống trơn và không lỗi console.
3. Chạy tiếp:

```js
localStorage.setItem('ccm-tool-columns', JSON.stringify(['errorCode']));
```

Tải lại — bảng rơi về đủ 7 cột mặc định.

4. Bấm `⚙ cột`, nhập `name, path, status` — bảng còn 3 cột đó.

- [ ] **Step 4: Commit**

```bash
git add public/js/ui/filters.js
git commit -m "fix: bo qua key cot khong con ton tai khi doc cau hinh cu"
```

---

### Task 12: Excel export thêm cột Name và Path

**Files:**
- Modify: `src/server/excel-export.js:3-17,49-65`
- Test: `test/excel-export.test.js`

**Interfaces:**
- Consumes: `rec.endpointName` và `rec.pathTemplate` từ Task 5.
- Produces: `EXPORT_COLUMNS` 14 cột, thứ tự `Index`, `Name`, `Path`, `MSISDN`, `Method`, `URL`, `Headers`, `Query Params`, `Status Code`, `Error Code`, `Duration (ms)`, `Response Body`, `Error Message`, `Started At`.

File Excel giữ nguyên các cột rời — nó dùng để lọc và pivot, gom lại là phản tác dụng.

- [ ] **Step 1: Sửa test cho khớp cột mới**

Trong `test/excel-export.test.js`:

1. Thêm `pathTemplate: '/query/abc/{*}'` vào hàm `record()` ngay dưới `endpointName`, và đổi `endpointName` thành `'Tra cuu thue bao'`.

2. Thay test `EXPORT_COLUMNS du 13 cot theo spec`:

```js
test('EXPORT_COLUMNS du 14 cot theo spec', () => {
  assert.deepEqual(EXPORT_COLUMNS.map((c) => c.header), [
    'Index', 'Name', 'Path', 'MSISDN', 'Method', 'URL', 'Headers', 'Query Params',
    'Status Code', 'Error Code', 'Duration (ms)', 'Response Body', 'Error Message', 'Started At',
  ]);
});
```

3. Trong test `writeResultsToStream tao file xlsx doc lai duoc`, cột dịch sang phải 1 ô — `Error Code` từ 9 thành 10, `Headers` từ 6 thành 7. Thay ba dòng assert:

```js
    assert.equal(ws.getRow(3).getCell(10).value, 'E0042');
    const headersCell = String(ws.getRow(2).getCell(7).value);
    assert.ok(!headersCell.includes(LONG_TOKEN), 'token phai bi che');
```

Và thêm ngay dưới đó:

```js
    assert.equal(ws.getRow(2).getCell(2).value, 'Tra cuu thue bao');
    assert.equal(ws.getRow(2).getCell(3).value, '/query/abc/{*}');
```

4. Trong test `writeResultsToStream giu token khi includeToken true`, đổi `getCell(6)` thành `getCell(7)`.

- [ ] **Step 2: Chạy test để xác nhận nó fail**

Run: `npm test -- test/excel-export.test.js`
Expected: FAIL — `EXPORT_COLUMNS` vẫn 13 cột, chưa có `Name`.

- [ ] **Step 3: Sửa `src/server/excel-export.js`**

Thay `EXPORT_COLUMNS`:

```js
export const EXPORT_COLUMNS = [
  { header: 'Index', key: 'index', width: 8 },
  { header: 'Name', key: 'name', width: 30 },
  { header: 'Path', key: 'path', width: 45 },
  { header: 'MSISDN', key: 'msisdn', width: 16 },
  { header: 'Method', key: 'method', width: 10 },
  { header: 'URL', key: 'url', width: 70 },
  { header: 'Headers', key: 'headers', width: 45 },
  { header: 'Query Params', key: 'queryParams', width: 35 },
  { header: 'Status Code', key: 'status', width: 12 },
  { header: 'Error Code', key: 'errorCode', width: 16 },
  { header: 'Duration (ms)', key: 'durationMs', width: 14 },
  { header: 'Response Body', key: 'bodyText', width: 80 },
  { header: 'Error Message', key: 'errorMessage', width: 40 },
  { header: 'Started At', key: 'startedAt', width: 26 },
];
```

Trong `toRow`, thay dòng `endpoint: rec.endpointName,` bằng:

```js
    name: rec.endpointName ?? '',
    path: rec.pathTemplate ?? '',
```

- [ ] **Step 4: Chạy toàn bộ test**

Run: `npm test`
Expected: PASS toàn bộ.

- [ ] **Step 5: Kiểm đầu-cuối bằng tay**

```bash
npm start
```

1. Nhập domain thật, token, date range.
2. Mở drawer MSISDN, nhập 2 số.
3. Bấm `⊢ Template`, để mặc định `name`/`method`/`endpoint`.
4. Import file `apis.csv` từ Task 8.
5. Bấm `▶ RUN ALL (4)`.
6. Tab OUTPUT: bảng có 7 cột, cột `Status · Error · Time` dạng `200 · 245ms`, cột `Path` còn nguyên `{*}`, cột `Name` là tên tiếng Việt.
7. Gõ `white-list` vào ô 🔍 — lọc đúng theo path dù cột `Request` có tắt.
8. Bấm `⬇ Export Excel`, mở file — có cột `Name` và `Path`, các cột `Status Code`, `Error Code`, `Duration (ms)` vẫn tách rời.

- [ ] **Step 6: Commit**

```bash
git add src/server/excel-export.js test/excel-export.test.js
git commit -m "feat: file Excel export them cot Name va Path"
```
