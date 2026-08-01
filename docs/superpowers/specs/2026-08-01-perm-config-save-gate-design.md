# Design Spec: nút Save cho cấu hình phân quyền, khớp tên theo include

> Bổ sung lên `2026-07-31-perm-single-flow-design.md` (luồng CHECK PERM một đường) và
> `2026-07-31-perm-tab-split-view-design.md` (bảng phân quyền raw). Không thay thế spec nào —
> chỉ chèn thêm một tầng "bản đã lưu" giữa panel cấu hình và mọi thứ tiêu thụ cấu hình đó,
> và nới vòng khớp tên đầu tiên của `hitsForRow` từ exact sang include.

## 1. Vấn đề

### 1.1 Cấu hình có hiệu lực ngay khi đang sửa dở

`permissions-panel.js` gọi `persist()` + `notify()` ngay trong mỗi handler `change`. Mỗi
`notify()` kéo theo `renderPermSheet()` và `refreshCheckPermButton()`. Đổi một mapping UC1 cần
ba thao tác (cột ↔ sheet ↔ auth profile), nghĩa là bảng phân quyền và số đếm trên nút CHECK PERM
vẽ lại **hai lần trên trạng thái nửa vời** trước khi tới trạng thái người dùng thực sự muốn.

Nặng hơn: đổi sheet của file phân quyền (`permissions-panel.js:72-88`) swap luôn
`permissionFile.headers` và `permissionFile.rows`. Cột đang khai ở UC1/UC2 chưa kịp đổi theo,
nên bảng raw hiện ra một tổ hợp không ai chọn — cột của sheet cũ soi vào dòng của sheet mới.

### 1.2 Vòng khớp tên đầu tiên là exact

`permission-match.js:hitsForRow` quét bốn vòng, bớt dần từ **đầu** tên ở file phân quyền. Vòng
`k = 0` tra bảng `exactIndexOf` — khớp **tuyệt đối** cả chuỗi. Chỉ từ `k = 1` mới `includes`.

Hệ quả: file phân quyền ghi `"Tra cứu thông tin thuê bao"`, endpoint ghi
`"API Tra cứu thông tin thuê bao VIP"` → vòng 0 trượt, phải rơi xuống vòng 1 (bỏ chữ `"tra"`)
mới bắt được. Tên nào chỉ khác nhau ở **đuôi** thì thuật toán bớt-từ-đầu không giúp được gì, và
endpoint rơi về `permRowIndex: null` → chấm `empty` dù người đọc nhìn là khớp.

## 2. Quyết định đã chốt

| Câu hỏi | Chốt |
|---|---|
| Cơ chế | Snapshot `state.savedConfig`. Draft vẫn `persist()` mỗi lần gõ; consumer đọc snapshot |
| Số nút Save | **Một**, đặt trong panel PHÂN QUYỀN |
| Trong gate | `permissionMapping` (UC1 + ba select UC2), `runFilter.methods`, sheet của file phân quyền |
| Ngoài gate | `importTemplate` (drawer TEMPLATE MAP CỘT) — giữ auto-save như cũ |
| Checkbox method | Lọc **ngay** danh sách ENDPOINTS đang xem; phạm vi CHECK PERM chỉ đổi sau Save |
| Phạm vi filter với CHECK PERM | Áp cho **mọi sheet** khai ở UC1, không giới hạn tab đang xem |
| Chiều include | Giá trị cột đích của endpoint **CHỨA** tên ở file phân quyền |
| Vòng bớt-từ-đầu | **Giữ** — include ở `k = 0`, không ra kết quả thì bớt dần như cũ |
| Ưu tiên khi nhiều dòng cùng với tới | Giữ nguyên: dòng đến trước giữ chỗ |
| `matchPermissionRow` / `matchPermissionName` | **Không đổi** — đó là đường RUN ALL |

## 3. Data model — `public/js/state.js`

### 3.1 Khoá mới

```js
// defaultConfig()
savedConfig: {
  permissionMapping: { usecase1: [], usecase2: { permissionColumn: '', columnSheet: '', endpointColumn: '' } },
  methods: [],
  permissionSheet: ''
}
```

Chỉ `methods`, không phải cả `runFilter`. `authIds` bị `auths-panel.js:79` sửa mỗi khi xoá một auth
profile — để trong gate thì badge "chưa lưu" bật oan, và Huỷ sẽ xoá mất lựa chọn auth profile của
người dùng. `matchPermissionEndpoints` chỉ đọc `methods`; `buildPermissionRunConfig` tự dựng lại
`authIds` từ union UC1; `msisdnPatterns` chỉ dùng cho `filterMsisdns` ngoài gate.

`state.permissionMapping`, `state.runFilter` và sheet đang chọn của file phân quyền giữ nguyên
vai trò **bản nháp**. Vẫn `persist()` mỗi lần đổi, nên reload không mất công gõ dở.

### 3.2 `permissionFile` bỏ hai khoá phái sinh

```js
// trước
permissionFile: { filename, sheets, selectedSheet, headers, rows }
// sau
permissionFile: { filename, sheets, selectedSheet }
```

`headers`/`rows` là bản sao của `sheets[i]` — giữ lại thì mỗi lần đổi sheet phải đồng bộ ba chỗ,
và không có cách nào giữ bản nháp mà không đụng bản đã lưu. Mọi nơi cần dữ liệu sheet gọi hàm
chung:

```js
// state.js
export function sheetByName(name) {
  const sheets = state.permissionFile?.sheets ?? [];
  return sheets.find((s) => s.name === name) ?? null;
}
export const savedSheet  = () => sheetByName(state.savedConfig.permissionSheet);
export const savedMapping = () => state.savedConfig.permissionMapping;
```

`savedSheet()` trả `null` khi sheet đã lưu không còn trong file — hợp lệ, xem §6.

Server (`src/server/http-client.js:61,64,104`) vẫn đọc `permissionFile.headers` / `.rows` — không
sửa gì bên đó. Client phải **làm phẳng** trước khi gửi:

```js
// permission-scope.js
export function savedPermissionPayload() {
  const sheet = savedSheet();
  return {
    permissionFile: {
      filename: state.permissionFile?.filename ?? '',
      headers: sheet?.headers ?? [],
      rows: sheet?.rows ?? []
    },
    permissionMapping: savedMapping()
  };
}
```

Cả hai đường chạy gửi payload này:

| Call site | Trước | Sau |
|---|---|---|
| `main.js:274` (RUN ALL) | `startRun(state)` | `startRun({ ...state, ...savedPermissionPayload() })` |
| `permission-scope.js:144` (CHECK PERM) | `{ ...state, endpoints, auths, … }` | `{ ...state, ...savedPermissionPayload(), endpoints, auths, … }` |

RUN ALL chấm điểm bằng nhánh `permRun` falsy của `evaluatePermission` — nhánh đó đọc
`permissionMapping.usecase1` và `permissionFile.headers`. Trước spec này nó dùng bản nháp; sau spec
này dùng bản đã lưu, nhất quán với bảng phân quyền và CHECK PERM. Đây là thay đổi hành vi có chủ
đích, không phải tác dụng phụ.

### 3.3 API commit / revert

```js
function snapshot() {
  return structuredClone({
    permissionMapping: state.permissionMapping,
    methods: state.runFilter?.methods ?? [],
    permissionSheet: state.permissionFile?.selectedSheet ?? ''
  });
}

export function saveConfig() {
  state.savedConfig = snapshot();
  persist();
  notify();
}

export function revertConfig() {
  const s = structuredClone(state.savedConfig ?? emptySavedConfig());
  state.permissionMapping = s.permissionMapping;
  // Gan rieng 'methods' — authIds/msisdnPatterns khong thuoc gate
  if (state.runFilter) state.runFilter.methods = s.methods;
  if (state.permissionFile) state.permissionFile.selectedSheet = s.permissionSheet;
  persist();
  notify();
}

export function isConfigDirty() {
  return JSON.stringify(snapshot()) !== JSON.stringify(state.savedConfig);
}

// Nhãn cho badge — người dùng biết đang treo cái gì
export function dirtyParts() {
  const cur = snapshot(); const sav = state.savedConfig;
  const out = [];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (!same(cur.permissionMapping, sav.permissionMapping)) out.push('mapping UC1/UC2');
  if (!same(cur.methods, sav.methods)) out.push('filter method');
  if (cur.permissionSheet !== sav.permissionSheet) out.push('sheet phân quyền');
  return out;
}
```

`structuredClone` có sẵn ở Node ≥ 17 và mọi trình duyệt hiện đại. Repo chạy `node:test`, không cần
polyfill.

### 3.4 Migration trong `load()` và `applyConfig()`

Config đã lưu từ bản cũ không có `savedConfig`. Sau khi `Object.assign` xong:

```js
if (!saved.savedConfig) state.savedConfig = snapshot();
```

Người dùng cũ mở lên thấy y hệt trước: bản nháp và bản đã lưu trùng nhau, badge tắt.

Bản cũ còn có `permissionFile.headers/rows`. `load()` bỏ qua hai khoá đó; sheet đọc từ
`permissionFile.sheets` theo `selectedSheet`. File nhập bằng bản rất cũ chỉ có `headers`/`rows`
mà không có `sheets` → dựng một sheet giả:

```js
const pf = state.permissionFile;
if (pf?.filename && (pf.sheets ?? []).length === 0 && Array.isArray(saved.permissionFile?.headers)) {
  pf.sheets = [{ name: 'Default', headers: saved.permissionFile.headers, rows: saved.permissionFile.rows ?? [] }];
  pf.selectedSheet = 'Default';
}
delete pf.headers; delete pf.rows;
```

## 4. Đổi nguồn đọc

| File:dòng | Trước | Sau |
|---|---|---|
| `main.js:143` | `getSheet: () => state.permissionFile` | `getSheet: () => ({ filename: state.permissionFile.filename, missing: savedSheet() === null, ...(savedSheet() ?? {}) })` |
| `main.js:144` | `roleColumns(state.permissionFile.headers, state.permissionMapping.usecase1)` | `roleColumns(savedSheet()?.headers, savedMapping().usecase1)` |
| `main.js:145` | `getUc2: () => state.permissionMapping.usecase2` | `getUc2: () => savedMapping().usecase2` |
| `permission-match.js:69-76` | `state.permissionMapping`, `state.permissionFile.headers/rows`, `state.runFilter.methods` | `savedMapping()`, `savedSheet()`, `state.savedConfig.methods` |
| `permission-scope.js:57` (`validatePermissionScope`) | `state.permissionMapping`, `permissionFile.headers` | bản đã lưu |
| `permission-scope.js:122` (`scopedEndpointsAndAuths`) | `state.permissionMapping` | `savedMapping()` |
| `permission-scope.js:140` (`buildPermissionRunConfig`) | trải `...state` | trải `...state`, **đè** `permissionMapping: savedMapping()` và `permissionFile: { ...filename, ...savedSheet() }` |

`buildPermissionRunConfig` là chỗ dễ sót nhất. Server chấm điểm bằng
`evaluateUc2Permission` → đọc `permissionMapping.usecase1` để tìm cột role theo auth profile.
Gửi bản nháp lên thì cột chấm điểm lệch với cột đang hiện trên bảng — sai âm thầm, không có gì báo.

`endpoint-list.js:255` (`state.importTemplate`) **không đổi** — template map cột nằm ngoài gate.

### 4.0 Panel cấu hình đọc sheet NHÁP, không đọc sheet đã lưu

`permissions-panel.js` là chỗ duy nhất cố tình đọc bản nháp — nó *là* giao diện sửa bản nháp. Ba
chỗ đang đọc `state.permissionFile.headers` (khoá bị bỏ ở §3.2) đổi sang sheet nháp:

```js
const draftHeaders = () => sheetByName(state.permissionFile?.selectedSheet)?.headers ?? [];
```

| Vị trí | Trước | Sau |
|---|---|---|
| `permissions-panel.js:92` (`btnAddMapping`) | `state.permissionFile.headers[0] ?? ''` | `draftHeaders()[0] ?? ''` |
| `permissions-panel.js:141` (select cột Name UC2) | `state.permissionFile.headers` | `draftHeaders()` |
| `permissions-panel.js:180` (select cột trong hàng UC1) | `state.permissionFile.headers` | `draftHeaders()` |

Đổi sheet ở dropdown làm danh sách cột trong panel đổi ngay — người dùng phải thấy cột của sheet
mình đang dò. Chỉ **bảng raw** và **CHECK PERM** mới đứng yên tới khi Save.

### 4.1 Luồng bảng phân quyền raw

```
savedConfig.permissionSheet ──> sheetByName() ──> { headers, rows }
                                                     │
savedConfig.permissionMapping                        │
  ├─ usecase2.permissionColumn ─> identifierColumnIndex(headers, uc2) ─> cột định danh (cột đầu)
  └─ usecase1[].permissionColumn > roleColumns(headers, uc1) ─────────> các cột role
                                                                          ô === 'x' → .status-up
```

`permission-sheet-filter.js` **không sửa dòng nào**. `permission-sheet-table.js` chỉ thêm **một
nhánh** trước nhánh `displayCols.length === 0` hiện có:

```js
if (sheet.missing) {
  tbody.replaceChildren(emptyRow(
    'Sheet đã lưu không còn trong file phân quyền — chọn sheet khác rồi bấm Lưu.',
  ));
  return { shown: 0, total: 0 };
}
```

Không có nhánh này thì `savedSheet() === null` rơi vào thông báo "Sheet này không có cột nào đang
khai ở UC1/UC2" — sai nguyên nhân, người dùng đi sửa mapping trong khi lỗi nằm ở sheet.

Ngoài ra: cột role suy từ UC1, cột định danh từ UC2, giá trị `x` đọc thẳng ô — không đổi.

## 5. UI

### 5.1 `permissions-panel.js`

Hàng action mới, cuối `#permissions-mapping-area`:

```html
<div class="perm-save-row">
  <span id="perm-dirty-badge" class="hint" hidden>⚠ Chưa lưu: <span data-parts></span></span>
  <button id="btn-permissions-save" type="button" class="btn btn-primary btn-sm">💾 Lưu cấu hình</button>
  <button id="btn-permissions-revert" type="button" class="btn btn-secondary btn-sm">↩ Huỷ</button>
  <div id="perm-save-errors" class="hint" hidden></div>
</div>
```

- Lưu / Huỷ `disabled` khi `!isConfigDirty()`.
- Lưu → `saveConfig()`, rồi chạy `validatePermissionScope(state)` và in kết quả vào
  `#perm-save-errors`. Lỗi **không chặn** Save — validate là việc của nút CHECK PERM.
- Huỷ → `revertConfig()`.

Mọi handler `change` hiện có **bỏ `notify()`**, chỉ còn `persist()` + `refreshDirty()`:

| Handler | Trước | Sau |
|---|---|---|
| `selFileSheet` change | `persist(); notify();` | `persist(); refreshDirty();` |
| `selNameCol` / `selEndpointSheet` / `selEndpointCol` change | `persist(); notify();` | `persist(); render();` |
| `btnAddMapping` click | `persist(); notify();` | `persist(); render();` |
| nút `✕` xoá mapping UC1 | `persist(); notify();` | `persist(); render();` |
| ba select trong hàng UC1 | `persist();` | `persist(); render();` |

Ba select UC2 và các select UC1 vẫn cần vẽ lại **trong panel** (đổi `columnSheet` làm đổi danh sách
cột đích; thêm/xoá UC1 làm đổi danh sách sheet tham chiếu), nên gọi `render()` cục bộ thay vì
`notify()` toàn cục. `notify()` là thứ kéo `renderPermSheet()` chạy theo bản nháp — đúng cái phải chặn.

`btnImport` (nạp file phân quyền mới) vẫn `notify()`: file mới làm đổi cả danh sách sheet lẫn
`permissionFile.filename` mà bảng raw đang hiển thị.

### 5.2 `method-filter.js`

Không đổi cấu trúc, vẫn `persist()` + `notify()` — danh sách ENDPOINTS phải lọc ngay. `notify()`
giờ không kéo được bảng phân quyền theo bản nháp nữa vì bảng đó đọc `savedConfig`.

Không thêm badge riêng ở đây; badge trong panel PHÂN QUYỀN đã liệt kê `filter method` qua
`dirtyParts()`.

### 5.3 Trạng thái lệch có chủ đích

Khi `runFilter` bẩn: danh sách ENDPOINTS đã lọc theo checkbox mới, nhưng số trên nút CHECK PERM
vẫn là số của bản đã lưu. Đây là hành vi đã chốt (A1), không phải bug. Badge `⚠ Chưa lưu: filter
method` là thứ giải thích cho người dùng.

## 6. Xử lý lỗi

| Tình huống | Xử lý |
|---|---|
| Save khi mapping chưa hợp lệ | Cho Save. In lỗi `validatePermissionScope` dưới nút, không chặn |
| `savedSheet()` trả `null` (sheet đã lưu không còn trong file) | Bảng raw hiện `'Sheet đã lưu không còn trong file phân quyền — chọn sheet khác rồi bấm Lưu.'`; `matchPermissionEndpoints` trả mọi endpoint với `permRowIndex: null`; `validatePermissionScope` thêm lỗi tương ứng |
| Import file phân quyền mới | Đặt **bản nháp** `selectedSheet = sheets[0].name`, **không** gọi `saveConfig()`. Badge bật, người dùng chủ động lưu |
| Config cũ không có `savedConfig` | `load()` snapshot từ giá trị đang có — coi như đã Save |
| Config cũ chỉ có `permissionFile.headers/rows` | Dựng sheet `'Default'` (§3.4) |
| `revertConfig()` | `structuredClone(savedConfig)` ghi đè draft, `persist()` + `notify()` |

## 7. Khớp tên theo include — `public/js/shared/permission-match.js`

```js
// Mot vong quet cua thuat toan include: bot tu DAU tu khoa, toi da 4 vong,
// dung o vong dau tien co ket qua. Gia tri cot dich cua endpoint phai CHUA
// ten o file phan quyen — khong phai nguoc lai.
function hitsForRow(rowText, pool) {
  const words = normalizeName(rowText).split(' ').filter(Boolean);

  for (let k = 0; k < 4 && k < words.length; k += 1) {
    const needle = words.slice(k).join(' ');
    const hits = pool.filter((it) => it.hay.includes(needle));
    if (hits.length > 0) return hits;
  }
  return [];
}
```

Xoá `exactIndexOf()` và tham số `exact`. Call site thành `hitsForRow(row[srcIdx], pool)`.

Ví dụ — file phân quyền ghi `"Tra cứu thông tin thuê bao"`:

| Giá trị cột đích của endpoint | Trước | Sau |
|---|---|---|
| `Tra cứu thông tin thuê bao` | khớp (vòng 0, exact) | khớp (vòng 0, include) |
| `API Tra cứu thông tin thuê bao VIP` | khớp (vòng 1, bỏ `tra`) | khớp (vòng 0) |
| `Tra cứu thông tin thuê bao — bản mở rộng` | khớp (vòng 1) | khớp (vòng 0) |
| `Tra cứu thông tin` | không | không |
| `Thông tin thuê bao` | khớp (vòng 2) | khớp (vòng 2) |

### 7.1 Hệ quả về thứ tự dòng

Vòng 0 lỏng hơn trước, nên thứ tự dòng trong file phân quyền có trọng lượng hơn. Dòng đến trước
vẫn giữ chỗ (`taken`): một dòng tên ngắn nằm trên có thể ôm mất endpoint mà dòng tên dài hơn bên
dưới đáng ra khớp sát hơn.

Giữ nguyên quy tắc này. Đổi sang "khớp dài nhất thắng" là thay đổi hành vi khác, không nằm trong
phạm vi spec này.

### 7.2 Rò rỉ cần vá — `src/server/http-client.js:148`

```js
// truoc — sai
const permissionMatchedName = req.permName ?? (permissionFile?.filename
  ? matchPermissionName(req.endpointName, permissionFile, permissionMapping?.usecase2 ?? {})
  : null);
```

CHECK PERM đặt `permName: null` cho endpoint không dòng nào với tới. Toán tử `??` rơi xuống
`matchPermissionName` — hàm khớp **exact**, thuộc đường RUN ALL. Endpoint mà include cố tình bỏ
vẫn hiện tên trong cột UC2 name, mâu thuẫn với `statusPermission: 'empty'` ngay cạnh.

```js
// sau
const permissionMatchedName = req.permRun
  ? (req.permName ?? null)
  : (permissionFile?.filename
    ? matchPermissionName(req.endpointName, permissionFile, permissionMapping?.usecase2 ?? {})
    : null);
```

`matchPermissionRow` / `matchPermissionName` / `permissionNameIndex` trong `permission-scope.js`
giữ nguyên exact — chúng phục vụ nhánh RUN ALL (`req.permRun` falsy), không nằm trong yêu cầu này.

## 8. Test

| File | Thêm |
|---|---|
| `test/state.test.js` | `saveConfig` snapshot đúng ba mảnh; `revertConfig` khôi phục draft; `isConfigDirty` bật/tắt; `dirtyParts` liệt kê đúng; migration config cũ (không `savedConfig`, chỉ `headers`/`rows`) |
| `test/permission-match.test.js` | endpoint chứa tên phân quyền → khớp ở vòng 0; ngược chiều (tên phân quyền chứa endpoint) → **không** khớp; fallback bớt-từ-đầu vẫn chạy; dòng đến trước giữ chỗ; đọc `savedConfig` chứ không phải draft |
| `test/permission-sheet-table.test.js` | bảng đọc sheet + cột của `savedConfig`; sửa draft không làm đổi cột/`x`; `savedSheet()` null → hiện thông báo sheet biến mất |
| `test/permission-scope.test.js` | `buildPermissionRunConfig` gửi `permissionMapping` **đã lưu**; `savedPermissionPayload` làm phẳng `headers`/`rows` từ sheet đã lưu, trả mảng rỗng khi sheet biến mất; `validatePermissionScope` chấm trên bản đã lưu |
| `test/permissions-panel.test.js` | Lưu/Huỷ disable khi sạch; đổi select bật badge; Huỷ khôi phục select; Save không bị chặn bởi lỗi validate; đổi sheet làm đổi **ngay** danh sách cột trong panel nhưng không đổi bảng raw |
| `test/http-client.test.js` | `permRun: true` + `permName: null` → `permissionMatchedName` là `null`, không rơi về exact |
| `test/run-filter.test.js` | không đổi — `filterEndpoints` vẫn đọc `state.runFilter` bản nháp cho danh sách ENDPOINTS |

Thêm ở `test/runner.test.js` hoặc `test/request-count.test.js`: RUN ALL gửi `permissionFile` đã làm
phẳng — không còn phụ thuộc `state.permissionFile.headers`.

## 9. Không nằm trong phạm vi

- **Thuật toán** chấm điểm của RUN ALL: `evaluatePermission` nhánh `permRun` falsy giữ nguyên, kể cả
  `matchPermissionRow` khớp exact. Chỉ **nguồn cấu hình** của nhánh đó đổi sang bản đã lưu (§3.2).
- `importTemplate` / drawer TEMPLATE MAP CỘT: giữ auto-save.
- Đổi quy tắc ưu tiên khi nhiều dòng UC2 cùng với tới một endpoint.
- Khử trùng endpoint (`METHOD:pathTemplate`) — không đụng.
