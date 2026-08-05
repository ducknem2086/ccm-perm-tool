# Design Spec: gom rule cùng target thành nhóm alias khi import endpoints

> Bổ sung lên `2026-07-29-endpoint-import-mapping-design.md` (template map cột). Không thay thế —
> chỉ đổi cách `resolveColumns` xử lý nhiều rule trỏ về cùng một target, và tách mức độ lỗi để
> sheet thiếu cột không bắt buộc vẫn nạp được.

## 1. Vấn đề

File endpoints thật (`Đối tượng sử dụng CCOS (3).xlsx`) có nhiều sheet, và **cùng một dữ liệu tên
API bị đặt tên cột khác nhau giữa các sheet**: sheet này ghi `Name`, sheet kia ghi `Name *`. Hai
cột cùng bản chất, cùng format — chỉ khác nhãn.

Template map cột hiện tại không diễn đạt được điều đó.

### 1.1 Rule sau đè rule trước

`endpoint-mapping.js:14-37` duyệt template phẳng và gán thẳng:

```js
columns[rule.target] = at;
```

Khai bốn dòng như `mapping-columns.md`:

```
name     ← Name
method   ← Method
endpoint ← API Mapping
name     ← Name *
```

thì dòng 4 đè dòng 1. Chỉ còn `Name *` có hiệu lực, mọi sheet dùng `Name` mất tên.

### 1.2 Một cột không khớp giết cả sheet

Nặng hơn nhiều. `endpoint-mapping.js:31-35` — rule không tìm thấy header thì push error. Rồi
`endpoint-mapping.js:64-66`:

```js
if (columnErrors.length > 0) {
  return { records: [], errors: columnErrors.map((reason) => ({ row: 1, reason })) };
}
```

Bất kỳ lỗi cột nào cũng trả về **zero record cho cả sheet**. Nên với bốn dòng template trên:

| Sheet | Header có | Rule trượt | Kết quả |
|---|---|---|---|
| A | `Name`, `Method`, `API Mapping` | `Name *` | **mất sạch sheet** |
| B | `Name *`, `Method`, `API Mapping` | `Name` | **mất sạch sheet** |

Cả hai sheet chết. Không có cách khai template nào cứu được cả hai cùng lúc — đó là lý do phải
gom nhóm.

## 2. Quyết định đã chốt

| Câu hỏi | Chốt |
|---|---|
| `Name` và `Name *` là gì | **Alias** — cùng dữ liệu, cùng format, khác nhãn giữa các sheet |
| Cơ chế | Gom rule cùng `target` thành **nhóm alias**, thứ tự template = độ ưu tiên |
| Sheet có cả hai cột | **Chốt một cột cho toàn sheet** — alias đầu tiên khớp thắng, không coalesce theo dòng |
| Alias lẻ không khớp | Không lỗi, rơi xuống alias kế tiếp |
| Cả nhóm không khớp — `endpoint` | **Chặn** — drop sheet |
| Cả nhóm không khớp — `name` / `method` | **Cảnh báo** — field bỏ trống, sheet vẫn nạp |
| UI drawer TEMPLATE MAP CỘT | **Không đổi** — vẫn list phẳng, người dùng tự khai đúng thứ tự |
| Default `importTemplate` trong `state.js` | **Không đổi** |

### 2.1 Vì sao chốt một cột cho toàn sheet, không coalesce theo dòng

Coalesce theo dòng (mỗi dòng lấy ô khác rỗng đầu tiên) là superset và chịu được file trộn lẫn hai
cột trong cùng sheet. Nhưng vấn đề thật nằm ở **cấp sheet** — người điền sai nhãn cột cho cả
sheet, không phải cho từng dòng. Resolve một lần cho mỗi sheet rẻ hơn, dễ giải thích hơn, và không
tạo ra hành vi "dòng này lấy cột A, dòng kia lấy cột B" khó truy vết khi dữ liệu bẩn.

Đánh đổi: sheet có cả hai cột và điền xen kẽ thì dòng nào trống ở cột thắng sẽ mất tên. Chấp nhận
— cảnh báo không bắt được ca này, nhưng `raw` vẫn giữ đủ hai cột nên UC2 tra cứu được.

### 2.2 Vì sao UI không đổi

Thứ tự dòng giờ mang ý nghĩa (ưu tiên alias), nên về lý có thể thêm nút ↑↓ hoặc gom khối theo
target. Bỏ. Thêm dòng luôn nối vào cuối, người dùng khai theo đúng thứ tự trong `mapping-columns.md`
là ra kết quả đúng. Không thêm mặt bằng UI cho một ràng buộc tự nhiên đã đúng.

## 3. Thiết kế

Sửa **một file**: `public/js/shared/endpoint-mapping.js`.

Không đụng `template-drawer.js`, `state.js`, `endpoint-list.js`, `src/server/file-import.js`.

### 3.1 `resolveColumns` — gom nhóm

Chữ ký mới:

```js
resolveColumns(headers, template, sheetName)
```

`sheetName` tùy chọn. Thiếu thì message bỏ tiền tố sheet — 16 test hiện có gọi hai tham số nên
không gãy.

Trả về:

```js
{ columns, errors, warnings }
```

`columns` giữ nguyên hình dạng `{ target: colIndex }`. `errors` là lỗi **chặn**. `warnings` là
cảnh báo **không chặn** — field mới.

Thuật toán:

1. Duyệt template theo thứ tự, bỏ rule có `selector` rỗng hoặc `target` ngoài `TARGETS`.
   Gom phần còn lại vào `Map<target, rule[]>` — thứ tự chèn giữ nguyên thứ tự template.
2. Với mỗi nhóm, duyệt alias lần lượt. Alias đầu tiên định vị được cột thì gán
   `columns[target]` và **dừng nhóm**.
   - `type: 'name'` — so khớp `norm(header) === norm(selector)` (giữ nguyên hàm `norm` hiện có:
     trim, gộp khoảng trắng, lowercase).
   - `type: 'index'` — `selector` phải là số nguyên trong `[1, headers.length]`, quy về 0-based.
   - Không thỏa → **miss**, rơi xuống alias kế. Index ngoài khoảng cũng chỉ là miss, không lỗi.
3. Nhóm không alias nào khớp:
   - `target === 'endpoint'` → push vào `errors`
   - `target` khác → push vào `warnings`
4. Template không có nhóm `endpoint` nào → push vào `errors` (giữ nguyên check cũ).

Ví dụ với template bốn dòng ở §1.1:

```
nhóm 'name'     = ["Name", "Name *"]
nhóm 'method'   = ["Method"]
nhóm 'endpoint' = ["API Mapping"]

Sheet A — headers: Name | Method | API Mapping
  name     → "Name" khớp                  → cột 0
  method   → "Method" khớp                → cột 1
  endpoint → "API Mapping" khớp           → cột 2

Sheet B — headers: Name * | Method | API Mapping
  name     → "Name" miss → "Name *" khớp  → cột 0
  method   → "Method" khớp                → cột 1
  endpoint → "API Mapping" khớp           → cột 2

Sheet C — headers: Method | API Mapping | BE Category
  name     → miss cả hai                  → warning, columns.name undefined
  method   → khớp                         → cột 0
  endpoint → khớp                         → cột 1
```

### 3.2 Định dạng message

Lỗi chặn (`endpoint`):

```
Sheet "Phân quyền button" — không tìm thấy cột nào cho trường endpoint.
Đã thử: "API Mapping". Header trong file: Name | Method | BE Category
```

Cảnh báo (`name` / `method`):

```
Sheet "Widget" — không tìm thấy cột nào cho trường name.
Đã thử: "Name", "Name *". Trường này để trống.
```

Message một dòng, ghép bằng khoảng trắng — hộp lỗi ở `endpoint-list.js:295-299` render mỗi
message thành một `div`.

Ràng buộc format phải giữ, vì test hiện có bám vào:

- Liệt kê **mọi** selector đã thử, nguyên văn — test `bao loi kem danh sach header` khớp `/Verb/`,
  test index ngoài khoảng khớp `/9/`.
- Lỗi chặn kèm `Header trong file: ` + `headers.join(' | ')` — test khớp
  `/Tên API \| HTTP Method \| Đường dẫn/`.
- Lỗi thiếu dòng endpoint chứa chữ `endpoint` — test khớp `/endpoint/`.

Tiền tố `Sheet "..." — ` là bổ sung mới. File thật nhiều sheet; không có tên sheet thì cảnh báo
không chỉ được chỗ nào sai. Bỏ tiền tố khi `sheetName` rỗng hoặc thiếu.

### 3.3 `mapSingleSheetRows` — chỉ drop sheet khi có `errors`

```js
function mapSingleSheetRows(sheet, template, sheetName) {
  const { headers = [], rows = [] } = sheet ?? {};
  const { columns, errors: colErrors, warnings } = resolveColumns(headers, template, sheetName);

  if (colErrors.length > 0) {
    return { records: [], errors: colErrors.map((reason) => ({ row: 1, reason })) };
  }

  const records = [];
  const errors = warnings.map((reason) => ({ row: 1, reason }));
  // ... phần còn lại giữ nguyên
}
```

`warnings` đi vào mảng `errors` trả ra ngoài để hộp lỗi vẫn hiện — cảnh báo, không chặn. Gõ sai
`Nmae` vẫn thấy được thay vì im lặng.

Phần thân vòng lặp dòng **không đổi**. `columns.name` undefined vẫn an toàn:
`cells[undefined] ?? ''` → `''` — đúng hành vi hiện có (test `mapRows de trong name khi template
khong khai dong name`).

### 3.4 `mapRows` — truyền tên sheet xuống

Đổi duy nhất:

```js
const { records, errors } = mapSingleSheetRows(sheet, template, sheetName);
```

Phần gán `r.sheetName`, dedupe, và hình dạng trả về `{ records, errors, skipped }` giữ nguyên.

### 3.5 Phân biệt "không khai" và "khai mà miss"

Quan trọng, đừng lẫn:

| Tình huống | Nhóm | Kết quả |
|---|---|---|
| Template **không có** dòng nào target `name` | không tồn tại | im lặng, `name = ''` |
| Template **có** dòng `name` nhưng không alias nào khớp | tồn tại, miss hết | **warning**, `name = ''` |

Test `mapRows de trong name khi template khong khai dong name` rơi vào hàng đầu — không sinh
warning. Giữ đúng như vậy.

## 4. Test

Thêm 9 test mới vào `test/endpoint-mapping.test.js`.

Mốc hiện tại (đo trước khi sửa):

- `test/endpoint-mapping.test.js` + `test/endpoint-dedupe.test.js` — **29 test, xanh hết**.
  Đây là hai file duy nhất chạm `resolveColumns` / `mapRows`. Sau thay đổi phải là 38 xanh.
- Toàn bộ suite — **868 test, 866 xanh, 2 đỏ**. Hai test đỏ là `test/runner.test.js` và
  `test/worker-pool.test.js`, **đỏ sẵn từ trước**, không liên quan thay đổi này. Đừng đuổi theo.

### 4.1 Soát test cũ

| Test | Sau thay đổi |
|---|---|
| `TARGETS va METHODS dung danh sach da chot` | pass — `TARGETS` không đổi |
| `resolveColumns khop cot theo ten` | pass — nhóm một phần tử |
| `resolveColumns bo qua hoa thuong va khoang trang thua` | pass — `norm` giữ nguyên |
| `resolveColumns khop cot theo index 1-based` | pass |
| `resolveColumns bao loi khi index ngoai khoang` | pass — nhóm `endpoint` miss hết → `errors`, message chứa `9` |
| `resolveColumns bao loi kem danh sach header` | pass — `errors`, message chứa `Verb` và header list |
| `resolveColumns bao loi khi template thieu dong endpoint` | pass — check §3.1 bước 4 |
| `resolveColumns bo qua dong template co selector rong` | pass — lọc trước khi gom |
| `mapRows khong nap gi khi cot khong khop` | pass — `endpoint` vẫn chặn |
| `mapRows de trong name khi template khong khai dong name` | pass — §3.5 hàng đầu |
| 11 test `mapRows` còn lại (method, path, dòng rỗng, dedupe, raw) | pass — không đụng thân vòng lặp |
| 8 test `endpoint-dedupe.test.js` | pass — `mapRows` giữ nguyên hình dạng trả về |

### 4.2 Test mới

`resolveColumns`:

1. Alias — sheet có `Name` → `columns.name` trỏ cột `Name`, `errors` và `warnings` rỗng
2. Alias — sheet có `Name *` → `columns.name` trỏ cột `Name *`, `errors` và `warnings` rỗng
3. Alias — sheet có **cả hai** → thắng theo thứ tự template (`Name`), không phải cột đứng trước
   trong file
4. Alias `name` miss hết → `columns.name` undefined, `warnings.length === 1`, `errors` rỗng
5. Alias `endpoint` miss hết → `errors.length === 1`, message liệt kê **đủ** alias đã thử
6. Alias đầu là index ngoài khoảng, alias sau khớp theo tên → `errors` và `warnings` rỗng
7. Truyền `sheetName` → message chứa tên sheet; không truyền → không có tiền tố

`mapRows`:

8. Hai sheet lệch nhãn cột (`Name` / `Name *`) → **cả hai** ra record, `name` đúng từng sheet
9. Sheet thiếu cả hai alias `name` → sheet **vẫn** nạp records, `name === ''`, có một warning
   trong `errors` trả ra

Chạy: `npm test`

## 5. Ngoài phạm vi

- Đổi UI drawer TEMPLATE MAP CỘT (gom khối, nút ↑↓, badge ưu tiên)
- Đổi `defaultConfig().importTemplate` trong `state.js`
- Coalesce theo từng dòng
- Thêm target mới (`usecase`, `category`…) vào `TARGETS`
- Đụng `permissionMapping` UC1/UC2/UC3
