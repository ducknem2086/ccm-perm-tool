# Thiết kế: Tab CHECK PERMISSION chia 2 panel resize được, panel phải xem bảng phân quyền raw

## 1. Tổng quan

Hiện tab **CHECK PERMISSION** chỉ có một bảng kết quả (`#perm-table`). Người dùng phải mở lại file Excel gốc mới đối chiếu được dòng phân quyền tương ứng.

Yêu cầu nâng cấp:

1. Xem được **bảng phân quyền raw** (đúng nguyên trạng sheet đang chọn của `state.permissionFile`) ngay trong tab CHECK PERMISSION.
2. Hai checkbox lọc **Có quyền / Không quyền** trên bảng raw đó.
3. Tab chia thành **2 panel chính**, ngăn nhau bằng một **thanh kéo ở giữa** chỉnh được tỉ lệ.
   - Panel **trái**: bảng kết quả CHECK PERM (giữ nguyên như hiện tại).
   - Panel **phải**: bảng phân quyền raw + bộ lọc.
4. Drawer chi tiết request **giữ nguyên** dạng overlay như hiện tại — không đụng tới.

---

## 2. Quyết định thiết kế đã chốt

| Câu hỏi | Quyết định |
|---|---|
| "Bảng permission" là bảng nào | Raw sheet: `state.permissionFile.headers` + `.rows` của sheet đang chọn, hiển thị **mọi dòng, mọi cột**, kể cả dòng không khớp endpoint nào |
| "Có quyền" nghĩa là gì | Dòng có ô giá trị `x` (trim + lowercase) ở **ít nhất một** cột role |
| "Cột role" là cột nào | Các cột khai trong `permissionMapping.usecase1[].permissionColumn`. Thêm mapping UC1 → tập cột role tự rộng ra |
| Bên trái / bên phải | Trái = kết quả CHECK PERM · Phải = bảng phân quyền raw |
| Drawer chi tiết | Giữ nguyên overlay `#drawer`, dùng chung với tab OUTPUT |

---

## 3. Thiết kế chi tiết các thành phần

### 3.1 Logic lọc thuần — `public/js/shared/permission-sheet-filter.js` (file mới)

Không đụng DOM, test không cần mock. Cùng họ với `permission-filter-logic.js` đang có.

```js
export function roleColumnIndexes(headers, uc1)   // -> number[]
export function rowHasPermission(row, roleIdxs)   // -> boolean
export function emptySheetFilter()                // -> { granted: true, denied: true }
export function applySheetFilter(rows, roleIdxs, filter) // -> { row, index, granted }[]
```

Quy tắc:

- `roleColumnIndexes`: với mỗi `m` trong `uc1`, lấy `headers.indexOf(m.permissionColumn)`; bỏ `-1`; khử trùng lặp; giữ thứ tự cột trong `headers`.
- `rowHasPermission`: `true` khi tồn tại `i` trong `roleIdxs` mà `String(row[i] ?? '').trim().toLowerCase() === 'x'`. Dùng đúng quy ước `'x'` mà `evaluateUc2Permission` (`src/server/http-client.js`) đang chấm — một nguồn sự thật, không được lệch.
- `applySheetFilter`: giữ lại dòng khi (`granted` và có quyền) hoặc (`denied` và không có quyền). Trả kèm `index` gốc trong `rows` để bảng hiển thị được số dòng thật.
- Cả hai checkbox bỏ tích → mảng rỗng (bảng hiện dòng "không khớp bộ lọc"), **không** đảo thành hiện tất cả.
- `roleIdxs` rỗng (chưa khai UC1 nào) → mọi dòng tính là **không có quyền**, nên chỉ hiện khi `denied` được tích.

### 3.2 Bảng raw — `public/js/ui/permission-sheet-table.js` (file mới)

Theo đúng pattern `initPermissionTable`: nhận callback getter, trả `{ render }`.

```js
export function initPermissionSheetTable({ getSheet, getUc1, getFilter })
```

- `getSheet()` → `state.permissionFile` (đọc `headers`, `rows`, `filename`, `selectedSheet`).
- Vẽ vào `#perm-sheet-table`; `thead` là `headers` của sheet, thêm cột đầu `#` là số dòng gốc (`index + 2` — khớp số dòng Excel khi hàng 1 là header).
- Ô thuộc cột role có giá trị `x` tô class `status-up`; dòng không có quyền nào để mặc định.
- Header dùng lại `.result-table` (sticky header có sẵn) — không viết CSS bảng mới.
- Chưa nạp file (`filename` rỗng) → hiện dòng gợi ý "Chưa nạp file phân quyền — vào tab INPUT → PHÂN QUYỀN để import".
- Bảng **chỉ đọc**: không click row, không mở drawer. (YAGNI — chưa có nhu cầu liên kết 2 bảng.)

### 3.3 Bộ lọc checkbox — `public/js/ui/permission-sheet-filter-bar.js` (file mới)

```js
export function initPermissionSheetFilterBar({ onChange })  // -> { getFilter, refreshCount }
```

- Hai `<input type="checkbox">` `#chk-perm-granted`, `#chk-perm-denied`, cả hai **mặc định tích**.
- Đổi tích → gọi `onChange()` (main.js render lại bảng raw). Không ghi vào `state`, không `persist()` — bộ lọc là trạng thái xem tạm, giống filter cột của bảng kết quả.
- `refreshCount(shown, total)` cập nhật nhãn `#perm-sheet-count` dạng `hiện 12/142 dòng`.

### 3.4 Thanh chia — `public/js/ui/split-pane.js` (file mới)

Module thuần, không biết gì về nội dung hai bên → tái dùng được.

```js
export function initSplitPane({ container, handle, initialPct, minPct = 20, maxPct = 80, onChange })
```

- `container` là CSS grid: `grid-template-columns: <pct>% 6px 1fr`. Kéo handle → set lại `container.style.gridTemplateColumns`.
- `pointerdown` trên handle → `setPointerCapture`, theo dõi `pointermove`, `pointerup` nhả. Dùng Pointer Events (một đường code cho chuột lẫn touch).
- Kẹp `pct` trong `[minPct, maxPct]` để không panel nào bị bóp về 0.
- `pointerup` → gọi `onChange(pct)` **một lần** (không gọi mỗi `pointermove`, tránh ghi localStorage liên tục).
- `dblclick` handle → về 60 (mặc định gốc, không phải `initialPct` đã lưu).
- Handle có `tabindex="0"` nên phải hỗ trợ bàn phím: `ArrowLeft`/`ArrowRight` đổi `±5%` (kẹp cùng biên), mỗi lần nhấn gọi `onChange` một lần.

### 3.5 State — `public/js/state.js`

Thêm khoá mới vào `defaultConfig()`:

```js
ui: { permSplitPct: 60 },
```

- Merge nông trong `load()` và `applyConfig()` như `advanced`: `ui: { ...base.ui, ...(saved.ui ?? {}) }`. Config cũ không có `ui` → nhận mặc định 60, không vỡ.
- `onChange(pct)` của split-pane ghi `state.ui.permSplitPct = pct` rồi `persist()` → tỉ lệ giữ sau F5.

### 3.6 HTML — `public/index.html`

`#panel-perm` giữ nguyên `runbar` ở trên, phần dưới thành grid 2 cột + handle:

```html
<div id="perm-split" class="split-pane">
  <div class="split-side">
    <div id="perm-viewport" class="result-viewport">
      <table id="perm-table" class="result-table"></table>
    </div>
  </div>

  <div id="perm-split-handle" class="split-handle" role="separator"
       aria-orientation="vertical" tabindex="0" aria-label="Kéo để chỉnh tỉ lệ hai panel"></div>

  <div class="split-side">
    <div class="split-head">
      <span class="label">BẢNG PHÂN QUYỀN</span>
      <label><input id="chk-perm-granted" type="checkbox" checked /> Có quyền</label>
      <label><input id="chk-perm-denied" type="checkbox" checked /> Không quyền</label>
      <span id="perm-sheet-count" class="muted mono"></span>
    </div>
    <div id="perm-sheet-viewport" class="result-viewport">
      <table id="perm-sheet-table" class="result-table"></table>
    </div>
  </div>
</div>
```

### 3.7 CSS — `public/css/app.css`

```css
.split-pane {
  flex: 1 1 auto; min-height: 0;
  display: grid; grid-template-columns: 60% 6px 1fr;
}
.split-side { min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.split-handle {
  cursor: col-resize; background: var(--hairline);
  transition: background .12s;
}
.split-handle:hover, .split-handle:focus-visible { background: var(--primary); }
.split-head {
  display: flex; align-items: center; gap: var(--sp-sm);
  padding: var(--sp-xs) var(--sp-sm); border-bottom: 1px solid var(--hairline);
}
```

`min-width: 0` trên `.split-side` là bắt buộc — thiếu nó grid item chứa bảng rộng sẽ tự nong ra và thanh kéo mất tác dụng.

### 3.8 Nối dây — `public/js/main.js`

```js
const permSheetFilterBar = initPermissionSheetFilterBar({ onChange: () => renderPermSheet() });
const permSheetTable = initPermissionSheetTable({
  getSheet: () => state.permissionFile,
  getUc1: () => state.permissionMapping.usecase1,
  getFilter: () => permSheetFilterBar.getFilter(),
});

function renderPermSheet() {
  const { shown, total } = permSheetTable.render();
  permSheetFilterBar.refreshCount(shown, total);
}

initSplitPane({
  container: document.getElementById('perm-split'),
  handle: document.getElementById('perm-split-handle'),
  initialPct: state.ui.permSplitPct,
  onChange: (pct) => { state.ui.permSplitPct = pct; persist(); },
});
```

Gọi `renderPermSheet()` tại hai chỗ:

- `subscribe(renderPermSheet)` — cùng kênh `notify()` mà `permissions-panel.js:259` đang nghe, nên import file phân quyền / đổi sheet / sửa mapping UC1 đều vẽ lại bảng raw.
- Một lần lúc khởi động, cạnh `renderPermResults()` ở cuối `main.js`.

---

## 4. Xử lý biên

| Tình huống | Hành vi |
|---|---|
| Chưa nạp file phân quyền | Bảng raw hiện dòng gợi ý import, checkbox vẫn bấm được nhưng không có gì đổi |
| Chưa khai UC1 mapping nào | Không có cột role → mọi dòng là "không có quyền"; tích mỗi "Có quyền" → bảng rỗng |
| Cột UC1 trỏ tới cột đã biến mất khỏi sheet | `indexOf` trả `-1`, bị loại khỏi `roleIdxs`; không throw. Cảnh báo cấu hình đã có sẵn ở `validatePermissionScope` khi bấm CHECK PERM |
| Đổi sheet ở panel PHÂN QUYỀN | `notify()` → `renderPermSheet()` vẽ lại theo sheet mới |
| Bỏ tích cả hai checkbox | Bảng rỗng, hiện "Chưa có dòng nào khớp bộ lọc" |
| Sheet rất nhiều dòng (~4000) | Vẽ một lần vào `DocumentFragment` rồi `replaceChildren`, giống `permission-table.js`. Chưa cần ảo hoá — cùng cỡ với bảng kết quả đang chạy được |
| Config cũ trong localStorage không có `ui` | Nhận `permSplitPct: 60` mặc định |

---

## 5. Kế hoạch kiểm thử

**`test/permission-sheet-filter.test.js`** (thuần, không DOM):

- `roleColumnIndexes` trả đúng chỉ số cột theo UC1; bỏ cột không tồn tại; khử trùng khi hai mapping cùng cột.
- `rowHasPermission`: `'x'`, `'X'`, `' x '` → `true`; rỗng / `null` / `'-'` → `false`.
- `applySheetFilter`: chỉ `granted` → chỉ dòng có `x`; chỉ `denied` → phần bù; cả hai → đủ dòng; không cái nào → rỗng.
- `roleIdxs` rỗng → mọi dòng `granted: false`.
- Kết quả giữ `index` gốc của dòng trong `rows`.

**`test/permission-sheet-table.test.js`** (MockElement như `test/permission-table.test.js`):

- Vẽ đủ số cột theo `headers` + cột `#`.
- Ô `x` ở cột role có class `status-up`; ô `x` ở cột **không phải** role thì không.
- `filename` rỗng → hiện dòng gợi ý import.
- `render()` trả `{ shown, total }` đúng.

**`test/split-pane.test.js`** (MockElement + pointer event giả):

- Khởi tạo set `gridTemplateColumns` theo `initialPct`.
- `pointermove` sau `pointerdown` đổi tỉ lệ; không `pointerdown` thì `pointermove` không đổi gì.
- Kẹp biên: kéo quá `minPct`/`maxPct` bị chặn.
- `onChange` chỉ gọi ở `pointerup`, đúng **một** lần cho một lượt kéo.

**`test/layout.test.js`** (bổ sung):

- `#panel-perm` chứa `#perm-split` với đủ `#perm-table`, `#perm-split-handle`, `#perm-sheet-table`, hai checkbox lọc.

**`test/state.test.js`** (bổ sung):

- `defaultConfig().ui.permSplitPct === 60`.
- `load()` / `applyConfig()` với config cũ không có `ui` → vẫn ra 60; có `ui` → giữ giá trị đã lưu.

---

## 6. Không làm (YAGNI)

- Không click row bảng raw để mở drawer hay nhảy tới dòng kết quả tương ứng.
- Không lọc/tìm kiếm theo cột trên bảng raw (chỉ 2 checkbox có/không quyền).
- Không export riêng bảng raw ra Excel.
- Không đụng tab OUTPUT, không đụng `detail-drawer.js`, không đụng đường chạy CHECK PERM ở server.
