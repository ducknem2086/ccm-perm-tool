# CCM Tool

Tool test hàng loạt request/response API. Một domain, nhiều endpoint, nhiều số điện thoại, một khoảng ngày.

## Chạy

```bash
npm install
npm start          # http://localhost:2345
npm test
```

Không có build step. Sửa file trong `public/` là refresh trình duyệt thấy ngay.

## Dùng

Tab **INPUT**:

1. **Domain** — ví dụ `https://abc.vn`
2. **Bearer token** — dán vào, hoặc bấm `⟳ Reload Token` để thử đọc `access_token` từ cookie/localStorage của chính origin này
3. **Date range** — `25/03/2026-01/04/2026`; dòng preview cho biết giá trị thật sẽ gửi đi
4. **MSISDN** — nhập tay hoặc `⤓ Import` file `.xlsx` / `.csv` / `.txt`; nhập xong vẫn sửa lại từng dòng được
5. **Endpoints** — path bắt đầu bằng `/`, dùng `:msisdn` hoặc `{{msisdn}}` ở chỗ cần thay số điện thoại
6. Bấm **RUN ALL** — số trên nút là số request sẽ chạy (`endpoint đang bật × số MSISDN`)

Tab **OUTPUT**: kết quả về từng dòng theo thời gian thực, lọc theo status code / error code / thời gian / từ khóa, click một dòng để xem đầy đủ request và response.

## Biến dựng sẵn

| Biến | Giá trị |
|---|---|
| `{{msisdn}}` / `:msisdn` | Từng số trong danh sách MSISDN |
| `{{fromDate}}` | Ngày bắt đầu, theo định dạng đã chọn |
| `{{toDate}}` | Ngày kết thúc, theo định dạng đã chọn |

## Token

Request được gửi **từ Node**, không phải từ trình duyệt — nên không dính CORS, nhưng máy chạy tool phải reach được domain đích.

Nút `⟳ Reload Token` chỉ đọc được `access_token` ở **cùng origin với tool**. Ở `localhost:2345` trình duyệt chặn đọc cookie của domain khác — đây là giới hạn của trình duyệt, không phải lỗi. Khi đó dán token thủ công.

Khi export Excel, radio `Token trong file` quyết định file có mang theo bearer token đầy đủ hay chỉ mang bản đã che. Mặc định là **Che**.
