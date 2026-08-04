# Design Spec: CHECK PERM gộp về một luồng, khử trùng theo endpoint + method

> Thay thế toàn bộ `2026-07-31-perm-scope-all-sheets-design.md` và
> `2026-07-31-perm-all-pool-by-role-columns-design.md`. Hai spec đó dựng mode `all` song song với
> đường mapping; spec này xoá hẳn khái niệm mode.
>
> Thay thế luôn quyết định "cột role suy từ `roleColumns`" — cột role quay về suy từ `usecase1`,
> tức khôi phục § "Nguồn sự thật" của `2026-07-31-perm-tab-split-view-design.md`.
>
> **Đính chính (2026-08-01):** §3 dòng "Checkbox `enabled` của endpoint | **Đọc**" và §7 sai. GOM
> **không được** đọc `enabled` — checkbox đó thuộc phạm vi RUN ALL (bảng ENDPOINTS), không phải phạm
> vi CHECK PERM (cột Sheet của UC1 quyết định). Bug y hệt bug mà spec này từng chỉ ra ở mode `all` cũ
> (§7 gốc) tái xuất hiện vì merge hai luồng đã vô tình kéo theo hành vi lọc `enabled` của luồng
> `mapping`. Sửa tại `matchPermissionEndpoints` (không gọi `filterEndpoints`, tự lọc sheet UC1 +
> method topbar) và `scopedEndpointsAndAuths` (ép `enabled: true` lên endpoint trả về, chặn tầng lọc
> lần hai ở `buildRequests`/`validateConfig` phía server). Xem `test/permission-match.test.js` và
> `test/permission-scope.test.js`.

## 1. Vấn đề

CHECK PERM hiện có hai đường chạy tách hẳn nhau, chọn bằng radio:

| Mode | Pool | Khử trùng | Endpoint không ghép được dòng phân quyền |
|---|---|---|---|
| `mapping` | endpoint thuộc sheet khai ở UC1 | theo `usecase2.dedupeColumn` | **bị loại im lặng** |
| `all` | endpoint thuộc tab trùng tên cột role đã tick | `METHOD:pathTemplate` | vẫn chạy, chấm `empty` |

Mode `all` sinh ra để chữa đúng một khiếm khuyết của mode `mapping`: loại endpoint im lặng. Nhưng
nó kéo theo một cơ chế khai báo thứ hai (`roleColumns` — tick cột role, suy tab theo tên cột) chồng
lên cơ chế đã có ở UC1 (`permissionColumn ↔ endpointSheet ↔ authProfileName`). Cùng một thứ khai hai
nơi: lệch nhau là chạy sai mà không có gì báo.

**Nhận ra**: cột `Sheet` của UC1 chính là thứ mode `all` phải đi vòng suy từ tên cột. Giữ mode
`mapping`, vá đúng ba điểm yếu của nó, là đủ — không cần đường thứ hai.

## 2. Quyết định đã chốt

| Câu hỏi | Chốt |
|---|---|
| Hai mode | **Gộp làm một.** Xoá radio, xoá `permissionMapping.mode` |
| Pool | Endpoint thuộc sheet khai ở cột `Sheet` của UC1 (đường mapping cũ, không đổi) |
| Khử trùng | `METHOD:pathTemplate`, thay `usecase2.dedupeColumn` |
| Endpoint không dòng UC2 nào kéo về | **Vẫn chạy**, `permRowIndex: null` → chấm `empty` |
| Checkbox `enabled` của endpoint | **Đọc** — giữ nguyên `filterEndpoints` như đường mapping hôm nay |
| Cột role (bảng phân quyền raw) | Quay về `usecase1[].permissionColumn` |
| Khai báo `roleColumns` | Xoá hẳn cùng file `permission-pool.js` |
| Cờ gửi server | `permMode: 'all'` → `permRun: true` |

## 3. Data model — `public/js/state.js`

```javascript
permissionMapping: {
  usecase1: [],   // [{ permissionColumn, endpointSheet, authProfileName }]
  usecase2: { permissionColumn: '', columnSheet: '', endpointColumn: '' }
}
```

Ba khoá bị xoá:

| Khoá | Lý do |
|---|---|
| `mode` | một luồng, không còn gì để chọn |
| `roleColumns` | cột role = tập `usecase1[].permissionColumn` |
| `usecase2.dedupeColumn` | khử trùng chuyển sang `METHOD:pathTemplate` |

`load()` và `applyConfig()` spread `permissionMapping` từ base nên config cũ mang theo ba khoá thừa
này vẫn nạp được — không ai đọc tới. Không viết code migration: thừa khoá vô hại, còn đoán hộ giá
trị thì sai âm thầm (xem §8).

## 4. Thuật toán — `public/js/shared/permission-match.js`

`matchUc2ToEndpoints` và `annotateAllEndpoints` gộp thành **một** hàm `matchPermissionEndpoints`:

```javascript
export function matchPermissionEndpoints(state) {
  const mapping = state?.permissionMapping ?? {};
  const uc1 = mapping.usecase1 ?? [];
  const uc2 = mapping.usecase2 ?? {};
  const permissionFile = state?.permissionFile ?? {};
  const headers = permissionFile.headers ?? [];
  const rows = permissionFile.rows ?? [];

  // Buoc 1 — GOM: bo loc san co (enabled + method topbar), gioi han sheet UC1.
  const sheets = uc1Sheets(uc1);
  const filtered = filterEndpoints(
    state?.endpoints, { methods: state?.runFilter?.methods ?? [] }, 'all', '', false,
  ).filter((e) => sheets.has(e.sheetName ?? 'Sheet 1'));

  // Buoc 2 — KHU TRUNG METHOD:pathTemplate, ban gap dau tien thang.
  const unique = dedupeEndpoints(filtered).unique;

  // Chua chon cot Name (UC2) hoac cot dich thi khong ghep duoc dong nao —
  // van tra ve het, ket qua toan 'empty'. Dung tinh than "chay het".
  const srcIdx = uc2.permissionColumn ? headers.indexOf(uc2.permissionColumn) : -1;
  const endpointColumn = uc2.endpointColumn;
  const bare = (e) => ({ endpoint: e, permName: null, permRowIndex: null });
  if (srcIdx === -1 || !endpointColumn) return unique.map(bare);

  // Buoc 3 — GHEP. Endpoint thieu raw hoac o cot dich rong khong tham gia
  // khop (khong thi moi ban rong gop chung mot khoa '' va nuot endpoint that),
  // nhung VAN co mat trong ket qua tra ve.
  const pool = unique
    .map((e) => ({ e, hay: normalizeName(e.raw?.[endpointColumn]) }))
    .filter((it) => it.hay !== '');
  const exact = exactIndexOf(pool);

  const taken = new Map();   // khoa = ban than endpoint
  rows.forEach((row, rowIndex) => {
    for (const h of hitsForRow(row[srcIdx], pool, exact)) {
      if (!taken.has(h.e)) {
        taken.set(h.e, { permName: String(row[srcIdx] ?? ''), permRowIndex: rowIndex });
      }
    }
  });

  // Buoc 4 — TRA VE HET.
  return unique.map((e) => (taken.has(e) ? { endpoint: e, ...taken.get(e) } : bare(e)));
}
```

Nhánh `srcIdx === -1 || !endpointColumn` không bao giờ tới được khi bấm CHECK PERM — `validatePermissionScope`
(§10) chặn trước. Giữ nó để hàm dùng được ở chỗ khác (đếm số endpoint hiện trên nút) mà không ném lỗi.

Bốn khác biệt so với `matchUc2ToEndpoints` hôm nay:

| Hôm nay | Sau |
|---|---|
| khoá `taken` = `normalizeName(raw[dedupeColumn])` | = **bản thân endpoint**, sau khi pool đã khử trùng `METHOD:path` |
| `return [...taken.values()]` — endpoint lạc biến mất | trả về hết, endpoint lạc mang `permRowIndex: null` |
| thiếu `dedupeColumn` → `return []` | khoá này không còn |
| vòng 4-bước viết inline (bản sao của `hitsForRow`) | dùng chung `hitsForRow`, xoá bản sao |

### Thứ tự bốn bước là bắt buộc

**Gom trước, khử trùng sau**: khử trùng trên toàn `state.endpoints` rồi mới cắt theo sheet UC1 thì
bản đại diện có thể nằm ở sheet không khai, cả nhóm biến mất.

**Khử trùng trước, ghép sau**: ghép trước rồi khử trùng thì hai bản của cùng một API có thể dính hai
dòng UC2 khác nhau, bản nào sống sót là ngẫu nhiên theo thứ tự mảng.

### Khử trùng cross-sheet an toàn

`dedupeEndpoints` (`public/js/shared/endpoint-dedupe.js:8-10`) khoá
`${METHOD}:${pathTemplate ?? endpoint}`. `GET /a` và `POST /a` không khử lẫn nhau.

Một API cấp cho 3 sheet role còn lại 1 endpoint, nhưng vẫn chạy 3 lượt: `buildRequests`
(`src/server/request-builder.js:272-280`) chạy tích chéo `auths × endpoints`, `auths` là union mọi
profile khai ở UC1. Mỗi lượt chấm bằng cột role của auth đang chạy (`evaluateUc2Permission`). Không
mất bản ghi nào — đây là lý do khử trùng ở tầng endpoint không cần bù ở tầng nào khác.

Tầng request cũng không cần khử thêm: msisdn cắt còn 1 (`permission-scope.js:194`),
`commonEndpointsEnabled: false`, nên endpoint unique kéo theo cặp `(auth, METHOD, path)` unique.

### `endpointColumns` bỏ tham số thứ ba

`endpointColumns(endpoints, uc1, allSheets)` → `endpointColumns(endpoints, uc1)`. Tham số `allSheets`
chỉ tồn tại để mode `all` union header của mọi sheet.

## 5. Dựng config chạy — `public/js/shared/permission-scope.js`

Xoá `permMode`, `PERM_MODE_ALL`, `PERM_MODE_MAPPING`. `scopedEndpointsAndAuths` còn một nhánh:

```javascript
function scopedEndpointsAndAuths(state) {
  const uc1 = state?.permissionMapping?.usecase1 ?? [];
  const authNames = uc1AuthNames(uc1);
  const auths = (state?.auths ?? []).filter((a) => authNames.has(normalizeName(a.name)));

  const endpoints = matchPermissionEndpoints(state).map(({ endpoint, permName, permRowIndex }) => ({
    ...endpoint, permName, permRowIndex, permRun: true,
  }));

  return { endpoints, auths };
}
```

`permRun` gắn lên **từng endpoint** chứ không phải một khoá của config: server chỉ nhìn thấy request
đã dựng, `buildRequests` không đọc `permissionMapping`.

## 6. Chấm điểm — `src/server/`

`request-builder.js` `buildOne` đổi một dòng passthrough:

```javascript
permRun: endpoint.permRun === true,     // truoc: permMode: endpoint.permMode ?? null
```

`http-client.js` `evaluatePermission` đổi điều kiện của nhánh đã có, giữ nguyên vị trí — **sau**
nhánh `permRowIndex != null`, **trước** toàn bộ đường RUN ALL:

```javascript
if (req.permRun) {
  return 'empty';
}
```

Không có nhánh này, endpoint CHECK PERM không ghép được dòng nào sẽ rơi xuống đường RUN ALL — đường
đó gate theo `endpointSheet === req.sheetName` và match tên kiểu 1-1, cho ra kết quả không liên quan.

`evaluateUc2Permission` **không đổi một dòng**: vẫn tra `usecase1` tìm dòng có `authProfileName`
khớp auth đang chạy, lấy `permissionColumn` của dòng đó, đọc ô tại `permRowIndex`.

Đường RUN ALL (`permRun` false) không đổi một dòng.

## 7. `enabled` — đọc, và bug được xoá theo

Bước 1 giữ nguyên `filterEndpoints` (`public/js/shared/run-filter.js:47`), tức CHECK PERM **tôn
trọng** checkbox của bảng ENDPOINTS, đúng như đường mapping hôm nay.

Việc này xoá một bug đang có ở mode `all`: `allModeEndpoints` cố ý bỏ qua `e.enabled` ở client, nhưng
config gửi lên `/api/run` vẫn đi qua `buildRequests` → `filterEndpoints` → `run-filter.js:51`
`if (!e.enabled) return false;`, và `validateConfig` (`request-builder.js:27`) còn đòi ít nhất một
endpoint `enabled`. Hệ quả: endpoint bỏ tick bị server nuốt im lặng, số trên nút CHECK PERM khác số
request chạy thật; bỏ tick hết thì CHECK PERM chết ở validate phía server. Một luồng, một luật, hết
lệch.

## 8. UI

### 8.1 `public/index.html`

Xoá khỏi `#permissions-mapping-area`:

- Khối `.perm-mode-row` — hai radio `#rad-perm-mode-all`, `#rad-perm-mode-mapping`.
- Khối `.perm-role-cols` — `#permissions-role-cols`, `#permissions-role-cols-hint`.
- Ô `UC2: Cột khử trùng (endpoints)` — label + `#sel-permissions-dedupe-col`.

Giữ nguyên: dòng import file + `#sel-permissions-file-sheet`, ba ô UC2 còn lại, khối `.perm-uc1` với
`#permissions-usecase1-table` và nút thêm mapping.

Thêm một dòng hint dưới `.perm-uc1-head`, luôn hiện:

```html
<p class="hint">Cột Sheet quyết định endpoint nào được kiểm tra. Endpoint trùng METHOD + path giữa
nhiều sheet chỉ chạy một lần cho mỗi auth.</p>
```

### 8.2 `public/js/ui/permissions-panel.js`

- Xoá `radModeAll`/`radModeMapping` cùng hai listener và `setMode`.
- Xoá `toggleRoleColumn`, xoá đoạn render checklist cột role, xoá import `columnTabs`/
  `effectiveRoleColumns`.
- Xoá `selDedupeCol` cùng listener.
- Bảng UC1: cột `Sheet` **không** còn `disabled`, bỏ `title` giải thích mode.
- Dropdown sheet tham chiếu (UC2) quay về chỉ liệt kê sheet khai trong UC1 (`uc1Sheets`), bỏ nhánh
  `isAllMode` liệt kê mọi sheet.

### 8.3 `public/css/app.css`

Xoá `.perm-mode-row`, `.perm-role-cols`, `.perm-role-cols-head`, `.role-col-list`, `.role-col-tab`,
`.role-col-tab.is-unmatched`.

## 9. Bảng phân quyền raw — cột role quay về UC1

`public/js/shared/permission-sheet-filter.js` khôi phục hai hàm đã xoá:

```javascript
export function roleColumns(headers, uc1)        // -> {index, name}[], thu tu header, khu trung
export function roleColumnIndexes(headers, uc1)  // -> number[]
```

`roleColumns`: với mỗi `m` trong `uc1` lấy `headers.indexOf(m.permissionColumn)`, bỏ `-1`, khử trùng,
giữ thứ tự cột trong `headers`.

`public/js/main.js` đổi dây nối của bảng raw:

```javascript
getRoleColumns: () => roleColumns(state.permissionFile.headers, state.permissionMapping.usecase1),
```

`permission-sheet-table.js` không đổi một dòng — vẫn nhận `getRoleColumns` từ ngoài, vẫn trả
`{index, name}[]` cùng hình dạng.

Xoá hẳn file `public/js/shared/permission-pool.js` (`columnTabs`, `roleTabPairs`,
`effectiveRoleColumns`, `allModeEndpoints`).

## 10. Validate — `validatePermissionScope`

Quay về đúng bộ luật của đường mapping, trừ hai chỗ:

| Luật | Đổi |
|---|---|
| `Chưa chọn cột khử trùng (UC2), hoặc cột đã biến mất` | **xoá** |
| `Không dòng UC2 nào kéo về được endpoint` | → `Không endpoint nào để chạy — kiểm tra sheet khai ở UC1, bộ lọc method và cột enabled` |

Thông báo thứ hai đổi vì ý nghĩa đã đổi: giờ pool rỗng mới là lỗi, còn "không ghép được dòng nào"
không còn là lỗi (endpoint vẫn chạy và chấm `empty`).

Xoá luôn ba luật riêng của mode `all`: `Chưa chọn cột role nào…`, `Cột role "X" không có tab endpoint
nào trùng tên`, và nhánh `isAllMode` ở mọi luật còn lại.

Giữ nguyên, áp cho mọi lần chạy: file phân quyền đã nạp · cột Name (UC2) còn trong sheet · UC1 không
rỗng · cột UC1 còn trong sheet · sheet UC1 còn endpoint · auth profile UC1 tồn tại · endpoints có
`raw` · sheet tham chiếu (UC2) ∈ sheet UC1 · cột đích (UC2) còn tồn tại · còn auth để chạy.

Gom lỗi thay vì dừng ở lỗi đầu tiên — cơ chế hiện có, không đổi.

## 11. Hệ quả khi nâng cấp — phải nói với người dùng

Ai đang chạy mode `all`: cột `Sheet` của UC1 bị `disabled` suốt thời gian đó, nên giá trị nằm trong
là mặc định lúc thêm dòng (`getUniqueSheets(state.endpoints)[0]`), nhiều khả năng chưa ai sửa. Sau khi
gộp luồng, cột này **có hiệu lực trở lại** và quyết định phạm vi chạy.

→ Lần mở đầu tiên sau khi nâng cấp phải soát lại cột `Sheet` từng dòng UC1. Không đoán hộ: đoán sai
thì phạm vi sai mà không có gì báo. Hint ở §8.1 nói thẳng vai trò của cột này.

Hệ quả thứ hai, giữ từ spec cũ: **số trên nút CHECK PERM khác số dòng bảng ENDPOINTS** cả hai chiều —
gom nhiều sheet nên nhiều hơn tab đang xem, nhưng khử trùng nên ít hơn tổng bản ghi. Thiết kế, không
phải lỗi.

Hệ quả thứ ba: cột `Role` ở bảng kết quả hiện sheet của bản ghi **thắng khử trùng**, không phải mọi
sheet chứa API đó. Đúng dữ liệu nhưng dễ đọc nhầm — không đổi ở spec này, ghi lại để biết.

## 12. Phạm vi không đụng tới

- `evaluateUc2Permission` và đường RUN ALL trong `src/server/http-client.js`.
- RUN ALL phía client, `countRequests`, tab OUTPUT, `result-table.js`, `filters.js`, `filter-logic.js`,
  `run-filter.js` (dùng lại `filterEndpoints` nguyên trạng).
- Bảng ENDPOINTS và tab "Tất cả (All)" — `allTabEndpoints` giữ vai trò hiển thị.
- `permission-table.js` (8 cột), `permission-filter-logic.js`, `permission-sheet-table.js`,
  `permission-sheet-filter-bar.js`, `split-pane.js`, `excel-export.js`.
- Định dạng file phân quyền, `/api/import/grid`, `runner.js`, `worker-pool.js`, `routes.js`.

## 13. Test

Chạy bằng `node --test`. Nền hiện tại 718 pass / 2 fail; hai fail là `test/layout.test.js:31` và
`:72` (đòi `run-breakdown` đã xoá), đỏ sẵn từ trước, không thuộc phạm vi spec này.

**`test/permission-match.test.js`** — `matchPermissionEndpoints`: gom đúng endpoint thuộc sheet khai
ở UC1, bỏ sheet ngoài; khử trùng `METHOD:pathTemplate` giữ bản gặp đầu tiên; `GET /a` và `POST /a`
không khử lẫn nhau; endpoint không dòng UC2 nào kéo về vẫn có mặt với `permRowIndex: null`; endpoint
ghép được mang đúng `permName` + `permRowIndex`; dòng UC2 đến trước giữ chỗ khi hai dòng cùng với tới
một endpoint; endpoint `enabled: false` bị loại; bộ lọc method áp đúng; chưa chọn cột Name (UC2) hoặc
cột đích → trả về đủ endpoint, tất cả `permRowIndex: null`; endpoint có ô cột đích rỗng không tham
gia khớp nhưng vẫn có mặt trong kết quả.

**`test/permission-scope.test.js`** — xoá `mode` khỏi mọi fixture; mọi endpoint mang `permRun: true`;
hai luật đổi ở §10; xoá nhóm test `dedupeColumn` và nhóm test riêng mode `all`; `auths` vẫn là union
profile UC1.

**`test/http-client.test.js`** — `permRun: true` + `permRowIndex: null` → `'empty'` kể cả khi
`endpointName`/`sheetName` đủ khớp nhánh RUN ALL (chứng minh nhánh mới chặn trước); `permRun: true` +
có `permRowIndex` → chấm theo luật UC2; RUN ALL (`permRun` false) giữ nguyên kết quả cũ.

**`test/permissions-panel.test.js`** — xoá nhóm test radio mode và nhóm test checklist cột role; cột
`Sheet` của UC1 **không** `disabled`; dropdown sheet tham chiếu chỉ liệt kê sheet khai ở UC1; không
còn `selDedupeCol`.

**`test/permission-sheet-filter.test.js`** — `roleColumns(headers, uc1)` trả đúng chỉ số theo UC1, bỏ
cột không tồn tại, khử trùng khi hai mapping cùng cột, giữ thứ tự header.

**`test/permission-sheet-table.test.js`** — `getRoleColumns` cấp từ `roleColumns(headers, uc1)`; cột
định danh UC2 trùng cột role chỉ render một lần (giữ test đã có).

**`test/state.test.js`** — `defaultConfig().permissionMapping` không còn `mode`, `roleColumns`,
`usecase2.dedupeColumn`.

**`test/layout.test.js`** — không còn `#rad-perm-mode-all`, `#rad-perm-mode-mapping`,
`#permissions-role-cols`, `#sel-permissions-dedupe-col`.

**Xoá file**: `test/permission-pool.test.js`.
