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

Tab **AUTHS**: mỗi profile là một lệnh `Copy as cURL` của request đã đăng nhập — nguồn danh tính duy nhất, dùng cho cả request nghiệp vụ lẫn CHECK PERM. **Mọi** header trong lệnh đó được gửi kèm cho request nghiệp vụ; CHECK PERM chỉ mượn lại phần cookie lõi auth (`access_token`, `id_token`, `client_id`, `claims_*`, `REDIRECT_AFTER_LOGIN`), không mượn `Authorization` — đúng như FE thật gọi `checkPermission`. Ô **Role** khai riêng vì không cookie nào chứa nó — FE tự gửi role đang chọn trên màn hình.

Nút trên mỗi profile: `✓ Verify` kiểm cURL đã đủ điều kiện auth chưa (xem dưới); `⌫` xoá cURL và role đã nhập nhưng **giữ lại profile** (id và tên còn nguyên nên bộ lọc auth và mapping UC1 không đứt) — dùng khi credential cũ còn sót đang đè lên HEADERS CHUNG; `⧉` nhân bản; `✕` xoá hẳn profile (luôn phải giữ lại ít nhất một).

Bấm **`✓ Verify`** trước khi chạy để khỏi đoán vì sao 401. Nó chấm từng điều kiện và ghi rõ điều kiện đó ảnh hưởng đường nào:

| Check | Ảnh hưởng | Hỏng thì |
|---|---|---|
| Đọc được header (kèm kiểu copy nhận dạng được) | cả hai | dán hỏng, không header nào tới đích |
| Có `Authorization` | NGHIỆP VỤ | request đi không Bearer → 401 |
| Cookie có `access_token` | CHECK PERM | không dựng được danh tính |
| Token còn hạn | cả hai | 401 |
| `claims_*` khớp token · Bearer khớp cookie (cùng user, cùng `sid`) | cả hai | cookie ghép từ hai lần login |
| Đã khai role | CHECK PERM | không dựng được body `checkPermission` |

Verdict ở đầu bảng: **ĐẠT** / **ĐẠT MỘT PHẦN** (còn cảnh báo) / **CHƯA ĐẠT** kèm số lỗi chặn. Sửa ô cURL hoặc bấm `⌫` thì kết quả cũ tự biến mất — không để verdict lạc hậu.

Profile đã `⌫` vẫn chạy được RUN ALL nếu HEADERS CHUNG tự mang credential — nhưng CHECK PERM sẽ báo "Chưa dán cURL", vì danh tính của `checkPermission` bắt buộc đọc từ cURL của chính profile.

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

Khi export Excel, radio `Token/Cookie trong file` quyết định file có mang theo credential đầy đủ của mọi profile hay chỉ mang bản đã che. Mặc định là **Che**.

## Domain phải là host API

Domain phải trỏ đúng **API**, không phải host trang web. Domain trang web (SPA) trả HTML cho mọi path — request nào cũng ăn lỗi `NOT_JSON` dù header đúng hết. Thường phân biệt bằng tiền tố `api-` (ví dụ `https://api-abc.vn`, không phải `https://abc.vn`).

## Credential phải dán tay

Hết hạn theo phiên đăng nhập nên nằm ở tab AUTHS, mỗi profile một lệnh cURL. Lấy đúng: F12 ▸
**Network** ▸ chọn request **gọi API nghiệp vụ** (không phải `checkPermission`, không phải request
điều hướng trang, không phải request tải JS/CSS) ▸ chuột phải ▸ Copy.

Kiểu copy nào cũng được — tool đọc được cả bốn: **cURL (bash)**, **cURL (cmd)** (mặc định trên
Windows), **PowerShell**, và **fetch**.

Phải là cURL của request **nghiệp vụ**, không phải của `checkPermission`: hai đường xác thực bằng hai
thứ khác nhau — request nghiệp vụ đi bằng `Authorization: Bearer`, `checkPermission` đi bằng cookie
`access_token`. Lệnh cURL nghiệp vụ mang **cả hai**; lệnh `checkPermission` không có `Authorization`
nên dán nhầm là mọi request nghiệp vụ ăn 401. Dán nhầm thì dòng cảnh báo dưới ô cURL báo ngay.

Không tự đọc được vì trình duyệt chặn đọc cookie/storage của domain khác — giới hạn của trình duyệt,
không phải lỗi tool.

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
