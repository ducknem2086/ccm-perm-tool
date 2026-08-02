# Toggle MSISDN / Query chung theo dòng đang lọc

Ngày: 2026-08-02

## Vấn đề

Bảng ENDPOINTS có hai nút gộp: `☑ MSISDN: Tất cả Có` và `☑ Query: Tất cả Có`
(`endpoint-list.js:309-321`). Cả hai gọi `setAllMsisdnInCurrentTab` / `setAllCommonQueryInCurrentTab`
(dòng 104, 129) — phạm vi là **toàn bộ sheet đang chọn**, hoặc toàn bộ `state.endpoints` khi đứng ở
tab "Tất cả (All)". Ô tìm kiếm không ảnh hưởng gì.

Người dùng lọc bảng còn 7 dòng rồi muốn bật MSISDN cho đúng 7 dòng đó thì không có đường nào ngoài
tick tay từng dòng. Bấm nút gộp là đụng cả trăm dòng không nhìn thấy.

## Quyết định

Thêm **hai nút nữa** đặt cạnh hai nút cũ, phạm vi = **các dòng đang hiện trên bảng**.

Bốn chốt phạm vi:

**1. "Đang hiện" = sheet hiện tại + khớp ô tìm kiếm.** Đúng tập `render()` đang vẽ. Nhóm checkbox
METHOD cạnh ô tìm kiếm **không** tính vào — nó không ẩn dòng nào, chỉ ghi `state.runFilter.methods`
cho RUN ALL (`method-filter.js:33`). Đưa nó vào phạm vi thì nút tác động lên dòng vẫn đang hiện rõ
trên màn hình, người dùng không có cách nào nhìn ra.

**2. Toggle hai trạng thái**, giống hệt hai nút cũ: một cú bấm đảo Có/Không cho cả tập, nhãn đổi
theo trạng thái hiện tại.

**3. Trên tab "Tất cả (All)", bản trùng đang bị ẩn đổi theo.** Tab All hiển thị danh sách đã khử
trùng `METHOD:pathTemplate` (`allTabEndpoints`, `endpoint-dedupe.js:29`) nhưng RUN ALL đọc thẳng
`state.endpoints` — bản trùng bị ẩn **vẫn chạy**. Chỉ set cho bản đại diện thì người dùng tưởng đã
set hết, lúc chạy vẫn có request khác cấu hình, không có gì báo. Nên set theo **khoá**, không theo
tham chiếu đối tượng.

**4. Search rỗng → nút disable.** Không lọc thì "kết quả lọc" bằng toàn bộ tab, trùng y hệt hai nút
cũ. Bốn nút làm cùng một việc là mời bấm nhầm.

## Không migrate sang Vue/React

Đã cân nhắc: chuyển tầng UI sang framework để trạng thái mờ/sáng của nút luôn bám dữ liệu. Loại, vì
rủi ro mà nó phòng đã không tồn tại ở đây, còn giá thì thật:

- **Nút không nằm trong vùng re-render.** `createEditableList` ghi `host.innerHTML` đúng một lần lúc
  init (`editable-list.js:31-44`). `render()` chỉ ghi lại `[data-body]` (dòng 80). Hàng nút ở
  `.el-actions` nằm ngoài `[data-body]` → ref bắt ở `endpoint-list.js:467-469` sống suốt đời trang,
  không bị thay thế. Ref chết vì template dựng lại — đúng class bug cần phòng — không có đường xảy ra.
- **`initEndpointList` gọi đúng một lần** (`main.js:115`). Không có vòng đời nào dựng lại panel.
- **Một hàm, hai nguồn sự kiện.** `refreshCheckAllBtn()` là nơi duy nhất set `textContent` /
  `disabled` / `title`. Gọi từ `subscribe()` (state đổi: import, xóa, đổi sheet, tick từng dòng) và
  từ listener `input` của ô tìm kiếm. Không có đường nào làm tập đang hiện đổi mà không đi qua một
  trong hai.
- **Giá.** Repo không có build step — `dependencies` chỉ `express` + `exceljs`, `devDependencies` chỉ
  `@playwright/test`, ES module phục vụ tĩnh. Vue/React kéo theo Vite, viết lại ~22 module
  `public/js/ui/`, và 46 file `test/*.test.js` đang mock DOM thẳng.

Thay vào đó chốt bằng test canh gác (mục 5 và 6 phần Test): nếu tương lai ai sửa `render()` thành
ghi lại cả `host.innerHTML`, test đỏ ngay.

## Thay đổi theo file

### `public/js/ui/editable-list.js` — xuất tập đang hiện

Logic lọc đang nằm inline trong `render()` (dòng 90-92). Tách ra hàm riêng, `render()` gọi nó:

```js
// Tap dong dang ve tren bang. Tach khoi render() de nut "theo dong dang loc"
// (endpoint-list.js) dung chung dung mot dinh nghia — them bo loc moi o day la
// ca hai cung doi, khong the lech.
function computeVisible() {
  const items = getItems();
  const rawQuery = search && searchInput ? searchInput.value : '';
  const rows = items.map((item, index) => ({ item, index }));
  return rawQuery.trim() !== '' ? rows.filter(({ item }) => search.match(item, rawQuery)) : rows;
}
```

Trong `render()`, thay ba dòng 90-92 bằng `const visible = computeVisible();`. Phần còn lại giữ
nguyên — `visible.forEach(({ item, index }) => ...)` vẫn đúng chữ ký.

Giá trị trả về (dòng 234) thêm hai khoá, **chỉ thêm**:

```js
return {
  render,
  getVisibleItems: () => computeVisible().map((r) => r.item),
  getSearchQuery: () => (search && searchInput ? searchInput.value : ''),
};
```

`msisdn-drawer.js:54` cũng dùng `createEditableList` nhưng không truyền `search` — `computeVisible()`
trả nguyên danh sách, không đổi hành vi.

### `public/js/ui/endpoint-list.js` — ba hàm mới

Đặt cạnh nhóm `setAll*` hiện có, export để test gọi trực tiếp:

```js
// Khoa dong nhat voi dedupeEndpoints (endpoint-dedupe.js:8-10) — cung mot dinh
// nghia "trung endpoint" voi cho khu trung tab All.
export function endpointKey(ep) {
  const method = String(ep?.method ?? 'GET').toUpperCase();
  const path = String(ep?.pathTemplate ?? '').trim();
  return `${method}:${path}`;
}

export function allFieldOnVisible(visible, field) {
  const list = visible ?? [];
  return list.length > 0 && list.every((e) => e?.[field] !== false);
}

// Pham vi ghi = pool cua tab hien tai; dieu kien = khoa nam trong tap dang hien.
// Tab All: pool la toan bo state.endpoints nen ban trung bi khu di van doi theo
// — RUN ALL doc thang state.endpoints, bo sot ban trung la sinh request lech
// cau hinh ma khong co gi bao. Tab mot sheet: pool bo hep lai dung sheet do nen
// khong ro sang sheet khac du trung METHOD:path.
export function setFieldForVisible(visible, field, val) {
  const keys = new Set((visible ?? []).map(endpointKey));
  if (keys.size === 0) return;

  const sheet = state.selectedSheet ?? 'all';
  state.endpoints = state.endpoints.map((e) => {
    const inScope = sheet === 'all' || (e?.sheetName ?? 'Sheet 1') === sheet;
    if (!inScope || !keys.has(endpointKey(e))) return e;
    return { ...e, [field]: val };
  });
  persist();
  notify();
}
```

`field` nhận `'attachMsisdn'` hoặc `'attachCommonQuery'`. Một hàm cho cả hai trục thay vì nhân đôi
khối `setAll*` gần y hệt nhau.

Bốn hàm `allMsisdnInCurrentTab` / `setAllMsisdnInCurrentTab` / `allCommonQueryInCurrentTab` /
`setAllCommonQueryInCurrentTab` **giữ nguyên** — hai nút cũ vẫn dùng, hành vi không đổi.

### `public/js/ui/endpoint-list.js` — hai nút mới

Chèn vào `extraActions` ngay sau hai nút cũ (sau dòng 321):

```js
const msisdnFilteredActionIndex = extraActions.length;
extraActions.push({
  label: '☐ MSISDN (lọc): chưa lọc',
  title: 'Bật/tắt MSISDN cho các dòng đang hiện trên bảng',
  onClick: () => {
    const visible = list.getVisibleItems();
    setFieldForVisible(visible, 'attachMsisdn', !allFieldOnVisible(visible, 'attachMsisdn'));
  },
});

const commonQueryFilteredActionIndex = extraActions.length;
extraActions.push({
  label: '☐ Query (lọc): chưa lọc',
  title: 'Bật/tắt Query chung cho các dòng đang hiện trên bảng',
  onClick: () => {
    const visible = list.getVisibleItems();
    setFieldForVisible(visible, 'attachCommonQuery', !allFieldOnVisible(visible, 'attachCommonQuery'));
  },
});
```

`extraActions` dựng trước `const list = createEditableList({...})` (dòng 323), nhưng `onClick` chỉ
chạy khi người dùng bấm — lúc đó `list` đã gán xong, không vướng TDZ. Nhãn khai ở đây chỉ là giá trị
ban đầu; `refreshCheckAllBtn()` ghi đè ngay ở lần chạy đầu (dòng 501).

### `public/js/ui/endpoint-list.js` — binding runtime

Lấy ref hai nút mới cạnh ba ref hiện có (dòng 467-469):

```js
const msisdnFilteredBtn = host.querySelector(`[data-extra-action="${msisdnFilteredActionIndex}"]`);
const commonQueryFilteredBtn = host.querySelector(`[data-extra-action="${commonQueryFilteredActionIndex}"]`);
```

Trong `refreshCheckAllBtn()`, thêm một hàm con dùng chung cho cả hai nút:

```js
function refreshFilteredBtn(btn, field, name) {
  if (!btn) return;
  const filtering = (searchInput?.value ?? '').trim() !== '';
  const visible = filtering ? list.getVisibleItems() : [];

  btn.disabled = !filtering || visible.length === 0;
  if (!filtering) {
    btn.textContent = `☐ ${name} (lọc): chưa lọc`;
    btn.title = 'Gõ vào ô tìm kiếm để bật nút này';
    return;
  }
  if (visible.length === 0) {
    btn.textContent = `☐ ${name} (lọc 0): —`;
    btn.title = 'Không có dòng nào khớp tìm kiếm';
    return;
  }

  const on = allFieldOnVisible(visible, field);
  btn.textContent = on
    ? `☑ ${name} (lọc ${visible.length}): Tất cả Có`
    : `☐ ${name} (lọc ${visible.length}): Tất cả Không`;
  btn.title = on
    ? `Tắt ${name} cho ${visible.length} dòng đang hiện`
    : `Bật ${name} cho ${visible.length} dòng đang hiện`;
}

refreshFilteredBtn(msisdnFilteredBtn, 'attachMsisdn', 'MSISDN');
refreshFilteredBtn(commonQueryFilteredBtn, 'attachCommonQuery', 'Query');
```

Nhãn mô tả trạng thái hiện tại, `title` mô tả hành động — cùng quy ước với ba nút cũ.

`refreshCheckAllBtn` hiện chỉ chạy qua `subscribe(...)` (dòng 505-510), tức chỉ khi state đổi. Gõ vào
ô tìm kiếm không đụng state nên phải nối thêm nguồn sự kiện thứ hai, đặt sau khi
`refreshCheckAllBtn` đã khai báo:

```js
// Go tim kiem khong doi state nen subscribe() khong bat duoc — nut moi phai tu
// nghe o search de nhan/mo va nhan so dong cap nhat ngay.
searchInput?.addEventListener('input', refreshCheckAllBtn);
```

`searchInput` đã có sẵn ở dòng 452. Listener của `editable-list` (gọi `render()`) vẫn nguyên; hai
listener trên cùng một element, độc lập.

### CSS

Không đổi. `.btn:disabled { opacity: .45; cursor: not-allowed; }` đã có (`app.css:244`).

## Hệ quả

- Hàng nút của bảng ENDPOINTS lên 6 nút: Template, Chọn tất cả, MSISDN, Query, MSISDN (lọc),
  Query (lọc). Hai nút mới mờ khi chưa gõ tìm kiếm.
- Trên tab "Tất cả (All)", một cú bấm có thể đổi nhiều bản ghi hơn số dòng đang hiện — đúng chủ đích,
  số trên nhãn là số **dòng**, không phải số bản ghi bị ghi. Bản trùng ẩn không hiện ở đâu cả; đây là
  hệ quả sẵn có của việc tab All khử trùng để hiển thị.
- Đứng ở tab một sheet, nút mới không bao giờ đụng sheet khác, kể cả khi trùng METHOD:path.
- Hai nút cũ giữ nguyên hành vi. Không đụng `src/server/`, không đụng `state.js`, không đổi cấu trúc
  endpoint lưu trong localStorage.

## Test

`test/editable-list.test.js`

1. `getVisibleItems()` trả nguyên danh sách khi ô tìm kiếm rỗng.
2. Gán `searchInput.value` rồi gọi `getVisibleItems()` → chỉ còn item khớp `search.match`.
3. `getVisibleItems()` trả `[]` khi không item nào khớp.
4. List không truyền `search` (như `msisdn-drawer`) → `getVisibleItems()` trả nguyên danh sách,
   `getSearchQuery()` trả `''`.
5. **Canh gác:** bắt ref `host.querySelector('[data-extra-action="0"]')`, gọi `render()`, rồi query
   lại — phải **là cùng một element**. Đỏ ngay nếu `render()` bị sửa thành ghi lại `host.innerHTML`.

`test/endpoint-list.test.js`

6. **Canh gác:** sau `list.render()`, ref nút lấy trước đó vẫn là element mà `host.querySelector`
   trả về.
7. `endpointKey` chuẩn hoá method về hoa và trim path; endpoint thiếu `method` → `GET`.
8. `allFieldOnVisible([], 'attachMsisdn')` → `false`.
9. `allFieldOnVisible` → `true` khi mọi phần tử có field khác `false` (kể cả `undefined`).
10. `allFieldOnVisible` → `false` khi có một phần tử `field === false`.
11. `setFieldForVisible` ở tab All: hai bản cùng `METHOD:path` ở Sheet 1 và Sheet 3, chỉ bản Sheet 1
    nằm trong `visible` → **cả hai** đổi.
12. `setFieldForVisible` ở tab `'Sheet 1'`: bản trùng ở Sheet 3 **không** đổi.
13. `setFieldForVisible` không đụng endpoint có khoá ngoài tập `visible`, kể cả cùng sheet.
14. `setFieldForVisible(visible, 'attachCommonQuery', false)` chỉ ghi `attachCommonQuery`,
    `attachMsisdn` và các field khác giữ nguyên.
15. `setFieldForVisible` với `visible` rỗng → `state.endpoints` không đổi, không gọi `persist`.
16. Toggle qua lại: đang tất cả Có → bấm thành tất cả Không → bấm lại thành tất cả Có.
17. Nút mới disable khi ô tìm kiếm rỗng; gán `searchInput.value` rồi bắn sự kiện `input` → hết
    disable, nhãn mang đúng số dòng.
18. Ô tìm kiếm khớp 0 dòng → nút disable trở lại, nhãn `(lọc 0)`.

Chạy: `npm test`.

## Không làm

- Không cho nhóm checkbox METHOD ẩn dòng trên bảng. Nó vẫn chỉ ghi `state.runFilter.methods`.
- Không migrate UI sang Vue/React.
- Không đổi hai nút cũ, không đổi radio Có/Không của từng dòng.
- Không thêm CSS.
