# Design Spec: khai tường minh "cột nào là role" của file phân quyền

> Thay thế mục `roleColumnIndexes` của `2026-07-31-perm-tab-split-view-design.md` (§ "Nguồn sự thật"
> và § test). Phần còn lại của spec đó giữ nguyên hiệu lực.

## 1. Vấn đề

Bảng phân quyền RAW (pane phải tab CHECK PERMISSION) lấy tập cột role bằng `roleColumns(headers, uc1)`
— suy ngầm từ `permissionColumn` của các dòng UC1. Hệ quả: cột role có trong file nhưng chưa được khai
ở UC1 thì **không xem được giá trị**, và cũng không tham gia bộ lọc `HAS PERMISSIONS YES/NO`.

Ở mode `all` điều này rõ nhất: mode này chạy mọi endpoint của tab All, người dùng muốn đối chiếu toàn
bộ ma trận quyền trong file, nhưng bảng chỉ hiện đúng mấy cột đã gắn auth profile.

**Mục tiêu:** tách khái niệm "cột role" ra khỏi bảng mapping UC1, khai tường minh bằng một multiselect
cột lấy từ file phân quyền.

## 2. Quyết định đã chốt

| Câu hỏi | Chốt |
|---|---|
| Nơi khai | Khối riêng trong panel PHÂN QUYỀN (tab INPUT), **độc lập** bảng UC1 |
| Phạm vi mode | Dùng chung cả hai mode (`all` và `mapping`) |
| Nguồn option | Mọi header của sheet phân quyền đang chọn |
| Mặc định khi chưa khai | Các cột đang khai ở UC1 — config cũ mở lên không đổi hành vi |
| Lọc `HAS PERMISSIONS YES/NO` | Tính trên tập cột role đã khai |
| Chấm điểm `statusPermission` | Không đụng — vẫn theo `uc1.permissionColumn` của auth đang chạy |

## 3. Data model — `public/js/state.js`

```javascript
permissionMapping: {
  mode: 'all',
  roleColumns: null,      // null = chua khai → suy tu UC1; mang = khai tuong minh
  usecase1: [],
  usecase2: { permissionColumn: '', columnSheet: '', endpointColumn: '', dedupeColumn: '' }
}
```

`null` chứ không phải `[]`, vì hai trạng thái này khác nghĩa:

| Giá trị | Nghĩa | Bảng raw |
|---|---|---|
| `null` | Chưa khai bao giờ | Cột role = `roleColumns(headers, uc1)`, y hệt trước |
| `['A', 'B']` | Khai tường minh | Cột role = A, B (bỏ tên không có trong sheet đang chọn) |
| `[]` | Khai rỗng — người dùng bỏ tick hết | Không cột role nào; mọi dòng là NO |

`load()` và `applyConfig()` đã spread `permissionMapping` từ base nên config cũ (không có khoá) tự nhận
`null`. Không cần code migration.

Lưu **tên cột**, không lưu index: đổi sheet của file phân quyền hoặc import lại file có thêm/bớt cột
thì index lệch hết, còn tên thì khớp lại được. Cùng quy ước với `usecase1[].permissionColumn` và
`usecase2.permissionColumn` đang dùng.

## 4. Nguồn sự thật — `public/js/shared/permission-sheet-filter.js`

Thêm một hàm, `roleColumns` cũ giữ nguyên và trở thành nhánh mặc định:

```javascript
// Tap cot role hieu luc cua bang raw. Khai tuong minh thi dung dung danh sach
// do, bo ten da bien mat khoi sheet phan quyen dang chon; chua khai (null) thi
// suy tu UC1 nhu truoc — config cu mo len khong doi mot dong nao.
export function effectiveRoleColumns(headers, uc1, declared) {
  if (!Array.isArray(declared)) return roleColumns(headers, uc1);

  const seen = new Map();
  for (const name of declared) {
    const idx = (headers ?? []).indexOf(name);
    if (idx === -1 || seen.has(idx)) continue;
    seen.set(idx, headers[idx]);
  }
  return [...seen.entries()].sort((a, b) => a[0] - b[0]).map(([index, name]) => ({ index, name }));
}
```

Trả `{index, name}[]` sắp theo thứ tự header và khử trùng — cùng hình dạng `roleColumns` nên mọi consumer
hiện tại dùng lại được không sửa.

`roleColumnIndexes` bị **xoá**. Consumer duy nhất của nó là `permission-sheet-table.js:88`, mà chỗ đó
chuyển sang nhận `{index, name}[]` sẵn từ ngoài (§6) rồi `.map((c) => c.index)` tại chỗ — giữ lại
`roleColumnIndexes` chỉ còn là dead code có test đi kèm. Test của nó chuyển thành test của
`effectiveRoleColumns`.

`rowHasPermission`, `applySheetFilter`, `identifierColumnIndex`, `emptySheetFilter` không đổi.

## 5. UI khai cột — `public/index.html` + `public/js/ui/permissions-panel.js`

Khối mới đặt trong `#permissions-mapping-area`, **trên** khối `.perm-uc1`, hiện ở cả hai mode:

```html
<div class="field perm-role-cols">
  <span class="label">Cột role (quyết định cột nào hiện ở bảng phân quyền và tính HAS PERMISSIONS)</span>
  <div class="col-filter">
    <button id="btn-perm-role-cols" type="button" class="btn btn-secondary btn-sm">Chọn cột ▾</button>
    <ul id="perm-role-cols-popup" class="col-filter-popup" hidden></ul>
  </div>
  <span id="perm-role-cols-count" class="hint mono"></span>
</div>
```

Dùng lại nguyên `.col-filter` / `.col-filter-popup` đã có trong `app.css` (đang phục vụ popup "Cột hiển
thị ▾" của pane raw) — không thêm CSS mới.

Hành vi trong `permissions-panel.js`:

- Popup vẽ lại mỗi lần `render()` (tức mỗi `notify()`), giữ nguyên thuộc tính `hidden` — không tự đóng
  khi state đổi. Một checkbox cho **mỗi header** của sheet phân quyền đang chọn; trạng thái tick lấy từ
  `effectiveRoleColumns(headers, usecase1, roleColumns).map(c => c.name)`. Chưa khai thì đúng các cột
  UC1 được tick sẵn.
- Nhãn đếm `#perm-role-cols-count` cập nhật trong `render()`: `` `${đã tick}/${tổng header} cột` ``.
- Tick hoặc bỏ tick: nếu `roleColumns` đang là `null` thì **materialize trước** — gán mảng tên đang tick
  (tức tập UC1) — rồi mới áp thay đổi của lần bấm này. Sau đó `persist()` + `notify()`.
  Không materialize trước thì lần bấm đầu tiên sẽ mất hết các cột UC1 đang ngầm được tick.
- Đóng/mở popup: cùng cơ chế với `permission-sheet-filter-bar.js` — bấm nút để toggle, click ra ngoài
  thì đóng.

Đổi sheet ở `sel-permissions-file-sheet`: **không** reset `roleColumns`. Tên không có trong headers mới
tự bị `effectiveRoleColumns` bỏ qua, đổi sheet qua lại không mất cấu hình — cùng tinh thần với cột Sheet
của UC1 ở mode `all` (mờ đi nhưng giữ giá trị).

## 6. Bảng raw — `public/js/main.js` + `public/js/ui/permission-sheet-table.js`

`main.js` đổi một dòng, thành nguồn duy nhất cho cả filter bar lẫn bảng:

```javascript
const getEffectiveRoleColumns = () => effectiveRoleColumns(
  state.permissionFile.headers,
  state.permissionMapping.usecase1,
  state.permissionMapping.roleColumns,
);

const permSheetFilterBar = initPermissionSheetFilterBar({
  getRoleColumns: getEffectiveRoleColumns,
  onChange: () => renderPermSheet(),
});
const permSheetTable = initPermissionSheetTable({
  getSheet: () => state.permissionFile,
  getRoleColumns: getEffectiveRoleColumns,   // thay cho getUc1
  getUc2: () => state.permissionMapping.usecase2,
  getFilter: () => permSheetFilterBar.getFilter(),
  getSelectedColumns: () => permSheetFilterBar.getSelectedColumns(),
});
```

`permission-sheet-table.js` bỏ tham số `getUc1` và bỏ hai lời gọi `roleColumns` / `roleColumnIndexes`
tự tính bên trong:

```javascript
const allRoleCols = getRoleColumns();
const roleIdxSet = new Set(allRoleCols.map((c) => c.index));
```

Đây là chỗ sửa quan trọng nhất: hiện tại bảng tự tính lại tập role từ `uc1`, để nguyên thì cột khai
thêm sẽ hiện ra trong danh sách chọn nhưng không được highlight `x` và không tính vào YES/NO.

`getUc2` giữ nguyên — vẫn cần cho `identifierColumnIndex`.

`permission-sheet-filter-bar.js` **không đổi** — nó đã nhận `getRoleColumns` từ ngoài, và cơ chế
"cột mới xuất hiện thì mặc định được tick" áp luôn cho cột role vừa khai thêm.

Quan hệ hai tầng, cố ý tách:

| Tầng | Ở đâu | Trả lời câu gì |
|---|---|---|
| Khai role | Panel PHÂN QUYỀN, tab INPUT | Cột nào của file là quyền — ảnh hưởng cả YES/NO |
| Chọn hiển thị | Nút "Cột hiển thị ▾", pane raw | Trong các cột role đó, đang muốn nhìn cột nào |

## 7. Phạm vi không đụng tới

- `evaluateUc2Permission` và `evaluatePermission` (`src/server/http-client.js`): vẫn đọc
  `usecase1[].permissionColumn` theo auth của request. `roleColumns` thuần hiển thị + lọc bảng raw.
- `permission-scope.js`, `permission-match.js`: phạm vi chạy CHECK PERM không đổi.
- Bảng kết quả CHECK PERM (`permission-table.js`, 8 cột), `permission-filter-logic.js`,
  `excel-export.js`.
- Bảng UC1 mapping: vẫn ba trường Cột ↔ Sheet ↔ Auth như cũ.

## 8. Test

**`test/permission-sheet-filter.test.js`** — `effectiveRoleColumns`:
`null` → bằng đúng `roleColumns(headers, uc1)`; mảng → đúng danh sách khai, sắp theo thứ tự header,
khử trùng khi khai lặp tên; tên không có trong `headers` bị bỏ; `[]` → `[]`.
Bốn test `roleColumnIndexes` hiện có viết lại thành test `effectiveRoleColumns` với `declared = null`
(cùng ca kiểm: theo UC1, bỏ cột không tồn tại, khử trùng, UC1 rỗng).

**`test/permissions-panel.test.js`** — popup liệt kê **mọi** header của sheet đang chọn (không chỉ cột
UC1); chưa khai thì đúng các cột UC1 được tick sẵn; lần chạm đầu hoá `null` thành mảng đầy đủ rồi mới
áp thay đổi (bỏ tick 1 trong 2 cột UC1 → còn lại 1, không phải 0); đổi sheet file phân quyền không xoá
`roleColumns`.

**`test/permission-sheet-table.test.js`** — cột role khai thêm (không có ở UC1) hiện ra trong bảng và ô
`x` được highlight `status-up`; lọc YES/NO tính theo tập khai — dòng chỉ có `x` ở cột khai thêm vẫn là
YES.

**`test/state.test.js`** — config cũ thiếu khoá `roleColumns` → `null` sau `load()` và `applyConfig()`.
