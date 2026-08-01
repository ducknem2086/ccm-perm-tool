# UC1 — option "Tất cả sheet" cho cột "Sheet endpoints sẽ chạy"

Ngày: 2026-08-01

## Vấn đề

Mỗi dòng UC1 là bộ ba `{ permissionColumn, endpointSheet, authProfileName }`. Cột `endpointSheet`
chỉ nhận đúng một tên sheet, nên muốn CHECK PERM quét hết endpoint đang có thì phải tạo N dòng —
một dòng cho mỗi sheet — lặp lại y hệt cùng cột ROLE và cùng auth profile. File endpoints có bao
nhiêu sheet thì bấy nhiêu dòng, và import lại file có thêm sheet mới thì phải nhớ khai bù.

Việc lặp này không mang thêm thông tin gì. Ở đường CHECK PERM, cột ROLE được chọn theo **auth
profile**, không theo sheet: `evaluateUc2Permission` (`src/server/http-client.js:67`) tìm dòng UC1
bằng `uc1.find((m) => m.authProfileName === req.authName)`. Nghĩa là trong N dòng trùng auth, chỉ
dòng đầu tiên chấm điểm; N−1 dòng còn lại chỉ có tác dụng nới **phạm vi chạy** qua `uc1Sheets()`.

## Quyết định

Thêm giá trị sentinel `'all'` cho `m.endpointSheet`, nghĩa là "mọi sheet đang có trong
`state.endpoints`" — tương ứng tab ALL của bảng endpoints.

- `'all'` là **wildcard**, được trộn tự do với các dòng khai sheet cụ thể. `uc1Sheets()` trả về
  union. Giữ nguyên ca dùng: auth A quét all, auth B chỉ Sheet 2 với cột ROLE khác.
- Phạm vi được nở ra **lúc đọc**, không materialize thành N dòng lúc lưu. Import lại file endpoints
  có sheet mới thì sheet đó tự vào phạm vi, không phải sửa mapping.
- **Không đụng `src/server/`.** Xem mục "Giới hạn đã biết".

Chuỗi `'all'` đã là quy ước sẵn của repo cho ý nghĩa này: `state.selectedSheet` (`state.js:42`),
tab ALL (`endpoint-list.js:165`), `filterBySheet` (`endpoint-list.js:30`), `run-filter.js:54`.
Dùng lại đúng chuỗi đó thay vì đặt sentinel mới (`__ALL__`) để không có hai quy ước song song.

Đã cân nhắc và loại:

- **Predicate `uc1CoversSheet(uc1, sheetName)` thay cho Set** — chỗ lọc endpoint thì gọn hơn, nhưng
  `endpointColumns` và picker "Sheet ENDPOINTS chứa cột khoá" của UC2 vẫn cần danh sách tên sheet cụ
  thể, nên vẫn phải giữ thêm một helper nở-ra nữa. Nhiều API hơn mà không lợi hơn.
- **Materialize N dòng khi bấm chọn `'all'`** — không đụng core, nhưng chính là thao tác lặp mà tính
  năng này sinh ra để xoá, và lệch ngay khi file endpoints có sheet mới.

## Thay đổi theo file

### `public/js/shared/permission-scope.js`

Export hằng và đổi chữ ký `uc1Sheets`:

```js
export const ALL_SHEETS = 'all';

// 'all' la sentinel, KHONG phai ten sheet — phai no ra thanh ten that truoc khi
// ai do .has() no, khong thi moi endpoint deu roi ngoai pham vi.
export function uc1Sheets(uc1, endpoints) {
  const rows = uc1 ?? [];
  const named = rows.map((m) => m.endpointSheet).filter((s) => s && s !== ALL_SHEETS);
  if (!rows.some((m) => m.endpointSheet === ALL_SHEETS)) return new Set(named);
  return new Set([...named, ...(endpoints ?? []).map((e) => e.sheetName ?? 'Sheet 1')]);
}
```

Hai ràng buộc của hàm này:

1. Kết quả **không bao giờ chứa chuỗi `'all'`**. Set này được dùng làm `sheets.has(e.sheetName)` ở
   `matchPermissionEndpoints` và `endpointColumns`; lọt sentinel vào thì nó thành một tên sheet ma
   không endpoint nào khớp.
2. Nở ra bằng `e.sheetName ?? 'Sheet 1'`, **không** dùng `getUniqueSheets` (`endpoint-list.js:23`) —
   hàm đó `filter(Boolean)` nên bỏ rơi endpoint thiếu `sheetName`, trong khi bộ lọc ở
   `permission-match.js:76` lại quy chúng về `'Sheet 1'`. Lệch một chỗ là endpoint không sheetName
   biến mất khỏi phạm vi mà không báo gì.

Không truyền `endpoints` mà UC1 có dòng `'all'` thì phần wildcard đóng góp rỗng — hỏng theo hướng
"chạy thiếu", không phải "chạy nhầm sheet".

### Call site của `uc1Sheets` — thuần truyền thêm tham số

| File | Dòng | Sửa thành |
|---|---|---|
| `public/js/shared/permission-match.js` | 8 (`endpointColumns`) | `uc1Sheets(uc1, endpoints)` |
| `public/js/shared/permission-match.js` | 73 (`matchPermissionEndpoints`) | `uc1Sheets(uc1, state?.endpoints)` |
| `public/js/shared/permission-scope.js` | 131 (`scopedRaw`) | `uc1Sheets(uc1, state?.endpoints)` |
| `public/js/shared/permission-scope.js` | 136 (check `uc2.columnSheet`) | `uc1Sheets(uc1, state?.endpoints)` |
| `public/js/ui/permissions-panel.js` | 207 (`uc1SheetList`) | `uc1Sheets(state.permissionMapping.usecase1, state.endpoints)` |

Không có call site nào khác — `uc1Sheets` chỉ được import ở `permission-match.js`,
`permissions-panel.js` và dùng nội bộ trong `permission-scope.js`.

### `validatePermissionScope` (`permission-scope.js:113-129`)

Vòng lặp kiểm từng dòng UC1 hiện báo lỗi `UC1: sheet "X" không còn endpoint nào` khi
`!endpointSheets.has(m.endpointSheet)`. Với `m.endpointSheet === ALL_SHEETS` thì `'all'` không nằm
trong `endpointSheets` nên sẽ báo lỗi sai. Sửa:

```js
if (m.endpointSheet === ALL_SHEETS) {
  if (endpointSheets.size === 0) errors.push('UC1: chọn "Tất cả sheet" nhưng chưa import endpoint nào');
} else if (!endpointSheets.has(m.endpointSheet)) {
  errors.push(`UC1: sheet "${m.endpointSheet}" không còn endpoint nào`);
}
```

Check `uc2.columnSheet` phải thuộc `uc1Sheets` (dòng 136) không cần sửa: `uc1Sheets` đã nở ra nên
mọi sheet đều hợp lệ khi có dòng `'all'`.

Các check còn lại (cột ROLE tồn tại, ROLE không trùng khoá ghép UC2, auth profile tồn tại, endpoint
thiếu `raw`) không phụ thuộc `endpointSheet` — giữ nguyên.

### `public/js/ui/permissions-panel.js`

**Select sheet của mỗi dòng UC1 (dòng 251-265):** chèn option `'all'` lên đầu, trước danh sách
`getUniqueSheets(state.endpoints)`:

```js
const optAll = document.createElement('option');
optAll.value = ALL_SHEETS;
optAll.textContent = '⟨Tất cả sheet⟩';
sheetSel.append(optAll);
```

Nhãn bọc `⟨⟩` để phân biệt với một sheet thật tên "all". Handler `change` giữ nguyên (vẫn gọi
`render()` — đổi phạm vi làm đổi danh sách sheet tham chiếu của UC2).

**Mặc định khi bấm "＋ Thêm mapping" (dòng 98):** giữ nguyên `getUniqueSheets(...)[0] ?? 'Sheet 1'`.
Không đổi mặc định sang `'all'` — người dùng thêm dòng mới thường là để khai một cột ROLE hẹp hơn.

**Picker "Sheet ENDPOINTS chứa cột khoá" của UC2 (dòng 207-222):** không sửa logic, tự đúng nhờ
`uc1Sheets` đã nở ra — chọn `'all'` ở UC1 thì picker này liệt kê mọi sheet. Nhánh
`if (!uc1SheetList.includes(columnSheet))` vẫn giữ chức năng kéo `columnSheet` về giá trị hợp lệ khi
người dùng thu hẹp phạm vi.

### `public/index.html`

Nối vào hint UC1 (dòng 171, sau câu "chạy hết sheet đó"):

> Chọn `⟨Tất cả sheet⟩` để chạy mọi endpoint đang có, tương đương tab ALL của bảng endpoints.

Thêm một dòng hint cảnh báo, dùng lại class `perm-uc1-warn` đã có:

> ⚠ `⟨Tất cả sheet⟩` chỉ có tác dụng với nút CHECK PERM. RUN ALL vẫn chấm cột quyền theo đúng tên
> sheet, nên dòng này không chấm được gì ở tab OUTPUT — cần cột quyền ở RUN ALL thì khai sheet cụ thể.

Không thêm CSS mới.

## Giới hạn đã biết — RUN ALL

`evaluatePermission` (`src/server/http-client.js:99`) lọc `uc1.filter((m) => m.endpointSheet === req.sheetName)`
rồi trả `'empty'` nếu rỗng. Nhánh này chỉ chạy cho RUN ALL (`req.permRowIndex == null && !req.permRun`);
CHECK PERM rẽ sớm ở dòng 84-85 sang `evaluateUc2Permission`, hàm không đọc `endpointSheet`.

Theo quyết định phạm vi, spec này **không sửa `src/server/`**. Hệ quả: UC1 chỉ có dòng `'all'` thì
cột `statusPermission` của RUN ALL là `'empty'` cho mọi request. Hint ở `index.html` là phần bù để
việc này không im lặng.

Muốn gỡ sau này thì chỉ cần một dòng — `m.endpointSheet === 'all' || m.endpointSheet === req.sheetName`
— nhưng nằm ngoài spec này.

## Test

Bổ sung vào file test sẵn có, theo đúng style `node:test` + `assert` đang dùng.

`test/permission-scope.test.js`
1. `uc1Sheets` với dòng `'all'` trả về mọi sheet của `endpoints`, và **không** chứa chuỗi `'all'`.
2. `uc1Sheets` trộn `'all'` + sheet cụ thể → vẫn là union, không trùng lặp.
3. `uc1Sheets(uc1)` thiếu tham số `endpoints` mà UC1 có `'all'` → Set rỗng (fail-closed).
4. `uc1Sheets` nở ra gồm cả endpoint thiếu `sheetName` (quy về `'Sheet 1'`).
5. `validatePermissionScope` **không** báo `sheet "all" không còn endpoint nào`.
6. `validatePermissionScope` báo lỗi khi có dòng `'all'` nhưng `state.endpoints` rỗng.
7. `buildPermissionRunConfig` với một dòng `'all'` duy nhất → `config.endpoints` phủ mọi sheet.
8. Cập nhật test hiện có ở dòng 103 cho chữ ký mới.

`test/permission-match.test.js`
9. `matchPermissionEndpoints` với một dòng `'all'` gom endpoint mọi sheet, vẫn khử trùng
   `METHOD:pathTemplate` (API cấp cho hai sheet chỉ chạy một lần).
10. Bộ lọc method của topbar vẫn áp lên phạm vi `'all'`.
11. `endpointColumns` với `'all'` → union cột raw của mọi sheet, giữ thứ tự gặp lần đầu.

`test/permissions-panel.test.js`
12. Select sheet của dòng UC1 có option `value="all"` nằm đầu danh sách.
13. Chọn `'all'` → picker "Sheet ENDPOINTS chứa cột khoá" của UC2 liệt kê mọi sheet.
14. Dòng UC1 đã lưu với `endpointSheet: 'all'` render lại đúng giá trị (`sheetSel.value === 'all'`).

## Không làm

- Không sửa `src/server/http-client.js` (xem "Giới hạn đã biết").
- Không đổi shape `savedConfig` / `permissionMapping` — config đã lưu từ bản cũ đọc lên chạy nguyên vẹn.
- Không thêm nút "chọn hết sheet" hay multi-select sheet cho một dòng UC1. Một sentinel đủ cho nhu
  cầu; multi-select là API rộng hơn chưa có ca dùng.
- Không đổi mặc định của dòng UC1 mới sang `'all'`.
