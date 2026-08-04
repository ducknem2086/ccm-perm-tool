# Design Spec: CHECK PERM hai mode — "Toàn bộ (tab All)" và "Theo mapping UC1"

> Bản này thay thế hoàn toàn nội dung trước của cùng file (bỏ `dedupeColumn`, coi `endpointSheet`
> trống là "mọi sheet"). Hướng đó sai: phạm vi toàn bộ không phải một giá trị của trường mapping mà
> là một **mode** đứng tách khỏi phần mapping theo fields. Toàn bộ logic mapping fields giữ nguyên
> như trước bản này.

## 1. Bối cảnh

Spec `2026-07-31-uc2-include-matching-design.md` dựng đường CHECK PERM chạy theo mapping UC1: pool
endpoint bị cắt theo `endpointSheet` của từng dòng UC1, rồi mỗi dòng UC2 kéo về một tập endpoint và
khử trùng theo `usecase2.dedupeColumn`. Endpoint không được dòng UC2 nào kéo về thì bị loại trước khi
gửi request.

Thực tế chạy thiếu khá nhiều endpoint: bảng phân quyền phủ **toàn bộ** endpoint, trong khi pool lại
chỉ gồm các sheet có tên trong UC1, và endpoint không khớp tên bị loại im lặng.

**Mục tiêu:** thêm một đường chạy thứ hai, song song và tách hẳn khỏi đường mapping.

## 2. Quyết định đã chốt

| Câu hỏi | Chốt |
|---|---|
| Hình thức | Một **mode** hai lựa chọn, không phải giá trị mới của trường mapping nào |
| Vị trí | Radio ở đầu khối UC1, panel PHÂN QUYỀN |
| Mặc định | `all` — "Toàn bộ (tab All)" |
| Mode `all` ghép endpoint ↔ dòng phân quyền | Không lọc: chạy hết. Ghép được thì chấm, không ghép được thì `empty` |
| Khử trùng ở mode `all` | **Không khử trùng gì cả.** Pool lấy đúng như RUN ALL: `state.endpoints` thô qua `filterEndpoints`. Một API cấp cho N sheet role là N bản ghi phải chấm riêng — khử theo `METHOD:pathTemplate` nuốt mất N−1 bản. Hệ quả: số request có thể lớn hơn số dòng hiện trên tab All (bảng đó vẫn khử trùng để hiển thị) |
| Endpoints chung | Vẫn ngoài phạm vi ở cả hai mode |
| Đường mapping cũ | Không sửa một dòng logic nào |

## 3. Data model — `public/js/state.js`

```javascript
permissionMapping: {
  mode: 'all',            // 'all' | 'mapping'
  usecase1: [],
  usecase2: { permissionColumn: '', columnSheet: '', endpointColumn: '', dedupeColumn: '' }
}
```

`load()`/`applyConfig()` đã spread `permissionMapping` từ base nên config cũ (không có `mode`) tự nhận
`'all'`. Không cần code migration.

`permission-scope.js` đọc mode qua một hàm chứ không đọc thẳng khoá, để giá trị lạ cũng rơi về `all`:

```javascript
export const PERM_MODE_ALL = 'all';
export const PERM_MODE_MAPPING = 'mapping';
export function permMode(state) {
  return state?.permissionMapping?.mode === PERM_MODE_MAPPING ? PERM_MODE_MAPPING : PERM_MODE_ALL;
}
```

## 4. Thuật toán mode `all` — `permission-match.js`

Hàm mới `annotateAllEndpoints(state)`, đứng cạnh `matchUc2ToEndpoints` (hàm cũ **không đổi**):

```javascript
// Pool y het RUN ALL: state.endpoints tho, chi qua enabled + method filter.
const all = filterEndpoints(state.endpoints, { methods: runFilter.methods }, 'all', '', false);
// khong loc theo uc1Sheets, khong khu trung theo usecase2.dedupeColumn,
// va khong khu trung METHOD:pathTemplate
const pool = all.map((e) => ({ e, hay: norm(e.raw?.[endpointColumn]) })).filter((it) => it.hay !== '');

// Duyet dong UC2 theo dung thu tu file; dong den truoc giu cho.
rows.forEach((row, rowIndex) => {
  for (const h of hitsForRow(row[srcIdx], pool, exact)) {
    if (!taken.has(h.e)) taken.set(h.e, { permName: String(row[srcIdx] ?? ''), permRowIndex: rowIndex });
  }
});

return all.map((e) => taken.has(e) ? { endpoint: e, ...taken.get(e) } : { endpoint: e, permName: null, permRowIndex: null });
```

Khác biệt so với `matchUc2ToEndpoints` nằm đúng ba chỗ: pool là `state.endpoints` thô (không cắt theo
sheet, không khử trùng), khoá `taken` là **bản thân endpoint** thay vì giá trị cột khử trùng, và
endpoint không khớp vẫn được trả về với `permRowIndex: null` thay vì bị loại.

`allTabEndpoints` **không** tham gia đường chạy — nó chỉ dựng bảng hiển thị tab All. Dùng nó làm pool
là nguyên nhân mode `all` miss bản ghi: một API cấp cho 5 sheet role chỉ còn 1 request, 4 role kia
không bao giờ được chấm.

Vòng quét 4 bước (bớt từ đầu, dừng ở vòng đầu tiên có kết quả) tách thành `hitsForRow` dùng chung cho
cả hai hàm — một nguồn sự thật, đổi luật khớp thì cả hai mode đổi cùng nhau.

Chưa chọn `permissionColumn` hoặc `endpointColumn` thì mọi endpoint trả về với `permRowIndex: null` —
run vẫn chạy, kết quả toàn `empty`. Đúng tinh thần "chạy hết".

`endpointColumns(endpoints, uc1, allSheets = false)` nhận thêm tham số thứ ba: mode `all` truyền
`true` để union header của mọi endpoint thay vì chỉ sheet UC1.

## 5. Dựng config chạy — `permission-scope.js`

`scopedEndpointsAndAuths` rẽ nhánh theo mode; `auths` (union UC1) và `msisdns` (1 số) giữ nguyên ở cả
hai mode:

```javascript
if (permMode(state) === PERM_MODE_ALL) {
  const endpoints = annotateAllEndpoints(state).map(({ endpoint, permName, permRowIndex }) => ({
    ...endpoint, permName, permRowIndex, permMode: PERM_MODE_ALL,
  }));
  return { endpoints, auths };
}
// nhanh mapping cu, khong doi
```

`permMode` gắn lên **từng endpoint** chứ không phải một khoá của config, vì server chỉ nhìn thấy
request đã dựng — `buildRequests` không đọc `permissionMapping`.

## 6. Chấm điểm — `src/server/`

`request-builder.js` `buildOne` thêm một khoá passthrough:

```javascript
permMode: endpoint.permMode ?? null,
```

`http-client.js` `evaluatePermission` thêm một nhánh, đặt **sau** nhánh `permRowIndex != null` và
**trước** toàn bộ code cũ:

```javascript
if (req.permMode === 'all') {
  return 'empty';
}
```

Không có nhánh này, endpoint mode `all` không ghép được dòng nào sẽ rơi xuống đường RUN ALL — đường
đó lọc theo `endpointSheet === req.sheetName` và match tên kiểu 1-1, cho ra kết quả không liên quan
gì tới mode đang chạy.

Đường RUN ALL (`permMode` null) và đường mapping (`permRowIndex` khác null) không đổi một dòng.

## 7. UI

`public/index.html` — trong `.perm-uc1`, ngay trên `.perm-uc1-head`:

```html
<div class="perm-mode-row">
  <span class="label">Phạm vi CHECK PERM</span>
  <label class="check"><input id="rad-perm-mode-all" type="radio" name="perm-mode" value="all" checked /> Toàn bộ (tab All)</label>
  <label class="check"><input id="rad-perm-mode-mapping" type="radio" name="perm-mode" value="mapping" /> Theo mapping UC1</label>
</div>
```

`public/css/app.css` thêm `.perm-mode-row` (flex, wrap).

`public/js/ui/permissions-panel.js`:

- Hai listener `change` ghi `state.permissionMapping.mode`, `render()` đồng bộ ngược `checked`.
- Mode `all`: cột Sheet của mỗi dòng UC1 `disabled` nhưng **giữ nguyên giá trị** (kèm `title` giải
  thích) — đổi về mode mapping không mất cấu hình. Select cột khử trùng cũng `disabled`.
- Mode `all`: dropdown sheet tham chiếu (UC2) liệt kê mọi sheet đã import; mode mapping vẫn chỉ liệt
  kê sheet khai trong UC1.

## 8. Validate — `validatePermissionScope`

Mode `mapping` giữ nguyên toàn bộ luật cũ. Mode `all` khác bốn chỗ:

| Luật | Mode `all` |
|---|---|
| `UC1: sheet "Y" không còn endpoint nào` | Bỏ — cột Sheet không tham gia |
| `Chưa chọn cột khử trùng (UC2)` | Bỏ — không khử trùng |
| Sheet tham chiếu (UC2) | Nhận mọi sheet đã import, không ép ∈ sheet UC1 |
| Không còn endpoint sau lọc | Đổi thông báo thành `Không endpoint nào để chạy — kiểm tra bộ lọc method và cột enabled` |
| Kiểm `raw` (import bản cũ) | Quét toàn bộ `state.endpoints`, không giới hạn sheet UC1 |

Luật còn lại (file phân quyền, cột Name UC2, UC1 rỗng, cột quyền UC1, auth profile, cột đích UC2)
áp cho cả hai mode. Riêng thông báo khi UC1 rỗng đổi lời ở mode `all` thành
`Chưa khai mapping UC1 nào — không biết cột quyền nào ứng với auth nào`, vì ở mode này UC1 chỉ còn
nhiệm vụ cấp cặp cột quyền ↔ auth.

## 9. Phạm vi không đụng tới

- `matchUc2ToEndpoints` và toàn bộ đường mapping: pool cắt theo `uc1Sheets`, khử trùng theo
  `dedupeColumn`, loại endpoint không khớp.
- RUN ALL, tab OUTPUT, `result-table.js`, `filters.js`, `filter-logic.js`, `run-filter.js`.
- `permission-table.js` (8 cột), `permission-filter-logic.js`, `excel-export.js` — mode `all` chỉ làm
  cột `Status Perm` xuất hiện nhiều giá trị `empty` hơn, không đổi nguồn dữ liệu cột nào.
- Định dạng file phân quyền, `/api/import/grid`, `runner.js`, `worker-pool.js`, `routes.js`.

## 10. Test

Chạy bằng `node --test`.

**`test/permission-scope.test.js`** — fixture hiện có ghim `mode: 'mapping'` (mặc định app là `all`,
không ghim thì mọi test cũ đổi nghĩa). Thêm nhóm test mode `all`: chạy cả endpoint thuộc sheet ngoài
UC1; endpoint không ghép được vẫn có mặt với `permRowIndex: null`; endpoint ghép được mang đúng
`permName`/`permRowIndex`; mọi endpoint mang `permMode: 'all'` còn mode mapping thì không; không khử
trùng theo `dedupeColumn`; **không khử trùng theo `METHOD:pathTemplate` — một API ở 4 sheet role sinh
đủ 4 bản ghi**; bỏ tick một bản ghi chỉ loại đúng bản đó; vẫn tôn trọng `enabled` + method filter;
bốn nhánh validate ở §8; `permMode()` mặc định `all`.

**`test/http-client.test.js`** — `permMode: 'all'` + `permRowIndex: null` → `'empty'` kể cả khi
`endpointName`/`sheetName` đủ để khớp nhánh RUN ALL (chứng minh nhánh mới chặn trước); `permMode:
'all'` + có `permRowIndex` → vẫn chấm theo luật UC2; RUN ALL (`permMode` null) giữ nguyên kết quả cũ.

**`test/permissions-panel.test.js`** — radio ghi vào state; `render()` đồng bộ radio theo mode; mode
`all` làm cột Sheet `disabled` nhưng giữ giá trị; mode `all` liệt kê mọi sheet đã import ở dropdown
sheet tham chiếu.

**`test/state.test.js`** — `defaultConfig().permissionMapping.mode === 'all'`.

**`test/layout.test.js`** — có `#rad-perm-mode-all` (checked mặc định) và `#rad-perm-mode-mapping`.

Ghi chú: `test/layout.test.js:31` và `:72` đang đỏ sẵn từ trước, không thuộc phạm vi spec này.
