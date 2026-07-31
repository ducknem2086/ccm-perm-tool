# Design Spec: UC2 chọn cột theo sheet

## 1. Bối cảnh

Spec `2026-07-31-uc2-include-matching-design.md` cho UC2 hai select mới — "Cột đích" và "Cột khử
trùng" — lấy option từ `endpointColumns(state.endpoints, uc1)`, tức union `Object.keys(e.raw)` của
endpoint thuộc sheet khai trong UC1.

Chạy thật thì cả hai select rỗng. Nguyên nhân ở §2. Spec này vá lỗi đó, đồng thời đổi cách chọn cột:
chọn sheet trước, rồi chọn cột trong sheet đó, để biết chắc mình đang trỏ vào cột nào.

Phạm vi quét lúc CHECK PERM **không đổi**: vẫn mọi sheet khai trong UC1, khớp theo tên cột.

## 2. Root cause

`public/js/ui/endpoint-list.js:46-53` dựng endpoint cho `state.endpoints` từ record của `mapRows`:

```javascript
function fromRecord(rec) {
  return {
    ...makeEndpoint(rec.endpoint, rec.sheetName),
    name: rec.name,
    method: rec.method,
    sheetName: rec.sheetName ?? 'Sheet 1',
  };
}
```

`mapRows` dựng `raw` đúng (`endpoint-mapping.js:90`) nhưng `fromRecord` không chép sang. Mọi phần tử
`state.endpoints` vì thế thiếu `raw`, `endpointColumns` duyệt `Object.keys(e.raw ?? {})` luôn trả
`[]`, hai select rỗng.

Hệ quả kèm theo: `validatePermissionScope` báo `Endpoints import từ bản cũ — cần import lại file
endpoints` (`permission-scope.js:91-93`) cho cả endpoint vừa import xong — import lại không cứu được.
Sau khi vá, câu báo đó chỉ còn đúng nghĩa với cấu hình cũ trong `localStorage`.

## 3. Quyết định đã chốt

| Câu hỏi | Chốt |
|---|---|
| Hình dạng UI | Một select sheet dùng chung cho cả "Cột đích" lẫn "Cột khử trùng" |
| Sheet nào vào select | Chỉ sheet khai trong UC1 |
| Nguồn danh sách cột của một sheet | Union `Object.keys(e.raw)` của endpoint thuộc sheet đó |
| Sheet chọn có scope phạm vi quét không | **Không** — chỉ là ống nhòm chọn cột |
| Đổi sheet có đổi cột đang chọn không | Không |
| Cột đang chọn vắng mặt trong sheet đang xem | Giữ nguyên giá trị, hiện option đánh dấu |

## 4. Thay đổi

### 4.1 `public/js/ui/endpoint-list.js`

```javascript
export function fromRecord(rec) {
  return {
    ...makeEndpoint(rec.endpoint, rec.sheetName),
    name: rec.name,
    method: rec.method,
    sheetName: rec.sheetName ?? 'Sheet 1',
    raw: rec.raw ?? {},
  };
}
```

`export` để test gọi thẳng, không phải dựng DOM mock. Module này chỉ khai báo ở top-level, không chạm
DOM cho tới khi gọi `init`, nên import được trong `node --test`.

### 4.2 `public/js/state.js`

`defaultConfig()` dòng 49, UC2 lên bốn trường:

```javascript
usecase2: {
  permissionColumn: '',   // cot nguon o file phan quyen
  columnSheet: '',        // sheet endpoints dung DE CHON COT   (moi)
  endpointColumn: '',     // ten cot dich
  dedupeColumn: ''        // ten cot khu trung
}
```

Tên `columnSheet` chứ không phải `endpointSheet` — `endpointSheet` đã mang nghĩa "sheet được kiểm
tra" ở UC1, dùng lại tên đó sẽ đọc nhầm thành phạm vi quét.

`load()` và `applyConfig()` (`state.js:132-139`, `157-164`) đã spread `usecase2` từ base nên khóa mới
tự có mặc định `''` với cấu hình cũ. Không cần code migrate.

### 4.3 `public/js/shared/permission-match.js`

Thêm một hàm, không sửa hàm cũ:

```javascript
// Cot cua RIENG mot sheet — nguon option cho hai select cot cua UC2.
export function endpointColumnsOfSheet(endpoints, sheetName)   // → string[]
```

Union `Object.keys(e.raw ?? {})` của endpoint có `(e.sheetName ?? 'Sheet 1') === sheetName`, giữ thứ
tự gặp lần đầu. `sheetName` rỗng hoặc không khớp endpoint nào → `[]`.

Cột trống ở mọi dòng của sheet không xuất hiện trong danh sách, vì `rawOf` bỏ ô rỗng
(`endpoint-mapping.js:49-58`). Chấp nhận: cột như vậy dùng làm cột đích hay cột khử trùng đều cho ra
`pool` rỗng, không đáng để lưu thêm header gốc lúc import.

`endpointColumns(endpoints, uc1)` — union mọi sheet UC1 — **giữ nguyên**, `validatePermissionScope`
còn dùng.

### 4.4 `public/index.html`

Thêm một field vào `.perm-grid` (dòng 136-153), đặt trước hai select cột:

```html
<label class="field">
  <span class="label">UC2: Sheet endpoints (chọn cột)</span>
  <select id="sel-permissions-endpoint-sheet" class="input input-sm"></select>
</label>
```

`.perm-grid` là grid 2 cột (`app.css:133`), năm field tự xuống dòng. Không đụng CSS.

### 4.5 `public/js/ui/permissions-panel.js`

**Select sheet mới**

- Option = `uc1Sheets(state.permissionMapping.usecase1)`, giữ thứ tự xuất hiện trong UC1.
- UC1 chưa khai dòng nào → select rỗng; hai select cột cũng rỗng theo.
- Trong `render()`: `columnSheet` rỗng hoặc không còn nằm trong tập sheet UC1 → gán về sheet UC1 đầu
  tiên rồi `persist()`, **không** `notify()` — `render()` là subscriber của `notify()`, gọi ngược lại
  sẽ đệ quy vô hạn. Reset an toàn vì nó chỉ là viewport, không phải cấu hình chạy.
- Handler `change`: gán `usecase2.columnSheet`, `persist()`, `notify()`. **Không** đụng
  `endpointColumn` / `dedupeColumn`.

**Hai select cột**

Option đọc từ `endpointColumnsOfSheet(state.endpoints, usecase2.columnSheet)` thay cho
`endpointColumns(state.endpoints, uc1)`.

Giá trị đang lưu mà không có trong danh sách của sheet đang xem thì **giữ nguyên trong state**, và
chèn thêm một option ở đầu:

```
value       = <giá trị đang lưu>
textContent = `<giá trị đang lưu> (không có trong sheet này)`
```

Có option đó thì `select.value` gán được, người dùng nhìn thấy mình đang trỏ vào cột nào. Không tự
đổi sang cột khác: đổi ngầm làm người dùng chạy nhầm cột mà không biết.

Giá trị rỗng (chưa cấu hình lần nào) không sinh option đánh dấu. Giữ nguyên hành vi hiện tại
(`permissions-panel.js:145`, `155`): select **hiển thị** phần tử đầu danh sách, nhưng state vẫn là
`''` cho tới khi người dùng thực sự bấm chọn — `validatePermissionScope` chặn bằng lỗi "Chưa chọn cột
đích/khử trùng (UC2)". Không tự ghi giá trị hiển thị vào state.

### 4.6 `public/js/shared/permission-scope.js`

Thêm một dòng vào bảng validate có sẵn (dòng 95-101):

| Điều kiện | Thông báo |
|---|---|
| `columnSheet` rỗng hoặc ∉ `uc1Sheets(uc1)` | `Chưa chọn sheet endpoints tham chiếu (UC2)` |

Hai check `endpointColumn` / `dedupeColumn` ∈ `endpointColumns(state.endpoints, uc1)` **giữ nguyên**:
cột hợp lệ khi tồn tại ở bất kỳ sheet UC1 nào, không bắt buộc phải có trong `columnSheet`. Người dùng
được phép chọn cột ở Sheet 1 rồi đổi ống nhòm sang Sheet 2 để soi.

## 5. Phạm vi quét — không đổi một dòng

`matchUc2ToEndpoints` (`permission-match.js:24-79`) giữ nguyên: lọc `filterEndpoints`, giới hạn theo
`uc1Sheets(uc1)`, đọc `e.raw?.[endpointColumn]` và `e.raw?.[dedupeColumn]` theo **tên cột**. Sheet
thiếu cột đang chọn thì endpoint của sheet đó có `hay` hoặc `key` rỗng và bị loại khỏi `pool` ngay
bước 2 — không vỡ.

`columnSheet` không xuất hiện ở bất kỳ đâu trong file này.

## 6. Test

Chạy bằng `node --test`.

**`test/permission-match.test.js` (sửa)**
- `endpointColumnsOfSheet` chỉ trả cột của sheet được hỏi, không lẫn cột sheet khác.
- Thứ tự là thứ tự gặp lần đầu khi duyệt endpoint.
- `sheetName` không khớp endpoint nào → `[]`.
- `sheetName` rỗng / `undefined` → `[]`.
- Endpoint thiếu `raw` bị bỏ qua, không ném lỗi.
- Endpoint không có `sheetName` được tính là `'Sheet 1'`.
- Test cũ của `endpointColumns` và `matchUc2ToEndpoints` phải xanh nguyên trạng.

**`test/endpoint-list.test.js` (mới)**
- `fromRecord` chép `raw` từ record sang endpoint.
- Record không có `raw` → endpoint nhận `{}`, không `undefined`.
- Vẫn đủ `name` / `method` / `sheetName` / `pathTemplate` / `enabled` như trước.

**`test/permission-scope.test.js` (sửa)**
- `columnSheet` rỗng → có lỗi mới.
- `columnSheet` trỏ sheet không khai trong UC1 → có lỗi mới.
- `columnSheet` hợp lệ, `endpointColumn` thuộc sheet UC1 khác → **không** có lỗi.

**`test/permissions-panel.test.js` (sửa)**
- Mock thêm `sel-permissions-endpoint-sheet`.
- Option select sheet = sheet khai trong UC1, không phải mọi sheet của `state.endpoints`.
- `columnSheet` rỗng → render gán về sheet UC1 đầu tiên.
- `columnSheet` trỏ sheet đã bị xóa khỏi UC1 → render gán về sheet UC1 đầu tiên.
- Đổi select sheet: option hai select cột đổi theo, `endpointColumn` / `dedupeColumn` trong state
  giữ nguyên.
- `endpointColumn` không có trong sheet đang xem → có option `... (không có trong sheet này)` và
  `select.value` khớp giá trị đang lưu.
- UC1 rỗng → cả ba select rỗng, không ném lỗi.

**`test/layout.test.js` (sửa)**
- Assert `id="sel-permissions-endpoint-sheet"` có trong `index.html`.

**`test/state.test.js` (sửa)**
- `defaultConfig().permissionMapping.usecase2.columnSheet === ''`.
- `load()` với cấu hình cũ thiếu `columnSheet` → nhận `''`.

Ghi chú: `test/layout.test.js:31` đang đỏ sẵn từ trước spec này, không thuộc phạm vi.

## 7. Phạm vi không đụng tới

- `matchUc2ToEndpoints`, `endpointColumns`, `buildPermissionRunConfig`.
- RUN ALL, tab OUTPUT, `result-table.js`, `permission-table.js`, `excel-export.js`.
- `endpoint-mapping.js` — `rawOf` và `mapRows` đã đúng.
- Server: `http-client.js`, `request-builder.js`, `routes.js`.
- Định dạng file phân quyền, `/api/import/grid`.
