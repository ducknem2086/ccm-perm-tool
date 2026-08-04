# Một cURL auth, một danh tính — bỏ cURL checkPermission trùng lặp

Ngày: 2026-08-03

## Vấn đề

Danh tính của một auth profile đang được khai ở **bốn** chỗ, và không chỗ nào là nguồn sự thật:

| Nguồn | Đi vào đâu |
|---|---|
| `auth.token` | `Authorization: Bearer` của request nghiệp vụ |
| `auth.cookie` | `Cookie` của request nghiệp vụ |
| `auth.curlRaw` (mode `curl`) | mọi header của request nghiệp vụ |
| `auth.permCurlRaw` **hoặc** `commonEndpointList[kind='oracle'].curlRaw` | request `checkPermission` |

Hai chỗ cuối là cùng một thứ khai hai lần — `buildOracleRequest` (`src/server/request-builder.js:198-231`)
ưu tiên `permCurlRaw`, không có thì rơi về mẫu chung. Người dùng phải dán cùng một lệnh cURL ở hai
nơi và tự giữ cho chúng khớp nhau.

Nặng hơn: khi dùng mẫu chung, `buildOracleRequest` **xoá** `Cookie`/`Authorization` của mẫu rồi điền
lại từ `auth.cookie`. Mà README dặn `auth.cookie` "không chứa `access_token`/`id_token`, vì hai cái
đó đã nằm trong Bearer token". Làm đúng lời dặn thì `checkPermission` nhận cookie không có
`access_token` → IAM không biết người gọi là ai → 401/403 → cột `Status Check Perm` là số rác.

Và `user.id` / `user.accountId` / `user.role` trong body vẫn nguyên của **người dán mẫu** —
`buildOracleRequest` chỉ ghi đè `function`/`action`. Chạy profile B bằng mẫu của profile A thì cookie
là của B mà body khai là A.

### Đã xác minh trên cURL thật trong repo

Đối chiếu `files/data_test/curl1.txt`, `curl2.txt` (checkPermission thật của FE) với `curl.txt`,
`true-request.txt`, `false-request.txt` (request nghiệp vụ):

| File | `Authorization` | cookie `access_token` | user trong token |
|---|---|---|---|
| `curl1.txt`, `curl2.txt` | **không có** | có · md5 `d7da91a1` | `vnp_gqkn_hotro@vnp.vn` · individual_id `019f4a3d-0cec-75d3-8797-ca7ff2cc2190` |
| `curl.txt` | có · md5 `5a2f3686` | có · md5 `8a0f6310` | `oda.superadmin@vnpt.vn` |
| `true-request.txt` | có · `5a2f3686` | **không có access_token** (chỉ `BIGipServerpool_*`, `REDIRECT_AFTER_LOGIN`) | `oda.superadmin@vnpt.vn` |

Ba kết luận:

1. **`checkPermission` không gửi `Authorization`.** Danh tính hoàn toàn từ cookie `access_token`.
   Decode payload JWT: `preferred_username=vnp_gqkn_hotro@vnp.vn`,
   `individual_id=019f4a3d-0cec-75d3-8797-ca7ff2cc2190` — trùng đúng `user.accountId` / `user.id`
   trong body cURL. Cookie **là** nguồn danh tính của IAM.
2. **Trong cùng một cURL nghiệp vụ, Bearer ≠ cookie `access_token`.** Cùng user nhưng khác `sid`
   (`966fcf60…` vs `4d2c6652…`), `iat` lệch 2 giây — hai lần cấp token khác nhau nằm chung một request.
3. **Request nghiệp vụ chạy được lại không có `access_token` trong cookie** — nó xác thực bằng Bearer.
   IAM xác thực bằng cookie. Hai đường, hai token.

`true-request.txt` khác `false-request.txt` ở **domain** (`api-dev-…` vs `dev-…`, host SPA), không
phải ở cookie — không dùng cặp đó làm bằng chứng về cookie.

### Cấu trúc cookie: lõi auth giống hệt giữa hai usecase

| Khoá | Nội dung |
|---|---|
| `access_token` | JWT · `typ: Bearer` · `aud: account` |
| `id_token` | JWT · `typ: ID` · `aud: tmf-api` |
| `client_id` | plain text `tmf-api` |
| `claims_<env>` | JSON base64 một khối — **không phải JWT** (không có hai dấu chấm), decode base64 một lần là đọc được |
| `REDIRECT_AFTER_LOGIN` | URL trang gốc |

`claims_dev` của `curl1.txt` giải ra:

```json
{"email_verified":false,"user_id":"019f4a3d-0d2d-770d-a411-fd615d39c367","auth_time":1785721302,
 "preferred_username":"vnp_gqkn_hotro@vnp.vn","email":"vnp_gqkn_hotro@vnp.vn","client_id":"tmf-api",
 "individual_id":"019f4a3d-0cec-75d3-8797-ca7ff2cc2190","username":"vnp_gqkn_hotro@vnp.vn"}
```

Đúng hai giá trị body `checkPermission` cần, và khớp với claim trong `access_token` — hai nguồn, cùng
giá trị.

Khác biệt giữa hai usecase chỉ là phần không liên quan auth: cURL `checkPermission` mang thêm 12
cookie analytics (`_ga*`, `_clck`, `_fbp`, `__hstc`, `hubspotutk`, `ajs_*`) vì chụp từ trình duyệt
đang mở trang thật, và `BIGipServerpool_10.165.7.186_30108` có/không tuỳ lần chụp.

Hai điểm chi phối thiết kế:

- **Không cookie nào chứa `role`.** `claims_*` chỉ có định danh. Role phải gõ tay — khớp kết luận của
  spec `2026-08-03-perm-oracle-checkpermission-design.md`: FE tự gửi role đang chọn trên màn hình.
- Tên khoá `claims_` **đổi theo môi trường** (`claims_dev` ở dev-oda). Phải match theo tiền tố, không
  hardcode tên đầy đủ.

**Giới hạn của bằng chứng:** không capture nào trong repo chứa cả hai usecase từ cùng một phiên đăng
nhập, nên đây là so cấu trúc, không phải so byte-by-byte cùng session. Cả hai đều đi tới cùng host
`api-dev-oda.vnpt.vn` từ cùng origin, nên trình duyệt gửi cùng cookie jar theo domain. Nếu chạy thực
tế thấy lệch, tool phải nói ra được (xem phần validate) để người dùng đi lấy lại cặp cURL cùng login.

## Quyết định

**Một auth profile = một lệnh cURL nghiệp vụ + một ô role.** Lõi auth trích từ cURL đó được dùng lại
cho `checkPermission`. Không còn chỗ nào để hai nguồn lệch nhau.

**Đối soát cURL bị bỏ hẳn.** Nó trả lời câu "endpoint nào khớp với function của cURL này" bằng cách
bắt người dùng dán thêm cURL — trong khi CHECK PERM chạy trên toàn pool đã trả lời câu đó bằng hai
cột status. Một tính năng, hai đường, giữ cả hai là giữ chỗ để lệch.

**cURL mẫu chung ở ENDPOINTS CHUNG được GIỮ.** Chỗ trùng lặp cần bỏ chỉ là `auth.permCurlRaw`; cURL
mẫu chung không phải bản sao của nó mà là **khuôn của request**: URL, toàn bộ header của app thật, và
body skeleton. Bỏ luôn cả khuôn rồi tự dựng request từ đầu là sai — xem mục dưới.

### Vì sao không tự dựng request từ đầu

Đã thử và hỏng: bỏ khuôn thì `Origin`/`Referer`/`X-Current-Url` rơi về origin của chính tool và
`Sec-Fetch-Site` thành `cross-site`. Đối chiếu với `curl1.txt` thật:

| Header | cURL thật | Khi tự dựng |
|---|---|---|
| `Origin` | `https://dev-oda.vnpt.vn` | `http://localhost:9000` |
| `Referer` | `https://dev-oda.vnpt.vn/` | `http://localhost:9000/` |
| `X-Current-Url` | `https://dev-oda.vnpt.vn/#/ccos/coordination-management` | `http://localhost:9000/` |
| `Sec-Fetch-Site` | `same-site` | `cross-site` |
| `Connection` | `keep-alive` | mất |
| `Accept-Language` | `en-US,en;q=0.9,vi;q=0.8` | `en,vi;q=0.9` |

IAM nằm sau WAF soi `Origin` → **401 toàn bộ**. Đây là lý do khuôn phải giữ: tool không đoán được URL
trang đang xem hay origin của app, chỉ lệnh cURL thật mới mang chúng.

### Parser phải ăn được mọi kiểu "Copy as …"

Bản cũ cho phép dán token trần vào ô riêng nên parser không nằm trên đường tới hiện. Bắt dán nguyên
lệnh cURL thì nó thành điểm chết: Chrome xuất bốn kiểu, `parseRawHeaders` chỉ đọc được một.

| Kiểu copy | Trước khi sửa |
|---|---|
| cURL (bash) | đúng |
| cURL (cmd) — **mặc định trên Windows** | tên header ra `^"Authorization` → mất Bearer |
| PowerShell — Windows | 1 header rác |
| fetch | tên header ra `"authorization` → mất Bearer |

Mất `Authorization` → request nghiệp vụ đi không kèm Bearer → **401**, và **im lặng** vì vẫn sinh ra
được vài cặp header trông như thật.

`parseRawHeaders` giờ nhận cả bốn, cộng thêm hai chốt chặn im lặng:

- `normalizeWindowsCmdQuotes` đổi `^"` → `"` (và `\^"` → `\"`, `^^` → `^`) trước mọi đường parse;
  `parseCurlRequest` cũng gọi nó, không thì URL đọc ra còn dính `^`.
- Cặp header có tên không hợp lệ theo RFC 7230 token bị **loại**, để một bản dán không đọc được trả về
  rỗng và `authIdentityErrors` báo "không đọc được header nào" thay vì âm thầm gửi header rác.

### Hai usecase, hai credential

`Authorization` và cookie `access_token` là hai token khác nhau, khác cả `sid`, ngay trong cùng một
phiên trình duyệt:

| cURL | `Authorization: Bearer` | `cookie.access_token` |
|---|---|---|
| nghiệp vụ (`curl.txt`) | có · sid `966fcf60` | có · sid `4d2c6652` |
| `checkPermission` (`curl1.txt`) | **không có** | có · sid `7003f08e` |

Request nghiệp vụ xác thực bằng Bearer, `checkPermission` xác thực bằng cookie. **Chỉ cURL nghiệp vụ
mang đủ cả hai** — nên ô cURL ở AUTHS phải nhận cURL nghiệp vụ. Dán nhầm cURL `checkPermission` vào đó
thì request nghiệp vụ đi không Bearer → 401 hàng loạt. `authWarnings` (không chặn chạy, khác
`authIdentityErrors`) báo đúng ca này ngay dưới ô nhập.

## Phần A — danh tính

### `public/js/state.js`

`makeAuth()` còn bốn khoá:

```js
export function makeAuth(over = {}) {
  authSeq += 1;
  return {
    id: `auth_${Date.now().toString(36)}_${authSeq}`,
    name: '',
    // Nguon danh tinh DUY NHAT. Moi header cua request nghiep vu lay tu day;
    // CHECK PERM muon lai rieng phan cookie loi auth (xem auth-identity.js).
    curlRaw: '',
    // Khong nam trong token — FE tu gui theo role dang chon tren man hinh.
    role: '',
    ...over,
  };
}
```

Bỏ `mode`, `token`, `cookie`, `refreshToken`, `permCurlRaw`.

`migrateAuths` dựng `curlRaw` cho cấu hình cũ. `parseRawHeaders` đọc được kiểu "Key: Value" mỗi dòng
khi chuỗi không có cờ cURL, nên bản migrate không cần URL giả:

```js
function curlFromLegacyFields(a) {
  const lines = [];
  if (a.token) lines.push(`Authorization: Bearer ${a.token}`);
  if (a.cookie) lines.push(`Cookie: ${a.cookie}`);
  if (a.refreshToken) lines.push(`refresh_token: ${a.refreshToken}`);
  return lines.join('\n');
}
```

Profile cũ `mode: 'curl'` giữ nguyên `curlRaw`. Profile cũ `mode: 'fields'` lấy chuỗi trên. `role` để
rỗng — người dùng khai lại, và validate sẽ đòi khi UC3 đang bật.

Mỗi profile migrate phải trải lên `makeAuth()`, không map thẳng từng khoá: cấu hình cũ có thể thiếu
`id`, mà `selectedAuths` lọc theo `runFilter.authIds` — `id: undefined` làm RUN ALL sinh **0 request**.

**Ba ô cũ chỉ được dựng lên `curlRaw` khi HEADERS CHUNG không tự khai danh tính.** Trước thay đổi này
`authHeaderPairs` trả `[]` cho `mode: 'fields'`, nên ba ô đó **không bao giờ được gửi đi** — cấu hình
vừa có ba ô vừa có cURL ở HEADERS CHUNG thì thứ đang chạy thật là cái cURL, còn ba ô chỉ là rác còn
sót từ phiên trước. Dựng chúng lên `curlRaw` sẽ đè ngược lên HEADERS CHUNG (auth thắng global, xem
mục thứ tự ưu tiên ngay dưới) và gửi token hết hạn → **401 hàng loạt**. Kiểm tra cả hai chế độ nhập
của HEADERS CHUNG (`globalHeaderRaw` và bảng `globalHeaders` đang bật) xem có `Authorization`/`Cookie`
không. Profile đã có `curlRaw` sẵn thì luôn giữ nguyên, không xét gì thêm.

### Thứ tự ưu tiên header của request nghiệp vụ

`mergePairs(endpoint, auth, global)` — danh sách đầu thắng khi trùng tên:

| Nguồn | Hạng |
|---|---|
| HEADERS riêng của endpoint | cao nhất |
| cURL của auth profile | giữa |
| HEADERS CHUNG | thấp nhất |

**Đây là thay đổi hành vi so với bản cũ** với riêng `mode: 'fields'`: ba ô cũ trước đây là *fallback*
(`putIfAbsent` sau khi merge), giờ cURL của auth là *nguồn có thẩm quyền*. Đúng theo thiết kế — nhiều
auth profile chỉ có nghĩa khi danh tính của từng profile thắng cấu hình dùng chung. Bản `mode: 'curl'`
cũ vốn đã chạy đúng thứ tự này.

`makeCommonEndpoint()` bỏ `curlRaw` — dòng `oracle` chỉ còn `line`.

### `public/js/shared/auth-identity.js` — module mới

Chỗ duy nhất biết cookie có cấu trúc gì. Mọi nơi khác gọi qua đây.

```js
// Cookie cua CCOS mang 5 khoa lien quan danh tinh; phan con lai la analytics
// (_ga*, _clck, _fbp, __hstc, hubspotutk, ajs_*) va sticky-session cua F5.
// Chi 5 khoa nay di sang request checkPermission.
export const AUTH_CORE_KEYS = ['access_token', 'id_token', 'client_id', 'REDIRECT_AFTER_LOGIN'];
export const AUTH_CORE_PREFIX = 'claims_'; // ten doi theo moi truong: claims_dev, claims_uat...

export function parseCookiePairs(cookieStr)  // -> [{ key, value }] giu nguyen thu tu
export function authCookieString(auth)       // -> chuoi Cookie da loc con lai loi auth
export function decodeJwtPayload(token)      // -> object | null (base64url, KHONG verify chu ky)
export function identityOf(auth)             // -> { accountId, individualId, exp, sid, azp, source }
export function authIdentityErrors(auth)     // -> string[]
```

`identityOf` đọc `claims_*` trước (JSON URL-encoded, không cần decode JWT), thiếu thì rơi về payload
của `access_token`; `source` ghi `'claims'` hay `'jwt'` để hiện ra UI. `exp`/`sid`/`azp` luôn lấy từ
`access_token` vì `claims_*` không có.

`authIdentityErrors` trả về đúng những câu người dùng cần để đi lấy lại cURL:

| Điều kiện | Thông báo |
|---|---|
| `parseCurlRequest`/`parseRawHeaders` không ra header nào | `cURL không đọc được header nào` |
| cookie không có `access_token` | `Cookie thiếu access_token — dán cURL của request đã đăng nhập` |
| `exp` đã qua | `access_token hết hạn lúc <HH:mm dd/MM/yyyy>` |
| `claims_*` khác `access_token` về `individual_id` hoặc `preferred_username` | `claims_* và access_token là hai người khác nhau — cookie ghép từ hai lần login` |
| cURL có `Authorization` và JWT của nó khác cookie `access_token` về `preferred_username` | `Authorization và cookie là hai user khác nhau` |
| …khác về `sid` (cùng user) | `Authorization và cookie thuộc hai phiên đăng nhập khác nhau` |
| cookie `client_id` khác `azp` trong JWT | `client_id trong cookie khác azp của token` |

Lệch `sid` là **cảnh báo chặn chạy** chứ không phải ghi chú: đó chính xác là ca `curl.txt` đang mắc,
và là lúc phải đi lấy lại cả hai cURL trong cùng một lần login.

**Đánh đổi đã cân nhắc:** lọc cookie làm rụng `BIGipServerpool_*` — sticky-session của F5. Nếu
`checkPermission` trả kết quả chập chờn giữa các lần chạy, đây là nghi phạm đầu tiên; thêm lại chỉ là
một phần tử trong `AUTH_CORE_KEYS`.

### `src/server/request-builder.js`

`buildOne` giữ nguyên — headers vẫn từ `authHeaderPairs(auth)` (parse `curlRaw`), chỉ bỏ ba dòng
`putIfAbsent` cho `Authorization`/`Cookie`/`refresh_token` vì ba khoá đó không còn tồn tại.

`buildOracleRequest` đọc **đúng một** cURL: mẫu chung ở ENDPOINTS CHUNG (`oracleTemplate.curlRaw`).
Không đọc `auth.permCurlRaw` nữa — khoá đó bị bỏ. Mẫu là **khuôn**, chỉ danh tính bị thay:

| Phần của request | Nguồn |
|---|---|
| URL, method | cURL mẫu (URL tuyệt đối dùng nguyên) |
| Mọi header trừ `Cookie`/`Authorization` | cURL mẫu, giữ **nguyên văn** |
| `Cookie` | `authCookieString(auth)` — 5 khoá lõi của auth đang chạy |
| `Authorization` | **xoá, không đặt lại** — cURL `checkPermission` thật không gửi header này |
| `permissionSpecification.function` | cột FUNCTION (UC3) |
| `permissionSpecification.action` | cột ACTION, rỗng thì giữ `action` của mẫu, không có nữa thì `Read` |
| `user.role` / `.id` / `.accountId` | `auth.role` + `identityOf(auth)`; field lạ khác trong `user` giữ nguyên |
| Header/`body` skeleton còn thiếu | `putIfAbsent` + `BROWSER_HEADERS` như `buildOne` |

Thứ tự bắt buộc: **trải header của khuôn trước**, rồi mới `putIfAbsent` — ngược lại thì
`Origin`/`Referer`/`X-Current-Url` của tool đè lên giá trị thật của app.

Chưa dán mẫu thì vẫn dựng được request tối thiểu từ dòng `METHOD /path`, nhưng validate chặn trước
(xem dưới) vì gần như chắc chắn 401.

Mã lỗi: `ORACLE_IDENTITY_MISSING` (cookie không ra được `individual_id`/`preferred_username`),
`ORACLE_ROLE_MISSING` (chưa khai role), `ORACLE_TEMPLATE_INVALID` (mẫu không parse ra URL),
`ORACLE_LINE_INVALID` (không mẫu và dòng `METHOD /path` cũng rỗng).

### `public/js/shared/permission-scope.js`

`validatePermissionScope` — nhánh UC3 bỏ kiểm tra `permCurlRaw`, thay bằng:

- Phải có dòng `kind: 'oracle'` ở ENDPOINTS CHUNG.
- Dòng đó **phải có `curlRaw`** — thiếu thì báo thẳng "request sẽ mang Origin/Referer của tool và IAM
  trả 401", không để người dùng chạy hết một lượt rồi mới thấy 401 hàng loạt.
- `curlRaw` phải `parseCurlRequest` ra được URL.
- Với mỗi auth profile thuộc UC1: gộp `authIdentityErrors(auth)`, tiền tố tên profile.
- `role` rỗng khi UC3 đã khai cột FUNCTION → báo.

`buildPermissionRunConfig` giữ nguyên cách đính `oracleTemplate` — nó mang cả `line` lẫn `curlRaw`.

### Xoá

| Đường dẫn | Lý do |
|---|---|
| `public/js/shared/curl-audit.js` | tính năng đối soát cURL bị bỏ (không có file test nào cho nó) |
| `public/index.html` — card `#card-curl-audit` | như trên |
| `public/js/main.js` — import `auditCurls` và block `461-485` | như trên |
| `public/js/ui/auths-panel.js` — `MODES`, `FIELDS`, `modeRow`, `permCurlBox` | còn 2 ô |
| `public/js/ui/common-endpoints.js` — nút `📋 cURL`, textarea `ce-curl` | dòng oracle chỉ còn `line` |

`README.md` phải sửa theo: mục "Credential phải dán tay" (bảng ba ô) và mục nói về nút
`⟳ Reload Token` — nút đó **không còn trong code**, README đang mô tả tính năng đã bị gỡ.

### `public/js/ui/auths-panel.js`

Mỗi profile còn một `textarea` cURL và một `input` role, cộng dòng tóm tắt danh tính đọc từ
`identityOf` — người dùng thấy ngay mình dán nhầm cURL của ai:

```
● oda.superadmin@vnpt.vn · id 334abe82… · hết hạn 14:21 03/08 · claims_dev
⚠ Authorization và cookie thuộc hai phiên đăng nhập khác nhau
```

Ba nút trên đầu mỗi thẻ profile: `⌫` **xoá nội dung đã nhập** (`curlRaw` + `role`) nhưng giữ nguyên
`id` và `name` — khác hẳn `✕` xoá cả profile. Giữ `id` để `runFilter.authIds` không đứt, giữ `name`
để dòng UC1 khai theo tên không mất đích. Nút tự tắt khi profile chưa nhập gì. Đây là đường thoát khi
credential cũ còn sót trong `curlRaw` đang đè lên HEADERS CHUNG.

Không cần đụng gì đến validate: RUN ALL vốn không đòi token (`validateConfig` không kiểm) nên profile
vừa `⌫` vẫn chạy được bằng HEADERS CHUNG; CHECK PERM thì `authIdentityErrors` báo đúng "Chưa dán cURL"
kèm tên profile.

### Nút `✓ Verify` — một engine, ba mặt hiển thị

Cảnh báo thụ động không đủ: người dùng phải chạy rồi mới biết mình hỏng ở đâu. `verifyAuth(auth)` trả
về `{ ok, checks: [{ status, scope, label, detail }] }` và là **nguồn sự thật duy nhất** — hai hàm cũ
chỉ còn là bộ lọc trên nó:

```js
export const authIdentityErrors = (auth) => verifyAuth(auth).checks
  .filter((c) => c.status === 'fail').map((c) => c.detail);
export const authWarnings = (auth) => verifyAuth(auth).checks
  .filter((c) => c.status === 'warn').map((c) => c.detail);
```

`scope` ghi rõ check đó chặn đường nào (`NGHIỆP VỤ` / `CHECK PERM` / `CẢ HAI`) — cần thiết vì hai
usecase xác thực bằng hai thứ khác nhau, thiếu Bearer chỉ hỏng đường nghiệp vụ chứ không hỏng
`checkPermission`.

Verify **không gọi mạng** — mọi check đều đọc được ngay từ chuỗi đã dán, nên bấm là có kết quả và
không sinh side effect. Kết quả lưu theo id profile trong closure và bị xoá khi `curlRaw`/`role` đổi
hoặc khi bấm `⌫`, để không bao giờ hiện verdict lạc hậu.

Gộp về một engine cũng bỏ được một trùng lặp cũ: thiếu `access_token` trước đây vừa là lỗi chặn vừa là
cảnh báo với hai câu chữ khác nhau. Giờ một điều kiện, một thông báo.

### `public/js/shared/auth-utils.js`

Không còn `mode` nên hai hàm bỏ nhánh rẽ:

- `authHeaderPairs(auth)` luôn `parseRawHeaders(auth.curlRaw)`, không kiểm `mode` nữa.
- `hasToken(auth)` đổi thành "cookie lõi có `access_token`" thay vì "có header `Authorization`" — đèn
  báo trên đầu thẻ profile phải nói đúng thứ quyết định chạy được hay không.

`findDuplicateNames` giữ nguyên.

Khuôn giữ focus (`openIds` / `pendingFocus`) giữ nguyên, chỉ bớt đi một ô.

## Phần B — record detail ở bảng log

### `public/js/shared/curl.js`

Tách phần dựng lệnh ra khỏi record để dùng được cho cả hai request:

```js
export function curlOf(request)                        // { method, url, headers, body } -> string
export const toCurl = (rec) => curlOf(rec?.request);   // giu chu ky cu cho result-table
export function curlFilename(rec, kind = 'business')   // kind 'oracle' -> hau to '-checkperm'
```

### `public/js/ui/detail-drawer.js`

Hai khối `REQUEST ORACLE` và `REQUEST NGHIỆP VỤ` đang xếp dọc, đổi thành hai cột ngang:

```
┌ Request #12 · Nhân viên GQKN                              [Đóng] ┐
│ ┌────────── NGHIỆP VỤ ──────────┐ ┌────── CHECK PERMISSION ─────┐│
│ │ GET · 403 · 812ms  [⧉][⤓]     │ │ POST · 200  [⧉][⤓]          ││
│ │ URL      (min-height 50px)    │ │ URL      (min-height 50px)  ││
│ │ REQUEST HEADERS               │ │ FUNCTION / ACTION           ││
│ │ RESPONSE HEADERS              │ │ REQUEST HEADERS             ││
│ │ PATH / QUERY PARAMS           │ │ RESPONSE HEADERS            ││
│ │ REQUEST BODY                  │ │ REQUEST BODY                ││
│ │ RESPONSE BODY [Pretty|Raw|..] │ │ RESPONSE BODY [Pretty|Raw]  ││
│ └───────────────────────────────┘ └─────────────────────────────┘│
```

Record không có `oracle` (chạy từ RUN ALL) → một cột chiếm hết chiều ngang, không dựng cột rỗng.

Mỗi cột có hai nút:

- `⧉ Copy cURL` — `navigator.clipboard.writeText` (tool chạy ở `localhost:9000`, là secure context nên
  API dùng được), fallback `textarea` + `execCommand('copy')`.
- `⤓ .txt` — `downloadBlob` sẵn có, tên file từ `curlFilename(rec, kind)`.

Cả hai báo qua `window.ccmToast`.

**Bẫy phải xử lý:** tab bar hiện query `[data-tab]` / `[data-pane]` trên cả drawer
(`detail-drawer.js:158-169`). Tách hai cột mà không thu hẹp phạm vi thì bấm `Pretty` ở cột trái lật
luôn pane của cột phải. Đổi sang query trong phần tử cột.

**Lưu ý bảo mật:** cURL xuất ra mang cookie và token **nguyên vẹn, không che** — khác Excel export có
radio Che/Đầy đủ. Đó là chủ đích, vì file để replay lại request. Nút mang `title` nói rõ file chứa
credential sống.

### `public/css/app.css`

```css
.drawer { width: min(1600px, 96vw); }          /* cu: min(1040px, 95vw) — hai cot se chat */
.detail-cols { display: flex; gap: var(--sp-md); align-items: flex-start; }
.detail-col { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: var(--sp-sm); }
.detail-col .kv-grid { grid-template-columns: 1fr; }
.drawer pre.url-box { min-height: 50px; }
@media (max-width: 1100px) { .detail-cols { flex-direction: column; } }
```

`min-width: 0` là bắt buộc — thiếu nó thì `pre` chứa URL dài đẩy cột phình ra khỏi drawer.

## Test

| File | Thêm |
|---|---|
| `test/auth-identity.test.js` (mới) | lọc cookie đúng 5 khoá lõi kể cả `claims_<env>` lạ tên; `identityOf` ưu tiên `claims_*`, rơi về JWT khi thiếu; đủ 7 ca của `authIdentityErrors`; JWT hỏng không ném lỗi |
| `test/auth-utils.test.js` | `hasToken` đọc cookie `access_token`; `authHeaderPairs` parse `curlRaw` không cần `mode`; bỏ ca `mode` |
| `test/state.test.js` | migrate profile cũ `mode:'fields'` ra `curlRaw` ba dòng; profile `mode:'curl'` giữ nguyên |
| `test/request-builder.test.js` | cURL mẫu giữ nguyên `Origin`/`Referer`/`X-Current-Url`/`Sec-Fetch-Site` của app thật; `Cookie` và khối `user` bị thay bằng danh tính auth; `Authorization` của mẫu bị bỏ; ACTION rỗng → giữ action của mẫu; thiếu role → `ORACLE_ROLE_MISSING` |
| `test/permission-scope.test.js` | validate báo lỗi kèm tên profile khi cookie hết hạn / lệch `sid` / thiếu role |
| `test/auths-panel.test.js` | còn 2 ô, dòng tóm tắt danh tính, không còn radio mode |
| `test/detail-drawer.test.js` | hai cột khi có oracle, một cột khi không; mỗi cột đủ 2 nút; tab bar cột trái không đụng cột phải; ô URL có class `url-box` |
| `test/curl.test.js` | `curlOf` dựng lệnh cho request oracle; `curlFilename(rec, 'oracle')` |

Chạy `npm test` sau mỗi bước — bộ test hiện tại đụng `auths` ở `request-builder.test.js`,
`routes.test.js`, `state.test.js`, `auths-panel.test.js`, tất cả đều phải đổi theo hình dạng
profile mới.

## Không làm

- **Không** che credential trong cURL export — file đó để replay, che thì vô dụng.
- **Không** đoán `role` từ token. Không claim nào chứa nó; đoán là bịa.
- **Không** giữ ô Bearer đè. Thêm một ô là thêm một chỗ lệch — đúng thứ spec này đang bỏ.
- **Không** đụng `buildOne`, `runner`, `worker-pool`, cách chấm `statusPermission`. Chúng đang đúng.
