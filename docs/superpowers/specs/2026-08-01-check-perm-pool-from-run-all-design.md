# CHECK PERM lấy đúng pool của RUN ALL

Ngày: 2026-08-01

## Vấn đề

Phạm vi chạy của CHECK PERM đang do cột "Sheet endpoints sẽ chạy" của UC1 quyết định: mỗi dòng UC1
khai một sheet, `uc1Sheets()` gom lại thành tập sheet, `matchPermissionEndpoints` lọc
`state.endpoints` theo tập đó. Muốn quét hết endpoint đang có thì phải tạo N dòng UC1 — một dòng cho
mỗi sheet — lặp lại y hệt cùng cột ROLE và cùng auth profile, và khai bù mỗi lần import file có sheet mới.

Các dòng lặp đó không mang thêm thông tin. Ở đường CHECK PERM, cột ROLE được chọn theo **auth
profile**, không theo sheet: `evaluateUc2Permission` (`src/server/http-client.js:67`) tìm dòng UC1
bằng `uc1.find((m) => m.authProfileName === req.authName)`. Trong N dòng trùng auth chỉ dòng đầu
tiên chấm điểm; N−1 dòng còn lại chỉ có tác dụng nới phạm vi.

Đã có sẵn một danh sách đúng bằng "mọi endpoint đang xét": list mà nút RUN ALL đang đếm.

## Quyết định

CHECK PERM dùng **đúng danh sách endpoint mà RUN ALL đang đếm**, khử trùng METHOD + URL, rồi mới
dựng request. Cột "Sheet endpoints sẽ chạy" của UC1 thôi quyết định phạm vi.

Nguồn duy nhất, đã tồn tại — `request-count.js:8` gọi:

```js
filterEndpoints(state.endpoints, state.runFilter, state.selectedSheet,
                state.commonEndpoints, state.commonEndpointsEnabled)
```

Muốn quét hết mọi sheet thì bấm tab **Tất cả (All)** ở bảng endpoints, giống hệt RUN ALL. Không thêm
sentinel `'all'` vào `m.endpointSheet`, không thêm khái niệm phạm vi thứ hai.

### Ba chốt phụ

**Tab sheet đang chọn có thu hẹp CHECK PERM.** Đứng ở tab "Sheet 2" thì CHECK PERM chỉ chạy Sheet 2,
đúng như RUN ALL. Một quy tắc duy nhất cho cả hai nút.

**Common endpoints bị loại.** Truyền `commonEndpointsEnabled = false` khi gọi `filterEndpoints`, giữ
đúng hành vi hiện tại của `buildPermissionRunConfig`. Bản ghi common gõ tay không có `raw` nên không
dòng UC2 nào ghép được — chạy vào chỉ để chấm `'empty'` và tốn request. Hệ quả: số trên nút CHECK
PERM lệch số trên nút RUN ALL đúng bằng số common endpoint đang bật.

**Cột "Sheet endpoints sẽ chạy" vẫn giữ.** Nhánh chấm quyền của RUN ALL
(`evaluatePermission`, `src/server/http-client.js:99`) lọc `m.endpointSheet === req.sheetName`; bỏ cột
thì phải sửa `src/server/`, nằm ngoài phạm vi đã chốt. Cột ở lại nhưng chỉ còn nghĩa với RUN ALL —
người dùng khai một dòng UC1 cho mỗi auth profile là đủ, không phải lặp theo sheet nữa.

Đã cân nhắc và loại: thêm giá trị `'all'` cho `m.endpointSheet` rồi nở ra trong `uc1Sheets()`. Cách
đó giữ hai định nghĩa phạm vi song song (một của RUN ALL, một của UC1) và phải đồng bộ tay mãi mãi.

## Thay đổi theo file

### `public/js/shared/permission-match.js` — thay đổi cốt lõi

`matchPermissionEndpoints(state)`, dòng 73-81. Bỏ khối lọc theo `uc1Sheets` + `saved.methods`:

```js
// Pool CHECK PERM = dung list ma nut RUN ALL dang dem (request-count.js), khu
// trung METHOD + URL. Mot dinh nghia pham vi duy nhat cho ca hai nut: doi tab
// sheet hay bo loc method la ca hai cung doi. Tab "Tat ca (All)" = quet het.
// commonEndpointsEnabled: false — ban ghi common go tay khong co raw nen khong
// dong UC2 nao ghep duoc, chay vao chi de cham 'empty'.
const filtered = filterEndpoints(
  state?.endpoints, state?.runFilter, state?.selectedSheet, '', false,
);
const unique = dedupePreferJoinable(filtered, uc2.endpointColumn);
```

Import `filterEndpoints` từ `./run-filter.js`. Bỏ import `uc1Sheets`, bỏ biến `uc1` và `wantedMethods`.
`dedupePreferJoinable` và `joinValueOf` định nghĩa ở mục "Giữ độ tin của chấm điểm khi pool rộng".
`uc2.endpointColumn` phải đọc **trước** chỗ này (hiện đang ở dòng 84) vì khử trùng cần nó.

Khử trùng vẫn dùng `dedupeEndpoints` sẵn có — khoá `METHOD:pathTemplate` (`endpoint-dedupe.js:8-10`),
đúng "trùng endpoint url và method". Vẫn phải chạy **trước** bước ghép dòng UC2: ghép trước rồi khử
trùng thì hai bản cùng API có thể dính hai dòng UC2 khác nhau, bản nào sống sót là ngẫu nhiên theo
thứ tự mảng.

`endpointColumns(endpoints, uc1)` (dòng 7-18) mất chỗ dùng — xoá. Nơi duy nhất gọi nó là
`validatePermissionScope`, và chỗ đó chuyển sang `endpointColumnsOfSheet` (bên dưới).

### `public/js/shared/permission-scope.js`

**Xoá `uc1Sheets`** (dòng 69-71). Không còn chỗ dùng sau khi sửa `permission-match.js` và
`permissions-panel.js`.

Import ở dòng 1-2 đổi thành `filterMsisdns, filterEndpoints` từ `./run-filter.js` và
`matchPermissionEndpoints, endpointColumnsOfSheet` từ `./permission-match.js`.

**`validatePermissionScope`** — ba chỗ:

1. Dòng 123-125, check `!endpointSheets.has(m.endpointSheet)`: **giữ nguyên**. Cột vẫn tồn tại và
   vẫn có nghĩa với nhánh chấm quyền của RUN ALL; trỏ vào sheet không còn endpoint vẫn là lỗi cấu hình.
2. Dòng 131-134, `scopedRaw`: đổi nguồn sang chính pool của CHECK PERM, để thông báo "Endpoints
   import từ bản cũ" bám đúng tập sắp chạy.
   ```js
   const scopedRaw = filterEndpoints(state?.endpoints, state?.runFilter, state?.selectedSheet, '', false);
   ```
3. Dòng 136-143, check `uc2.columnSheet` và `uc2.endpointColumn`: `uc2.columnSheet` là sheet dùng để
   lấy **danh sách tên cột** làm khoá ghép, không phải phạm vi chạy — nên xét trên mọi sheet có
   endpoint, không phải theo tab đang chọn.
   ```js
   const sheets = new Set((state?.endpoints ?? []).map((e) => e.sheetName ?? 'Sheet 1'));
   if (!uc2.columnSheet || !sheets.has(uc2.columnSheet)) {
     errors.push('Chưa chọn sheet endpoints tham chiếu (UC2)');
   }
   const cols = endpointColumnsOfSheet(state?.endpoints, uc2.columnSheet);
   if (!uc2.endpointColumn || !cols.includes(uc2.endpointColumn)) {
     errors.push('Chưa chọn cột đích (UC2), hoặc cột đã biến mất');
   }
   ```
   Dùng `endpointColumnsOfSheet` — đúng hàm mà panel dùng để dựng option (`permissions-panel.js:226`),
   nên không còn cảnh validate qua nhưng dropdown rỗng.

**`buildPermissionRunConfig`** (dòng 177-197): giữ nguyên `selectedSheet: 'all'`,
`commonEndpointsEnabled: false`, `runFilter.methods: []` trong config gửi server. Client đã nướng
sẵn danh sách cuối vào `config.endpoints`; để server lọc lại lần nữa là lọc hai lần trên hai bản
state khác nhau.

### `public/js/state.js` — bỏ `methods` khỏi gate Lưu

`matchPermissionEndpoints` không còn đọc `savedConfig.methods` (bộ lọc method giờ đi qua
`state.runFilter` như RUN ALL). Để `methods` lại trong gate thì badge "⚠ Chưa lưu: filter method"
bật lên trong khi việc bấm Lưu không đổi kết quả gì — hướng dẫn sai.

- `snapshot()` (dòng 146-152): bỏ khoá `methods`.
- `emptySavedConfig()` (dòng 24-37): bỏ khoá `methods` và đoạn comment về nó.
- `revertConfig()` (dòng 160-169): bỏ hai dòng gán `state.runFilter.methods`.
- `dirtyParts()` (dòng 182): bỏ nhánh `'filter method'`.
- `normalizeSavedConfig()`: bỏ `methods` khỏi kết quả chuẩn hoá.

Gate Lưu còn lại: mapping UC1/UC2 và sheet phân quyền. Config cũ trong localStorage có thừa khoá
`methods` thì `normalizeSavedConfig` bỏ qua — không cần migration.

### `public/js/ui/permissions-panel.js`

Dòng 207-222, picker "Sheet ENDPOINTS chứa cột khoá" của UC2 đang lấy option từ
`uc1Sheets(state.permissionMapping.usecase1)`. Đổi sang mọi sheet có endpoint:

```js
const uc1SheetList = getUniqueSheets(state.endpoints);
```

`getUniqueSheets` đã được import sẵn ở dòng 6. Bỏ import `uc1Sheets` ở dòng 8. Nhánh
`if (!uc1SheetList.includes(columnSheet))` giữ nguyên — vẫn kéo `columnSheet` về giá trị hợp lệ khi
sheet biến mất khỏi file endpoints.

Không đổi select sheet của từng dòng UC1, không đổi mặc định khi bấm "＋ Thêm mapping".

### `public/index.html`

Hint UC1 (dòng 171) đang viết "Sheet endpoints quyết định endpoint nào được chạy (chạy hết sheet đó)"
— sai sau thay đổi này. Viết lại:

> Mỗi dòng: cột ROLE quyết định quyền kỳ vọng (ô `x` = phải được phép), Auth profile là danh tính gọi
> API. **CHECK PERM chạy đúng danh sách mà nút RUN ALL đang đếm** (theo tab sheet và bộ lọc method
> đang chọn), đã khử trùng METHOD + URL — bấm tab "Tất cả (All)" ở bảng endpoints để quét hết. Cột
> Sheet chỉ còn dùng cho cột chấm quyền của RUN ALL, mỗi auth profile khai một dòng là đủ.

Giữ nguyên hint cảnh báo `perm-uc1-warn` về cột ROLE. Không thêm CSS.

## Hệ quả

- Số trên nút CHECK PERM giờ đổi theo tab sheet và bộ lọc method, không cần bấm Lưu. Trước đây trục
  method bị gate Lưu.
- Endpoint trùng METHOD + URL giữa nhiều sheet chỉ chạy một lần cho mỗi auth — đã đúng như vậy từ
  trước, nay áp lên pool rộng hơn.
- Đứng ở tab một sheet cụ thể thì CHECK PERM hẹp lại theo. Đây là hành vi được chọn có chủ đích, hint
  ở `index.html` nói rõ.
- Không đụng `src/server/`. Nhánh chấm quyền của RUN ALL giữ nguyên ngữ nghĩa khoá theo `endpointSheet`.
- Tầng 3 của `joinValueOf` đổi kết quả **cả với pool hẹp**: endpoint ở sheet không có cột khoá ghép
  trước đây chấm `'empty'`, nay ghép theo `e.name` và có thể ra `'true'`/`'false'`. Đó là ý đồ —
  nhưng nghĩa là lần chạy đầu sau thay đổi này có thể khác lần chạy trước trên cùng file. Số
  `unmatched` (mục D) là chỗ đối chiếu: nó phải giảm, không được tăng.

## Giữ độ tin của chấm điểm khi pool rộng

Công thức chấm điểm **không đổi**: `evaluateUc2Permission` (`src/server/http-client.js:58-77`) đọc
`req.permRowIndex` (dòng UC2 client ghép sẵn) và `req.authName` → dòng UC1 → `permissionColumn`. Nó
không đọc `endpointSheet` bao giờ. Với workflow "N dòng cùng cột ROLE, cùng auth" mà thay đổi này
xoá bỏ, kết quả pool rộng **y hệt** khai đủ N sheet — `uc1.find` lấy dòng đầu theo auth, mọi dòng đều
cùng `permissionColumn`.

Ba chỗ mong manh sẵn có bị pool rộng khuếch đại, xử lý dưới đây.

### A. Khoá ghép resolve nhiều tầng

`uc2.endpointColumn` là **một** tên cột, chọn từ **một** sheet (`uc2.columnSheet`). Pool rộng trải
nhiều sheet, mà các sheet đặt tên cột khác nhau — đó là lý do `endpointColumnsOfSheet` tồn tại
(`permission-match.js:20-22`). Endpoint ở sheet thiếu cột đó có `e.raw?.[endpointColumn]` rỗng, bị
`filter((it) => it.hay !== '')` (dòng 90) loại khỏi pool ghép → `permRowIndex: null` → chạy mà chấm
`'empty'`, không báo gì.

Thêm vào `permission-match.js`:

```js
// Gia tri khoa ghep cua mot endpoint. Ba tang, KHONG phai ba lan doan:
//   1. dung ten cot da chon
//   2. cot cung ten sau normalize — lech hoa/thuong hoac khoang trang thua
//   3. e.name, CHI khi sheet do khong he co cot nay
// O rong trong sheet CO cot thi tra rong, khong roi xuong tang 3: do la du lieu
// thieu, doan bang ten endpoint se ghep nham vao dong khac (thuat toan include
// bot tu dau tu khoa nen rat long).
export function joinValueOf(endpoint, endpointColumn) {
  const raw = endpoint?.raw ?? {};
  const want = normalizeName(endpointColumn);
  if (want === '') return '';

  const hit = Object.entries(raw).find(([k]) => normalizeName(k) === want);
  if (hit) return String(hit[1] ?? '');

  return String(endpoint?.name ?? '');
}
```

Tầng 3 dùng `e.name` — đúng khoá mà nhánh RUN ALL vẫn dùng (`matchPermissionRow` đọc
`req.endpointName`), nên hai đường không lệch nguồn.

`matchPermissionEndpoints` dựng pool bằng `hay: normalizeName(joinValueOf(e, endpointColumn))` thay
cho `normalizeName(e.raw?.[endpointColumn])`.

### B. Khử trùng ưu tiên bản ghép được

`dedupeEndpoints` giữ bản **gặp đầu tiên** (`endpoint-dedupe.js:12-17`). API có mặt ở Sheet 1 và
Sheet 2, bản Sheet 1 để trống ô tên → bản đó sống sót và không ghép được, còn bản Sheet 2 ghép được
thì bị vứt. Kết quả phụ thuộc thứ tự mảng.

Thay bằng một lượt khử trùng riêng của CHECK PERM, trong `permission-match.js`:

```js
// Cung khoa METHOD:pathTemplate nhu dedupeEndpoints, nhung khi hai ban dung do
// thi giu ban CO khoa ghep. Map giu thu tu chen nen ban gap dau tien van thang
// khi ca hai cung ghep duoc (hoac cung khong).
function dedupePreferJoinable(endpoints, endpointColumn) {
  const best = new Map();
  for (const e of endpoints) {
    const method = String(e.method ?? 'GET').toUpperCase();
    const path = String(e.pathTemplate ?? e.endpoint ?? '').trim();
    const key = `${method}:${path}`;
    const cur = best.get(key);
    if (!cur) { best.set(key, e); continue; }
    const curHas = normalizeName(joinValueOf(cur, endpointColumn)) !== '';
    const newHas = normalizeName(joinValueOf(e, endpointColumn)) !== '';
    if (!curHas && newHas) best.set(key, e);
  }
  return [...best.values()];
}
```

`matchPermissionEndpoints` gọi hàm này thay cho `dedupeEndpoints(filtered).unique`.
`dedupeEndpoints` **giữ nguyên** — RUN ALL và import vẫn dùng.

### C. Validate chặn nhập nhằng dòng UC1

`evaluateUc2Permission` lấy dòng UC1 **đầu tiên** khớp auth. Hai dòng cùng auth khác `permissionColumn`
thì dòng sau bị lờ im lặng. Thêm vào `validatePermissionScope`, sau vòng lặp kiểm từng dòng:

```js
// Cham diem lay dong UC1 DAU TIEN khop auth (http-client.js:67). Hai dong cung
// auth khac cot ROLE la cau hinh mo ho — dong thu hai khong bao gio duoc doc.
const roleByAuth = new Map();
const reported = new Set();
for (const m of uc1) {
  const key = normalizeName(m.authProfileName);
  if (!key) continue;
  if (!roleByAuth.has(key)) { roleByAuth.set(key, m.permissionColumn); continue; }
  const first = roleByAuth.get(key);
  if (first !== m.permissionColumn && !reported.has(key)) {
    reported.add(key);
    errors.push(
      `UC1: auth "${m.authProfileName}" khai hai cột ROLE khác nhau ("${first}" và `
      + `"${m.permissionColumn}") — chấm điểm chỉ dùng cột đầu tiên`,
    );
  }
}
```

### D. Phơi số endpoint không ghép được

`'empty'` hiện chỉ nằm rải trong bảng kết quả (`permission-table.js:20`) — không ai đếm. Đưa con số
ra trước và sau khi chạy.

`buildPermissionRunConfig` (`permission-scope.js:177-197`) trả thêm một khoá:

```js
const unmatched = endpoints.filter((e) => e.permRowIndex == null).length;
return { config, endpointCount: endpoints.length, authCount: auths.length, total, unmatched };
```

`public/js/main.js`:

- `refreshCheckPermButton` (dòng 217-229) lấy thêm `unmatched`, `endpointCount` và đặt tooltip:
  ```js
  btnCheckPerm.title = unmatched > 0
    ? `⚠ ${unmatched}/${endpointCount} endpoint không khớp dòng phân quyền nào — vẫn chạy nhưng chấm 'empty'`
    : '';
  ```
- Lúc bắt đầu CHECK PERM (dòng 343) giữ `unmatched` vào biến module-level, `onDone` (dòng 372) nối
  vào `permStatsEl` khi lớn hơn 0:
  ```js
  permStatsEl.textContent = `⏱ ${(summary.elapsedMs / 1000).toFixed(1)}s · ✓ ${summary.ok} · ✕ ${summary.failed}`
    + (permUnmatched > 0 ? ` · ⚠ ${permUnmatched} không khớp phân quyền` : '');
  ```

Đếm từ `permRowIndex` lúc dựng config, không đếm `statusPermission === 'empty'` trong kết quả —
`'empty'` còn phát sinh khi request lỗi mạng (`status === null`), trộn hai nguyên nhân vào một con số
thì nó hết chỉ được chỗ nào cần sửa.

## Test

`test/permission-match.test.js`
1. `matchPermissionEndpoints` với `selectedSheet: 'all'` gom endpoint mọi sheet, không cần dòng UC1 nào khai sheet.
2. Đổi `state.selectedSheet` sang một sheet cụ thể → pool hẹp lại đúng sheet đó.
3. `runFilter.methods` lọc pool; `savedConfig.methods` **không** còn tác dụng.
4. Khử trùng `METHOD:pathTemplate` chạy trước bước ghép UC2: hai bản cùng API ở hai sheet chỉ còn một, và bản sống sót ghép đúng dòng UC2.
5. Common endpoints trong `state.commonEndpoints` không lọt vào pool kể cả khi `commonEndpointsEnabled === true`.
6. Dòng UC1 khai `endpointSheet` trỏ sang sheet khác không thu hẹp pool nữa.

`test/permission-scope.test.js`
7. `buildPermissionRunConfig` với một dòng UC1 duy nhất → `config.endpoints` phủ mọi sheet khi đang ở tab ALL.
8. `validatePermissionScope` không báo lỗi khi UC1 chỉ có một dòng và endpoints trải nhiều sheet.
9. `validatePermissionScope` chấp nhận `uc2.columnSheet` là sheet không được dòng UC1 nào khai.
10. `validatePermissionScope` vẫn báo "Endpoints import từ bản cũ" khi endpoint trong pool thiếu `raw`.
11. Xoá/cập nhật test cũ của `uc1Sheets` (dòng 102-104) và của `endpointColumns`.

`test/permissions-panel.test.js`
12. Picker "Sheet ENDPOINTS chứa cột khoá" liệt kê mọi sheet có endpoint, kể cả sheet không dòng UC1 nào khai.

`test/request-count.test.js` (hoặc test mới cạnh nó)
13. Pool của CHECK PERM = pool RUN ALL trừ common endpoint, sau khử trùng — kiểm trực tiếp bằng một state có sheet trùng endpoint.

Cơ chế A/B/C/D — `test/permission-match.test.js` và `test/permission-scope.test.js`:

17. `joinValueOf` tầng 1: trả đúng giá trị của `endpointColumn`.
18. `joinValueOf` tầng 2: cột lệch hoa/thường hoặc thừa khoảng trắng vẫn khớp.
19. `joinValueOf` tầng 3: sheet **không có** cột đó → trả `e.name`.
20. `joinValueOf` **không** rơi xuống tầng 3 khi sheet có cột mà ô rỗng → trả `''`.
21. `joinValueOf` với `endpointColumn` rỗng → `''`, không rơi về `e.name`.
22. `matchPermissionEndpoints`: endpoint ở sheet đặt tên cột khác vẫn ghép được dòng UC2 qua tầng 3.
23. `dedupePreferJoinable` giữ bản có khoá ghép khi bản gặp trước để trống ô tên.
24. `dedupePreferJoinable` giữ bản gặp đầu tiên khi cả hai cùng ghép được — thứ tự ổn định.
25. `dedupePreferJoinable` giữ bản gặp đầu tiên khi cả hai cùng không ghép được.
26. `dedupeEndpoints` không đổi hành vi (test cũ xanh nguyên) — RUN ALL và import vẫn dùng.
27. `validatePermissionScope` báo lỗi khi hai dòng UC1 cùng auth khác `permissionColumn`.
28. Lỗi đó chỉ xuất hiện **một lần** cho mỗi auth dù có ba dòng trở lên.
29. Hai dòng UC1 cùng auth **cùng** `permissionColumn` → không lỗi (đúng workflow đang chạy hôm nay).
30. So khớp auth bỏ hoa/thường và khoảng trắng thừa, giống `evaluateUc2Permission`.
31. `buildPermissionRunConfig` trả `unmatched` = số endpoint có `permRowIndex == null`.
32. `unmatched === 0` khi mọi endpoint đều ghép được.

Gate Lưu — file test đang phủ `isConfigDirty`/`dirtyParts`:
14. Đổi `runFilter.methods` **không** còn bật badge chưa lưu.
15. `revertConfig` không đụng `runFilter.methods`.
16. `normalizeSavedConfig` bỏ qua khoá `methods` thừa trong config cũ.

## Không làm

- Không sửa `src/server/`.
- Không thêm sentinel `'all'` cho `m.endpointSheet`.
- Không bỏ cột "Sheet endpoints sẽ chạy" khỏi UC1.
- Không thêm bộ lọc riêng cho CHECK PERM. Nó soi gương RUN ALL, đúng một định nghĩa phạm vi.
