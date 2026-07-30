# Design Spec: Nút CHECK PERM và tab CHECK PERMISSION

## 1. Bối cảnh và mục tiêu

Tính năng phân quyền hiện chỉ sống nhờ RUN ALL: người dùng chạy như bình thường rồi đọc cột
`Status Permission` trong tab OUTPUT. Cách đó không kiểm được ma trận quyền, vì phạm vi chạy của
RUN ALL do tab sheet đang mở và bộ lọc auth quyết định — hoàn toàn không biết gì về
`permissionMapping`:

- `filterEndpoints` (`public/js/shared/run-filter.js:47-68`) cắt theo `state.selectedSheet`, nên
  đứng ở một tab thì các sheet khác có mapping UC1 không bao giờ được gửi request.
- `selectedAuths` (`run-filter.js:76-83`) chỉ lấy profile được tick ở filter bar. Thiếu profile được
  cấp quyền thì không có dòng nào chứng minh nhánh 200; thiếu profile không được cấp thì nhánh kỳ
  vọng 403 (`src/server/http-client.js:93-101`) không bao giờ chạy.
- Endpoint không có tên trong cột Name của file phân quyền vẫn được gửi đi và luôn trả `'empty'` —
  rác trong bảng kết quả.

**Mục tiêu:** thêm một đường chạy thứ hai chuyên cho việc kiểm quyền, hoàn toàn tách khỏi RUN ALL:

- Nút **CHECK PERM** trên topbar, cạnh RUN ALL.
- Tab **CHECK PERMISSION** cạnh OUTPUT, bảng 7 cột riêng, có filter theo từng cột kết hợp đồng thời,
  có nút xuất Excel riêng.
- Phạm vi chạy suy ra từ `permissionMapping`: mọi sheet khai trong UC1, mọi auth profile khai trong
  UC1, chỉ những endpoint có tên khớp cột Name của UC2.

**RUN ALL và tab OUTPUT giữ nguyên hoàn toàn.** Không sửa một dòng nào trong đường chạy của chúng.

Cơ chế chấm `status_permission` không đổi, vẫn đúng `require.md` dòng 7-10 và spec
`2026-07-30-uc2-permission-scope-by-uc1-design.md`.

## 2. Quyết định thiết kế đã chốt

| Câu hỏi | Chốt |
|---|---|
| Phạm vi sheet | Mọi sheet có mapping UC1, bỏ qua tab sheet đang mở |
| Phạm vi auth | Union `authProfileName` của **mọi** dòng UC1, không phải subset theo từng sheet |
| Endpoint không khớp cột Name UC2 | Loại trước khi gửi request |
| MSISDN | Chỉ 1 số đầu tiên sau khi lọc pattern |
| Bộ lọc hiện có (`enabled`, method filter) | Vẫn áp dụng, chạy trước bước lọc mapping |
| Endpoints chung | Loại (`sheetName: 'Common'` không bao giờ khớp UC1) |
| Khóa auth trong UC1 | Giữ `authProfileName` dạng chuỗi, thêm validate chặn khi tên không còn tồn tại |
| Kiến trúc thực thi | Client dựng config phái sinh, gọi lại `POST /api/run` và SSE có sẵn |

Lý do union toàn bộ dòng UC1 thay vì subset theo sheet: profile `cskh` chỉ được cấp ở `Sheet 2` vẫn
phải chạy trên `Sheet 1` để rơi vào nhánh kỳ vọng 403. Lấy subset theo từng sheet thì mọi request
đều có `exactMatch` và nhánh 403 chết.

## 3. Module mới `public/js/shared/permission-scope.js`

Đặt trong `public/js/shared/` để cả server import lại được, đúng cách `request-builder.js:3-7` đang
import `run-filter.js`. Quy tắc so khớp tên phải là một nguồn sự thật duy nhất: client dùng nó để
lọc, server dùng nó để chấm điểm — hai bản sao sẽ lệch nhau ở chỗ trim/lowercase.

```javascript
export const normalizeName = (s) => String(s ?? '').trim().toLowerCase();

// Vi tri cot Name cua UC2 trong headers, -1 neu chua cau hinh hoac cot da bien mat.
export function permissionNameIndex(permissionFile, uc2)

// Dong dau tien trong permissionFile.rows co o tai cot Name trung ten endpoint.
export function matchPermissionRow(endpointName, permissionFile, uc2)   // → row | null

// Gia tri goc trong file (giu nguyen hoa/thuong cua file, khong phai cua endpoint).
export function matchPermissionName(endpointName, permissionFile, uc2)  // → string | null

export function uc1Sheets(uc1)      // → Set<string> ten sheet
export function uc1AuthNames(uc1)   // → Set<string> ten profile da normalize, union moi dong

export function validatePermissionScope(state)     // → string[]
export function buildPermissionRunConfig(state)    // → { config, endpointCount, authCount, total }
```

`matchPermissionName` trả **giá trị gốc trong file phân quyền**, không phải `endpoint.name`. Hai
chuỗi này khớp nhau theo nghĩa đã normalize nhưng có thể khác hoa/thường hoặc khoảng trắng; cột hiển
thị phải là bản của file phân quyền vì đó mới là "record name của usecase 2".

### 3.1 `buildPermissionRunConfig(state)`

```javascript
const uc1 = state.permissionMapping?.usecase1 ?? [];
const uc2 = state.permissionMapping?.usecase2 ?? {};
const sheets = uc1Sheets(uc1);
const authNames = uc1AuthNames(uc1);

// Buoc 1 — bo loc san co. Truyen 'all' de bo qua tab sheet dang mo, va tat
// endpoints chung vi sheetName 'Common' khong bao gio co mapping UC1.
const filtered = filterEndpoints(state.endpoints, { methods: state.runFilter?.methods ?? [] }, 'all', '', false);

// Buoc 2 — loc theo mapping UC1 roi UC2.
const endpoints = filtered.filter((e) => (
  sheets.has(e.sheetName ?? 'Sheet 1')
  && matchPermissionName(e.name, state.permissionFile, uc2) !== null
));

const auths = (state.auths ?? []).filter((a) => authNames.has(normalizeName(a.name)));
const msisdns = filterMsisdns(state.msisdns, state.runFilter).slice(0, 1);

const config = {
  ...state,
  endpoints,
  auths,
  msisdns,
  selectedSheet: 'all',
  commonEndpointsEnabled: false,
  runFilter: { methods: [], msisdnPatterns: [], authIds: auths.map((a) => a.id) },
};
```

`runFilter.methods` để rỗng vì `endpoints` đã lọc xong — để nguyên sẽ lọc hai lần, vô hại nhưng thừa.
`authIds` phải liệt kê đủ id: `selectedAuths` trả rỗng khi `authIds` rỗng và số profile > 1
(`run-filter.js:80-82`).

`total = auths.length × Σ(endpoint.attachMsisdn !== false ? msisdns.length : 1)` — dùng lại
`countRequests` với config phái sinh thay vì tự nhân, tránh lệch với cách server đếm.

Server nhận về một config đã thu hẹp sẵn và không biết gì về "chế độ permission". Nhờ vậy
`validateConfig`, `buildRequests`, `runner`, `worker-pool` không sửa dòng nào.

### 3.2 `validatePermissionScope(state)`

Chặn trước khi gửi request, gom toàn bộ lỗi thay vì dừng ở lỗi đầu. Đây cũng là chỗ xử lý lệch khóa
`authProfileName` (UC1 lưu tên, `runFilter` lưu id — đổi tên profile ở tab AUTHS làm `exactMatch`
trong `http-client.js:80` trượt âm thầm và mọi request rơi vào nhánh 403 sai).

| Điều kiện | Thông báo |
|---|---|
| `permissionFile.filename` rỗng | `Chưa nạp file phân quyền` |
| `usecase2.permissionColumn` rỗng hoặc ∉ `headers` | `Chưa chọn cột Name (UC2), hoặc cột đã biến mất khỏi sheet đang chọn` |
| `usecase1` rỗng | `Chưa khai mapping UC1 nào — không biết kiểm sheet nào` |
| `m.permissionColumn` ∉ `headers` | `UC1: cột "X" không có trong sheet phân quyền đang chọn` |
| `m.endpointSheet` ∉ sheet của `state.endpoints` | `UC1: sheet "Y" không còn endpoint nào` |
| `m.authProfileName` ∉ tên profile hiện có | `UC1: auth profile "Z" không tồn tại — đã đổi tên?` |
| Sau lọc: 0 endpoint | `Không endpoint nào khớp cột Name của file phân quyền` |
| Sau lọc: 0 auth | `Không auth profile nào trong UC1 còn tồn tại` |

Có lỗi → không chạy, hiện toast lỗi nhiều dòng và chuyển về tab INPUT (giống nhánh catch của RUN ALL
tại `main.js:223-229`).

## 4. Thay đổi phía server

Đúng một việc: bổ sung `permissionMatchedName` vào bản ghi kết quả.

`src/server/http-client.js`:

- `evaluatePermission` bỏ vòng `rows.find` nội bộ (dòng 70-73), gọi `matchPermissionRow` từ module
  shared. Chữ ký và giá trị trả về (`'true' | 'false' | 'empty' | null`) giữ nguyên.
- `finalize` thêm `permissionMatchedName: matchPermissionName(req.endpointName, permissionFile, uc2)`
  vào bản ghi, ngay cạnh `statusPermission` (dòng 144).

Chấp nhận quét `rows` hai lần cho mỗi request (một lần chấm điểm, một lần lấy tên). File phân quyền
cỡ vài trăm dòng, chi phí này không đáng kể so với một vòng network, và đổi lại `evaluatePermission`
giữ nguyên chữ ký nên không phải sửa lan sang `worker-pool`/`request-worker`.

`sheetName` (cột Role) và `authName` (cột Auth) đã có sẵn trong bản ghi (`http-client.js:121-123`).

## 5. Thay đổi UI

### 5.1 `public/index.html`

Trong `.tabs-left`, sau tab OUTPUT:

```html
<button id="tab-perm" class="tab" role="tab" aria-controls="panel-perm" aria-selected="false" tabindex="-1">
  CHECK PERMISSION <span id="tab-perm-badge" class="tab-badge" hidden>0</span>
</button>
```

Trong `.topbar-right`, ngay sau `#btn-run`:

```html
<button id="btn-check-perm" class="btn btn-primary" type="button">🔐 CHECK PERM (0)</button>
```

Panel mới `#panel-perm` đặt sau `#panel-output`, cấu trúc song song với panel OUTPUT: runbar riêng
(`#perm-progress`, `#perm-stats`, `#btn-perm-cancel`, `#btn-perm-export`), hàng filter, và
`<table id="perm-table" class="result-table">` trong `.result-viewport`.

Panel CHECK PERMISSION **không** có radio Token/Cookie — bảng này không xuất cột Headers nên không có
credential nào để che.

### 5.2 `public/js/ui/tabs.js`

`TAB_IDS` thành `['input', 'auths', 'output', 'perm']`. Phần còn lại của file không đổi (điều hướng
mũi tên, Home/End tự chạy đúng theo độ dài mảng).

### 5.3 `public/js/state.js`

Song song với `results` / `getRunId` / `setRunId` / `resetResults` hiện có (dòng 62-70):

```javascript
export const permResults = [];
let permRunId = null;
export const getPermRunId = () => permRunId;
export const setPermRunId = (v) => { permRunId = v; };
export function resetPermResults() { permResults.length = 0; }
```

Hai run độc lập nhau: chạy CHECK PERM không xoá kết quả trong tab OUTPUT và ngược lại.

### 5.4 `public/js/ui/permission-table.js` (mới)

Bảng 7 cột, mỗi dòng là một request thật:

| # | Header | Nguồn | Định dạng |
|---|---|---|---|
| 1 | Status | `rec.response.status` | `—` khi null; xanh khi < 400, đỏ khi ≥ 400 |
| 2 | Status Perm | `rec.statusPermission` | xanh `true`, đỏ `false`, xám `empty` |
| 3 | Auth | `rec.authName` | |
| 4 | Endpoint | `rec.pathTemplate` | `title` là URL đầy đủ |
| 5 | Role | `rec.sheetName` | tên sheet endpoints |
| 6 | Endpoint Name | `rec.permissionMatchedName` | tên trong file phân quyền (UC2) |
| 7 | Response Body | `bodyPretty(rec)` | cắt một dòng, click mở drawer |

Click dòng mở `initDetailDrawer` đang có (`main.js:102`) — dùng lại nguyên vẹn, không viết drawer mới.

Badge `#tab-perm-badge` hiện số dòng đang có, giống `#tab-output-badge`.

### 5.5 Filter theo từng cột — `public/js/shared/permission-filter-logic.js` (mới)

Mọi điều kiện kết hợp bằng AND; ô/select để trống nghĩa là không lọc theo cột đó.

```javascript
export function emptyPermFilter() {
  return { status: '', perm: '', auth: '', endpoint: '', role: '', permName: '', body: '' };
}
export function matchPermRecord(rec, filter)   // → boolean
export function collectPermStatuses(records)   // → string[] cho select
export function collectPermAuths(records)
export function collectPermRoles(records)
```

- `status`, `perm`, `auth`, `role`: dropdown, so sánh bằng. `perm` cố định 3 lựa chọn
  `true` / `false` / `empty`; ba cột kia đọc giá trị thật có trong kết quả.
- `endpoint`, `permName`, `body`: ô gõ tìm, khớp chuỗi con không phân biệt hoa thường.

Ô lọc nằm ở hàng ngay dưới hàng header, đúng cách bảng OUTPUT đang làm qua `filterCell`
(`filters.js:106-111`, `result-table.js`). Tách logic thuần khỏi DOM để test được không cần trình duyệt,
giống cặp `filter-logic.js` ↔ `filters.js` hiện có.

### 5.6 `public/js/main.js`

Thêm nhánh chạy thứ hai, không đụng nhánh `btnRun` (dòng 179-230):

```
btnCheckPerm.click
  → errors = validatePermissionScope(state)
  → errors.length > 0 ? toast lỗi + tabs.select('input') : tiếp
  → { config } = buildPermissionRunConfig(state)
  → resetPermResults(); startRun(config); setPermRunId(runId)
  → tabs.select('perm')
  → openStream(runId, { onResult → permResults, onProgress → #perm-progress, onDone → #perm-stats })
```

`#btn-perm-cancel` gọi `cancelRun(getPermRunId())`, đúng cách `#btn-cancel` đang làm ở `main.js:232-237`
nhưng đọc `permRunId` thay vì `runId` — huỷ run này không đụng run của RUN ALL.

Nhãn nút cập nhật trong `subscribe` cùng chỗ `refreshRunButton`:

- Chưa nạp file phân quyền → `🔐 CHECK PERM (cần file phân quyền)`, `disabled`.
- Đã nạp → `🔐 CHECK PERM (n)` với `n` là tổng request dự kiến; `disabled` khi `n === 0` hoặc đang chạy.
- Cấu hình sai kiểu khác (thiếu cột UC2, profile đã đổi tên…) không làm nút tắt — bấm vào sẽ hiện
  toast liệt kê đúng chỗ sai, hữu ích hơn một nút xám không nói gì.

Hai run chạy đồng thời được: mỗi bên giữ `stream`, cờ `running` và `runId` riêng.

### 5.7 Xuất Excel

`src/server/excel-export.js` — thêm bộ cột thứ hai và tham số `layout`:

```javascript
export const PERMISSION_EXPORT_COLUMNS = [
  { header: 'Status Code',       key: 'status',           width: 12 },
  { header: 'Status Permission', key: 'statusPermission', width: 18 },
  { header: 'Auth',              key: 'auth',             width: 18 },
  { header: 'Endpoint',          key: 'path',             width: 45 },
  { header: 'Role',              key: 'role',             width: 20 },
  { header: 'Endpoint Name',     key: 'permName',         width: 35 },
  { header: 'Response Body',     key: 'bodyText',         width: 80, style: MULTILINE },
];
```

`writeResultsToStream(stream, records, { includeToken, hasPermission, layout = 'default' })`:
`layout === 'permission'` dùng bộ cột trên, tô xanh/đỏ ô `status` theo `< 400` và ô
`statusPermission` theo `true`/`false` — cùng quy tắc màu đang dùng (`excel-export.js:124-136`).
Khi `layout === 'permission'` thì `hasPermission` bị bỏ qua: bộ cột đã cố định, không còn chuyện
đánh đổi cột `Duration (ms)` lấy `Status Permission` như bố cục mặc định.

`toRow` bổ sung hai khoá chỉ dùng cho bố cục này: `role: rec.sheetName ?? ''` và
`permName: rec.permissionMatchedName ?? ''`. Các khoá còn lại (`status`, `statusPermission`, `auth`,
`path`, `bodyText`) đã có sẵn trong `toRow` hiện tại.

`src/server/routes.js:115-137` đọc thêm `layout` từ body và truyền xuống.
`public/js/api.js` — `exportExcel(runId, indexes, includeToken, layout = 'default')`.
Nút export của tab CHECK PERMISSION luôn gửi `includeToken: false`.

## 6. Test

Chạy bằng `node --test` như phần còn lại của dự án. Không dùng Playwright.

**`test/permission-scope.test.js` (mới)**
- `matchPermissionName`: khớp sau khi trim + lowercase; trả **giá trị gốc trong file**, không phải tên
  endpoint; trả `null` khi cột UC2 chưa cấu hình, khi cột đã biến mất khỏi headers, và khi không có
  dòng nào khớp.
- `uc1AuthNames`: là union mọi dòng UC1, kể cả profile chỉ xuất hiện ở một sheet.
- `buildPermissionRunConfig`: loại endpoint thuộc sheet ngoài UC1; loại endpoint không khớp cột Name;
  loại endpoints chung; giữ đúng bộ lọc `enabled` và method filter; bỏ qua `selectedSheet` (đặt tab
  một sheet nhưng UC1 khai ba sheet → vẫn ra endpoint của cả ba); `msisdns` còn đúng 1 phần tử;
  `auths` đúng bằng union UC1; `runFilter.authIds` liệt kê đủ id.
- `validatePermissionScope`: mỗi nhánh trong bảng ở §3.2 sinh đúng một lỗi; cấu hình sạch trả mảng rỗng.

**`test/permission-filter-logic.test.js` (mới)**
- Ba điều kiện đặt cùng lúc trên ba cột khác nhau lọc theo AND.
- Ô rỗng không lọc gì.
- `endpoint` / `permName` / `body` khớp chuỗi con không phân biệt hoa thường.
- `collectPermStatuses` / `collectPermAuths` / `collectPermRoles` không lặp giá trị.

**`test/permission-table.test.js` (mới)**
- Render đủ 7 cột, đúng thứ tự, đúng nguồn dữ liệu.
- Ô `Status Perm` gắn class `status-up` với `'true'`, `status-down` với `'false'`, không class với `'empty'`.
- Bảng đang lọc thì badge và danh sách index dùng cho export chỉ tính dòng còn hiển thị.

**`test/http-client.test.js` (sửa)**
- Bản ghi có `permissionMatchedName` bằng giá trị gốc trong file khi khớp, `null` khi không khớp.
- Các assert `statusPermission` hiện có phải xanh nguyên trạng — chứng minh việc rút `rows.find` ra
  module shared không đổi hành vi chấm điểm.

**`test/excel-export.test.js` (sửa)**
- `layout: 'permission'` cho ra đúng 7 header theo thứ tự trên.
- Ô `statusPermission` được tô đúng màu; `layout` mặc định không đổi gì so với hiện tại.

**`test/layout.test.js` (sửa)**
- Có tab `#tab-perm`, panel `#panel-perm`, nút `#btn-check-perm`, nút `#btn-perm-export`.

Ghi chú: `test/layout.test.js:31` (`cot rong co card CONNECTION/BODY CHUNG gop lam mot…`) hiện **đang
đỏ sẵn** trước khi làm việc này — 516/518 pass. Đó là lỗi có từ trước, không do thay đổi ở đây, và
không nằm trong phạm vi spec này.

## 7. Phạm vi không đụng tới

- `btnRun` và toàn bộ nhánh RUN ALL trong `main.js`, tab OUTPUT, `result-table.js`, `filters.js`,
  `filter-logic.js`.
- `run-filter.js`, `request-count.js`, `request-builder.js`, `runner.js`, `worker-pool.js`,
  `request-worker.js`, `routes.js` (trừ tham số `layout` của route export).
- Quy tắc chấm `status_permission` trong `evaluatePermission` — chỉ rút phần tìm dòng ra module shared,
  không đổi logic exactMatch / fallback 403.
- Định dạng file phân quyền, `/api/import/grid`, panel PHÂN QUYỀN ở tab INPUT.

## 8. Việc đã hoãn (làm spec riêng sau)

Tách filter riêng cho từng tab sheet endpoints. Hiện `state.runFilter` là một bộ dùng chung
`{ methods, msisdnPatterns, authIds }`; mong muốn là mỗi tab sheet giữ filter riêng, và dữ liệu sau
lọc của mọi tab trở thành đầu vào chung cho cả RUN ALL lẫn CHECK PERM. Hoãn ở đợt này để tránh mở
rộng phạm vi quá xa. Spec này vẫn dùng `runFilter.methods` chung như hiện tại.
