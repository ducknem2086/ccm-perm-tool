# CCM Tool — Design Spec

Ngày: 2026-07-29
Nguồn yêu cầu: `require.md`
Nguồn design system: `token.md` (Binance)

## 1. Mục tiêu

Tool nội bộ chạy bằng Node.js trên port **2345**, dùng để test hàng loạt request/response của API — kiểu Postman thu gọn, nhưng chuyên cho một dạng bài: **một domain, nhiều endpoint, nhiều số điện thoại, một khoảng ngày**.

Giá trị chính: nhập 1 lần cấu hình → chạy N request (N = số endpoint × số MSISDN) → xem kết quả dạng bảng lọc được → export Excel.

## 2. Ngoài phạm vi

- Không có tài khoản, đăng nhập, phân quyền.
- Không có database. Cấu hình lưu `localStorage`, kết quả lưu in-memory theo `runId`.
- Không có collection/environment nhiều tầng như Postman thật.
- Không test WebSocket/GraphQL — chỉ HTTP.
- Không viết test UI tự động.

## 3. Kiến trúc

```
Browser (public/)  ──POST /api/run──────▶  Node/Express :2345  ──fetch──▶  API đích
      ▲                                            │
      └──── SSE GET /api/run/:runId/stream ────────┘
```

Request tới API đích được gửi **từ Node**, không phải từ browser. Lý do:

- Không dính CORS preflight — nhiều API nội bộ sẽ chặn origin `localhost:2345`.
- Set được mọi header, kể cả header bị browser cấm ghi đè.
- Đo thời gian không lẫn overhead của tab browser.
- Chạy song song nhiều MSISDN với pool có kiểm soát.

Đánh đổi: máy chạy tool phải reach được domain đích (VPN / mạng nội bộ phải thông từ máy đó).

### Dependencies

| Package | Dùng để |
|---|---|
| `express` | Serve static + REST + SSE |
| `exceljs` | Đọc `.xlsx` khi import, ghi `.xlsx` khi export |

Fetch dùng `globalThis.fetch` built-in của Node. Upload file gửi raw `ArrayBuffer` nên không cần `multer`.

## 4. Mô hình dữ liệu

Phân rã API mẫu trong `require.md`:

```
https://abc.vn / DataAggregationEngine/query/abc-information/:msisdn ? fromDate=25032026&toDate=01042026
└── domain ──┘ └─────────────── pathTemplate ─────────────────────┘ └────── queryParams ──────┘
```

### 4.1 Config

```js
{
  domain: "https://abc.vn",           // 1 giá trị duy nhất
  token: "eyJhbGciOi...",             // bearer token, 1 giá trị duy nhất
  dateRange: { from: "25/03/2026", to: "01/04/2026" },
  dateFormat: "ddMMyyyy",             // ddMMyyyy | dd/MM/yyyy | yyyy-MM-dd
  msisdns: ["0912345678", "0913000111"],
  endpoints: [
    {
      id: "ep_1",
      enabled: true,
      method: "GET",
      pathTemplate: "/DataAggregationEngine/query/abc-information/:msisdn",
      queryParams: [],                // override, đè lên global
      headers: []                     // override, đè lên global
    }
  ],
  globalQueryParams: [
    { key: "fromDate", value: "{{fromDate}}", enabled: true },
    { key: "toDate",   value: "{{toDate}}",   enabled: true }
  ],
  globalHeaders: [],
  advanced: {
    concurrency: 5,
    timeoutMs: 30000,
    errorCodePaths: ["errorCode", "error_code", "code", "error.code"],
    dedupeOnImport: true
  }
}
```

### 4.2 Các quan hệ trong `require.md` được hiện thực thế nào

| Yêu cầu | Cách hiện thực |
|---|---|
| domain–path **1-n** | Một ô `domain`, mảng `endpoints` bên dưới |
| phone param → **n-n** path-param | Một mảng `msisdns` dùng chung; mọi endpoint có `:msisdn` trong path đều nhận cùng list này |
| query string param **n-n** | `globalQueryParams` áp cho mọi endpoint + `endpoint.queryParams` đè lên theo `key` |
| path param **n-n** | `pathTemplate` chứa placeholder; giá trị resolve từ scope biến dùng chung |

### 4.3 Hệ biến

Placeholder chấp nhận **hai cú pháp**: `:name` (kiểu Express, dùng trong path) và `{{name}}` (dùng ở path, query value, header value).

Scope biến khi build một request:

| Biến | Nguồn |
|---|---|
| `{{msisdn}}` | Biến lặp — mỗi giá trị trong `msisdns` sinh ra 1 request |
| `{{fromDate}}` | `dateRange.from` format theo `dateFormat` |
| `{{toDate}}` | `dateRange.to` format theo `dateFormat` |

Biến không resolve được → request **không được gửi**. Nó vẫn xuất hiện trong bảng kết quả với `errorCode = "UNRESOLVED_VAR"` và message nêu rõ tên biến thiếu. Fail hiện ra chứ không im lặng.

### 4.4 Sinh test matrix

```
for endpoint of endpoints.filter(e => e.enabled):
    if endpoint có biến {{msisdn}} / :msisdn:
        for msisdn of msisdns:  → 1 request
    else:
        → 1 request
```

Tổng số request hiện lên nút RUN ALL trước khi chạy: `▶ RUN ALL (200)`.

## 5. Xử lý ngày

Ô nhập là **một daterange text** đúng format `dd/mm/yyyy-dd/mm/yyyy` như yêu cầu, kèm 2 native date picker phụ để chọn nhanh (chọn xong ghi ngược lại vào ô text). Bên dưới có dòng preview giá trị thật sẽ gửi đi:

```
25/03/2026-01/04/2026   →   fromDate=25032026 & toDate=01042026
```

Parse chặt: ngày không hợp lệ hoặc `from > to` → viền đỏ, chặn RUN.

## 6. Luồng chạy

1. `POST /api/run` với config → server validate, build matrix, tạo `runId`, trả ngay `{ runId, total }`.
2. Client mở `GET /api/run/:runId/stream` (SSE). Server đẩy event:
   - `result` — một `ResultRecord` (mỗi request xong đẩy ngay, không chờ hết)
   - `progress` — `{ done, total }`
   - `done` — `{ total, ok, failed, elapsedMs }`
3. `POST /api/run/:runId/cancel` → `AbortController.abort()` toàn bộ request đang bay.

Pool concurrency: N worker (mặc định 5) cùng rút việc từ queue. Timeout mỗi request qua `AbortSignal.timeout(timeoutMs)`.

Kết quả giữ in-memory trong `Map<runId, ResultRecord[]>`, TTL 1 giờ, để export còn dùng được.

### 6.1 ResultRecord

```js
{
  index: 1,
  endpointId: "ep_1",
  endpointName: "/DataAggregationEngine/query/abc-information/:msisdn",
  msisdn: "0912345678",
  request: {
    method: "GET",
    url: "https://abc.vn/DataAggregationEngine/query/abc-information/0912345678?fromDate=25032026&toDate=01042026",
    headers: { Authorization: "Bearer eyJhbG…MWQx", "Content-Type": "application/json" },
    pathParams: { msisdn: "0912345678" },
    queryParams: { fromDate: "25032026", toDate: "01042026" },
    body: null
  },
  response: {
    status: 200,          // null nếu lỗi mạng
    statusText: "OK",
    headers: { ... },
    body: { ... },        // JSON đã parse, hoặc null
    bodyText: "{...}",    // raw, dùng cho export
    sizeBytes: 1234
  },
  errorCode: null,
  errorMessage: null,
  durationMs: 412,
  startedAt: "2026-07-29T03:12:44.001Z",
  finishedAt: "2026-07-29T03:12:44.413Z"
}
```

**Token trả về đầy đủ** trong `request.headers.Authorization` — cả ở bảng lẫn drawer chi tiết đều xem được giá trị thật, để còn đối chiếu khi debug lỗi 401.

Việc che token chỉ áp dụng ở bước **export Excel**, do người dùng chọn bằng radio button — xem mục 9.

### 6.2 Cột "status code / error code"

Hai thứ khác nhau, gộp chung một nhóm cột:

- **status code** — HTTP status. `null` khi lỗi mạng.
- **error code** — mã lỗi nghiệp vụ moi từ response body, dò lần lượt theo `advanced.errorCodePaths` (mặc định `errorCode`, `error_code`, `code`, `error.code`), lấy giá trị đầu tiên tìm thấy. User sửa được danh sách path này trong Advanced.
- Khi lỗi mạng, `errorCode` lấy mã của Node: `ETIMEDOUT`, `ECONNREFUSED`, `ENOTFOUND`, `ABORTED`.

Quy ước màu (theo trading semantics của `token.md`): `2xx` → `#0ecb81`, `4xx/5xx` → `#f6465d`, lỗi mạng → `#f6465d`, đang chạy → `#707a8a`.

## 7. Giao diện

Một trang duy nhất, chia **2 tab**: `INPUT` và `OUTPUT`, mỗi tab là một tabpanel đầy đủ.

Tablist theo chuẩn ARIA: `role="tablist"` / `role="tab"` / `role="tabpanel"`, `aria-selected`, `aria-controls`, roving `tabindex`, điều hướng bằng `ArrowLeft` / `ArrowRight` / `Home` / `End`. Bấm RUN ALL thì tự nhảy sang tab OUTPUT.

```
┌──────────────────────────────────────────────────────────────────────┐
│ CCM TOOL                              [● token ok]  [⟳ Reload Token] │  64px
├──────────────────────────────────────────────────────────────────────┤
│  ┌─────────┐┌──────────────┐                                         │
│  │  INPUT  ││ OUTPUT  156  │   ← tablist                             │
│  └─────────┘└──────────────┘                                         │
└──────────────────────────────────────────────────────────────────────┘
```

### 7.1 Tab INPUT

Full width, grid 2 cột trên desktop, gộp 1 cột dưới 1024px.

```
┌────────────────────────────────┬───────────────────────────────────┐
│ CONNECTION                     │ MSISDN                    (2)  ⊕ ⤓│
│  Domain  [https://abc.vn     ] │  ┌──────────────────────────────┐ │
│  Token   [•••••••••••     ] ⟳ │  │ [0912345678              ] ✕ │ │  ← ô cao 16px
│                                │  │ [0913000111              ] ✕ │ │
├────────────────────────────────┤  │ [                       ] ✕ │ │
│ DATE RANGE                     │  └──────────────────────────────┘ │
│  [25/03/2026-01/04/2026     ]  │   [+ Thêm] [⤓ Import] [Xóa hết]  │
│  📅 [từ] 📅 [đến]              ├───────────────────────────────────┤
│  → fromDate=25032026           │ ENDPOINTS                 (1)  ⊕ ⤓│
│    toDate=01042026             │  ┌──────────────────────────────┐ │
│  Format [ddMMyyyy ▾]           │  │☑[/query/abc-information/:ms] ✕│ │
├────────────────────────────────┤  │  GET▾        :msisdn         │ │
│ QUERY PARAMS               ⊕   │  └──────────────────────────────┘ │
│  ☑ fromDate = {{fromDate}}  ✕  │   [+ Thêm] [⤓ Import] [Xóa hết]  │
│  ☑ toDate   = {{toDate}}    ✕  ├───────────────────────────────────┤
├────────────────────────────────┤ ▸ ADVANCED                        │
│ HEADERS                    ⊕   │   concurrency [5] timeout [30000] │
│  (Authorization tự thêm)       │   errorCodePaths [errorCode, …]   │
└────────────────────────────────┴───────────────────────────────────┘
                    [ ▶ RUN ALL (200) ]   [⤒ Export config] [⤓ Import config]
```

### 7.2 Component `editable-list` (dùng chung)

Đây là component quan trọng nhất của tab INPUT. Dùng cho **cả MSISDN lẫn endpoint path**.

- Import file `.xlsx` / `.csv` / `.txt` → parse → render thành **danh sách các ô input sửa được**, không phải textarea hay text tĩnh. Sửa lại sau khi import là yêu cầu bắt buộc.
- Mỗi dòng: `<input>` cao **16px** (`--el-input-height`, `font-size: 12px`, `line-height: 1`, `padding: 0 6px`), nút `✕` xóa dòng.
- Header: label + counter + nút `+ Thêm` / `⤓ Import` / `Xóa hết`.
- Body cuộn riêng, `max-height: 320px`.
- Import khi list đang có dữ liệu → hỏi **Nối thêm** hay **Thay thế**.
- Validate theo từng dòng, dòng sai viền `#f6465d` + tooltip lý do. MSISDN validate `^[0-9+][0-9]{6,14}$`; endpoint validate path bắt đầu bằng `/`.
- `Enter` ở dòng cuối → thêm dòng mới và focus vào đó. `Backspace` trên dòng rỗng → xóa dòng, focus dòng trên.
- Dán nhiều dòng vào một ô → tự tách thành nhiều dòng.

Biến thể cho endpoint list: thêm checkbox `enabled`, dropdown method, và badge liệt kê biến phát hiện được trong template (`:msisdn`).

> Ghi chú: 16px là chiều cao rất chật so với khuyến nghị 40px trong `token.md`. Làm đúng yêu cầu, nhưng đặt qua biến CSS `--el-input-height` để chỉnh một chỗ nếu dùng thực tế thấy khó bấm.

### 7.3 Tab OUTPUT

```
┌───────────────────────────────────────────────────────────────────────┐
│ ▶ 156/200   ⏱ 42.1s   ✓ 141  ✕ 15        [■ Dừng]  [⬇ Export Excel]  │
│                          Token trong file: ( ) Kèm đầy đủ  (•) Che    │
├───────────────────────────────────────────────────────────────────────┤
│ status [all ▾]  error [all ▾]  time ≥[    ] ≤[    ]  🔍[        ] ⚙cột│
├────┬─────────────────────────┬──────────────┬────────┬───────┬────────┤
│  # │ REQUEST                 │ RESPONSE     │ STATUS │ ERROR │   TIME │
├────┼─────────────────────────┼──────────────┼────────┼───────┼────────┤
│  1 │ GET /query/abc-info/09… │ {"data":{"n… │  200   │   —   │  412ms │
│  2 │ GET /query/abc-info/09… │ timeout      │   —    │ETIMEDO│ 30000ms│
│  3 │ GET /query/abc-info/09… │ {"error":"n… │  500   │ E0042 │   89ms │
└────┴─────────────────────────┴──────────────┴────────┴───────┴────────┘
   click 1 dòng → drawer phải: full URL, headers, query params, response body pretty-print
```

**Cột** (đúng theo `require.md`, cột 4 tách đôi cho dễ lọc):

| Cột | Nội dung |
|---|---|
| `index` | Số thứ tự |
| `request` | `METHOD` + URL rút gọn; hover xem full; click mở drawer xem header/url/param đầy đủ |
| `response body / error` | 120 ký tự đầu của body, hoặc thông điệp lỗi |
| `status code` | HTTP status, tô màu theo nhóm |
| `error code` | Mã lỗi nghiệp vụ hoặc mã lỗi mạng |
| `thời gian request` | Mili giây |

Có thêm cột ẩn mặc định: `endpoint`, `msisdn` — bật qua nút `⚙cột`.

**Bộ lọc** — `require.md` viết "bộ select filter cho các cột hiển thị", đọc được theo hai nghĩa nên làm cả hai:

- Lọc dữ liệu: `status code` (multi-select, options tự sinh từ kết quả thực tế), `error code` (multi-select, tự sinh), `thời gian request` (hai number input min/ms và max/ms), ô search text tự do quét URL + msisdn + body.
- Chọn cột hiển thị: nút `⚙cột` bật/tắt từng cột.

Bảng render bằng virtual scroll khi vượt 500 dòng để không đơ.

### 7.4 Token

- Ô input nhập tay, tự lưu `localStorage` của tool.
- Nút `⟳ Reload Token`: thử đọc `document.cookie["access_token"]` rồi tới `localStorage["access_token"]` của **chính origin tool**. Có thì điền vào ô, không có thì giữ nguyên giá trị đang nhập và báo một dòng trạng thái. Đường này chỉ ăn khi tool được deploy cùng domain với API; ở `localhost:2345` thì trình duyệt chặn đọc cookie của `abc.vn` — đây là giới hạn của trình duyệt, không phải bug.
- Token được gắn vào header `Authorization: Bearer <token>` ở phía server, cho mọi request, trừ khi endpoint tự khai header `Authorization` đè lên.
- Indicator ở top bar: `● token ok` / `○ chưa có token`.

### 7.5 Design tokens

Lấy từ `token.md` (Binance, dark surface — vì đây là product/dashboard surface):

| Vai trò | Token | Giá trị |
|---|---|---|
| Canvas | `canvas-dark` | `#0b0e11` |
| Card, panel, top-nav | `surface-card-dark` | `#1e2329` |
| Row hover, nested | `surface-elevated-dark` | `#2b3139` |
| Border, divider | `hairline-on-dark` | `#2b3139` |
| Accent duy nhất | `primary` | `#FCD535` |
| Accent pressed | `primary-active` | `#f0b90b` |
| Text trên yellow | `on-primary` | `#181a20` |
| Body text | `body` | `#eaecef` |
| Label, header bảng, caption | `muted` | `#707a8a` |
| Status 2xx | `trading-up` | `#0ecb81` |
| Status 4xx/5xx, lỗi | `trading-down` | `#f6465d` |
| Focus ring | `info` | `#3b82f6` |

Radius: nút `6px`, input `8px`, card `12px`. Spacing theo bậc 4px (`4/8/12/16/24/32/48`).

Kỷ luật màu theo `token.md`: **vàng chỉ dành cho nút RUN ALL và wordmark** — không dùng cho nút phụ, không dùng làm nền mảng lớn. Xanh/đỏ chỉ dùng làm màu chữ và badge status, không làm nền card.

Font: `BinanceNova` không có license nên dùng chuỗi thay thế đúng như `token.md` khuyến nghị — `Inter` cho chữ, `JetBrains Mono` cho số. Cả hai có fallback hệ thống (`Segoe UI` / `Consolas`) nên tool chạy được offline, không phụ thuộc CDN. Mọi con số (status code, thời gian, MSISDN) render bằng font tabular.

## 8. Import file

`POST /api/import` — raw `ArrayBuffer` trong body, tên file qua header `X-Filename`.

| Đuôi | Cách parse |
|---|---|
| `.txt` | Mỗi dòng một giá trị |
| `.csv` | Cột đầu tiên; bỏ dòng đầu nếu nó không pass validator (coi là header) |
| `.xlsx` / `.xls` | Cột đầu tiên của sheet đầu, qua `exceljs` |

Sau parse: `trim`, bỏ dòng rỗng, dedupe nếu `advanced.dedupeOnImport`. Trả `{ values: [...], total, skipped }`. Client render thẳng ra `editable-list`.

## 9. Export Excel

`POST /api/export/:runId` với body `{ indexes: [1,3,7,...], includeToken: false }` — client gửi đúng những dòng đang hiển thị sau khi lọc, nên file xuất ra khớp với những gì đang nhìn thấy.

### 9.1 Radio chọn có kèm token hay không

Ngay cạnh nút `⬇ Export Excel` ở tab OUTPUT có một cặp radio:

```
Token trong file:  ( ) Kèm đầy đủ    (•) Che (Bearer eyJhbG…MWQx)
```

- **Che** — mặc định. Header `Authorization` trong file thành `Bearer eyJhbG…MWQx` (giữ 6 ký tự đầu + 4 ký tự cuối).
- **Kèm đầy đủ** — ghi nguyên bearer token vào file.

Mặc định để ở **Che** vì file kết quả thường được gửi qua chat/mail, còn bật sang **Kèm đầy đủ** chỉ tốn một click khi thật sự cần. Khi chọn **Kèm đầy đủ**, hiện một dòng cảnh báo màu `#f6465d` ngay dưới radio: `File sẽ chứa bearer token còn hạn — cân nhắc trước khi chia sẻ.`

### 9.2 Nội dung file

Server dùng `exceljs` stream ra `.xlsx`, một sheet `Results`, hàng đầu freeze + tô nền `#1e2329` chữ `#eaecef`, auto-filter bật sẵn.

Cột: `Index`, `Endpoint`, `MSISDN`, `Method`, `URL`, `Headers`, `Query Params`, `Status Code`, `Error Code`, `Duration (ms)`, `Response Body`, `Error Message`, `Started At`.

Cột `Status Code` tô chữ xanh/đỏ theo nhóm. Cột `Headers` áp dụng lựa chọn ở 9.1.

Tên file: `ccm-result-<yyyyMMdd-HHmmss>.xlsx`.

## 10. Xử lý lỗi

| Tình huống | Hành vi |
|---|---|
| Domain rỗng / sai định dạng URL | Chặn RUN, viền đỏ ô domain |
| Không có endpoint nào `enabled` | Chặn RUN, thông báo dưới nút |
| Endpoint có `:msisdn` nhưng list MSISDN rỗng | Chặn RUN, chỉ đúng dòng endpoint gây lỗi |
| Daterange sai / `from > to` | Chặn RUN, viền đỏ |
| Biến không resolve được | Không gửi request, ghi dòng `UNRESOLVED_VAR` vào bảng |
| Timeout | `status = null`, `errorCode = "ETIMEDOUT"`, `durationMs` = timeout đã set |
| Body không phải JSON | `response.body = null`, giữ nguyên `bodyText`, không coi là lỗi |
| Mất SSE giữa chừng | Client tự reconnect, kéo lại kết quả đã có qua `GET /api/run/:runId` |
| Import file sai định dạng | Toast đỏ, giữ nguyên list cũ, không xóa mất dữ liệu đang nhập |

## 11. Cấu trúc file

```
ccm-tool/
├── package.json
├── server.js                        # bootstrap express, lắng nghe 2345
├── src/server/
│   ├── routes.js                    # đăng ký toàn bộ endpoint REST + SSE
│   ├── runner.js                    # pool concurrency, quản lý runId, cancel
│   ├── http-client.js               # gửi 1 request, đo thời gian, chuẩn hóa lỗi
│   ├── request-builder.js           # config → danh sách request cụ thể
│   ├── variables.js                 # resolve :name và {{name}}
│   ├── date-format.js               # parse/format dd/mm/yyyy ↔ ddMMyyyy
│   ├── error-code.js                # moi error code từ body theo path
│   ├── file-import.js               # parse xlsx/csv/txt → string[]
│   └── excel-export.js              # ResultRecord[] → xlsx stream
├── public/
│   ├── index.html
│   ├── css/tokens.css               # CSS variables từ token.md
│   ├── css/app.css                  # layout, tabs, table, editable-list
│   └── js/
│       ├── main.js                  # bootstrap, wire component
│       ├── state.js                 # store + persist localStorage
│       ├── api.js                   # gọi backend, quản lý SSE
│       └── ui/
│           ├── tabs.js              # tablist ARIA
│           ├── connection-panel.js  # domain + token + reload
│           ├── date-range.js
│           ├── editable-list.js     # component dùng chung
│           ├── endpoint-list.js     # editable-list + method + enabled
│           ├── param-table.js       # query params, headers
│           ├── result-table.js      # bảng + virtual scroll
│           ├── filters.js           # filter bar + chọn cột
│           └── detail-drawer.js     # xem full request/response
├── test/                            # node:test
└── docs/superpowers/specs/
    └── 2026-07-29-ccm-tool-design.md
```

Mỗi file một nhiệm vụ. Các module thuần (`variables`, `date-format`, `request-builder`, `error-code`, `file-import`) không đụng I/O nên test độc lập được.

## 12. Testing

`node:test` built-in, chạy bằng `npm test`. Không thêm test framework.

| Module | Ca test |
|---|---|
| `variables` | resolve `:name`, `{{name}}`, biến thiếu, nhiều biến một chuỗi, biến trong query value |
| `date-format` | parse daterange hợp lệ, ngày sai, `from > to`, format ra cả 3 kiểu, năm nhuận |
| `request-builder` | matrix endpoint × msisdn, endpoint không có `:msisdn`, endpoint disabled, override query param đè global |
| `error-code` | dò từng path theo thứ tự, path lồng `error.code`, body không phải object, không tìm thấy |
| `file-import` | csv có header / không header, txt nhiều dòng, xlsx cột đầu, dedupe, dòng rỗng |
| `http-client` | timeout, non-JSON body, token giữ nguyên đầy đủ trong record trả về |
| `excel-export` | `includeToken: false` che đúng dạng `Bearer xxxxxx…yyyy`, `includeToken: true` giữ nguyên, chỉ xuất đúng các `indexes` được gửi lên |

`http-client` là module duy nhất đụng I/O. Test nó bằng một `node:http` server dựng tạm trong chính file test rồi tắt sau — không mock `fetch`, không gọi ra mạng ngoài.

## 13. Chạy

```bash
npm install
npm start          # http://localhost:2345
npm test
```

Không có build step. Sửa file trong `public/` là refresh thấy ngay.
