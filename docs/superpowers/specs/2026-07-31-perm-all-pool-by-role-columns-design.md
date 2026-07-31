# Design Spec: mode `all` gom endpoint theo cột role của file phân quyền

> Thay thế § "Thuật toán mode `all`" và § "Khử trùng ở mode `all`" của
> `2026-07-31-perm-scope-all-sheets-design.md`. Phần còn lại của spec đó (radio mode, chấm điểm,
> đường mapping) giữ nguyên hiệu lực.
>
> Thay thế luôn quyết định "cột role suy từ UC1" của
> `2026-07-31-perm-tab-split-view-design.md` § "Nguồn sự thật".

## 1. Vấn đề

Mode `all` lấy pool endpoint từ `state.endpoints` — mọi sheet đã import. Hai cách làm đã thử đều sai:

| Cách | Hỏng ở đâu |
|---|---|
| `allTabEndpoints(state.endpoints)` (khử trùng `METHOD:pathTemplate` trước) | Một API cấp cho 5 tab role chỉ còn 1 request. Mất 4 bản ghi |
| `state.endpoints` thô, không khử trùng | Chạy cả tab không phải role (`Role phân quyền`, …) và chạy lặp cùng một API 5 lần cho cùng một auth |

Cả hai đều suy phạm vi từ dữ liệu có sẵn thay vì để người dùng khai. Kết quả: người dùng không kiểm
chứng được vì sao con số trên nút CHECK PERM ra như vậy.

**Mục tiêu:** người dùng khai tường minh *tab nào là tab role*, bằng cách chọn cột role trong file
phân quyền. Tên cột role khớp tên tab endpoint.

## 2. Quyết định đã chốt

| Câu hỏi | Chốt |
|---|---|
| Phạm vi thay đổi | Chỉ pool chạy của CHECK PERM mode `all`. Bảng ENDPOINTS tab "Tất cả (All)" và RUN ALL không đổi |
| Nguồn tab | Cột role tick ở multiselect, lấy từ sheet phân quyền đang chọn |
| Luật khớp tên cột ↔ tab | Chuẩn hoá (`trim` + `lowercase` + gộp khoảng trắng) rồi so bằng |
| Thứ tự xử lý | gom → lọc method (topbar) → khử trùng |
| Khoá khử trùng | `METHOD + pathTemplate` |
| Checkbox `enabled` của endpoint | **Không áp** |
| Bảng UC1 | Giữ nguyên. Chỉ còn nhiệm vụ cấp cặp cột quyền ↔ auth cho việc chấm điểm |
| Cột role tick nhưng không tab nào trùng tên | Lỗi, chặn CHECK PERM |
| Mặc định khi chưa khai | Tick sẵn mọi cột có tab endpoint trùng tên |
| Cột hiển thị ở bảng phân quyền raw | Cùng tập cột role này — một nguồn sự thật, bỏ nút "Cột hiển thị ▾" ở pane phải |

## 3. Data model — `public/js/state.js`

```javascript
permissionMapping: {
  mode: 'all',
  roleColumns: null,      // null = chua khai -> suy mac dinh; mang = khai tuong minh
  usecase1: [],
  usecase2: { permissionColumn: '', columnSheet: '', endpointColumn: '', dedupeColumn: '' }
}
```

Lưu **tên cột**, không lưu index: đổi sheet của file phân quyền hoặc import lại file có thêm/bớt cột
thì index lệch hết, còn tên thì khớp lại được. Cùng quy ước với `usecase1[].permissionColumn` và
`usecase2.permissionColumn`.

`null` chứ không phải `[]` — hai trạng thái khác nghĩa:

| Giá trị | Nghĩa | Cột role hiệu lực |
|---|---|---|
| `null` | Chưa khai bao giờ | Mọi cột của sheet đang chọn có tab endpoint trùng tên |
| `['Trưởng ca', 'ĐTV đối tác']` | Khai tường minh | Đúng hai cột đó, bỏ tên đã biến mất khỏi sheet đang chọn |
| `[]` | Người dùng bỏ tick hết | Không cột nào — validate chặn |

Suy lười (`null` → tính lúc render) chứ không ghi sẵn mảng vào state khi import: config export từ máy
này mở ở máy khác có bộ tab endpoint khác vẫn tự khớp lại, không mang theo tập cột đã chết.

`load()` và `applyConfig()` đã spread `permissionMapping` từ base nên config cũ (không có khoá) tự
nhận `null`. Không cần code migration.

## 4. Module mới — `public/js/shared/permission-pool.js`

Tách khỏi `permission-match.js` (đang lo việc khớp dòng UC2 ↔ endpoint). Module này trả lời đúng một
câu: **chạy những endpoint nào**.

```javascript
// Chuan hoa ten de so khop cot role voi tab endpoint. Excel hay dinh space
// thua va lech hoa/thuong, so bang tuyet doi thi hut im lang.
const normTab = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

// norm(ten tab) -> ten tab THAT. Tab den truoc giu cho khi hai tab chuan hoa
// ra cung mot ten.
function tabIndex(endpoints) {
  const map = new Map();
  for (const s of getUniqueSheets(endpoints)) {
    if (!map.has(normTab(s))) map.set(normTab(s), s);
  }
  return map;
}

// Tra {index, name}[] — CUNG HINH DANG voi roleColumns() cu cua
// permission-sheet-filter.js, nen permission-sheet-table.js dung lai duoc
// khong sua mot dong render nao.
//   declared == null -> moi cot co tab endpoint trung ten
//   declared la mang -> dung cac ten do, bo ten khong con trong sheet
export function effectiveRoleColumns(headers, declared, endpoints) {
  const tabs = tabIndex(endpoints);
  const out = [];
  (headers ?? []).forEach((name, index) => {
    const keep = Array.isArray(declared) ? declared.includes(name) : tabs.has(normTab(name));
    if (keep) out.push({ index, name });
  });
  return out;
}

// [{ index, name, sheet }] — sheet la ten tab endpoint THAT (giu nguyen
// hoa/thuong cua file endpoints de con loc duoc), null neu khong tab nao trung
// ten. Mo rong effectiveRoleColumns nen moi consumer doc duoc ca hai.
export function roleTabPairs(headers, declared, endpoints) {
  const tabs = tabIndex(endpoints);
  return effectiveRoleColumns(headers, declared, endpoints)
    .map((col) => ({ ...col, sheet: tabs.get(normTab(col.name)) ?? null }));
}

// Pool chay cua mode 'all' — xem thuat toan ben duoi.
export function allModeEndpoints(state) { ... }
```

`effectiveRoleColumns` trả `{index, name}[]` **giữ thứ tự header**, đúng hình dạng mà
`permission-sheet-table.js` đang tiêu thụ. `roleTabPairs` bọc thêm khoá `sheet` vì UI cần hiện "cột
này ứng với tab nào" và validate cần biết cột nào không khớp được tab nào.

Hai hàm này dùng chung ở **cả hai mode**: mode `mapping` cũng gọi `effectiveRoleColumns` để lấy cột
hiển thị bảng raw. Mặc định "cột có tab trùng tên" vì thế cũng áp cho mode `mapping` — chấp nhận
được, vì tên cột role trong file phân quyền và tên tab endpoint vốn cùng một danh mục role.

### Thuật toán `allModeEndpoints`

```javascript
// Buoc 1 — GOM: moi ban ghi thuoc tab da chon. KHONG loc enabled: checkbox do
// thuoc ve RUN ALL, pham vi CHECK PERM do cot role quyet dinh.
const sheets = new Set(roleTabPairs(headers, declared, endpoints).map((p) => p.sheet).filter(Boolean));
const gathered = (state.endpoints ?? []).filter((e) => sheets.has(e.sheetName ?? 'Sheet 1'));

// Buoc 2 — LOC METHOD theo bo loc topbar. Rong = lay tat ca.
const wanted = new Set((state.runFilter?.methods ?? []).map((m) => String(m).toUpperCase()));
const byMethod = wanted.size === 0
  ? gathered
  : gathered.filter((e) => wanted.has(String(e.method || 'GET').toUpperCase()));

// Buoc 3 — KHU TRUNG METHOD:pathTemplate, ban gap dau tien thang.
return dedupeEndpoints(byMethod).unique;
```

Bước 3 dùng lại `dedupeEndpoints()` của `endpoint-dedupe.js` — đúng khoá `METHOD:pathTemplate` cần.
Một nguồn sự thật cho khoá trùng, đổi luật thì bảng tab All và pool đổi cùng nhau.

Thứ tự **gom trước, khử trùng sau** là bắt buộc: khử trùng trước rồi mới cắt theo tab thì bản đại diện
có thể nằm ở tab không được chọn, và cả nhóm biến mất.

### Ghép vào `permission-match.js`

`annotateAllEndpoints(state)` đổi đúng một dòng — pool lấy từ `allModeEndpoints(state)`:

```javascript
const all = allModeEndpoints(state);
```

Phần còn lại (khớp dòng UC2 bằng `hitsForRow`, gán `permName`/`permRowIndex`, endpoint không khớp vẫn
trả về với `permRowIndex: null`) giữ nguyên không đổi một dòng.

## 5. UI — panel PHÂN QUYỀN, tab INPUT

Khối mới, đặt ngay trên `.perm-uc1`, **luôn hiện** ở cả hai mode (mode `mapping` vẫn cần nó để chọn
cột hiển thị bảng raw):

```html
<div class="field perm-role-cols">
  <div class="perm-role-cols-head">
    <span class="label">Cột role (file phân quyền)</span>
    <span id="permissions-role-cols-hint" class="hint"></span>
  </div>
  <ul id="permissions-role-cols" class="role-col-list"></ul>
</div>
```

Danh sách checkbox **hiện thẳng**, không giấu sau dropdown: đây là control quyết định phạm vi chạy,
giấu đi thì người dùng lại không kiểm chứng được con số trên nút CHECK PERM. Mỗi dòng nói luôn cột
ứng với tab nào:

```
[x] Trưởng ca      → tab "Trưởng ca"
[x] ĐTV đối tác    → tab "ĐTV đối tác"
[ ] BE Name        → không có tab endpoint trùng tên
```

Dòng không khớp tab hiện chữ xám; tick vào thì validate chặn với thông báo nêu đúng tên cột đó.

`#permissions-role-cols-hint` đổi lời theo mode:

| Mode | Hint |
|---|---|
| `all` | `gom endpoint từ tab trùng tên, và là cột hiển thị ở bảng phân quyền` |
| `mapping` | `cột hiển thị ở bảng phân quyền` |

Tick/bỏ tick ghi thẳng `state.permissionMapping.roleColumns` (mảng tên, thứ tự header) rồi
`persist()` + `notify()`. Lần tick đầu tiên chuyển `null` → mảng: lấy tập đang hiệu lực rồi thêm/bớt
đúng cột vừa bấm, nên hành vi không nhảy.

Đổi sheet file phân quyền **không** ghi đè `roleColumns` — cùng lý do đã sửa cho
`usecase1[].permissionColumn`: người dùng dò sheet để tìm đúng bảng, ghi đè thì mỗi lần dò là một cấu
hình hỏng. Tên cột không có trong sheet mới đơn giản là không hiệu lực, quay về sheet cũ thì khớp lại.

## 6. UI — pane phải tab CHECK PERMISSION

Bỏ `#btn-perm-col-filter` và `#perm-col-popup` khỏi `index.html`. `.split-head` còn:

```
BẢNG PHÂN QUYỀN   [ ] Có   [x] Không   hiện n/m dòng
```

`permission-sheet-filter-bar.js` bỏ toàn bộ phần cột (`selectedCols`, `knownNames`, `paintPopup`,
listener đóng popup), chỉ còn `getFilter()` và `refreshCount()`.

`permission-sheet-table.js` nhận `getRoleColumns` từ ngoài thay vì tự suy từ UC1:

```javascript
initPermissionSheetTable({
  getSheet: () => state.permissionFile,
  getRoleColumns: () => effectiveRoleColumns(
    state.permissionFile.headers, state.permissionMapping.roleColumns, state.endpoints,
  ),
  getUc2: () => state.permissionMapping.usecase2,
  getFilter: () => permSheetFilterBar.getFilter(),
});
```

`getSelectedColumns` bỏ hẳn — không còn hai tầng lọc cột. `roleColumns(headers, uc1)` và
`roleColumnIndexes` trong `permission-sheet-filter.js` bị **xoá**; consumer duy nhất là bảng này.

Hai hành vi giữ nguyên: cột định danh UC2 luôn đứng đầu và khử trùng theo index với cột role; bộ lọc
`Có/Không` chấm trên **mọi** cột role hiệu lực.

## 7. Validate — `validatePermissionScope`

Mode `mapping` giữ nguyên toàn bộ luật cũ. Mode `all` thay ba luật:

| Luật cũ (mode `all`) | Thành |
|---|---|
| — | `Chưa chọn cột role nào — không biết gom endpoint từ tab nào` khi tập hiệu lực rỗng |
| — | `Cột role "X" không có tab endpoint nào trùng tên` cho từng cột đã tick mà không khớp |
| `Không endpoint nào để chạy — kiểm tra bộ lọc method và cột enabled` | `Không endpoint nào để chạy — kiểm tra cột role đã chọn và bộ lọc method` (bỏ nhắc `enabled`, mode này không đọc) |

Gom lỗi thay vì dừng ở lỗi đầu tiên — giữ đúng cơ chế hiện có.

Luật còn lại (file phân quyền, cột Name UC2, UC1 rỗng, cột quyền UC1, auth profile tồn tại, sheet tham
chiếu UC2, cột đích UC2) áp cho cả hai mode, không đổi.

## 8. Chấm điểm — `src/server/`

**Không đổi một dòng.** `permMode: 'all'` vẫn gắn lên từng endpoint, `evaluateUc2Permission` vẫn chấm
theo `req.permRowIndex` + cột quyền của auth đang chạy lấy từ UC1, endpoint không ghép được dòng nào
vẫn rơi vào nhánh `req.permMode === 'all'` → `'empty'`.

## 9. Hệ quả phải nói rõ trong UI

**Nút "Bỏ chọn tất cả" không ảnh hưởng CHECK PERM.** Nó chỉ đổi RUN ALL. Thu hẹp phạm vi CHECK PERM
bằng cách bỏ tick cột role hoặc dùng bộ lọc method.

**Số trên nút CHECK PERM khác số dòng bảng ENDPOINTS**, cả hai chiều: gom nhiều tab nên nhiều hơn tab
đang xem, nhưng khử trùng nên ít hơn tổng số bản ghi. Thiết kế, không phải lỗi.

**Cột `Role` ở bảng kết quả hiện tab của bản ghi thắng khử trùng**, không phải mọi tab chứa API đó.
Đúng dữ liệu nhưng dễ đọc nhầm — không đổi ở spec này, ghi lại để biết.

## 10. Phạm vi không đụng tới

- `matchUc2ToEndpoints` và toàn bộ đường mapping.
- RUN ALL, `countRequests`, `buildRequests`, tab OUTPUT, `result-table.js`, `filters.js`.
- Bảng ENDPOINTS và tab "Tất cả (All)" — `filterBySheet`/`allTabEndpoints` giữ nguyên vai trò hiển thị.
- `permission-table.js` (8 cột), `permission-filter-logic.js`, `excel-export.js`.
- Định dạng file phân quyền, `/api/import/grid`, `runner.js`, `worker-pool.js`, `routes.js`.

## 11. Test

Chạy bằng `node --test`.

**`test/permission-pool.test.js`** (mới) — khớp tên qua sai khác hoa/thường, space thừa, space kép;
`effectiveRoleColumns` trả `{index, name}[]` theo thứ tự header; `declared` null trả cột có tab trùng
tên và bỏ cột như `BE Name`; `declared` là mảng trả đúng các cột đó; `declared` rỗng trả mảng rỗng;
tên đã biến mất khỏi sheet bị bỏ; `roleTabPairs` trả `sheet` là tên tab thật (giữ hoa/thường của file
endpoints) và `null` cho cột không khớp; `allModeEndpoints` gom đủ mọi tab đã chọn, **không** loại
endpoint `enabled: false`, tôn trọng bộ lọc method, khử trùng `METHOD:pathTemplate` giữ bản đầu tiên,
và `GET /a` với `POST /a` không khử lẫn nhau.

**`test/permission-scope.test.js`** — mode `all`: pool đi qua `allModeEndpoints`; endpoint thuộc tab
không phải role không được chạy; ba luật validate mới ở §7; mode `mapping` không đổi kết quả nào.

**`test/permissions-panel.test.js`** — danh sách cột role render đủ header của sheet đang chọn; cột có
tab trùng tên hiện tên tab, cột không khớp hiện chú thích; mặc định (`roleColumns: null`) tick đúng
các cột khớp tab; tick/bỏ tick ghi mảng vào state; lần tick đầu chuyển `null` → mảng mà không nhảy tập
đang hiệu lực; đổi sheet phân quyền không ghi đè `roleColumns`; hint đổi lời theo mode.

**`test/permission-sheet-table.test.js`** — nhận `getRoleColumns` từ ngoài; bỏ `getSelectedColumns`;
cột định danh UC2 trùng cột role chỉ render một lần (giữ test đã có).

**`test/permission-sheet-filter-bar.test.js`** — xoá nhóm test về popup cột; giữ test
`getFilter`/`refreshCount`.

**`test/state.test.js`** — `defaultConfig().permissionMapping.roleColumns === null`.

**`test/layout.test.js`** — có `#permissions-role-cols`; **không** còn `#btn-perm-col-filter`.

Ghi chú: `test/layout.test.js:31` và `:72` đang đỏ sẵn từ trước (đòi `run-breakdown` đã xoá), không
thuộc phạm vi spec này.
