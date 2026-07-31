# Design Spec: CHECK PERM quét mọi sheet endpoints, khử trùng theo cột đích

## 1. Bối cảnh

Spec `2026-07-31-uc2-include-matching-design.md` dựng thuật toán match "include": mỗi dòng trong file
phân quyền kéo về một tập endpoint. Nhưng tập endpoint được quét (`pool`) vẫn bị cắt theo sheet khai
trong UC1:

```javascript
// public/js/shared/permission-match.js:47-49
const filtered = filterEndpoints(
  state?.endpoints, { methods: state?.runFilter?.methods ?? [] }, 'all', '', false,
).filter((e) => sheets.has(e.sheetName ?? 'Sheet 1'));
```

Sheet nào không xuất hiện ở cột `endpointSheet` của UC1 thì mọi endpoint của nó biến mất khỏi mọi
vòng match — dù bảng phân quyền vốn phủ **toàn bộ** endpoint, không phân biệt sheet. Thực tế chạy
thấy thiếu khá nhiều endpoint vì lý do này.

Ràng buộc đó cũng đã hết cơ sở: từ spec include-matching, việc chấm `status_permission` đọc cột quyền
của **dòng UC2** (`evaluateUc2Permission` trong `src/server/http-client.js`), không còn sheet-gating.
`endpointSheet` chỉ còn tác dụng thu hẹp `pool`, tức chỉ còn là bộ lọc.

**Mục tiêu:** mặc định quét mọi endpoint đã import; giữ `endpointSheet` lại làm bộ lọc tùy chọn để
lùi về hành vi cũ khi cần. Nhân tiện bỏ cột khử trùng riêng, dùng chính cột đích làm khóa.

**RUN ALL và tab OUTPUT giữ nguyên hoàn toàn.**

## 2. Quyết định đã chốt

| Câu hỏi | Chốt |
|---|---|
| `endpointSheet` trong UC1 | Giữ, thành **bộ lọc tùy chọn**: trống = mọi sheet, điền = thu hẹp |
| Khóa khử trùng | Chính cột đích — bỏ hẳn `usecase2.dedupeColumn` |
| Endpoint có ô cột đích rỗng / sheet thiếu cột đó | Loại **im lặng**, không toast, không dòng "skip" |
| Endpoints chung (`Common`) | Vẫn ngoài phạm vi, giữ `commonEndpointsEnabled: false` |
| Nguồn sheet cho `uc2.columnSheet` | Mọi sheet đã import, không còn ép ∈ sheet UC1 |

## 3. Thay đổi `public/js/shared/permission-match.js`

### 3.1 Pool quét mọi sheet, lọc theo UC1 chỉ khi được khai

```javascript
const sheets = uc1Sheets(uc1);   // uc1Sheets da .filter(Boolean) — dong trong khong vao Set

const filtered = filterEndpoints(
  state?.endpoints, { methods: state?.runFilter?.methods ?? [] }, 'all', '', false,
);
const scoped = sheets.size === 0
  ? filtered
  : filtered.filter((e) => sheets.has(e.sheetName ?? 'Sheet 1'));
```

`uc1Sheets` (`permission-scope.js:41-43`) đã bỏ giá trị rỗng, nên "mọi dòng UC1 để trống Sheet" tự
cho ra `Set` rỗng — không cần cờ riêng.

Hành vi hỗn hợp: một dòng UC1 khai `Sheet 2`, các dòng còn lại trống → `sheets = {'Sheet 2'}` →
thu hẹp về đúng `Sheet 2`. Có chủ đích: khai một sheet là tín hiệu muốn giới hạn; muốn quét hết thì
để trống hết. Không cộng dồn kiểu "trống nghĩa là thêm mọi sheet" — luật đó khiến một dòng trống lẫn
vào làm bộ lọc mất tác dụng mà không ai thấy.

Tham số cuối `false` của `filterEndpoints` giữ nguyên: endpoints chung không vào pool.

### 3.2 Khử trùng theo cột đích

```javascript
const endpointColumn = uc2.endpointColumn;
if (srcIdx === -1 || !endpointColumn) return [];   // bo dieu kien !dedupeColumn

const pool = scoped
  .map((e) => ({ e, hay: normalizeName(e.raw?.[endpointColumn]) }))
  .filter((it) => it.hay !== '');
```

`taken` đổi khóa từ `it.key` sang `it.hay`. Mọi chỗ đọc `h.key` thành `h.hay`. Phần còn lại của thuật
toán — 4 vòng bớt từ đầu, vòng 0 dùng `Map` exact, `break` khi vòng có kết quả, dòng UC2 đến trước
giữ chỗ — **không đổi một dòng**.

Đánh đổi cần biết: hai endpoint khác method nhưng cùng giá trị cột đích (`GET /x` và `POST /x` cùng
tên chức năng) giờ gộp còn một dòng kết quả. Trước đây tách được nếu cột khử trùng là mã API. Chấp
nhận: một cột ít hơn để cấu hình, và cột đích là thứ quyết định việc match nên dùng nó làm danh tính
là nhất quán.

Endpoint có ô cột đích rỗng — kể cả vì sheet đó không có cột tên như vậy — bị loại tại `.filter` này.
Không đếm, không cảnh báo.

### 3.3 `endpointColumns` — bỏ scope UC1

Hàm `endpointColumns(endpoints, uc1)` hiện union header của riêng sheet UC1. Với pool là mọi sheet,
tham số `uc1` hết ý nghĩa. Đổi chữ ký:

```javascript
export function endpointColumns(endpoints)   // union raw-header cua MOI endpoint, giu thu tu gap dau
```

`endpointColumnsOfSheet(endpoints, sheetName)` giữ nguyên — vẫn là nguồn option cho hai select cột
sau khi chọn sheet tham chiếu.

## 4. Thay đổi data model — `public/js/state.js:49`

```javascript
usecase2: { permissionColumn: '', columnSheet: '', endpointColumn: '' }
```

Bỏ `dedupeColumn`. Không viết code migration: config cũ trong `localStorage` còn khóa này sẽ được
spread vào nhưng không nơi nào đọc, vô hại — cùng lựa chọn đã áp cho `targetSheet` ở spec
`2026-07-30-uc2-permission-scope-by-uc1-design.md` §2.

## 5. Thay đổi `public/js/shared/permission-scope.js`

`validatePermissionScope`:

| Luật hiện có | Đổi |
|---|---|
| `UC1: sheet "Y" không còn endpoint nào` | Chỉ kiểm khi `m.endpointSheet` khác rỗng. Trống là hợp lệ. |
| `scopedRaw.some((e) => !e.raw)` → `Endpoints import từ bản cũ` | Quét **toàn bộ** `state.endpoints`, bỏ `.filter(uc1Sheets…)` |
| `Chưa chọn sheet endpoints tham chiếu (UC2)` | Điều kiện đổi từ `uc1Sheets(uc1).has(columnSheet)` sang `columnSheet` ∈ sheet của `state.endpoints` |
| `Chưa chọn cột đích (UC2), hoặc cột đã biến mất` | Nguồn cột đổi sang `endpointColumns(state.endpoints)` (một tham số) |
| `Chưa chọn cột khử trùng (UC2)` | **Xóa** |
| `Không dòng UC2 nào kéo về được endpoint` | Giữ nguyên |
| Các luật còn lại (file phân quyền, cột Name UC2, UC1 rỗng, cột quyền, auth profile) | Giữ nguyên |

Thông báo `Chưa khai mapping UC1 nào — không biết kiểm sheet nào` sửa lời cho khớp vai trò mới của
UC1: `Chưa khai mapping UC1 nào — không biết cột quyền nào ứng với auth nào`.

`scopedEndpointsAndAuths` và `buildPermissionRunConfig` không đổi: chúng gọi `matchUc2ToEndpoints`
và `uc1AuthNames`, cả hai vẫn giữ chữ ký cũ.

## 6. Thay đổi UI

### 6.1 `public/index.html`

Xóa dòng 155:

```html
<select id="sel-permissions-dedupe-col" class="input input-sm"></select>
```

cùng `<label>` bọc nó. Lưới cột trong khối UC2 giảm một ô — kiểm lại `grid-template-columns` của khối
này trong `public/css/app.css` và giảm số cột tương ứng, đúng cách đã làm ở spec
`2026-07-30-uc2-permission-scope-by-uc1-design.md` §4.1.

### 6.2 `public/js/ui/permissions-panel.js`

- Bỏ `selDedupeCol` (dòng 37), listener `change` ghi `usecase2.dedupeColumn` (dòng 129), và nhánh
  `renderColumnSelect(selDedupeCol, …)` (dòng 191).
- `render()` dòng 175-181: danh sách sheet hợp lệ cho `selEndpointSheet` đổi từ `uc1SheetList` sang
  `getUniqueSheets(state.endpoints)`. Giá trị đang chọn không còn trong danh sách → rơi về phần tử
  đầu, đúng như logic hiện tại.
- Dropdown `endpointSheet` của mỗi dòng UC1 (dòng 224-226) thêm option đầu:
  `<option value="">(mọi sheet)</option>`. Dòng UC1 mới tạo (dòng 103) mặc định `endpointSheet: ''`
  thay vì `getUniqueSheets(state.endpoints)[0] ?? 'Sheet 1'`.
- Nhãn cột Sheet trong bảng UC1 đổi thành `Sheet (trống = mọi sheet)` để người dùng hiểu ô trống là
  lựa chọn có nghĩa, không phải chưa điền.
- Import `endpointColumnsOfSheet` giữ nguyên. Panel không gọi `endpointColumns`; chỗ duy nhất gọi hàm
  đó là `permission-scope.js:99`, đã nói ở §5.

## 7. Phạm vi không đụng tới

- `src/server/http-client.js` — `evaluateUc2Permission` chấm theo `permRowIndex` + cột quyền của dòng
  UC1 khớp `authName`, chưa bao giờ đọc `endpointSheet`. Nhánh RUN ALL (`evaluatePermission`, lọc
  `m.endpointSheet === req.sheetName` ở dòng 92) giữ nguyên tuyệt đối.
- `src/server/request-builder.js`, `runner.js`, `worker-pool.js`, `request-worker.js`, `routes.js`.
- `public/js/ui/permission-table.js` (8 cột), `permission-filter-logic.js`,
  `src/server/excel-export.js` — không cột nào đổi nguồn dữ liệu.
- RUN ALL, tab OUTPUT, `result-table.js`, `filters.js`, `filter-logic.js`, `run-filter.js`.
- Định dạng file phân quyền, `/api/import/grid`.

## 8. Test

Chạy bằng `node --test`. Không dùng Playwright.

**`test/permission-match.test.js` (sửa)**
- Mọi dòng UC1 để `endpointSheet: ''` → endpoint thuộc sheet chưa từng khai trong UC1 vẫn vào pool và
  được dòng UC2 kéo về.
- Ít nhất một dòng UC1 khai sheet → pool thu hẹp đúng union sheet đó; endpoint sheet khác bị loại
  (chứng minh đường backup còn sống).
- Hỗn hợp: một dòng khai `Sheet 2`, một dòng trống → chỉ `Sheet 2` được quét.
- Khử trùng theo cột đích: hai endpoint ở hai sheet khác nhau cùng giá trị cột đích → còn đúng một.
- Hai endpoint khác method cùng giá trị cột đích → còn một (ghi nhận đánh đổi ở §3.2).
- Endpoint có ô cột đích rỗng, hoặc `raw` không chứa cột đích → bị loại, không ném lỗi.
- Cấu hình thiếu `endpointColumn` → trả mảng rỗng. Không còn test nào dựa vào `dedupeColumn`.
- Các test cũ về 4 vòng, bớt từ đầu, dừng ở vòng đầu có kết quả, dòng UC2 đến trước giữ chỗ: **phải
  xanh nguyên trạng** — bằng chứng thuật toán không đổi.
- `endpointColumns`: test hiện có ở dòng 37 (`union header cua endpoint thuoc sheet UC1`) viết lại
  thành union header của **mọi** endpoint, gọi với một tham số.

**`test/permission-scope.test.js` (sửa)**
- `endpointSheet: ''` không sinh lỗi `sheet không còn endpoint nào`; `endpointSheet: 'Sheet lạ'` vẫn sinh.
- Lỗi `Endpoints import từ bản cũ` bắt được endpoint thiếu `raw` ở sheet **ngoài** UC1.
- `columnSheet` là sheet đã import nhưng không có trong UC1 → hợp lệ, không sinh lỗi.
- Không còn lỗi nào về cột khử trùng.
- `buildPermissionRunConfig` vẫn gắn `permName` + `permRowIndex` lên endpoint clone và không mutate
  `state.endpoints`.

**`test/permissions-panel.test.js` (sửa)**
- Bỏ `MockElement` cho `sel-permissions-dedupe-col` và khóa tương ứng trong `installMockDocument`.
  `initPermissionsPanel()` sau khi sửa không được đọc phần tử này nữa — mock DOM thiếu nó sẽ ném lỗi
  ngay nếu code còn sót, đó chính là bằng chứng UI đã dọn sạch.
- `selEndpointSheet` liệt kê mọi sheet đã import, không chỉ sheet UC1.
- Dropdown sheet của dòng UC1 có option `''` và dòng mới tạo mặc định `endpointSheet: ''`.

**`test/state.test.js` (sửa)**
- `defaultConfig().permissionMapping.usecase2` còn đúng ba khóa
  `{ permissionColumn, columnSheet, endpointColumn }`.

**`test/layout.test.js` (sửa)**
- Không còn `#sel-permissions-dedupe-col`.

Ghi chú: `test/layout.test.js:31` (`cot rong co card CONNECTION/BODY CHUNG gop lam mot…`) đang đỏ sẵn
từ trước, không thuộc phạm vi spec này.
