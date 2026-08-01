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
const unique = dedupeEndpoints(filtered).unique;
```

Import `filterEndpoints` từ `./run-filter.js`. Bỏ import `uc1Sheets`, bỏ biến `uc1` và `wantedMethods`.

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

Gate Lưu — file test đang phủ `isConfigDirty`/`dirtyParts`:
14. Đổi `runFilter.methods` **không** còn bật badge chưa lưu.
15. `revertConfig` không đụng `runFilter.methods`.
16. `normalizeSavedConfig` bỏ qua khoá `methods` thừa trong config cũ.

## Không làm

- Không sửa `src/server/`.
- Không thêm sentinel `'all'` cho `m.endpointSheet`.
- Không bỏ cột "Sheet endpoints sẽ chạy" khỏi UC1.
- Không thêm bộ lọc riêng cho CHECK PERM. Nó soi gương RUN ALL, đúng một định nghĩa phạm vi.
