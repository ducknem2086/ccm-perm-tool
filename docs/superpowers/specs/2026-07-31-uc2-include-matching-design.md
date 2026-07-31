# Design Spec: UC2 match endpoints kiểu "include"

## 1. Bối cảnh

Spec `2026-07-31-check-permission-tab-design.md` dựng tab CHECK PERMISSION với quy tắc khớp tên
1-1 tuyệt đối: `normalizeName(row[idx]) === normalizeName(endpoint.name)`
(`public/js/shared/permission-scope.js:19-25`). Thực tế dữ liệu không chạy được luật đó — một dòng
trong file phân quyền mô tả **một chức năng**, còn file endpoints tách chức năng đó thành **nhiều
bản ghi API**. Tên hai bên liên hệ với nhau theo kiểu chứa nhau, không phải bằng nhau.

Spec này đổi chiều quan hệ: từ mỗi dòng UC2 tìm ra tập endpoint, thay vì từ mỗi endpoint tìm ra một
dòng UC2.

**RUN ALL và tab OUTPUT giữ nguyên hoàn toàn** — luật khớp cũ vẫn sống ở đó, không sửa một dòng.

## 2. Quyết định đã chốt

| Câu hỏi | Chốt |
|---|---|
| "Cột đích" của UC2 | Cột bất kỳ của file endpoints — phải giữ raw cells lúc import |
| Nguồn header cho dropdown cột đích | Union header mọi sheet khai trong UC1 |
| Phạm vi quét endpoint | Các sheet khai trong UC1, trên `state.endpoints` đã import |
| Thuật toán include | 4 vòng, bớt từ **đầu**, dừng ở vòng đầu tiên có kết quả |
| Khử trùng | Theo một cột cấu hình, phạm vi **toàn cục** (bất kể sheet) |
| Endpoint bị nhiều dòng UC2 với tới | Dòng UC2 xuất hiện trước trong file giữ chỗ |
| Sheet-gating khi chấm điểm | **Bỏ** — chấm theo cột quyền của dòng UC2, không theo sheet |
| Nơi chạy thuật toán | Client, một lần mỗi run; server chỉ đọc lại kết quả |
| RUN ALL | Không đụng, giữ exact match + sheet-gating |

## 3. Mô hình dữ liệu

### 3.1 Endpoint record giữ raw cells

`public/js/shared/endpoint-mapping.js:76` hiện vứt mọi cột không nằm trong template:

```javascript
records.push({ name: at('name'), method, endpoint });
```

Đổi thành:

```javascript
records.push({ name: at('name'), method, endpoint, raw: rawOf(cells, headers) });
```

`rawOf` dựng object `{ [header]: value }`, **bỏ ô rỗng và bỏ header rỗng** — file Excel thường thừa
cột trắng ở đuôi, giữ hết sẽ phình `localStorage` vô ích.

Header trùng tên trong cùng sheet: cột xuất hiện sau ghi đè cột trước. Chấp nhận — file endpoints
thật không có header trùng, và xử lý riêng cho trường hợp này tốn code hơn giá trị nó mang lại.

### 3.2 Union header cho dropdown

Không thêm state key mới. Danh sách cột đích suy ra từ union `Object.keys(e.raw)` của các endpoint
thuộc sheet khai trong UC1, giữ thứ tự gặp lần đầu:

```javascript
export function endpointColumns(endpoints, uc1)   // → string[]
```

Sheet nào không có cột đang chọn thì endpoint của sheet đó đơn giản là không match — không vỡ.

### 3.3 Endpoint import từ bản cũ

Cấu hình đã lưu trong `localStorage` trước thay đổi này không có `raw`. Không migrate được vì dữ
liệu gốc đã mất. `validatePermissionScope` chặn với thông báo yêu cầu import lại file endpoints.

### 3.4 UC2 lên 3 trường

`public/js/state.js:49`:

```javascript
usecase2: {
  permissionColumn: '',   // cot nguon o file phan quyen   (da co)
  endpointColumn: '',     // cot dich o file endpoints     (moi)
  dedupeColumn: ''        // cot khu trung o file endpoints (moi)
}
```

`load()` và `applyConfig()` (`state.js:132-139`, `157-164`) đã spread `usecase2` từ base nên hai
khóa mới tự có mặc định `''` với cấu hình cũ. Không cần code migrate.

## 4. Thuật toán match — `public/js/shared/permission-match.js` (mới)

Tách khỏi `permission-scope.js` vì hai file trả lời hai câu khác nhau: file này trả lời "dòng UC2
nào kéo về endpoint nào", `permission-scope.js` trả lời "run này gồm những gì". Gộp lại sẽ thành một
file làm hai việc.

```javascript
export function matchUc2ToEndpoints(state)
// → [{ endpoint, permName, permRowIndex }]
```

### 4.1 Các bước

```javascript
// Buoc 1 — chuan hoa mot lan cho ca run. scoped = endpoint thuoc sheet khai
// trong UC1, da qua filterEndpoints (enabled + method filter) nhu spec cu.
const pool = scoped
  .map((e) => ({ e, hay: norm(e.raw?.[endpointColumn]), key: norm(e.raw?.[dedupeColumn]) }))
  .filter((it) => it.hay !== '' && it.key !== '');

// Buoc 2 — index cho vong 0, tra O(1).
const exact = new Map();          // hay → item[]
for (const it of pool) {
  if (!exact.has(it.hay)) exact.set(it.hay, []);
  exact.get(it.hay).push(it);
}

// Buoc 3 — duyet theo dung thu tu dong trong file phan quyen, nen dong den
// truoc luon giu cho khi hai dong cung voi toi mot endpoint.
const taken = new Map();          // dedupeKey → { endpoint, permName, permRowIndex }

for (const [rowIndex, row] of rows.entries()) {
  const words = norm(row[srcIdx]).split(' ').filter(Boolean);

  for (let k = 0; k < 4; k += 1) {
    if (k >= words.length) break;
    const needle = words.slice(k).join(' ');        // bot tu DAU

    const hits = k === 0
      ? (exact.get(needle) ?? [])
      : pool.filter((it) => it.hay.includes(needle));

    if (hits.length === 0) continue;

    for (const h of hits) {
      if (!taken.has(h.key)) {
        taken.set(h.key, { endpoint: h.e, permName: String(row[srcIdx]), permRowIndex: rowIndex });
      }
    }
    break;                                          // dung khi co ket qua
  }
}

return [...taken.values()];
```

Vòng 0 chỉ nhận `===`; vòng 1–3 nhận `includes`. Vòng nào ra ≥1 kết quả thì lấy nguyên vòng đó rồi
thoát — khớp chặt luôn thắng khớp lỏng.

`break` đặt sau vòng lặp gán, **không** phụ thuộc việc `taken` có nhận thêm phần tử nào không: vòng
đã tìm ra endpoint thì coi như xong, kể cả khi mọi endpoint đó đã bị dòng UC2 trước giữ chỗ. Nới
tiếp sang vòng lỏng hơn chỉ kéo về endpoint lạc.

`permName` là **giá trị gốc trong file phân quyền**, giữ nguyên hoa/thường, không normalize — đây là
chuỗi hiển thị cho người dùng.

Endpoint có ô cột đích hoặc ô cột khử trùng rỗng bị loại khỏi `pool` ngay từ bước 1: không có khóa
khử trùng thì mọi bản ghi rỗng sẽ gộp thành một, âm thầm nuốt mất endpoint thật. Loại sớm và báo số
lượng bị loại trong toast trước khi chạy, để người dùng biết mình chọn nhầm cột.

### 4.2 Ví dụ

```
kw = "Tra cứu whitelist roaming VIP"

vòng 0: "Tra cứu whitelist roaming VIP"  ===  → 0 hit
vòng 1: "cứu whitelist roaming VIP"       ⊆   → 0 hit
vòng 2: "whitelist roaming VIP"           ⊆   → 5 hit  ← LẤY, THOÁT
vòng 3: (không chạy)
```

Bớt từ đầu vì tiền tố trong file phân quyền hay là từ chung ("Tra cứu", "Quản lý"), phần định danh
nằm về cuối chuỗi. Cắt dần tiền tố giữ lại phần đặc trưng.

### 4.3 Chi phí

```
chuan hoa pool : E lan          (1 lan / run)
vong 0         : Map lookup, O(1)
vong 1..3      : R x 3 x E lan String.includes
```

R = 500 dòng UC2, E = 1000 endpoint → ~1.5M `includes` trên chuỗi ngắn, vài chục ms, chạy đúng một
lần mỗi run. Không tối ưu thêm.

Đường lùi khi dữ liệu phình (R × E > 10M): index n-gram theo từ — mỗi `hay` gồm W từ sinh W(W+1)/2
chuỗi con, mọi vòng thành O(1) lookup. Đánh đổi: containment chuyển từ mức ký tự sang mức từ, nên
`"cuu white"` không còn khớp `"tra cuu whitelist"`. Chưa cần ở quy mô hiện tại.

## 5. Luật chấm `status_permission` mới

Bỏ sheet-gating tạo một lỗ: mọi auth trong run đều có dòng UC1, nên `exactMatch` luôn tìm thấy và
nhánh fallback 403 (`src/server/http-client.js:89-97`) chết hẳn. Luật viết lại, đọc theo **cột quyền
trong dòng UC2** thay vì theo sheet:

```
cell = o cua dong UC2, tai cot quyen ung voi auth dang chay

status === null  → 'empty'
cell === 'x'     → status !== 403 ? 'true' : 'false'
cell !== 'x'     → status === 403 ? 'true' : 'false'
```

`'x'` là dấu hiệu auth profile được cấp quyền trên chức năng đó. Có quyền thì bất kỳ mã nào **khác
403** đều là đạt — endpoint có thể trả 400/404/500 vì lý do nghiệp vụ khác, cổng quyền vẫn qua.
Không có `'x'` là không có quyền, phải bị chặn 403.

`status === null` (timeout, DNS hỏng, lỗi mạng) không chứng minh được gì về quyền → `'empty'`, đúng
nghĩa "rơi ngoài các case" của `require.md:10`. Lọc riêng được để chạy lại.

Hệ quả: trong tab CHECK PERMISSION, `'empty'` chỉ còn xuất hiện khi request không có status. Tab
OUTPUT giữ nguyên ba giá trị theo luật cũ.

## 6. Thay đổi phía server — ba chỗ

### 6.1 `src/server/request-builder.js`

`buildOne` (dòng 237-253) thêm hai khóa passthrough:

```javascript
permName: endpoint.permName ?? null,
permRowIndex: endpoint.permRowIndex ?? null,
```

RUN ALL không gắn hai khóa này lên endpoint nên chúng luôn `null` ở đường cũ.

### 6.2 `src/server/http-client.js`

`evaluatePermission` rẽ nhánh ngay đầu hàm, trước mọi thứ khác:

```javascript
if (req.permRowIndex != null) {
  return evaluateUc2Permission({ req, status, permissionFile, permissionMapping });
}
```

`evaluateUc2Permission` (hàm mới cùng file):

- Đọc thẳng `permissionFile.rows[req.permRowIndex]` — không quét, không so chuỗi.
- Tìm dòng UC1 có `authProfileName` khớp `req.authName` trên **toàn bộ** `usecase1`, không lọc theo
  `req.sheetName`.
- Áp luật ba dòng ở §5.
- Không tìm thấy dòng UC1 nào cho auth đó → `'empty'`. Về lý thuyết không xảy ra vì `auths` của run
  là union UC1, nhưng trả `'empty'` an toàn hơn là ném lỗi giữa run.

Toàn bộ code cũ bên dưới nhánh này **không đổi một dòng**.

### 6.3 `finalize`

```javascript
const permissionMatchedName = req.permName ?? (permissionFile?.filename
  ? matchPermissionName(req.endpointName, permissionFile, permissionMapping?.usecase2 ?? {})
  : null);
```

Đường CHECK PERM lấy `req.permName` đã bake sẵn; RUN ALL rơi xuống nhánh cũ y nguyên
(`http-client.js:112-114`).

## 7. Thay đổi UI

### 7.1 `public/js/ui/permissions-panel.js`

Khối UC2 thêm hai select, cùng cách select cột nguồn đang làm (`permissions-panel.js:83-87`,
`110-117`):

```
Cột nguồn (phân quyền): [ TÊN CHỨC NĂNG ▾ ]
Cột đích (endpoints):   [ name ▾ ]
Cột khử trùng:          [ ma_chuc_nang ▾ ]
```

Hai select mới đọc option từ `endpointColumns(state.endpoints, uc1)`. Khi UC1 đổi sheet, danh sách
option đổi theo; giá trị đang chọn mà biến mất khỏi danh sách thì để nguyên — `validatePermissionScope`
sẽ báo, tự động đổi sang cột khác dễ làm người dùng chạy nhầm cột mà không biết.

### 7.2 `public/js/ui/permission-table.js`

Bảng 7 cột lên 8 — tách đôi cột name:

| # | Header | Nguồn | Ghi chú |
|---|---|---|---|
| 1 | Status | `rec.response.status` | `—` khi null |
| 2 | Status Perm | `rec.statusPermission` | xanh `true`, đỏ `false`, xám `empty` |
| 3 | Auth | `rec.authName` | |
| 4 | Endpoint | `rec.pathTemplate` | `title` là URL đầy đủ |
| 5 | Role | `rec.sheetName` | sheet gốc của bản ghi được giữ sau khử trùng |
| 6 | Endpoint Name | `rec.endpointName` | tên trong file endpoints |
| 7 | UC2 Name | `rec.permissionMatchedName` | tên chức năng trong file phân quyền |
| 8 | Response Body | `bodyPretty(rec)` | cắt một dòng, click mở drawer |

Cột Role giữ lại dù không còn tham gia chấm điểm — nó cho biết bản ghi được giữ đến từ sheet nào sau
khử trùng toàn cục, thông tin cần khi soi lại kết quả bất thường.

### 7.3 `public/js/shared/permission-filter-logic.js`

`emptyPermFilter()` thêm khóa `epName`; khóa `permName` giữ nguyên ý nghĩa (tên UC2). Cả hai khớp
chuỗi con không phân biệt hoa thường. Mọi điều kiện vẫn kết hợp bằng AND.

### 7.4 Xuất Excel

`PERMISSION_EXPORT_COLUMNS` trong `src/server/excel-export.js` lên 8 cột, chèn `Endpoint Name`
(`key: 'epName'`, width 35) trước `UC2 Name` (`key: 'permName'`, width 35). `toRow` thêm
`epName: rec.endpointName ?? ''`.

## 8. Validate bổ sung — `validatePermissionScope`

Thêm vào bảng có sẵn ở `permission-scope.js:52-98`:

| Điều kiện | Thông báo |
|---|---|
| Có endpoint trong sheet UC1 nhưng thiếu `raw` | `Endpoints import từ bản cũ — cần import lại file endpoints` |
| `endpointColumn` rỗng hoặc ∉ union header | `Chưa chọn cột đích (UC2), hoặc cột đã biến mất` |
| `dedupeColumn` rỗng hoặc ∉ union header | `Chưa chọn cột khử trùng (UC2), hoặc cột đã biến mất` |
| Sau match: 0 endpoint | `Không dòng UC2 nào kéo về được endpoint` |

Lỗi cũ `Không endpoint nào khớp cột Name của file phân quyền` bỏ đi — dòng cuối bảng trên thay thế.

`buildPermissionRunConfig` thay bước lọc `matchPermissionName(...) !== null` bằng
`matchUc2ToEndpoints(state)`. Endpoint đưa vào config là **bản clone** mang thêm `permName` và
`permRowIndex`; không mutate `state.endpoints`. Các phần còn lại (`auths` union UC1, `msisdns` một
số, `selectedSheet: 'all'`, `commonEndpointsEnabled: false`, `runFilter.authIds`) giữ nguyên.

## 9. Test

Chạy bằng `node --test`.

**`test/permission-match.test.js` (mới)**
- Vòng 0 chỉ nhận `===`: `hay` chứa `kw` như chuỗi con nhưng không bằng thì vòng 0 phải trượt.
- Bớt từ **đầu**, không phải từ cuối.
- Tối đa 4 vòng: keyword 8 từ thì vòng cuối vẫn còn 5 từ, không cắt tiếp.
- Keyword ít hơn 4 từ: dừng khi hết từ, không sinh needle rỗng.
- Dừng ở vòng đầu tiên có kết quả — vòng lỏng hơn không được chạy.
- Vòng có kết quả nhưng mọi endpoint đã bị giữ chỗ: vẫn thoát, không nới sang vòng sau.
- Khử trùng toàn cục: cùng `dedupeColumn` ở hai sheet khác nhau chỉ còn một bản.
- Dòng UC2 đứng trước trong file giữ chỗ khi hai dòng cùng với tới một endpoint.
- Endpoint thiếu `raw`, ô cột đích rỗng, hoặc ô cột khử trùng rỗng: bị loại khỏi `pool`, không ném lỗi.
- `permName` là giá trị gốc trong file, không phải bản đã normalize.

**`test/http-client.test.js` (sửa)**
- Ba nhánh của luật §5, mỗi nhánh cả trường hợp đúng lẫn sai.
- `status: null` → `'empty'` ở cả hai nhánh `'x'` và không `'x'`.
- Auth không có dòng UC1 nào → `'empty'`.
- Assert cũ của RUN ALL (`req.permRowIndex == null`) phải xanh nguyên trạng.

**`test/endpoint-mapping.test.js` (sửa)**
- `raw` giữ đúng cặp header→giá trị, bỏ ô rỗng và header rỗng.
- Bản ghi vẫn có đủ `name` / `method` / `endpoint` / `sheetName` như cũ.

**`test/permission-scope.test.js` (sửa)**
- Bốn nhánh validate mới ở §8.
- `buildPermissionRunConfig` gắn `permName` + `permRowIndex` lên endpoint clone, và
  `state.endpoints` không bị mutate.

**`test/permission-filter-logic.test.js`, `test/permission-table.test.js`, `test/excel-export.test.js`,
`test/layout.test.js` (sửa)** — cập nhật theo 8 cột và hai select mới.

Ghi chú: `test/layout.test.js:31` đang đỏ sẵn từ trước thay đổi này, không thuộc phạm vi spec.

## 10. Phạm vi không đụng tới

- RUN ALL, tab OUTPUT, `result-table.js`, `filters.js`, `filter-logic.js`.
- `run-filter.js`, `request-count.js`, `runner.js`, `worker-pool.js`, `request-worker.js`, `routes.js`.
- `matchPermissionRow` / `matchPermissionName` / `permissionNameIndex` trong `permission-scope.js` —
  RUN ALL còn dùng, giữ nguyên.
- Định dạng file phân quyền, `/api/import/grid`.
