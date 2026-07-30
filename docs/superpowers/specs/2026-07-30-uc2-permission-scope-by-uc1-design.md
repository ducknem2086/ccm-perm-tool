# Design Spec: UC2 phạm vi theo mapping UC1 (bỏ "Sheet endpoints đích")

## 1. Bối cảnh và mục tiêu

Hiện tại Usecase 2 (match tên endpoint với cột Name trong file phân quyền) yêu cầu người dùng chọn
một **sheet endpoints đích** (`usecase2.targetSheet`): hoặc `'all'`, hoặc đúng một sheet cụ thể.

Ràng buộc này sai với thực tế dữ liệu:

- File endpoints nhiều sheet nhưng **cấu trúc cột giống nhau trên mọi sheet**, nên việc match theo
  cột Name không phụ thuộc vào sheet nào.
- Phạm vi thực sự cần kiểm tra đã được khai báo ở UC1 rồi: mỗi dòng UC1 là bộ
  `{ permissionColumn, endpointSheet, authProfileName }`. Sheet nào không có dòng UC1 thì không có
  cột quyền nào để đối chiếu — kiểm tra vô nghĩa.
- Chọn một sheet duy nhất ở `targetSheet` khiến người dùng phải chạy nhiều lượt nếu muốn kiểm tra
  nhiều sheet, dù UC1 đã cấu hình đủ.

**Mục tiêu:** bỏ hẳn `usecase2.targetSheet`. UC2 tự động áp dụng cho **mọi sheet endpoints đã được
cấu hình trong UC1**, và trong `evaluatePermission` bước lọc UC1 phải chạy **trước** bước match cột
Name của UC2.

## 2. Thay đổi data model

`public/js/state.js` — `defaultConfig()`:

```javascript
permissionMapping: {
  usecase1: [],
  usecase2: { permissionColumn: '' }   // bo truong targetSheet
}
```

`usecase1` giữ nguyên: mảng `{ permissionColumn, endpointSheet, authProfileName }`.

**Không viết code migration.** Config cũ trong `localStorage` (hoặc file config import) còn khoá
`targetSheet` sẽ được `loadConfig`/`applyConfig` spread vào `state.permissionMapping.usecase2` nhưng
không nơi nào đọc nó nữa, nên vô hại. Đây là lựa chọn có chủ đích: thêm code strip chỉ để dọn một
khoá chết không đáng.

## 3. Thay đổi logic đánh giá quyền

`src/server/http-client.js` — hàm `evaluatePermission({ req, status, permissionFile, permissionMapping })`.

### 3.1 Thứ tự mới

| Bước | Trước | Sau |
|---|---|---|
| 1 | Không có file phân quyền → `null` | giữ nguyên |
| 2 | Gate `targetSheet` vs `req.sheetName` | **xoá** |
| 3 | Match cột Name của UC2 → `matchedRow`; không thấy → `'empty'` | chuyển xuống bước 4 |
| 4 | Lọc `uc1` theo `endpointSheet === req.sheetName`; rỗng → `'empty'` | **chuyển lên bước 3** |
| 5 | exactMatch / anyHasPermission | giữ nguyên |

Nghĩa là: **lọc UC1 trước, match UC2 sau**.

### 3.2 Luồng sau khi đổi

1. `permissionFile` rỗng hoặc không có `filename` → trả `null` (permission check tắt).
2. `sheetMappings = uc1.filter(m => m.endpointSheet === req.sheetName)`.
   Nếu rỗng → trả `'empty'` (sheet này không nằm trong phạm vi UC1, dừng luôn — không cần dò cột Name).
3. Tìm `matchedRow` trong `permissionFile.rows`: giá trị tại cột `uc2.permissionColumn` so sánh bằng
   với `req.endpointName` (trim, lowercase). Không thấy → `'empty'`.
4. Giữ nguyên phần còn lại:
   - `exactMatch` = dòng UC1 có `authProfileName` trùng `req.authName` (trim, lowercase).
     Nếu có: đọc ô tại `exactMatch.permissionColumn`; ô là `'x'` → `status === 200 ? 'true' : 'false'`;
     ô khác `'x'` → `'empty'`.
   - Không có `exactMatch` (profile không được cấp quyền trên sheet này): nếu **bất kỳ** dòng UC1 nào
     của sheet có ô `'x'` tại `matchedRow` → `status === 403 ? 'true' : 'false'`; ngược lại `'empty'`.

### 3.3 Ảnh hưởng hành vi

- Cấu hình cũ `targetSheet: 'all'` (mặc định): kết quả **không đổi** — phạm vi vốn đã do UC1 quyết định
  ở bước lọc phía sau.
- Cấu hình cũ `targetSheet: 'Sheet X'`: nay UC2 chạy trên mọi sheet có mapping UC1, không chỉ Sheet X.
  Đây chính là thay đổi mong muốn.
- Endpoint thuộc sheet không có mapping UC1 vẫn trả `'empty'` như cũ, chỉ khác là thoát sớm hơn.

## 4. Thay đổi UI

### 4.1 `public/index.html`

Xoá cả khối `<label class="field">` chứa dropdown `sel-permissions-target-sheet`
(dòng ~142–147, nhãn "UC2: Sheet endpoints đích").

`.perm-grid` còn 2 ô: "Sheet file phân quyền" và "UC2: Cột Name phân quyền".

`public/css/app.css:133` đang cứng 3 cột:

```css
.perm-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--sp-xs); }
```

Đổi `repeat(3, ...)` → `repeat(2, ...)` để không hở một ô trống.

### 4.2 `public/js/ui/permissions-panel.js`

- Bỏ biến `selTargetSheet` (`getElementById('sel-permissions-target-sheet')`).
- Bỏ listener `selTargetSheet.addEventListener('change', ...)` ghi `usecase2.targetSheet`.
- Bỏ đoạn populate `selTargetSheet` trong `render()` (option `all` + `getUniqueSheets`).
- `getUniqueSheets` vẫn dùng cho dropdown sheet của UC1 → giữ import.

### 4.3 Nhãn giải thích

Đổi nhãn khối UC1 từ `UC1: Mappings Cột ↔ Sheet ↔ Auth Profile` thành
`UC1: Mappings Cột ↔ Sheet ↔ Auth Profile (quyết định sheet nào được kiểm tra)` để người dùng hiểu
phạm vi kiểm tra giờ nằm ở đây, không còn ô chọn riêng.

## 5. Test

Chạy bằng `node --test` (test runner có sẵn của dự án). Không dùng Playwright cho thay đổi này.

### 5.1 `test/http-client.test.js`

- Bỏ `targetSheet: 'all'` khỏi `samplePermissionMapping` (dòng ~255) và khỏi fixture ở dòng ~424.
- Các test hiện có phải xanh nguyên trạng (vì `targetSheet: 'all'` vốn không lọc gì).
- **Thêm test mới:** endpoint có `sheetName` **không** xuất hiện trong `usecase1` nhưng tên **có**
  trong cột Name của file phân quyền → `statusPermission === 'empty'`.
- **Thêm test mới:** hai sheet cùng có mapping UC1 (ví dụ `Sheet 1` và `Sheet 2`), cùng một
  `permissionFile`; request trên `Sheet 2` vẫn được đánh giá `'true'`/`'false'` bình thường — chứng
  minh UC2 không còn bị khoá vào một sheet.

### 5.2 `test/permissions-panel.test.js`

Trong `setup()`:

- Xoá `MockElement('select', 'sel-permissions-target-sheet')` (dòng ~13), khoá tương ứng trong
  `installMockDocument` (dòng ~23) và `selTargetSheet` trong object trả về (dòng ~42).
- Bỏ `targetSheet: 'all'` khỏi `state.permissionMapping` khởi tạo (dòng ~32).

Trong các test:

- Test `'hien thi thông tin khi đă nap file va populate selectors'`: bỏ `selTargetSheet` khỏi
  destructure và xoá assert `selTargetSheet.children.length === 3` (dòng ~63).
- Test `'thay doi usecase 2 selectors cap nhat state'`: bỏ `selTargetSheet` khỏi destructure, xoá hai
  dòng `selTargetSheet.change('SheetA')` + assert `targetSheet` (dòng ~98–99). Test còn lại chỉ kiểm
  `selNameCol.change('User')` → `usecase2.permissionColumn === 'User'`.
- `initPermissionsPanel()` sau khi sửa không được đọc `sel-permissions-target-sheet` nữa; bộ mock DOM
  không còn phần tử này nên nếu code sót lại sẽ ném lỗi ngay — đó chính là bằng chứng UI đã dọn sạch.

### 5.3 `test/state.test.js`

- Cập nhật assert `defaultConfig()` (dòng ~68) thành
  `{ usecase1: [], usecase2: { permissionColumn: '' } }`.
- Test `'load va applyConfig merge safe permissionFile va permissionMapping'` (dòng ~271–299):
  - Bỏ `targetSheet: 'Sheet1'` khỏi input `applyConfig` (dòng ~277) và xoá assert dòng ~285.
  - Xoá assert `usecase2.targetSheet === 'all'` ở nhánh `load()` (dòng ~298).
  - Giữ nguyên phần còn lại: `permissionColumn` phải nhận `'colB'` từ `applyConfig` và `'colC'` từ
    `load()`, `permissionFile.filename` reset về `''` khi config lưu không có nó.

## 6. Phạm vi không đụng tới

- `src/server/request-builder.js`, `worker-pool.js`, `excel-export.js`, `result-table.js`: không đổi.
  `statusPermission` vẫn là `'true' | 'false' | 'empty' | null` như cũ.
- Logic UC1 (exactMatch / fallback 403) giữ nguyên hoàn toàn.
- Không đổi định dạng file phân quyền hay API `/api/import/grid`.
