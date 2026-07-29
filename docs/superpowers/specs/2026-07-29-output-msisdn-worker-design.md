# Spec: Output viewer, msisdn mặc định, worker pool, filter theo cột

Ngày: 2026-07-29

## 1. Mục tiêu

Năm thay đổi độc lập nhau nhưng cùng chạm vào luồng dựng request và tab OUTPUT:

1. Xem response giống Postman: body dạng JSON/HTML, header dạng bảng key-value.
2. msisdn được gắn mặc định vào mọi request, không cần viết placeholder trong path.
3. `{*}` đổi nghĩa: ranh giới giữa path và query string riêng của endpoint.
4. Chạy request bằng worker pool, mỗi luồng tối đa 5 request đồng thời.
5. Filter đặt ngay dưới tiêu đề cột; ô search trên filterbar chỉ còn lọc msisdn.

Kèm theo: bố cục lại tab INPUT theo `template-grid-token.md`.

## 2. Dựng URL và msisdn

### 2.1. Model endpoint

`makeEndpoint()` trong `public/js/ui/endpoint-list.js` thêm field:

```js
{ id, enabled: true, name: '', method: 'GET', pathTemplate: '',
  attachMsisdn: true,            // MỚI
  queryParams: [], headers: [] }
```

`attachMsisdn` mặc định `true`. Config cũ thiếu field này được coi là `true`.

### 2.2. Ngữ nghĩa `{*}`

`{*}` là ranh giới trong `pathTemplate`:

```
/query/abc-information/{*}?type=PREPAID&limit=10
└──────── path ───────┘   └── query riêng ──┘
```

- Phần bên trái `{*}` là path.
- Phần bên phải `{*}` là query string riêng của endpoint. Chấp nhận cả dạng có `?` dẫn đầu lẫn dạng `k=v&k=v` trần.
- Không có `{*}` thì toàn bộ chuỗi là path, query riêng rỗng.
- `{*}` không còn là placeholder msisdn.

### 2.3. Quy tắc nối msisdn

Với `attachMsisdn = true`:

- Nếu path **không** chứa cú pháp msisdn cũ (`:msisdn`, `{{msisdn}}`) → nối `/<msisdn>` vào cuối path.
- Nếu path **có** chứa `:msisdn` hoặc `{{msisdn}}` → thay tại đúng vị trí đó và **không** nối thêm ở cuối. Giữ tương thích với config đã lưu.

Với `attachMsisdn = false`: endpoint chạy đúng 1 request, không nhân theo danh sách MSISDN, `record.msisdn = null`.

Ví dụ (`domain = https://abc.vn`, `msisdn = 0912345678`, global query `fromDate=25032026`, `toDate=01042026`):

| pathTemplate | attachMsisdn | URL kết quả |
|---|---|---|
| `/query/abc-information` | true | `https://abc.vn/query/abc-information/0912345678?fromDate=25032026&toDate=01042026` |
| `/query/abc-information/{*}` | true | như trên |
| `/query/abc-information/{*}?type=PREPAID` | true | `.../0912345678?type=PREPAID&fromDate=25032026&toDate=01042026` |
| `/query/abc-information/:msisdn/detail` | true | `https://abc.vn/query/abc-information/0912345678/detail?fromDate=…` |
| `/system/health` | false | `https://abc.vn/system/health?fromDate=…&toDate=…` |

### 2.4. Thứ tự ghép query param

Ghép theo thứ tự **inline (sau `{*}`) → `endpoint.queryParams` → `globalQueryParams`**. Key trùng thì cái xuất hiện trước thắng — inline là cụ thể nhất nên đè được global. Thứ tự trong URL cuối cùng đúng bằng thứ tự chèn.

`{{fromDate}}` và `{{toDate}}` vẫn resolve bình thường ở cả path lẫn giá trị param.

### 2.5. Đếm và validate

- Số request = `Σ (endpoint bật) × (attachMsisdn ? msisdns.length : 1)`. Áp dụng cho cả `countRequests()` ở `public/js/main.js` lẫn `buildRequests()` ở server.
- `validateConfig()`: endpoint bật có `attachMsisdn = true` mà danh sách MSISDN rỗng → lỗi `Endpoint cần msisdn nhưng danh sách MSISDN đang rỗng`.

### 2.6. File chạm

- `public/js/shared/variables.js` — bỏ `STAR_RE` khỏi `extractVariables`/`resolve`, thêm hàm tách `{*}`.
- `src/server/request-builder.js` — dựng path, nối msisdn, ghép query theo thứ tự mới.
- `public/js/ui/endpoint-list.js` — field `attachMsisdn` + radio trong dòng endpoint.
- `public/js/main.js` — `countRequests()`.

## 3. Bố cục tab INPUT

Theo `template-grid-token.md`: grid 2 cột `1fr 2fr`, 4 hàng.

```
+-- 1/3 -----------+-- 2/3 ---------------------------------+
| CONNECTION       | HEADERS            | ADVANCED          |  row 1
+------------------+--------------------+-------------------+
| MSISDN           |                                        |  row 2
+------------------+              ENDPOINTS                 |
| DATE RANGE       |                                        |  row 3
+------------------+                                        |
| QUERY PARAMS     |                                        |  row 4
+------------------+----------------------------------------+
```

- Cột 1 (1/3): nhóm 1 = CONNECTION + MSISDN (2 hàng), nhóm 2 = DATE RANGE + QUERY PARAMS (2 hàng).
- Cột 2 (2/3): nhóm 1 = HEADERS + ADVANCED nằm cạnh nhau trong 1 hàng, nhóm 2 = ENDPOINTS chiếm 3 hàng.

Dòng endpoint:

```
[✓] [GET ▾] [Tên API............] [/path/{*}?............] [msisdn: (•) Có ( ) Không]
```

Responsive: `≤1280px` → 1 cột, tất cả card xếp dọc theo thứ tự CONNECTION, MSISDN, DATE RANGE, QUERY PARAMS, HEADERS, ADVANCED, ENDPOINTS.

File chạm: `public/index.html`, `public/css/app.css`, `public/js/ui/endpoint-list.js`.

## 4. Worker pool

### 4.1. Cấu trúc

File mới:

- `src/server/worker-pool.js` — quản lý pool, hàng đợi, phân phối, huỷ.
- `src/server/request-worker.js` — entry của worker thread, gọi `sendRequest`.

### 4.2. Cách chia luồng

- Pool có **N worker cố định**, N lấy từ `advanced.workerCount` (mặc định 4, min 1, max 16).
- Mỗi worker giữ tối đa **5 request đang bay** (`MAX_INFLIGHT = 5`). Xong 1 request thì xin request tiếp theo từ hàng đợi chung ở main thread.
- Tổng concurrency = `N × 5`.
- Số thread không phụ thuộc tổng số request.

```
500 request, N = 4

worker#1  [req req req req req]  <- tối đa 5 đồng thời
worker#2  [req req req req req]
worker#3  [req req req req req]
worker#4  [req req req req req]
           ^ xong 1 cái thì rút cái tiếp từ queue chung
```

### 4.3. Giao thức message

Main → worker:

- `{ type: 'run', request }` — gửi 1 request để chạy.
- `{ type: 'cancel' }` — abort mọi request đang bay trong worker đó.

Worker → main:

- `{ type: 'result', record }` — 1 record hoàn chỉnh, đúng shape mà `finalize()` trong `http-client.js` trả về.
- `{ type: 'ready' }` — worker khởi động xong.

Main thread nhận `result` thì `run.results.push(record)` và `emit` như hiện tại. Luồng SSE ở `routes.js` không đổi.

### 4.4. Huỷ và lỗi

- `cancelRun()` gửi `cancel` tới mọi worker, chờ tối đa 2s rồi `terminate()`.
- Worker chết bất thường (`error` / `exit` code khác 0): các request đang bay của worker đó được trả lại hàng đợi, pool spawn worker thay thế. Request bị trả lại quá 1 lần thì ghi record lỗi `errorCode: 'WORKER_CRASH'`.
- Không spawn được worker (môi trường chặn `worker_threads`) → `runner.js` chạy đường inline hiện tại làm fallback, log cảnh báo.

### 4.5. UI Advanced

Ô `Concurrency` đổi nhãn thành `Số luồng` (`workerCount`), kèm hint `× 5 request/luồng`. Khoá `advanced.concurrency` cũ trong localStorage được đọc sang `workerCount` nếu `workerCount` chưa có.

### 4.6. Ghi chú kỹ thuật

Request HTTP là I/O-bound nên worker pool không tăng throughput so với `Promise.all` hiện tại. Lợi ích thực tế: parse JSON body lớn không chặn event loop của main thread, và một worker chết không kéo sập cả run. Thay đổi này làm theo yêu cầu, có ghi nhận đánh đổi.

File chạm: `src/server/runner.js`, `src/server/routes.js`, `public/index.html`, `public/js/main.js`, `public/js/state.js`.

## 5. Tab OUTPUT — cột và filter

### 5.1. Danh sách cột

`ALL_COLUMNS` trong `public/js/shared/filter-logic.js`:

| key | header | ghi chú |
|---|---|---|
| `index` | `#` | số thứ tự, giữ ở đầu |
| `status` | `Status · Error · Time` | chuyển lên ngay sau `#` |
| `name` | `Name` | |
| `path` | `Path` | |
| `request` | `Request` | |
| `responseBody` | `Response body` | tách từ cột `response` cũ |
| `responseHeaders` | `Response headers` | mới, truncate 1 dòng |

Bỏ cột `msisdn`. Giá trị `rec.msisdn` vẫn còn trong record để filter và export.

### 5.2. Hàng filter

```
FILTERBAR:  [ 🔍 tìm theo msisdn.............. ]              [ ⚙ cột ]

+---+-----------------+----------+----------+----------+-----------+-----------+
| # | Status·Err·Time | Name     | Path     | Request  | Resp body | Resp hdr  |
|   | [▾ all] [▾ all] | [gõ tìm] |          |          |           |           |
+---+-----------------+----------+----------+----------+-----------+-----------+
| 1 | 200 · 143ms     | Balance  | /query/..| GET https| {"code":0 | content-t |
```

- Hàng filter là `<tr class="filter-row">` thứ hai trong `<thead>`, sticky cùng hàng tiêu đề.
- `Name`: `<input type="search">`, khớp chuỗi con, không phân biệt hoa thường.
- `Status`: hai `<select>` đơn nằm cạnh nhau — một cho status code, một cho error code. Mỗi select có option đầu `(tất cả)` value rỗng. Danh sách option sinh từ kết quả thực tế qua `collectStatuses()` / `collectErrorCodes()`.
- Các cột còn lại không có ô filter.
- Sửa filter thì paint lại bảng, không reset scroll về đầu.

### 5.3. Filterbar

Chỉ còn:

- Ô search lọc theo msisdn (khớp chuỗi con trên `rec.msisdn`).
- Nút `⚙ cột`.

Bỏ khỏi filterbar: select status, select error, ô `time ≥`, ô `time ≤`.

### 5.4. Model filter

```js
export function emptyFilter() {
  return { msisdn: '', name: '', status: '', errorCode: '' };
}
```

`matchesFilter()` viết lại theo 4 field trên. Filter theo thời gian chạy (`timeMin` / `timeMax`) bị bỏ hẳn — đã xác nhận với người dùng.

File chạm: `public/js/shared/filter-logic.js`, `public/js/ui/filters.js`, `public/js/ui/result-table.js`, `public/index.html`, `public/css/app.css`.

## 6. Drawer chi tiết kiểu Postman

```
+-- Request #12 ---------------------------------------------+
| GET · 200 OK · 143ms                                       |
| URL  https://abc.vn/query/abc-info/0912345678?fromDate=..  |
|------------------------------------------------------------|
| REQUEST HEADERS            | RESPONSE HEADERS              |
| key           | value      | key            | value        |
| Authorization | Bearer ●●● | content-type   | application/json |
| Accept        | */*        | x-request-id   | a7f3…        |
|------------------------------------------------------------|
| PATH PARAMS                | QUERY PARAMS                  |
| msisdn        | 091234567  | fromDate       | 25032026     |
|------------------------------------------------------------|
| RESPONSE BODY   [Pretty] [Raw] [Preview]                   |
| {                                                          |
|   "code": 0,                                               |
|   "data": { "msisdn": "0912345678", "balance": 15000 }     |
| }                                                          |
+------------------------------------------------------------+
```

### 6.1. Bảng key-value

Component dùng chung `renderKvTable(obj)` trả về `<table class="kv">` hai cột `key` / `value`. Dùng cho request headers, response headers, path params, query params. Object rỗng hiển thị dòng `(không có)`. Bảng cuộn dọc, `max-height` 30vh.

### 6.2. Viewer response body

Ba tab:

- `Pretty` — mặc định khi `rec.response.body !== null`. `JSON.stringify(body, null, 2)` kèm tô màu key / string / number / boolean / null bằng regex trên chuỗi đã escape HTML.
- `Raw` — `rec.response.bodyText` nguyên bản, không tô màu.
- `Preview` — chỉ bật khi `content-type` chứa `text/html` hoặc `xml`. Render bằng `<iframe sandbox srcdoc>` **không** cấp `allow-scripts`, `allow-same-origin`. Response đến từ domain ngoài nên không cho phép chạy JS trong đó. Content-type khác thì tab này disabled.

Body rỗng và có `errorMessage` → hiển thị `errorMessage` ở tab `Raw`, hai tab kia disabled.

### 6.3. Chiều rộng drawer

Tăng từ `min(680px, 90vw)` lên `min(1040px, 95vw)` để chứa hai pane.

File chạm: `public/js/ui/detail-drawer.js`, `public/css/app.css`.

## 7. Excel export

`EXPORT_COLUMNS` trong `src/server/excel-export.js`:

- **Giữ** cột `MSISDN` — file Excel cần nó để đối soát, khác với bảng UI.
- **Thêm** cột `Response Headers` (width 45), serialize bằng `serializeHeaders(rec.response.headers, true)`. Response header không chứa bearer token nên không cần mask.

## 8. Tương thích ngược

| Dữ liệu cũ | Xử lý |
|---|---|
| endpoint thiếu `attachMsisdn` | coi là `true` |
| path chứa `:msisdn` / `{{msisdn}}` | thay tại chỗ, không nối thêm ở cuối |
| path chứa `{*}` | đổi nghĩa thành ranh giới query — URL kết quả không đổi với path dạng `/a/b/{*}` |
| `advanced.concurrency` | đọc sang `advanced.workerCount` nếu chưa có |
| localStorage `ccm-tool-columns` chứa `msisdn` / `response` | `loadColumns()` đã lọc key không hợp lệ sẵn (`filters.js:11`) |

## 9. Kiểm thử

Sửa: `test/request-builder.test.js`, `test/filter-logic.test.js`, `test/result-table.test.js`, `test/detail-drawer.test.js`, `test/runner.test.js`, `test/excel-export.test.js`, `test/layout.test.js`, `test/api.test.js`.

Thêm: `test/worker-pool.test.js`.

Ca kiểm thử trọng yếu:

- Bảng URL ở mục 2.3 — mỗi dòng một ca.
- Thứ tự và độ ưu tiên query param ở mục 2.4.
- `attachMsisdn = false` không nhân theo danh sách MSISDN.
- Validate báo lỗi khi cần msisdn mà danh sách rỗng.
- Pool: 12 request với `N = 2` chạy hết, không quá 10 request bay cùng lúc, mỗi worker không quá 5.
- Pool: huỷ giữa chừng thì run kết thúc trạng thái `cancelled`.
- Pool: worker chết thì request được chạy lại.
- `matchesFilter()` với từng field, và tổ hợp msisdn + status.
- `Preview` disabled khi content-type là JSON.
- Excel có đúng cột `Response Headers` và vẫn còn cột `MSISDN`.
