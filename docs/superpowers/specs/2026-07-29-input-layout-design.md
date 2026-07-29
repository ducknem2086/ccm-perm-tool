# Spec: Thiết kế giao diện 3 cột cho Tab INPUT

## 1. Mục tiêu
Tái cấu trúc giao diện Tab **INPUT** từ bố cục 2 cột hiện tại thành bố cục 3 cột chính nhằm tối ưu hóa không gian hiển thị, giúp cân bằng chiều cao giữa các card thiết lập và cải thiện trải nghiệm người dùng trên các màn hình lớn.

## 2. Bố cục thiết kế (Layout Design)

### 2.1. Phân chia các nhóm thiết lập (Card Groupings)
Các card thiết lập hiện tại sẽ được phân chia vào 3 thẻ `<div class="col">` như sau:
* **Cột 1 (General Settings & Global Params):**
  * **CONNECTION**: Thiết lập Domain và Bearer Token.
  * **DATE RANGE**: Thiết lập khoảng ngày chạy và định dạng ngày gửi đi.
  * **QUERY PARAMS**: Bảng tham số URL query params toàn cục.
  * **HEADERS**: Bảng HTTP headers toàn cục.
* **Cột 2 (Data Source):**
  * **MSISDN**: Danh sách số điện thoại (chứa list ô nhập có thể cuộn tối đa 320px).
* **Cột 3 (Endpoints & Advanced):**
  * **ENDPOINTS**: Danh sách đường dẫn HTTP API endpoints cần test.
  * **ADVANCED**: Các thiết lập nâng cao (luồng chạy song song, timeout, lọc lỗi, trùng lặp).

### 2.2. Khả năng thích ứng (Responsive Grid Columns)
Bố cục `.input-grid` trong `public/css/app.css` sẽ được định nghĩa lại bằng CSS Grid để tự động thích ứng với kích thước màn hình:
* **Màn hình lớn (>1280px):** 3 cột song song.
  `grid-template-columns: 1fr 1fr 1fr;`
* **Màn hình trung bình / Tablet (768px - 1280px):** 2 cột. Cột 3 tự động trượt xuống hàng bên dưới.
  `grid-template-columns: 1fr 1fr;`
* **Màn hình nhỏ / Mobile (<768px):** 1 cột. Tất cả 3 nhóm cột xếp chồng dọc.
  `grid-template-columns: 1fr;`

## 3. Các tệp tin thay đổi (Affected Files)
* [public/index.html](file:///D:/VNPT_ODA/poc-folder/migrate-folder/app-dynamic-clone/ccm-tool/public/index.html)
* [public/css/app.css](file:///D:/VNPT_ODA/poc-folder/migrate-folder/app-dynamic-clone/ccm-tool/public/css/app.css)
