# CCM Tool

Tool test hàng loạt request/response API. Một domain, nhiều endpoint, nhiều số điện thoại, một khoảng ngày.

## Chạy

```bash
npm install
npm start          # http://localhost:9000
npm test
```

Không có build step. Sửa file trong `public/` là refresh trình duyệt thấy ngay.

## Dùng

Tab **INPUT**:

1. **Domain** — ví dụ `https://abc.vn`
2. **Date range** — `25/03/2026-01/04/2026`; dòng preview cho biết giá trị thật sẽ gửi đi
3. **MSISDN** — nhập tay hoặc `⤓ Import` file `.xlsx` / `.csv` / `.txt`; nhập xong vẫn sửa lại từng dòng được
4. **Endpoints** — path bắt đầu bằng `/`, dùng `:msisdn` hoặc `{{msisdn}}` ở chỗ cần thay số điện thoại
5. Bấm **RUN ALL** — số trên nút là số request sẽ chạy (`endpoint đang lọc × số MSISDN đang lọc × số auth profile đang chọn`)

Tab **AUTHS**: mỗi profile là một bộ credential (Bearer token, Cookie, Refresh token). Nhập theo ba ô riêng, hoặc dán nguyên lệnh `Copy as cURL` — khi dán cURL thì **mọi** header trong lệnh đó được gửi kèm, không chỉ ba credential. Bấm `⧉` để nhân bản một profile, `✕` để xóa (luôn phải giữ lại ít nhất một profile).

Trước khi bấm RUN ALL, thanh **FILTER** thu hẹp tập request theo ba trục: method, msisdn (gõ vào để chọn từ gợi ý, hoặc gõ một đoạn số để khớp mọi số chứa đoạn đó), và auth profile. Không chọn gì ở một trục nghĩa là lấy tất cả trục đó. Dòng cạnh nút cho biết `N endpoint × M msisdn × K auth`.

Tab **OUTPUT**: kết quả về từng dòng theo thời gian thực, lọc theo status code / error code / auth profile / thời gian / từ khóa, click một dòng để xem đầy đủ request và response.

## Biến dựng sẵn

| Biến | Giá trị |
|---|---|
| `{{msisdn}}` / `:msisdn` | Từng số trong danh sách MSISDN |
| `{{fromDate}}` | Ngày bắt đầu, theo định dạng đã chọn |
| `{{toDate}}` | Ngày kết thúc, theo định dạng đã chọn |

## Token

Request được gửi **từ Node**, không phải từ trình duyệt — nên không dính CORS, nhưng máy chạy tool phải reach được domain đích.

Nút `⟳ Reload Token` chỉ đọc được `access_token` ở **cùng origin với tool**, và ghi vào profile đang được chọn ở filter (không chọn gì thì ghi vào profile đầu danh sách). Ở `localhost:9000` trình duyệt chặn đọc cookie của domain khác — đây là giới hạn của trình duyệt, không phải lỗi. Khi đó dán token thủ công vào tab AUTHS.

Khi export Excel, radio `Token/Cookie trong file` quyết định file có mang theo credential đầy đủ của mọi profile hay chỉ mang bản đã che. Mặc định là **Che**.

## Domain phải là host API

Domain phải trỏ đúng **API**, không phải host trang web. Domain trang web (SPA) trả HTML cho mọi path — request nào cũng ăn lỗi `NOT_JSON` dù header đúng hết. Thường phân biệt bằng tiền tố `api-` (ví dụ `https://api-abc.vn`, không phải `https://abc.vn`).

## Credential phải dán tay

Ba giá trị này hết hạn theo phiên đăng nhập nên nằm ở tab AUTHS, mỗi profile một bộ:

| Ô | Thành header | Ghi chú |
|---|---|---|
| Bearer token | `Authorization: Bearer <token>` | Luôn cần |
| Cookie | `Cookie: <giá trị>` | Thường chỉ là cookie hạ tầng (load balancer, redirect hint) — **không** chứa `access_token`/`id_token`, vì hai cái đó đã nằm trong Bearer token |
| Refresh token | `refresh_token: <giá trị>` | Hiếm khi cần, để trống trừ khi API cụ thể đòi header này |

Lấy đúng: F12 ▸ **Network** ▸ chọn request **gọi API** (không phải request điều hướng trang, không phải request tải JS/CSS) ▸ chuột phải ▸ Copy ▸ **Copy as fetch**. Cách này chính xác hơn Copy as cURL vì DevTools chỉ liệt kê đúng header thật sự đi kèm request đó — Copy as cURL đôi khi lẫn header từ ngữ cảnh trang, không phải request thật.

Không tự đọc được vì trình duyệt chặn đọc cookie/storage của domain khác — giới hạn của trình duyệt, không phải lỗi tool.

## Header mặc định

Request đi từ Node nên không có header trình duyệt tự gắn. Tool tự thêm bộ giống Chrome, không cần khai:

```
Accept, Accept-Language, User-Agent
Origin, Referer, X-Current-Url
Sec-Fetch-Dest / Mode / Site / Storage-Access
sec-ch-ua, sec-ch-ua-mobile, sec-ch-ua-platform
```

`Origin`, `Referer`, `X-Current-Url` lấy theo origin của chính tool — đây là lý do port cố định **9000**, trùng với app CCOS thật.

Mọi header mặc định đều bị đè nếu bạn khai cùng tên ở HEADERS chung hoặc HEADERS riêng của endpoint. Ví dụ API soi kỹ `X-Current-Url` thì khai đè bằng URL trang thật.
