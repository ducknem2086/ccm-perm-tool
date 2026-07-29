# Import endpoint nhiều cột và cập nhật bảng kết quả

Ngày: 2026-07-29

## Vấn đề

### Import chỉ đọc được một cột

Ô import ở panel ENDPOINTS chỉ đọc được cột đầu tiên của file. `parseCsv` cắt lấy
`line.split(/[,;\t]/)[0]`, `parseXlsx` chỉ đọc `row.getCell(1)`. Mọi endpoint nạp vào
đều mang `method: 'GET'` mặc định (`endpoint-list.js`, `makeEndpoint`), nên sau khi
import phải sửa tay từng dòng cho những API dùng POST/PUT/DELETE.

File nguồn thực tế có ba cột: tên API, phương thức, đường dẫn. Tool cần đọc đủ ba cột
và sinh ra các cặp method–path đúng.

### Bảng kết quả dàn ngang quá nhiều cột hẹp

`status`, `errorCode`, `durationMs` là ba cột riêng, mỗi cột chứa vài ký tự — chiếm chỗ
mà không nói thêm được gì so với khi ghép lại. Ngược lại, `Name`, `Path` và `MSISDN` là
thứ cần nhìn thấy để biết dòng nào hỏng thì `endpoint` và `msisdn` lại đang
`default: false` nên không hiện, còn tên API thì chưa có chỗ nào chứa.

## Mục tiêu

1. Import file nhiều cột, lấy được `name`, `method`, `endpoint` theo cấu hình người dùng.
2. Người dùng tự khai cột nào ứng với trường nào — theo tên header hoặc theo số thứ tự cột.
3. Endpoint nạp vào ghép được với cấu hình sẵn có (domain, token, date range, MSISDN,
   query params, headers) thành request thật khi bấm RUN.
4. Không đổi layout ba cột hiện tại, không ảnh hưởng luồng import MSISDN.
5. Bảng kết quả gom `status`, `error code`, `time` vào một cột, và hiện thêm ba cột
   `Name`, `Path`, `MSISDN`.

## Ngoài phạm vi

- Sửa layout panel INPUT.
- Đổi cơ chế import MSISDN.
- Thêm định dạng file mới (giữ `.xlsx`, `.xls`, `.csv`, `.txt`).
- Gom cột trong file Excel export — file đó để lọc và pivot, gom lại là phản tác dụng.

## Luồng dữ liệu

```
file .xlsx / .csv / .txt
   │
   │  POST /api/import/grid          (server parse, không chọn cột)
   ▼
{ headers: ["Tên API","HTTP Method","Đường dẫn"], rows: [[...], [...]] }
   │
   │  mapRows(grid, template)        (client, module shared)
   ▼
{ records: [{ name, method, endpoint }], errors: [{ row, reason }] }
   │
   ▼
state.endpoints  →  { id, enabled: true, name, method, pathTemplate }
   │
   │  bấm RUN
   ▼
buildRequests(config)
   endpoints × msisdns × (domain, token, dateRange, query params, headers)
```

Việc map cột nằm ở client, trong `public/js/shared/`, cùng chỗ với `validators.js`,
`variables.js`, `filter-logic.js`. Lý do: template chứa tên cột tiếng Việt có dấu, đẩy
qua HTTP header sẽ vỡ vì header chỉ nhận ASCII; và logic map là hàm thuần, test thẳng
bằng `node:test` không cần dựng HTTP.

## Data model

### Endpoint

Thêm trường `name`:

```js
{ id, enabled, name, method, pathTemplate, queryParams, headers }
```

Endpoint cũ trong localStorage không có `name` — `initEndpointList` đã có bước nâng cấp
dữ liệu cũ, thêm `name: ep.name ?? ''` vào đó.

### Template map cột

Thêm vào `defaultConfig()`, persist chung `localStorage` theo cơ chế sẵn có:

```js
importTemplate: [
  { id: 'tpl_name',   type: 'name', selector: 'name',     target: 'name' },
  { id: 'tpl_method', type: 'name', selector: 'method',   target: 'method' },
  { id: 'tpl_path',   type: 'name', selector: 'endpoint', target: 'endpoint' },
]
```

- `type`: `'name'` khớp theo header ở dòng 1, `'index'` khớp theo số thứ tự cột (1-based).
- `selector`: tên header hoặc số cột.
- `target`: `'name'` | `'method'` | `'endpoint'`.

Dòng có `selector` rỗng bị bỏ qua. Hai dòng cùng `target` thì dòng sau thắng.

## Placeholder `{*}`

Đường dẫn trong file dùng cú pháp `{*}` cho path param đầu tiên:

```
/DataAggregationEngine/query/white-list-ir-subscriber/{*}
```

`{*}` ứng với MSISDN. Với domain `https://abc.vn`, số `0912345678`, query params
`fromDate=25032026` và `toDate=01042026`, request sinh ra là:

```
https://abc.vn/DataAggregationEngine/query/white-list-ir-subscriber/0912345678?fromDate=25032026&toDate=01042026
```

`public/js/shared/variables.js` thêm một biểu thức:

```js
const STAR_RE = /\{\*\}/g;   // → scope.msisdn
```

`extractVariables('/x/{*}')` trả `['msisdn']`. `resolve` thay `{*}` bằng `scope.msisdn`,
thiếu thì đưa vào `missing` như các biến khác.

Hệ quả: **`request-builder.js` không phải sửa logic nhân request**. Hàm `usesMsisdn` gọi
`extractVariables` nên tự nhận `{*}`; `buildRequests` tự sinh N MSISDN × M endpoint.
`countRequests()` trong `main.js` cũng dùng `extractVariables` nên nút RUN ALL đếm đúng
theo.

Endpoint không chứa placeholder nào (`{*}`, `:msisdn`, `{{msisdn}}`) chỉ sinh **một**
request, không nhân theo danh sách MSISDN — tránh N request giống hệt nhau.

## Backend

### `src/server/file-import.js` — đổi primitive thành grid

Grid là dạng gốc, cột đầu suy ra từ grid:

```js
export function parseTxtGrid(text)      // string[][] , mỗi dòng một ô
export function parseCsvGrid(text)      // string[][] , tách theo , ; tab
export async function parseXlsxGrid(buffer)   // string[][]
export async function parseGrid({ filename, buffer })  // { headers, rows }
```

`parseCsv(text)` trở thành `parseCsvGrid(text).map((r) => r[0]).filter(Boolean)`.
`parseXlsx`, `parseTxt`, `parseImport` giữ nguyên chữ ký và hành vi — toàn bộ test hiện
có phải xanh không sửa.

`parseGrid` trả `headers` = dòng đầu tiên, `rows` = các dòng còn lại. Không lọc, không
dedupe, không bỏ dòng rỗng ở tầng này.

### `src/server/routes.js`

Thêm route:

```
POST /api/import/grid
  header  X-Filename
  body    raw file
  →  200 { headers: string[], rows: string[][] }
  →  400 { error }        đuôi file không hỗ trợ
```

`POST /api/import` giữ nguyên, phục vụ MSISDN.

### `src/server/request-builder.js`

Bảng kết quả cần `Name` và `Path` là hai cột riêng, nên request mang hai trường riêng —
không gộp làm một:

```js
endpointName: endpoint.name ?? '',        // tên lấy từ file Excel
pathTemplate: endpoint.pathTemplate,      // chuỗi gốc, còn nguyên {*}
```

### `src/server/http-client.js`

`finalize` chuyển tiếp trường mới xuống record:

```js
pathTemplate: req.pathTemplate,
```

## Client

### `public/js/shared/endpoint-mapping.js` — module mới

Hàm thuần, không đụng DOM, không đụng state:

```js
export const TARGETS = ['name', 'method', 'endpoint'];
export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export function resolveColumns(headers, template)
// → { columns: { name: 0, method: 1, endpoint: 2 }, errors: string[] }

export function mapRows(grid, template, { dedupe = true } = {})
// → { records: [{ name, method, endpoint }], errors: [{ row, reason }], skipped: number }
```

`resolveColumns`:

- `type: 'name'` — so khớp sau khi `trim()`, gộp khoảng trắng thừa, bỏ phân biệt hoa
  thường. Không tìm thấy thì đưa vào `errors` kèm danh sách header đọc được từ file.
- `type: 'index'` — số 1-based; ngoài khoảng `1..headers.length` thì báo lỗi.
Phân biệt hai tình huống:

- **Dòng template không tồn tại** — người dùng đã xóa dòng `name` khỏi template. Không
  phải lỗi; trường đó bỏ trống (`name: ''`) hoặc lấy mặc định (`method: 'GET'`).
- **Dòng template có nhưng khớp hụt** — người dùng khai `selector: 'HTTP Method'` mà file
  không có header đó. Là lỗi chặn: **không nạp dòng nào**, báo kèm danh sách header đọc
  được. Nạp một nửa còn khó gỡ hơn.

Riêng `endpoint` bắt buộc phải có dòng template và phải khớp — thiếu path thì không dựng
được request nào.

`mapRows` chuẩn hóa từng dòng:

| Trường | Luật |
|---|---|
| `method` | `trim().toUpperCase()`; rỗng → `GET`; ngoài `METHODS` → dòng lỗi, bỏ dòng |
| `endpoint` | `trim()`; rỗng → dòng lỗi, bỏ dòng; thiếu `/` ở đầu → tự thêm |
| `name` | `trim()`; cho phép rỗng |

Dòng rỗng hoàn toàn thì bỏ im lặng, không tính là lỗi.

Dedupe theo cặp `` `${method} ${endpoint}` `` — cùng path khác method là hai API khác
nhau, phải giữ cả hai. Bật/tắt theo `state.advanced.dedupeOnImport` (checkbox
`#chk-dedupe` đã có sẵn).

`errors` mang số dòng trong file (tính cả dòng header, để người dùng mở Excel dò được
đúng dòng).

### `public/js/api.js`

```js
export async function importGrid(file)   // → { headers, rows }
```

Cùng khuôn với `importFile` hiện có.

### `public/js/ui/editable-list.js`

Thêm hai option, đều không bắt buộc:

- `onImport(file)` — có thì thay luồng import mặc định. MSISDN không truyền, chạy y như cũ.
- `extraActions: [{ label, title, onClick }]` — nút phụ chèn vào `.el-actions`.

Không đổi hành vi nào đang có.

### `public/js/ui/endpoint-list.js`

- `makeEndpoint` thêm `name: ''`.
- Bước nâng cấp dữ liệu cũ bổ sung `name`.
- `renderExtra` thêm ô nhập tên giữa dropdown method và ô path:
  `[✓] [GET ▾] [Tra cứu thuê bao] [/DataAggregationEngine/query/…/{*}] [✕]`
- `extraActions` thêm nút `⊢ Template` mở drawer.
- `onImport` gọi `importGrid` → `mapRows` → gộp vào `state.endpoints`, giữ nguyên hộp
  thoại "nối thêm hay thay thế" đang dùng.

### `public/js/ui/template-drawer.js` — file mới

Drawer riêng, dựng theo đúng khuôn `msisdn-drawer.js`: đóng bằng Esc, đóng khi click ra
ngoài, `aria-hidden` đồng bộ với `hidden`.

```
┌─ TEMPLATE MAP CỘT ──────────────── ✕ ─┐
│ [name  ▾] [Tên API      ] → [name   ▾] ✕ │
│ [name  ▾] [HTTP Method  ] → [method ▾] ✕ │
│ [index ▾] [3            ] → [endpoint ▾] ✕ │
│                            [+ Thêm dòng] │
└──────────────────────────────────────────┘
```

Ô giữa đổi placeholder theo `type`: `name` → `Tên cột trong file`, `index` → `1`.
Mọi thay đổi ghi thẳng `state.importTemplate` rồi `persist()`.

### `public/index.html`

Thêm một dòng cạnh các drawer đang có:

```html
<aside id="template-drawer" class="drawer" hidden aria-hidden="true"
       aria-label="Template map cột khi import endpoint"></aside>
```

Layout ba cột không đổi.

### `public/css/app.css`

- `.el-name { flex: 0 0 26%; }` — ô tên trong dòng endpoint.
- `.tpl-row` — dùng lại khuôn `.pt-row` đang có.

### `public/js/main.js`

Gọi `initTemplateDrawer()` cạnh `initMsisdnDrawer()`.

## Bảng kết quả (tab OUTPUT)

### Cột

`public/js/shared/filter-logic.js`, `ALL_COLUMNS` thay bằng:

```js
export const ALL_COLUMNS = [
  { key: 'index',    header: '#',                     default: true },
  { key: 'name',     header: 'Name',                  default: true },
  { key: 'path',     header: 'Path',                  default: true },
  { key: 'msisdn',   header: 'MSISDN',                default: true },
  { key: 'request',  header: 'Request',               default: true },
  { key: 'response', header: 'Response body / error', default: true },
  { key: 'status',   header: 'Status · Error · Time', default: true },
];
```

Ba cột rời `status`, `errorCode`, `durationMs` gộp thành một, giữ key `status`. Cột
`endpoint` cũ tách đôi thành `name` và `path`.

Giữ key `status` là có chủ đích: cấu hình cột lưu ở `localStorage` khóa `ccm-tool-columns`
của người dùng cũ vẫn còn key này nên bảng không trống trơn sau khi cập nhật.

### Nội dung ô

`public/js/ui/result-table.js`, `cellText`:

| Cột | Nội dung |
|---|---|
| `name` | `rec.endpointName` — rỗng thì `—` |
| `path` | `rec.pathTemplate` — chuỗi gốc còn `{*}`, không thay số, không kèm domain hay query |
| `msisdn` | `rec.msisdn` — rỗng thì `—` |
| `status` | ghép bằng ` · ` từ ba mảnh, bỏ mảnh rỗng |

Ba mảnh của cột `status`:

1. status code, `null` → `—`
2. error code, không có → bỏ mảnh
3. `${rec.durationMs}ms`

```
200 · 245ms
500 · E001 · 89ms
— · ETIMEDOUT · 30000ms
```

Ô tô màu theo `status-up` khi `response.status !== null && < 400`, còn lại `status-down`.
Bỏ nhánh tô màu riêng cho `errorCode` ở `buildRow` vì cột đó không còn.

`NUMERIC` bỏ `status` và `durationMs` (giờ là chuỗi ghép, căn phải sẽ xấu), giữ `index`
và `msisdn`.

### Cấu hình cột

`public/js/ui/filters.js`, `loadColumns` lọc bỏ key không còn tồn tại:

```js
const valid = saved.filter((k) => ALL_COLUMNS.some((c) => c.key === k));
if (valid.length > 0) return valid;
```

Rỗng thì rơi về danh sách mặc định. Người dùng cũ đang bật `errorCode`, `durationMs`,
`endpoint` sẽ mất ba key đó nhưng vẫn còn `status` nên bảng vẫn hiện.

### Bộ lọc

Filterbar không đổi: lọc theo status code, error code, khoảng thời gian vẫn đọc thẳng
`rec.response.status`, `rec.errorCode`, `rec.durationMs` — độc lập với việc gom cột hiển
thị.

`matchesFilter` thêm `rec.pathTemplate` vào chuỗi tìm kiếm, để gõ `white-list` trong ô 🔍
tìm được cả khi cột `Request` bị tắt.

### Excel export

`src/server/excel-export.js` giữ nguyên các cột rời — file Excel dùng để lọc và pivot,
gom lại là phản tác dụng. Chỉ đổi hai chỗ trong `EXPORT_COLUMNS`:

```js
{ header: 'Name', key: 'name', width: 30 },   // thêm, đứng sau Index
{ header: 'Path', key: 'path', width: 45 },   // thay cột 'Endpoint' cũ
```

`toRow` thêm `name: rec.endpointName`, `path: rec.pathTemplate`.

## Báo lỗi

Import xong hiện toast tổng hợp:

```
Đã nạp 12 endpoint từ apis.xlsx (bỏ 2 dòng trùng, 3 dòng lỗi)
```

Dòng lỗi liệt kê trong vùng `.el-errors` dưới danh sách endpoint, tối đa 10 dòng, có nút
✕ để ẩn:

```
Dòng 7: method "FETCH" không hợp lệ
Dòng 9: đường dẫn để trống
```

Không khớp được cột thì **không nạp dòng nào**, báo kèm header đọc được:

```
Không tìm thấy cột "HTTP Method". Header trong file: Tên API | Verb | Đường dẫn
```

## Test

Chạy bằng `npm test` (`node --test`).

| File | Ca kiểm |
|---|---|
| `test/file-import.test.js` | `parseCsvGrid` / `parseXlsxGrid` giữ đủ cột; `parseGrid` tách header khỏi rows; toàn bộ test cũ vẫn xanh |
| `test/endpoint-mapping.test.js` (mới) | khớp cột theo tên có trim và không phân biệt hoa thường; khớp theo index 1-based; index ngoài khoảng → lỗi; cột không tồn tại → lỗi kèm danh sách header; method rỗng → `GET`; method lạ → dòng lỗi và bỏ dòng; path thiếu `/` → tự thêm; path rỗng → dòng lỗi; dòng rỗng bỏ im lặng; dedupe giữ cả `GET /a` lẫn `POST /a`; `dedupe: false` giữ nguyên trùng |
| `test/variables.test.js` | `extractVariables('/x/{*}')` → `['msisdn']`; `resolve` thay `{*}`; thiếu msisdn → vào `missing` |
| `test/request-builder.test.js` | 2 MSISDN × 2 endpoint `{*}` → 4 request, URL đúng thứ tự path rồi query; endpoint không placeholder → 1 request; request mang cả `endpointName` lẫn `pathTemplate` |
| `test/routes.test.js` | `POST /api/import/grid` trả headers và rows; đuôi file lạ → 400 |
| `test/http-client.test.js` | record mang `pathTemplate` |
| `test/filter-logic.test.js` | `ALL_COLUMNS` đủ 7 key và đều `default: true`; tìm kiếm khớp `pathTemplate` |
| `test/result-table.test.js` | cột `status` ghép `200 · 245ms`; có error code → `500 · E001 · 89ms`; status `null` → `— · ETIMEDOUT · 30000ms`; cột `name` rỗng → `—`; cột `path` giữ nguyên `{*}` |
| `test/excel-export.test.js` | `EXPORT_COLUMNS` có `Name` và `Path`; `toRow` đổ đúng hai trường |

## File đụng vào

### Import endpoint

| Sửa | Thêm mới |
|---|---|
| `src/server/file-import.js` | `public/js/shared/endpoint-mapping.js` |
| `src/server/routes.js` | `public/js/ui/template-drawer.js` |
| `src/server/request-builder.js` | `test/endpoint-mapping.test.js` |
| `src/server/http-client.js` | |
| `public/js/shared/variables.js` | |
| `public/js/state.js` | |
| `public/js/api.js` | |
| `public/js/ui/editable-list.js` | |
| `public/js/ui/endpoint-list.js` | |
| `public/js/main.js` | |
| `public/index.html` | |
| `public/css/app.css` | |
| `test/file-import.test.js` | |
| `test/variables.test.js` | |
| `test/request-builder.test.js` | |
| `test/routes.test.js` | |

### Bảng kết quả

| Sửa |
|---|
| `public/js/shared/filter-logic.js` |
| `public/js/ui/result-table.js` |
| `public/js/ui/filters.js` |
| `src/server/excel-export.js` |
| `test/filter-logic.test.js` |
| `test/result-table.test.js` |
| `test/excel-export.test.js` |
| `test/http-client.test.js` |
