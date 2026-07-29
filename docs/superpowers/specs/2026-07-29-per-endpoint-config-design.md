# Spec: Cấu hình riêng cho từng endpoint (query / headers / body)

Ngày: 2026-07-29

## 1. Mục tiêu

Cho phép mỗi endpoint trong danh sách ENDPOINTS mang cấu hình riêng về query string, headers và request body. Endpoint nào đã cấu hình riêng thì chạy theo cấu hình đó; endpoint nào chưa cấu hình vẫn ăn theo cấu hình chung ở tab INPUT như hôm nay.

Kèm theo: thu cột 1 của tab INPUT xuống 300px.

## 2. Phạm vi

Thuộc phạm vi:

- Drawer cấu hình riêng cho từng endpoint, mở từ danh sách ENDPOINTS.
- Ba nhóm cấu hình trong drawer: query string, headers, request body.
- Query và headers: hai kiểu nhập — bảng key-value hoặc chuỗi thô, chọn bằng select.
- Body: bốn chế độ — `none`, `json`, `text`, `kv` — chọn bằng select.
- Quy tắc trộn cấu hình riêng với cấu hình chung ở `request-builder.js`.
- Tự đặt `Content-Type` theo chế độ body.
- Chặn hai lỗi cấu hình mới trước khi chạy.
- Thu cột 1 tab INPUT còn 300px.

Ngoài phạm vi:

- Che token trong file cURL export (đã thống nhất bỏ qua).
- Body chung dùng cho mọi endpoint. Không có nhu cầu, không làm.
- Body dạng `form-data` / upload file.
- Import cấu hình riêng từ file Excel. Template import hiện chỉ map `name`, `method`, `endpoint`, giữ nguyên.

## 3. Data model

`state.endpoints[i]` thêm bảy trường, tất cả tùy chọn:

```js
{
  // đã có
  id, enabled, name, method, pathTemplate, attachMsisdn,

  // query riêng
  queryMode:   'kv',    // 'kv' | 'raw'
  queryParams: [],      // [{ key, value, enabled }] — dùng khi mode 'kv'
  queryRaw:    '',      // 'page=1&size=50' — dùng khi mode 'raw'

  // headers riêng
  headerMode:  'kv',    // 'kv' | 'raw'
  headers:     [],      // [{ key, value, enabled }] — dùng khi mode 'kv'
  headerRaw:   '',      // mỗi dòng một header, dạng 'Key: Value'

  // body riêng
  bodyMode:    'none',  // 'none' | 'json' | 'text' | 'kv'
  bodyRaw:     '',      // dùng cho 'json' và 'text'
  bodyParams:  [],      // [{ key, value, enabled }] — dùng cho 'kv'
}
```

`queryParams` và `headers` đã tồn tại trong `makeEndpoint()` nhưng chưa có giao diện nào ghi vào. Spec này cấp giao diện cho chúng và thêm năm trường còn lại.

### 3.1. Hai nguồn lưu song song

`queryParams` và `queryRaw` cùng tồn tại, chỉ nguồn khớp `queryMode` được gửi đi. Đổi mode qua lại không xóa dữ liệu đã gõ ở mode kia. Headers và body theo cùng nguyên tắc.

Lý do: người dùng gõ dở bảng key-value rồi chuyển sang raw để dán nhanh, chuyển ngược lại vẫn thấy nguyên bảng cũ. Postman cũng giữ song song raw và form.

Hệ quả cần chấp nhận: đổi mode không tự chuyển đổi dữ liệu. Gõ raw rồi chuyển sang key-value sẽ thấy bảng trống, không phải bảng đã parse từ raw.

### 3.2. Tương thích cấu hình cũ

Endpoint đã lưu trong `localStorage` thiếu bảy trường trên. `initEndpointList()` đang chuẩn hóa endpoint cũ ở dòng 25-27; bổ sung giá trị mặc định vào đúng chỗ đó:

```js
{ queryMode: 'kv', queryRaw: '', headerMode: 'kv', headerRaw: '',
  bodyMode: 'none', bodyRaw: '', bodyParams: [], ...e }
```

Với mặc định này, endpoint cũ chạy ra kết quả y hệt trước khi có spec.

## 4. Quy tắc trộn

### 4.1. Query string

Thứ tự ưu tiên đổi so với hôm nay:

```
hôm nay:  inline trong pathTemplate  >  endpoint  >  global
spec này: endpoint (drawer)          >  inline    >  global
```

Cấu hình khai tường minh trong drawer phải đè được query dính sẵn trong `pathTemplate` — thứ query đó thường do import Excel mang vào chứ không phải người dùng chủ ý gõ.

Trộn theo từng key, không phải thay nguyên cụm. Key nào endpoint khai thì endpoint thắng; key nào endpoint không khai vẫn lấy từ global.

Mode `raw` được `parseInlineQuery()` tách thành các cặp rồi trộn y hệt mode `kv`. Hai mode chỉ khác cách nhập, không khác ngữ nghĩa trộn.

Ví dụ:

```
global query:      fromDate={{fromDate}}, toDate={{toDate}}
pathTemplate:      /query/abc/{*}?page=1
endpoint queryRaw: page=99&size=50

kết quả:  page=99      (drawer thắng inline)
          size=50      (drawer)
          fromDate=…   (global, drawer không khai)
          toDate=…     (global, drawer không khai)
```

Thực thi: đổi thứ tự đối số ở `request-builder.js:66` thành `mergePairs(endpointList, inlineList, globalList)`.

### 4.2. Headers

Endpoint thắng global, trộn theo key. Đúng thứ tự `mergePairs` đang chạy ở dòng 71, không đổi logic — chỉ thay nguồn `endpoint.headers` bằng kết quả đã chuẩn hóa từ `headerMode`.

Mode `raw` parse bằng hàm mới `parseRawHeaders(text)`:

- Tách theo dòng.
- Mỗi dòng cắt tại dấu `:` **đầu tiên** (giá trị header có thể chứa `:`, ví dụ URL).
- Trim key và value.
- Bỏ qua dòng rỗng, dòng chỉ có khoảng trắng, và dòng không có `:`.
- Bỏ qua dòng bắt đầu bằng `#` để người dùng ghi chú được.

### 4.3. Body

Không trộn. Endpoint quyết định hoàn toàn — không có body chung nên không có gì để trộn.

| `bodyMode` | Gửi đi |
|---|---|
| `none` | không gửi body |
| `json` | nguyên chuỗi trong `bodyRaw` |
| `text` | nguyên chuỗi trong `bodyRaw` |
| `kv` | `JSON.stringify(obj)` với `obj` là object phẳng dựng từ `bodyParams` |

Mode `kv` dựng object phẳng: mỗi dòng bật thành một cặp `key: value`, giá trị luôn là chuỗi. Key trùng thì dòng sau đè dòng trước. Không hỗ trợ lồng nhau — cần lồng thì dùng mode `json`.

### 4.4. Biến

`{{msisdn}}`, `{{fromDate}}`, `{{toDate}}` resolve được trong cả ba nhóm: query (kv lẫn raw), headers (kv lẫn raw), body (raw lẫn kv). Dùng chung hàm `resolve()` sẵn có.

Biến thiếu giá trị vẫn dồn vào `unresolved` và trả về record với `errorCode: 'UNRESOLVED_VAR'` như hiện tại.

### 4.5. Content-Type tự đặt

Sau khi trộn headers, nếu **không** tìm thấy key `content-type` (so sánh không phân biệt hoa thường) ở cả endpoint lẫn global:

| `bodyMode` | Content-Type đặt vào |
|---|---|
| `json`, `kv` | `application/json` |
| `text` | `text/plain` |
| `none` | không đặt gì |

Người dùng đã khai `Content-Type` thì tôn trọng khai báo đó, không ghi đè.

Thứ tự trong `buildOne()`: trộn headers → gắn `Authorization` (logic sẵn có) → gắn `Content-Type`.

## 5. Hai lỗi chặn trước khi chạy

`validateConfig()` thêm hai kiểm tra, gắn lỗi vào `field: 'endpoint:<id>'` theo đúng khuôn các lỗi hiện có:

**5.1. JSON sai cú pháp.** `bodyMode === 'json'` và `bodyRaw` không rỗng nhưng `JSON.parse` ném lỗi.

```
Body JSON của endpoint không hợp lệ: <thông điệp lỗi từ JSON.parse>
```

Kiểm tra trên chuỗi **chưa** resolve biến. Chuỗi `{"msisdn":"{{msisdn}}"}` là JSON hợp lệ vì `{{msisdn}}` nằm trong dấu nháy. Đặt biến ngoài nháy thì JSON sai và báo lỗi — đúng, vì kết quả sau resolve cũng sẽ sai.

Chạy rồi mới phát hiện thì đã phí cả loạt request.

**5.2. GET/HEAD kèm body.** `method` là `GET` hoặc `HEAD` mà `bodyMode !== 'none'`.

```
Method GET không gửi được body. Đổi method hoặc đặt Body về None.
```

Node `fetch()` ném `TypeError: Request with GET/HEAD method cannot have body`. Không chặn thì cả loạt request chết với lỗi khó truy nguyên. Postman gửi được GET body, Node thì không — khác biệt này phải nói rõ tại chỗ.

## 6. Giao diện

### 6.1. Nút mở drawer

Mỗi dòng trong danh sách ENDPOINTS thêm một nút ngay sau cụm radio msisdn, tức trước ô nhập path:

```
[✓] [GET ▾] [Tên API      ] [◉Có ○Không] [⚙] [/query/abc/{*}        ] [✕]
```

Đặt ở đó vì `createEditableList` gọi `renderExtra()` trước khi tự append ô path và nút ✕ — mọi control phụ hiện có (checkbox, method, name, radio) đều nằm trước ô path theo đúng cơ chế này. Đẩy nút xuống cuối dòng sẽ phải mở rộng `editable-list.js` thêm một hook chỉ để phục vụ một nút; không đáng.

- Nhãn `⚙`, title `Cấu hình riêng cho endpoint này`.
- Endpoint đã có cấu hình riêng thì nút đổi sang trạng thái nổi bật (class `has-config`, chấm màu `--info`) để nhìn danh sách biết ngay dòng nào đã cấu hình.
- "Đã có cấu hình riêng" nghĩa là ít nhất một trong: `queryParams` có dòng bật, `queryRaw` khác rỗng, `headers` có dòng bật, `headerRaw` khác rỗng, `bodyMode !== 'none'`. Điều kiện tính theo mode đang chọn — `queryMode: 'kv'` thì không xét `queryRaw`.

### 6.2. Drawer

Thêm `<aside id="endpoint-drawer" class="drawer">` vào `index.html`, cạnh ba drawer sẵn có. Module mới `public/js/ui/endpoint-drawer.js` theo đúng khuôn `template-drawer.js`: `open(index)` / `close()`, đóng bằng nút ✕ hoặc phím Escape.

Bố cục:

```
┌────────────────────────────────────────────────┐
│ CẤU HÌNH RIÊNG — GET /query/abc/{*}      [✕]  │
│                                                │
│ [ QUERY ] [ HEADERS ] [ BODY ]                 │
│                                                │
│ Kiểu nhập: [ Key-value ▾ ]                     │
│ ┌────────────────────────────────────────────┐ │
│ │ [✓] page          │ 1              │ [✕]  │ │
│ │ [✓] size          │ 50             │ [✕]  │ │
│ └────────────────────────────────────────────┘ │
│ [+ Thêm dòng]                                  │
│                                                │
│ Cấu hình chung vẫn áp dụng cho các key         │
│ endpoint này không khai.                       │
└────────────────────────────────────────────────┘
```

Ba tab dùng lại pattern `.body-tabs` / `.body-tab` của `detail-drawer.js`.

**Tab QUERY** — select `Key-value | Chuỗi thô`.
- `Key-value`: bảng key-value.
- `Chuỗi thô`: một `<textarea>`, placeholder `page=1&size=50`. Không cần dấu `?` ở đầu; có gõ thì cắt bỏ.

**Tab HEADERS** — select `Key-value | Chuỗi thô`.
- `Key-value`: bảng key-value.
- `Chuỗi thô`: `<textarea>`, mỗi dòng `Key: Value`, placeholder minh họa hai dòng.

**Tab BODY** — select `None | JSON | Text | Key-value`.
- `None`: hiện dòng chữ "Request này không gửi body."
- `JSON`: `<textarea class="mono">`, kiểm tra cú pháp khi gõ, sai thì viền đỏ (`is-invalid`) kèm title chứa thông điệp lỗi. Chỉ báo tại chỗ, việc chặn chạy do `validateConfig()` lo.
- `Text`: `<textarea>`, không kiểm tra.
- `Key-value`: bảng key-value, kèm dòng gợi ý "Các cặp bên dưới sẽ được gửi đi dưới dạng JSON object."

Mỗi thay đổi ghi thẳng vào `state.endpoints[index]` rồi `persist()` + `notify()`, giống mọi ô nhập khác trong tab INPUT. Không có nút Lưu.

Method `GET`/`HEAD` thì tab BODY vẫn mở được nhưng hiện cảnh báo ngay trên select: "Method GET không gửi được body." Người dùng cần thấy trạng thái đã cấu hình chứ không phải bị giấu đi.

### 6.3. Bảng key-value dùng chung

`param-table.js` hiện gắn cứng `state.globalQueryParams` / `state.globalHeaders` và `document.getElementById(hostId)`, không dùng lại được cho drawer.

Tách lõi thành `public/js/ui/kv-table.js`:

```js
createKvTable({
  host,             // phần tử chứa bảng
  getRows,          // () => [{ key, value, enabled }]
  setRows,          // (rows) => void
  onChange,         // gọi sau mỗi thay đổi
  keyPlaceholder,
  valPlaceholder,
  emptyText = 'Chưa có dòng nào.',
})  // trả về { render, addRow }
```

Giữ nguyên hành vi hiện có: checkbox bật/tắt dòng, ô key, ô value dùng font mono, nút ✕ xóa dòng, dòng trống hiện `.el-empty`.

`param-table.js` co lại còn phần khai báo hai bảng global và gọi `createKvTable`. Drawer gọi cùng hàm đó với `getRows`/`setRows` trỏ vào `state.endpoints[index]`.

Đây là refactor có mục đích, không phải dọn dẹp tùy hứng: cùng một bảng xuất hiện ở hai nơi, tách ra thì hành vi chỉ còn một chỗ để sửa. Repo đã có tiền lệ `createEditableList` dùng chung cho MSISDN và ENDPOINTS.

### 6.4. Thu cột 1 xuống 300px

`app.css` dòng 72:

```css
/* trước */ grid-template-columns: 1fr 2fr;
/* sau  */  grid-template-columns: 300px 1fr;
```

Breakpoint 1280px giữ nguyên — dưới ngưỡng đó vẫn xếp một cột.

Cột hẹp chứa CONNECTION, MSISDN, DATE RANGE, QUERY PARAMS. Ở 300px, ô nhập domain và token sẽ hẹp hơn hiện tại; chấp nhận được vì hai ô đó dán vào chứ ít khi gõ tay, và cột rộng được thêm chỗ cho danh sách ENDPOINTS vốn cần nhiều bề ngang hơn sau khi có thêm nút ⚙.

`test/layout.test.js` đang khẳng định `grid-template-columns: 1fr 2fr` — phải cập nhật cùng lúc.

## 7. Tệp thay đổi

Thêm mới:

| Tệp | Việc |
|---|---|
| `public/js/ui/kv-table.js` | Factory bảng key-value dùng chung |
| `public/js/ui/endpoint-drawer.js` | Drawer cấu hình riêng, ba tab |
| `test/kv-table.test.js` | Test factory |
| `test/endpoint-drawer.test.js` | Test drawer |

Sửa:

| Tệp | Việc |
|---|---|
| `public/index.html` | Thêm `<aside id="endpoint-drawer">` |
| `public/css/app.css` | `300px 1fr`; style tab drawer, textarea, nút ⚙ |
| `public/js/ui/param-table.js` | Dùng `createKvTable` |
| `public/js/ui/endpoint-list.js` | Nút ⚙, giá trị mặc định cho bảy trường mới |
| `public/js/main.js` | Khởi tạo `endpoint-drawer`, nối vào `endpoint-list` |
| `public/js/shared/endpoint-path.js` | Thêm `parseRawHeaders()` |
| `src/server/request-builder.js` | Đổi thứ tự trộn query; chuẩn hóa theo mode; dựng body; đặt Content-Type; hai lỗi mới |
| `test/layout.test.js` | Đổi khẳng định grid |
| `test/request-builder.test.js` | Test trộn, body, Content-Type, hai lỗi |
| `test/endpoint-path.test.js` | Test `parseRawHeaders` |
| `test/input-panels.test.js` | Không sửa. `createKvTable` giữ nguyên cấu trúc DOM nên test này phải xanh nguyên trạng — đây là chốt chặn cho bước refactor `param-table.js` |

## 8. Kiểm thử

**`parseRawHeaders()`**
- Dòng `Accept: application/json` → `{ key: 'Accept', value: 'application/json' }`.
- Giá trị chứa `:` — `X-Url: https://a.vn:8080/x` → value giữ nguyên cả cổng và scheme.
- Bỏ dòng rỗng, dòng chỉ khoảng trắng, dòng không có `:`, dòng mở đầu bằng `#`.
- Trim khoảng trắng thừa hai bên key và value.

**Trộn query** (`request-builder.js`)
- Drawer đè inline khi trùng key.
- Drawer đè global khi trùng key.
- Key chỉ có ở global vẫn xuất hiện trong URL.
- Mode `raw` cho kết quả giống hệt mode `kv` khi nội dung tương đương.
- Dòng `enabled: false` bị loại.
- Endpoint không cấu hình riêng cho ra URL y hệt trước spec — chốt chặn không phá vỡ hành vi cũ.

**Trộn headers**
- Endpoint đè global khi trùng key.
- Mode `raw` parse đúng và trộn đúng.

**Body**
- `none` → `body === null`.
- `json` → gửi nguyên chuỗi.
- `text` → gửi nguyên chuỗi.
- `kv` → `'{"a":"1","b":"2"}'`; dòng tắt bị loại; key trùng lấy dòng sau.
- Biến trong body raw và body kv được resolve.
- Biến thiếu trong body dồn vào `unresolved`.

**Content-Type**
- `json`/`kv` chưa khai header → tự đặt `application/json`.
- `text` chưa khai header → tự đặt `text/plain`.
- Đã khai `content-type` chữ thường ở global → không ghi đè.
- Đã khai `Content-Type` ở endpoint → không ghi đè.
- `none` → không có key `Content-Type` trong headers.

**`validateConfig()`**
- `bodyMode: 'json'` với chuỗi hỏng → một lỗi `endpoint:<id>`.
- `bodyMode: 'json'` với `{"m":"{{msisdn}}"}` → không lỗi.
- `bodyMode: 'json'` với `bodyRaw` rỗng → không lỗi.
- `GET` kèm `bodyMode: 'text'` → một lỗi.
- `POST` kèm `bodyMode: 'text'` → không lỗi.

**`createKvTable()`**
- Render đúng số dòng từ `getRows`.
- Sửa ô key/value gọi `setRows` với dữ liệu mới.
- Bỏ tick checkbox đặt `enabled: false`.
- Nút ✕ xóa đúng dòng.
- Danh sách rỗng hiện `.el-empty`.

**`endpoint-drawer.js`**
- `open(index)` render đúng endpoint theo chỉ số.
- Đổi tab hiện đúng khung nhập.
- Đổi select mode hiện đúng khung nhập và ghi `queryMode` vào state.
- Đổi mode rồi đổi lại giữ nguyên dữ liệu ở cả hai nguồn.
- `bodyMode: 'json'` với chuỗi hỏng gắn class `is-invalid`.
- Escape đóng drawer.

**`layout.test.js`**
- CSS khẳng định `grid-template-columns: 300px 1fr`.

Toàn bộ 254 test hiện có phải tiếp tục xanh.
