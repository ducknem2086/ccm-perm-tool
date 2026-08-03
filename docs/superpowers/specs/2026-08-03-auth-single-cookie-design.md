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
| `claims_<env>` | JSON URL-encoded — **không phải JWT**, đọc thẳng được |
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

`buildOracleRequest` viết lại, **không đọc cURL nào**:

```js
function buildOracleRequest({ config, auth, endpoint }) {
  const fn = String(endpoint.oracleFunction ?? '').trim();
  if (!fn) return null;

  const tpl = config?.oracleTemplate;
  if (!tpl) return null;
  // Dung lai parser cua ENDPOINTS CHUNG — 'POST /iam/engage/checkPermission'
  // tach ra { method, pathTemplate } y het dong 'business'.
  const [line] = parseCommonEndpoints(tpl.line ?? '');
  if (!line) return { error: 'ORACLE_LINE_INVALID' };

  const id = identityOf(auth);
  if (!id?.individualId || !id?.accountId) return { error: 'ORACLE_IDENTITY_MISSING' };
  const role = String(auth?.role ?? '').trim();
  if (!role) return { error: 'ORACLE_ROLE_MISSING' };

  const headers = { Cookie: authCookieString(auth), 'Content-Type': 'application/json' };
  // KHONG co Authorization — curl checkPermission that cua FE khong gui header nay.
  const origin = String(config.origin ?? '').trim().replace(/\/+$/, '');
  putIfAbsent(headers, 'Origin', origin);
  putIfAbsent(headers, 'Referer', origin ? `${origin}/` : '');
  putIfAbsent(headers, 'X-Current-Url', origin ? `${origin}/` : '');
  for (const [k, v] of Object.entries(BROWSER_HEADERS)) putIfAbsent(headers, k, v);

  const action = String(endpoint.oracleAction ?? '').trim() || 'Read';
  const body = {
    '@type': 'CheckPermission',
    permissionSpecification: { '@type': 'PermissionSpecification', function: fn, action },
    user: { '@type': 'PartyRef', role, id: id.individualId, accountId: id.accountId },
  };

  const base = String(config.domain ?? '').trim().replace(/\/+$/, '');
  return { method: line.method, url: `${base}${line.pathTemplate}`, headers,
           body: JSON.stringify(body), permFunction: fn, permAction: action };
}
```

**Đổi hành vi cần biết:** cột ACTION để trống trước đây nghĩa là "giữ nguyên `action` trong cURL mẫu";
giờ không còn mẫu nên mặc định `"Read"` — đúng giá trị cả hai cURL thật đang dùng.

Ba mã lỗi mới `ORACLE_IDENTITY_MISSING` / `ORACLE_ROLE_MISSING` / `ORACLE_LINE_INVALID` đi cùng đường
với `ORACLE_BODY_INVALID` sẵn có, hiện ở cột `Status Check Perm` thay vì âm thầm gửi request thiếu
người. `ORACLE_BODY_INVALID` không còn chỗ phát sinh (body do tool dựng) nhưng giữ lại trong
`error-code.js` để record cũ mở lại vẫn đọc được nhãn.

### `public/js/shared/permission-scope.js`

`validatePermissionScope` — nhánh UC3 bỏ toàn bộ kiểm tra `permCurlRaw` và body cURL mẫu, thay bằng:

- Phải có đúng một dòng `kind: 'oracle'` ở ENDPOINTS CHUNG, `line` parse ra `METHOD /path`.
- Với mỗi auth profile thuộc UC1: gộp `authIdentityErrors(auth)`, tiền tố tên profile.
- `role` rỗng khi UC3 đã khai cột FUNCTION → báo.

`buildPermissionRunConfig` giữ nguyên cách đính `oracleTemplate`, chỉ khác là nó không còn mang
`curlRaw`.

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
| `test/request-builder.test.js` | `buildOracleRequest` dựng body từ danh tính cookie + role; không có header `Authorization`; ACTION rỗng → `Read`; thiếu role → `ORACLE_ROLE_MISSING` |
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
