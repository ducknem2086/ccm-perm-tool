# Spec: Giao diện 3 Cột Dàn Đều & MSISDN Sidebar Drawer

## 1. Mục tiêu
Tối ưu hóa giao diện Tab **INPUT** để:
1. **Dàn đều 3 cột** nằm gọn trong khung hình (viewport height) mà không bắt trình duyệt cuộn trang ở cấp độ grid chính.
2. **Đơn giản hóa Card MSISDN** trên màn hình chính: hiển thị 1 ô input duy nhất để dán/nhập nhanh 1 số chính, cùng badge đếm tổng số lượng và nút mở Sidebar.
3. **Sidebar Drawer MSISDN**: Thiết kế một Drawer/Sidebar trượt ra từ bên phải màn hình (đè lên viewport giống component PrimeVue Drawer) chứa công cụ quản lý/chỉnh sửa chi tiết danh sách MSISDN và hỗ trợ import file.

## 2. Thiết kế chi tiết

### 2.1. Cấu trúc Layout 3 Cột Dàn Đều (Viewport-Fit Layout)
* **Kích thước & Grid**:
  * `.input-grid`: `display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--sp-md); height: calc(100vh - var(--topbar-h) - 45px - 60px); overflow: hidden;`
  * `.col`: `display: flex; flex-direction: column; gap: var(--sp-md); min-height: 0; flex: 1;`
  * `.card`: Các card có vùng danh sách dài (như `list-endpoint`, `tbl-query-params`, `tbl-headers`) sẽ tự có `overflow-y: auto` và `max-height` phù hợp, giữ cho tổng khung 3 cột không bị tràn màn hình xuống bên dưới.

### 2.2. Card MSISDN Đơn Giản Hóa (Cột 2)
Card `list-msisdn` ở Cột 2 hiển thị:
* **Tiêu đề & Badge**: `MSISDN` kèm tổng số lượng `(N)`.
* **Ô nhập nhanh (Single Input)**: 1 ô `<input class="input" placeholder="0912345678">` để xem/sửa nhanh số đầu tiên trong danh sách (`state.msisdns[0]`).
* **Nút mở Sidebar**: `<button id="btn-open-msisdn-drawer" class="btn btn-secondary btn-sm">⚙ Quản lý danh sách & Import (${N})</button>`.

### 2.3. MSISDN Sidebar Drawer (Slide-Over Panel)
* Thêm phần tử HTML `<aside id="msisdn-drawer" class="drawer msisdn-drawer" hidden>` đè bên phải màn hình.
* **Nội dung Drawer**:
  * Header có tiêu đề "DANH SÁCH MSISDN" và nút `✕ Đóng`.
  * Nhúng component `createEditableList` quản lý toàn bộ mảng `state.msisdns` (thêm dòng, sửa dòng, xóa từng dòng, copy paste nhiều dòng, nút `⤓ Import` file txt/csv/xlsx, nút `Xóa hết`).
* **Tương tác**:
  * Bấm nút mở / bấm Import trên ô đơn -> Drawer mở ra từ bên phải với hiệu ứng trượt.
  * Bấm nút `✕ Đóng`, bấm ra ngoài vùng Drawer, hoặc nhấn phím `Esc` -> Drawer đóng lại.
  * Mọi thay đổi danh sách trong Drawer sẽ đồng bộ trực tiếp với `state.msisdns` và cập nhật lại hiển thị ô nhập nhanh ở màn hình chính.

## 3. Các tệp tin thay đổi (Affected Files)
* [public/index.html](file:///D:/VNPT_ODA/poc-folder/migrate-folder/app-dynamic-clone/ccm-tool/public/index.html)
* [public/css/app.css](file:///D:/VNPT_ODA/poc-folder/migrate-folder/app-dynamic-clone/ccm-tool/public/css/app.css)
* [public/js/ui/msisdn-drawer.js](file:///D:/VNPT_ODA/poc-folder/migrate-folder/app-dynamic-clone/ccm-tool/public/js/ui/msisdn-drawer.js) (File mới)
* [public/js/main.js](file:///D:/VNPT_ODA/poc-folder/migrate-folder/app-dynamic-clone/ccm-tool/public/js/main.js)
