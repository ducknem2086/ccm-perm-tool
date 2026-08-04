# Export màn CHECK PERMISSION khớp đúng bảng

Ngày: 2026-08-04

## Vấn đề

Nút Export Excel ở màn CHECK PERMISSION xuất ra file không khớp bảng đang hiển thị.

Nguyên nhân: bộ cột được khai **hai nơi độc lập**, không nơi nào biết nơi kia.

| Nơi khai | File |
|---|---|
| Bảng | `public/js/ui/permission-table.js:6` — hằng `COLUMNS` + hàm `cellText` |
| Export | `src/server/excel-export.js:84` — hằng `PERMISSION_EXPORT_COLUMNS` + hàm `toRow` |

Hệ quả lệch cụ thể:

- **Thiếu hẳn cột `Status Check Perm`** (`rec.oracle.status`). Bảng có, export không — lệch nặng nhất, mất luôn cột dùng để đối chiếu IAM trả gì so với API trả gì.
- Thứ tự cột khác: export đẩy `Status Permission` lên vị trí 2.
- Ô rỗng hiển thị khác: bảng vẽ `—` (hoặc `empty` cho Status Perm), export ghi chuỗi rỗng.
- `Response Body`: bảng cắt 120 ký tự qua `bodyPreview`, export ghi đầy đủ qua `bodyPretty`.

Số dòng thì **không lệch**: `getVisibleIndexes()` gửi đúng tập đã lọc, và cả hai phía đều sắp theo `index` (`permission-filter-logic.js:39`, `routes.js:123`).

## Mục tiêu

1. Export ra đúng y hệt những gì bảng đang hiển thị — cả cột, thứ tự, lẫn cách hiện ô rỗng.
2. Thêm cột `Function Name`.
3. Bỏ cột `Response Body` khỏi cả bảng lẫn export.
4. Hiện method (GET/POST/…) cho từng status trên mỗi dòng.

## Kiến trúc: một nguồn sự thật cho cột

**File mới** `public/js/shared/permission-columns.js` giữ toàn bộ định nghĩa cột:

```js
export const PERM_COLUMNS = [ { key, header, width }, ... ];
export function permCellText(rec, key) { ... }
```

- `permission-table.js` dựng `COLUMNS = [{ key: 'action', header: 'Action' }, ...PERM_COLUMNS]`, vẽ ô bằng `permCellText`.
- `excel-export.js` sinh `PERMISSION_EXPORT_COLUMNS` từ `PERM_COLUMNS`, dựng row bằng chính `permCellText`.

Server import module trong `public/js/shared` đã là tiền lệ sẵn có của repo — `excel-export.js:2` đang import `response-body.js` theo đúng cách này.

Sau thay đổi, export **không thể lệch** nữa: cùng danh sách cột, cùng hàm sinh nội dung ô, nên cả `—` lẫn `empty` cũng ra giống hệt bảng.

### Hai hướng đã cân nhắc và loại

- **Client gửi ma trận string đã render lên server.** Parity tuyệt đối nhưng phình payload theo số dòng và đổi hợp đồng của `POST /api/export/:runId`. Không đáng cho một bảng 9 cột.
- **Vá tay `PERMISSION_EXPORT_COLUMNS` cho khớp.** Rẻ nhất, nhưng đây chính là cách nó lệch lần này — lần thêm cột sau lại lệch tiếp.

## Bộ cột cuối

Cột cũ giữ nguyên vị trí. `Response Body` vốn ở cuối nên xoá nó không đẩy ai; `Function Name` chiếm chỗ trống đó.

| # | Header | key | Nguồn | Thay đổi |
|---|--------|-----|-------|----------|
| — | Action | `action` | nút 👁 | giữ nguyên, **chỉ có trên bảng** |
| 1 | Status | `status` | `rec.request.method` + `rec.response.status` | nội dung ô đổi |
| 2 | Status Check Perm | `permStatus` | `rec.oracle.request.method` + `rec.oracle.status` | nội dung ô đổi; **export mới có** |
| 3 | Status Perm | `perm` | `rec.statusPermission` | giữ nguyên |
| 4 | Auth | `auth` | `rec.authName` | giữ nguyên |
| 5 | Endpoint | `endpoint` | `rec.pathTemplate` | giữ nguyên |
| 6 | Role | `role` | `rec.sheetName` | giữ nguyên |
| 7 | Endpoint Name | `epName` | `rec.endpointName` | giữ nguyên |
| 8 | UC2 Name | `permName` | `rec.permissionMatchedName` | giữ nguyên |
| 9 | Function Name | `fnName` | `rec.oracleFunction` | **mới** |
| ~~10~~ | ~~Response Body~~ | ~~`body`~~ | — | **xoá khỏi cả bảng lẫn export** |

`Function Name` là mã FUNCTION của UC3 (`permissionMapping.usecase3.functionColumn`), chính là mã gửi vào body checkPermission. Trước đây chỉ xem được trong Detail drawer ở mục `FUNCTION / ACTION` (`detail-drawer.js:168`).

## Method gộp vào ô status

Mỗi dòng có hai status đến từ hai request khác nhau, nên method đi kèm ngay trong ô status của request sinh ra nó — không thêm cột.

| Ô | Quy tắc | Ví dụ |
|---|---------|-------|
| `status` | `${method} · ${status}`, status `null` → `—` | `GET · 200`, `GET · —` |
| `permStatus` | `rec.oracle` là `null` → `—` trơn, không method | `—` |
| `permStatus` | có oracle → `${method} · ${status}` | `POST · 403` |

`rec.oracle` bằng `null` nghĩa là endpoint không khai FUNCTION nên không gọi checkPermission — không có request thì không có method để hiện.

Method đọc qua optional chaining (`rec.request?.method`, `rec.oracle.request?.method`) và rơi về `—` khi thiếu, để một record khuyết `request` không làm sập cả bảng.

**Đánh đổi đã chấp nhận:** ô Status trong Excel chuyển từ số (`200`) thành chuỗi (`GET · 200`), nên mất sort/filter kiểu số trên cột đó trong Excel. Đổi lại file xuất ra khớp đúng bảng — đây là yêu cầu chính.

## Bộ lọc

`permission-filter-logic.js`:

- `emptyPermFilter()` — bỏ khoá `body`, thêm khoá `fnName: ''`
- `matchPermRecord()` — bỏ nhánh lọc `body`, thêm `filter.fnName` khớp chuỗi con không phân biệt hoa thường trên `rec.oracleFunction` (cùng khuôn với `epName`)

`permission-filters.js` — bỏ ô search `Response Body`, thêm ô search `Function Name`, khai `case 'fnName'` trong `filterCell`.

Lọc theo status **giữ nguyên**: `statusLabel()` và `permStatusLabel()` đọc thẳng `rec.response.status` / `rec.oracle?.status`, không đọc text của ô, nên dropdown vẫn là `200 / 401 / N/A` chứ không thành `GET · 200`.

## Tô màu trong Excel

Layout permission tô theo 3 ô, đọc từ record chứ không parse lại text ô:

| Ô | Điều kiện xanh `FF0ECB81` | Điều kiện đỏ `FFF6465D` |
|---|---|---|
| `status` | `rec.response.status < 400` | còn lại |
| `permStatus` | `rec.oracle.status < 400` | `rec.oracle.status >= 400`; `oracle` null thì không tô |
| `perm` | `statusPermission === 'true'` | `statusPermission === 'false'` |

Layout `default` không đổi.

## Ảnh hưởng lên `excel-export.js`

- `toRow()` hiện phục vụ cả hai layout qua cờ `hasPermission`. Tách: `toRow()` chỉ còn lo layout `default`, thêm `toPermRow(rec)` dựng row từ `PERM_COLUMNS` + `permCellText`.
- `writeResultsToStream()` chọn hàm dựng row theo `isPermLayout`.
- Nhánh tô màu tách theo layout vì tên khoá ô khác nhau: layout permission dùng `status` / `permStatus` / `perm`, layout default vẫn dùng `status` / `statusPermission`.
- `bodyPretty` vẫn dùng cho layout `default`, chỉ thôi dùng ở nhánh permission.

`permission-table.js` bỏ import `bodyPreview` và hàm `truncate` — không còn cột nào cần cắt chuỗi.

## Test

Cập nhật:

- `test/excel-export.test.js:270` và `:276` — kỳ vọng 8 header cũ đổi thành 9 header mới; ô status kỳ vọng `'GET · 200'` thay vì `200`; thêm ca `rec.oracle` null ra `—`.
- `test/permission-table.test.js` — danh sách header, chỉ số ô, và helper `rec()` phải có `request.method`.
- `test/permission-filter-logic.test.js:100` — ca "loc theo body" đổi thành "loc theo fnName"; `emptyPermFilter` kỳ vọng đổi khoá.

Thêm mới `test/permission-columns.test.js` — chốt chặn drift:

- Header của `PERMISSION_EXPORT_COLUMNS` khớp đúng header bảng sau khi bỏ cột `Action`.
- `permCellText` trả `GET · 200`, `GET · —` khi status null, `—` khi `oracle` null, `POST · 403` khi có oracle.
- Mọi khoá rỗng đều ra `—`, riêng `perm` ra `empty`.

Test này là thứ ngăn lần sau ai đó thêm cột vào bảng mà quên export.
