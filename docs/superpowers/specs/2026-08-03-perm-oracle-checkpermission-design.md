# CHECK PERM đối soát với oracle `checkPermission`

Ngày: 2026-08-03

## Vấn đề

`evaluateUc2Permission` (`src/server/http-client.js:75-76`) kết luận phân quyền bằng **đúng một** tín hiệu:

```js
if (cellVal === 'x') return status !== 403 ? 'true' : 'false';
return status === 403 ? 'true' : 'false';
```

Nghĩa là **mọi** 403 đều được đọc là "bị chặn vì không có quyền". Nhưng 403 còn phát sinh từ:

- gateway/WAF chặn một URL không tồn tại,
- token hết hạn hoặc sai audience,
- path do tool tự ghép — `buildOne` nối `/${msisdn}` vào cuối path khi endpoint không có
  placeholder (`src/server/request-builder.js:188-190`),
- endpoint khai sai trong file import.

Không có nguồn thứ hai nào để bác bỏ, nên bốn nguyên nhân trên đều được chấm là "đúng phân quyền".

Quan sát thực tế đã xác nhận: hai function trong `files/data_test/curl1.txt` và `curl2.txt`
(`/ccm-troubleTicket-feedbackTicket`, `/ccm-troubleTicket-assignmentTicket`) được tool chấm 403 trong
khi endpoint thật trả 404.

Hệ thống có sẵn một tín hiệu thứ hai: `POST /iam/engage/checkPermission` của IAM — hỏi thẳng "role
này có quyền với function này không", không đi qua API nghiệp vụ nên không dính URL sai hay WAF. Body:

```json
{"@type":"CheckPermission",
 "permissionSpecification":{"@type":"PermissionSpecification",
   "function":"/ccm-troubleTicket-feedbackTicket","action":"Read"},
 "user":{"role":"core_donvixuly","@type":"PartyRef",
   "id":"019f4a3d-0cec-75d3-8797-ca7ff2cc2190","accountId":"vnp_gqkn_hotro@vnp.vn"}}
```

`user.id` = claim `individual_id` và `user.accountId` = claim `preferred_username` của access token
trong cookie. `user.role` (`core_donvixuly`) **không** nằm trong token — FE tự gửi theo role đang chọn
trên màn hình. Vì vậy không suy ra được `user` từ token; mỗi danh tính phải có curl riêng.

## Quyết định

CHECK PERM chạy **theo cặp**: mỗi endpoint sinh hai request — một tới `checkPermission` (endpoint
chung), một tới API nghiệp vụ — rồi in **hai status thô thành hai cột** trên bảng log. Không ghép,
không dẫn xuất; người đọc tự đối chiếu.

### Cặp chạy trong cùng một task

Một record vẫn là một dòng bảng, nhưng mang hai response.

```
worker task
  ├─ 1. checkPermission: POST /iam/engage/checkPermission  → oracle.status
  └─ 2. nghiệp vụ:       GET  /query/whitelist-.../{msisdn} → response.status
       ⇒ record { response, oracle }   // hai status, hai cot rieng
```

Đã cân nhắc và loại: đẩy oracle thành request thứ hai trong cùng hàng đợi rồi ghép lại bằng `pairId`.
Cách đó buộc phải sửa cách đếm progress ở `runner.js`, sửa SSE, và phải định nghĩa hành vi khi một
nửa cặp chết. Gộp trong task thì `runner.js`, `worker-pool.js`, luồng SSE và cấu trúc bảng kết quả
**không đổi dòng nào**.

`checkPermission` lỗi mạng/timeout → cột `Status Check Perm` hiện `—`; request nghiệp vụ **vẫn chạy**
và cột `Status` vẫn có số. Một nửa cặp chết không kéo nửa kia theo.

### Hai status thô, không ghép công thức

Hai status **không liên quan gì nhau** về mặt tính toán. Mỗi cái là một cột riêng trên bảng log,
người đọc tự đối chiếu.

| Cột | Nguồn | Ghi chú |
|---|---|---|
| `Status` | HTTP status của request nghiệp vụ | đã có hôm nay |
| `Status Check Perm` | HTTP status **thô** của endpoint chung `checkPermission` | mới; `—` khi không gọi |

Không dẫn xuất cột thứ ba từ hai cột này. Không có biến `allowed`, không có ma trận quy đổi. Tool
đặt hai con số cạnh nhau; kết luận là việc của người đọc.

**`status_permission` giữ nguyên** — vẫn chấm theo `status === 403` của request nghiệp vụ đúng như
`require.md` mô tả. `evaluatePermission` và `evaluateUc2Permission` (`src/server/http-client.js:58-135`)
**không sửa một dòng nào**. Oracle là cột thông tin đặt cạnh, không phải nguồn chấm điểm mới.

Đã cân nhắc và loại: dùng oracle làm nguồn chấm thay cho status endpoint, hoặc sinh cột dẫn xuất
"endpoint có khớp oracle không". Cả hai đều bắt tool phán quyết thay người dùng dựa trên giả định
"oracle 403 = từ chối" — giả định đó chưa được xác nhận bằng response thật, và đoán sai thì lại đúng
kiểu lỗi đang phải sửa.

### Đơn vị chạy = một endpoint, không gộp theo BE API

Hai function FE khác nhau có thể trỏ chung một BE API (`GET /troubleTicket` phục vụ nhiều màn hình).
Khoá khử trùng hiện tại `METHOD:pathTemplate` (`permission-match.js:47-60`) sẽ **xoá mất một bản**, và
function của bản bị xoá không còn endpoint nào đại diện — đúng triệu chứng "test không tìm thấy
endpoint khớp với endpoint của curl".

Khi UC3 được khai, khoá khử trùng đổi thành `METHOD:pathTemplate:function`. Mỗi function là một đơn vị
phân quyền riêng nên phải có cặp request riêng.

## Thay đổi theo file

### `public/js/state.js`

**ENDPOINTS CHUNG đổi shape.** `commonEndpoints` (string) → `commonEndpointList` (mảng):

```js
commonEndpointList: [
  // kind: 'business' = vao pool RUN ALL nhu hom nay
  //       'oracle'   = KHONG vao pool, la khai bao endpoint checkPermission mac dinh
  { id: 'ce_1', kind: 'business', line: 'POST /api/v1/submit', curlRaw: '' },
  { id: 'ce_2', kind: 'oracle',   line: 'POST /iam/engage/checkPermission', curlRaw: '<curl mau>' },
]
```

Giữ `commonEndpointsEnabled` nguyên nghĩa — chỉ gate mục `kind: 'business'`.

Migration trong `load()` và `applyConfig()`: chưa có `commonEndpointList` mà có `commonEndpoints`
string → tách theo dòng, mỗi dòng thành một mục `kind: 'business'`. Xoá khoá `commonEndpoints` sau khi
chuyển. Cấu hình cũ mở lên chạy y hệt trước.

**`filterEndpoints` không đổi chữ ký.** Thêm hàm dẫn xuất trong `run-filter.js`:

```js
// Chuoi ma filterEndpoints van dang nhan — noi lai tu cac muc 'business'.
// Giu nguyen chu ky filterEndpoints de request-builder.js va request-count.js
// khong phai doi mot dong nao.
export const businessCommonText = (list) => (list ?? [])
  .filter((c) => c.kind !== 'oracle')
  .map((c) => c.line)
  .join('\n');
```

Mọi chỗ đang truyền `state.commonEndpoints` đổi sang `businessCommonText(state.commonEndpointList)`:
`main.js:276`, `request-count.js:8`, `run-filter-bar.js:163`, `request-builder.js:80`.

**UC3 vào mapping.** `permissionMapping` và `emptySavedConfig()` thêm:

```js
usecase3: { columnSheet: '', functionColumn: '', actionColumn: '' }
```

`snapshot()` đã clone cả `state.permissionMapping` nên UC3 tự vào gate Lưu. `normalizeSavedConfig()`
thêm nhánh `usecase3` trải từ `base` giống cách đang làm với `usecase2`, để cấu hình cũ (không có UC3)
mở lên không văng `undefined`.

**Auth profile.** `makeAuth()` thêm `permCurlRaw: ''`.

### `public/js/shared/curl-parse.js` — file mới

`parseRawHeaders` (`endpoint-path.js:100`) chỉ moi `-H`/`-b`, không lấy URL, method, body. Oracle cần
cả ba.

```js
// Tach mot lenh cURL thanh request day du. Tai su dung parseRawHeaders cho phan
// header/cookie — mot nguon su that duy nhat, khong viet lai logic quote/xuong dong.
export function parseCurlRequest(text) // -> { method, url, headers: {}, body: string|null }
```

Quy tắc:

- URL: token đầu tiên khớp `^https?://` (chịu được cả dạng nháy đơn, nháy kép, trần).
- Method: `-X`/`--request` nếu có; không có thì `POST` khi có body, `GET` khi không.
- Body: `--data-raw`, `--data`, `--data-binary`, `-d` — lấy nguyên chuỗi, không parse.
- Headers: gọi `parseRawHeaders(text)` rồi đổ thành object.
- Không parse được URL → trả `null`; nơi gọi báo lỗi cấu hình, không đoán.

### `public/js/shared/permission-match.js`

**Hàm đọc cột nghiêm ngặt** — thêm cạnh `joinValueOf`:

```js
// Doc gia tri mot cot raw. HAI tang, khong co tang 3 fallback ve e.name nhu
// joinValueOf: doan function bang ten endpoint la bia ra mot quyen khong ton tai,
// va oracle se tra 404/403 cho mot function khong co that -> cham diem sai ma
// khong ai biet. Thieu cot thi tra '' de duoc dem vao noFunction.
export function rawValueOf(endpoint, column) {
  const raw = endpoint?.raw ?? {};
  const want = normalizeName(column);
  if (want === '') return '';
  const hit = Object.entries(raw).find(([k]) => normalizeName(k) === want);
  return hit ? String(hit[1] ?? '') : '';
}
```

**Khử trùng theo function.** `dedupePreferJoinable(endpoints, endpointColumn)` nhận thêm `uc3`:

```js
const key = uc3?.functionColumn
  ? `${method}:${path}:${normalizeName(rawValueOf(e, uc3.functionColumn))}`
  : `${method}:${path}`;
```

Trả thêm số bản đã gộp để phơi ra UI: `{ unique, collapsed }`.

**Gắn function/action vào endpoint.** `matchPermissionEndpoints` trả thêm hai khoá cho mỗi mục:

```js
{ endpoint, permName, permRowIndex,
  oracleFunction: rawValueOf(e, uc3.functionColumn),
  oracleAction:   rawValueOf(e, uc3.actionColumn) }
```

Endpoint có `oracleFunction === ''` vẫn chạy request nghiệp vụ và vẫn được chấm `status_permission`
như thường — chỉ không sinh request `checkPermission`, nên cột `Status Check Perm` hiện `—`.

### `public/js/shared/permission-scope.js`

**`scopedEndpointsAndAuths`** chuyển tiếp `oracleFunction`/`oracleAction` vào từng endpoint, giống cách
đang làm với `permName`/`permRowIndex`.

**`buildPermissionRunConfig`** nhét template oracle vào config và trả thêm ba số:

```js
const oracleTemplate = (state?.commonEndpointList ?? []).find((c) => c.kind === 'oracle') ?? null;

// Moi auth mot danh tinh rieng: profile nao dan curl thi dung curl do (co san
// cookie + user block dung nguoi), profile bo trong roi ve mau chung o
// ENDPOINTS CHUNG kem token/cookie cua chinh profile.
const auths = ...; // giu nguyen cach loc hien tai

const noFunction = endpoints.filter((e) => !String(e.oracleFunction ?? '').trim()).length;
const pairs      = auths.length * perAuth;          // = so request nghiep vu, nhu hom nay
// Endpoint trong cot FUNCTION khong sinh request oracle nen KHONG phai lucky
// "gap doi": dem rieng, khong thi nhan nut noi mot dang ma Network tab mot neo.
const oracleCalls = auths.length * (perAuth - noFunctionPerAuth);

return { config: { ...config, oracleTemplate },
         endpointCount, authCount, pairs, oracleCalls, total: pairs + oracleCalls,
         unmatched, noFunction, collapsed };
```

`total` là **số request thật sẽ bắn đi**, không phải số cặp — nút CHECK PERM hiển thị đúng con số này.

**`validatePermissionScope`** thêm bốn kiểm tra, gom vào cùng mảng `errors` như hiện tại:

1. **Chỉ kiểm khi `uc3.functionColumn` đã khai.** Khi đó phải có ít nhất một mục `kind: 'oracle'` ở
   ENDPOINTS CHUNG, hoặc mọi auth profile trong UC1 đều đã dán `permCurlRaw`. Không có cả hai →
   `'UC3 đã khai cột FUNCTION nhưng chưa khai endpoint check permission'`. UC3 trống thì bỏ qua cả
   bốn kiểm tra dưới đây.
2. `uc3.columnSheet` thuộc tập sheet có endpoint; `uc3.functionColumn`/`uc3.actionColumn` nằm trong
   `endpointColumnsOfSheet(state.endpoints, uc3.columnSheet)`. Dùng đúng hàm mà panel dựng option,
   không thì validate qua mà dropdown rỗng.
3. Mỗi `permCurlRaw` đã dán phải `parseCurlRequest` ra được URL — hỏng thì báo kèm tên profile.
4. Body của template oracle phải parse được JSON và có đường dẫn `permissionSpecification`. Không có
   → `'Body curl checkPermission thiếu permissionSpecification'`.

UC3 để trống hoàn toàn là **hợp lệ** — khi đó CHECK PERM chạy như trước thay đổi này (một request,
chấm theo 403), không bắt buộc mọi người dùng phải cấu hình oracle mới bấm được nút.

### `src/server/request-builder.js`

`buildOne` gắn thêm một sub-request khi endpoint có function và auth có template:

```js
// Sub-request oracle di kem request nghiep vu. Khong phai mot phan tu rieng
// trong mang requests: cap phai chay trong cung mot task de khong dung toi cach
// dem progress cua runner.js.
const oracle = buildOracleRequest({ config, auth, endpoint });
return { ...req, oracle };
```

`buildOracleRequest` mới:

- Nguồn template: `auth.permCurlRaw` nếu có, không thì `config.oracleTemplate.curlRaw`, không nữa thì
  dựng từ `config.oracleTemplate.line` (`POST /iam/engage/checkPermission`) + `config.domain`.
- URL: URL tuyệt đối trong curl dùng nguyên; chỉ có path thì ghép `config.domain` như request thường.
- Headers: header của curl trước, rồi `authHeaderPairs(auth)`, rồi `putIfAbsent` Authorization /
  Cookie / `BROWSER_HEADERS` — **cùng thứ tự ưu tiên** với `buildOne` để hai request trong cặp mang
  cùng danh tính.
- Body: `JSON.parse` body của curl, gán
  `body.permissionSpecification.function = endpoint.oracleFunction` và
  `.action = endpoint.oracleAction`, rồi `JSON.stringify`. Parse hỏng hoặc thiếu
  `permissionSpecification` → trả `{ error: 'ORACLE_BODY_INVALID' }`, không đoán bằng string replace.
- Không gắn msisdn, không gắn `globalQueryParams`: oracle không nhận tham số nào ngoài body.
- Trả kèm `permFunction` / `permAction` (đúng giá trị vừa nhét vào body) để `finalize` đưa thẳng ra
  cột `Function` của bảng mà không phải parse ngược body.

Trả `null` khi endpoint không có `oracleFunction` — cặp thoái về một request.

### `src/server/http-client.js`

**Tách phần gửi** khỏi `sendRequest`: một hàm `send(req, opts)` chỉ lo axios + parse + `diagnose`, trả
`{ status, statusText, resHeaders, body, bodyText, redirected, finalUrl, errorCode, errorMessage }`.
`finalize` giữ nguyên vai trò dựng record.

**`sendPair(req, options)`** — điểm vào mới của worker:

```js
// Oracle chay TRUOC: no khong doi trang thai gi tren he thong (chi hoi quyen),
// nen khi request nghiep vu la POST/DELETE thi thu tu nay tranh duoc canh
// "da ghi du lieu roi moi biet la khong duoc phep".
export async function sendPair(req, options) {
  const oracle = req.oracle ? await send(req.oracle, options) : null;
  const main   = await send(req, options);
  return finalize({
    req, startedAt, t0, oracle, ...main,
    errorCodePaths: options.errorCodePaths,
    permissionFile: options.permissionFile,
    permissionMapping: options.permissionMapping,
  });
}
```

`startedAt`/`t0` bấm giờ trước lời gọi oracle: `durationMs` của record là thời gian **cả cặp**, đúng
cái người dùng chờ.

`req.oracle.error === 'ORACLE_BODY_INVALID'` → bỏ qua bước gọi, `oracle = null`, record mang
`errorCode` đó để hiện trong drawer.

**Chấm điểm không đổi.** `evaluatePermission` (dòng 79-135) và `evaluateUc2Permission` (dòng 58-77)
giữ nguyên từng dòng — chúng vẫn chỉ đọc `status` của request nghiệp vụ. Oracle không đi vào công
thức nào; nó chỉ thêm dữ liệu vào record.

**Record** mọc thêm ba khoá, `finalize` nhận thêm tham số `oracle`:

```js
// Status tho cua oracle, dat canh response.status de nguoi doc tu doi chieu.
// KHONG co cot dan xuat nao tu hai con so nay.
oracle: oracle && {
  request: { method: ..., url: ..., headers: ..., body: ... },
  status, statusText, headers, body, bodyText,
},
oracleFunction: req.oracle?.permFunction ?? null,
oracleAction:   req.oracle?.permAction ?? null,
```

### `src/server/request-worker.js`

Dòng 2 và 17: `sendRequest` → `sendPair`. Không đổi gì khác — worker vẫn nhận một request, trả một
record.

`runner.js` chạy fallback inline ở dòng 102 cũng đổi sang `sendPair`.

### `public/js/ui/common-endpoints.js` — file mới

Thay textarea `#inp-endpoints-common` bằng danh sách dòng cấu hình, mỗi dòng:

```
[ POST /iam/engage/checkPermission          ] [ Check permission ▾ ] [ 📋 cURL ] [ ✕ ]
[ /api/v1/health                            ] [ Nghiệp vụ        ▾ ] [        ] [ ✕ ]
                                                          [ ＋ Thêm dòng ]
```

Select "Phân loại" dùng lại `.input.input-sm` như các select mapping fields. Nút `📋 cURL` chỉ hiện ở
dòng `kind: 'oracle'`, mở ô dán curl mẫu (`curlRaw`). Dựng theo khuôn `editable-list.js` đang có,
không thêm CSS mới.

`main.js:78-109` bỏ hai binding textarea/checkbox cũ, gọi module này.

### `public/js/ui/permissions-panel.js` + `public/index.html`

Thêm khối UC3 ngay dưới UC2:

```html
<div class="perm-section-head"><span class="label">UC3 — ORACLE CHECK PERMISSION</span></div>
<p class="hint">Hai cột dưới đây cấp giá trị <code>function</code> và <code>action</code> cho request
<code>checkPermission</code>. Endpoint bỏ trống cột FUNCTION vẫn chạy bình thường, chỉ để trống cột
<code>Status Check Perm</code>.</p>
<div class="perm-grid">
  <label class="field"><span class="label">Sheet ENDPOINTS tham chiếu</span>
    <select id="sel-perm-uc3-sheet" class="input input-sm"></select></label>
  <label class="field"><span class="label">Cột FUNCTION</span>
    <select id="sel-perm-uc3-function" class="input input-sm"></select></label>
  <label class="field"><span class="label">Cột ACTION</span>
    <select id="sel-perm-uc3-action" class="input input-sm"></select></label>
</div>
```

Option sheet lấy từ `getUniqueSheets(state.endpoints)`, option cột từ
`endpointColumnsOfSheet(state.endpoints, uc3.columnSheet)` — đúng hai hàm UC2 đang dùng.

### `public/js/ui/auths-panel.js`

Mỗi profile thêm một ô `textarea` "cURL checkPermission (tuỳ chọn)" ghi vào `auth.permCurlRaw`. Hint:
để trống thì dùng mẫu chung ở ENDPOINTS CHUNG kèm token/cookie của chính profile này.

Cạnh ô hiện một dòng tóm tắt sau khi `parseCurlRequest` chạy: `POST api-dev-oda.vnpt.vn · role=core_donvixuly`
— đọc `user.role` từ body để người dùng thấy ngay mình dán nhầm curl của profile khác.

### `public/js/ui/permission-table.js`

`COLUMNS` (dòng 6-15) thêm hai cột. `Status Check Perm` đặt **ngay cạnh** `status` để hai con số nằm
sát nhau — mắt đối chiếu được mà không phải kéo ngang:

```js
{ key: 'status',     header: 'Status' },            // da co
{ key: 'permStatus', header: 'Status Check Perm' }, // status THO cua oracle, '—' khi khong goi
{ key: 'perm',       header: 'Status Perm' },       // da co, cong thuc khong doi
...
{ key: 'fn',         header: 'Function' },          // gia tri da gui di, de doi chieu voi curl
```

`permStatus` tô màu theo đúng quy tắc `status` đang dùng (`< 400` → `status-up`, còn lại
`status-down`, dòng 75-78) — cùng bảng màu thì lệch nhau nhìn ra ngay. Không có cột dẫn xuất nào.

### `public/js/ui/detail-drawer.js`

Tách hai khối khi record có `oracle`: **REQUEST ORACLE** trước, **REQUEST NGHIỆP VỤ** sau, mỗi khối đủ
method + url + headers + body + response. Đây là chỗ soi khi hai cột status lệch nhau — phải thấy được
IAM trả gì và API trả gì cạnh nhau, kèm body đầy đủ.

### `public/js/main.js`

**Nhãn nút** (dòng 234): `🔐 CHECK PERM (N cặp · M request)` với `M = pairs + oracleCalls`. Tooltip
(dòng 231) gộp ba cảnh báo:

```js
const warns = [];
if (unmatched > 0)  warns.push(`${unmatched}/${endpointCount} endpoint không khớp dòng phân quyền`);
if (noFunction > 0) warns.push(`${noFunction} endpoint trống cột FUNCTION — không gọi được oracle`);
if (collapsed > 0)  warns.push(`${collapsed} bản trùng đã gộp`);
btnCheckPerm.title = warns.length ? `⚠ ${warns.join(' · ')}` : '';
```

**Nút "Đối soát cURL"** cạnh nút CHECK PERM. Mở ô dán 1..n curl `checkPermission`, tool tách
`permissionSpecification.function` + `.action` của từng curl rồi đối chiếu với pool đang chọn:

```
/ccm-troubleTicket-feedbackTicket    Read   ✓ khớp 1 endpoint (GET /troubleTicket/feedback)
/ccm-troubleTicket-assignmentTicket  Read   ✗ KHÔNG endpoint nào khai function này
Pool hiện tại: 148 endpoint · sheet: Trưởng ca (92), ĐTV đối tác (56)
```

Dòng `✗` là câu trả lời trực tiếp cho "không tìm thấy endpoint khớp với endpoint của curl": function
đó có thật (curl chạy được) nhưng pool không chứa nó. Dòng "Pool hiện tại" chỉ luôn chỗ hụt — thiếu
dòng ở cột FUNCTION, hay tab sheet / bộ lọc method đang cắt mất.

Đối soát đọc pool qua `matchPermissionEndpoints(state)`, đúng danh sách sắp chạy, không dựng lại một
định nghĩa phạm vi thứ hai.

## Hệ quả

- Số request của CHECK PERM tăng gần gấp đôi (`pairs + oracleCalls`). Nhãn nút nói rõ trước khi bấm.
- **Cột `status_permission` không đổi giá trị** với cùng một bộ dữ liệu — công thức không đụng tới.
  Endpoint trống cột FUNCTION chỉ mất cột `Status Check Perm` (hiện `—`), không mất gì khác.
- Endpoint trùng METHOD + URL nhưng khác `function` không còn nuốt nhau. Số cặp có thể **tăng** so với
  số endpoint trước đây — đó là ý đồ, `collapsed` cho biết còn bao nhiêu bản thật sự trùng.
- UC3 để trống → hành vi y hệt trước thay đổi này. Không ép cấu hình lại mới bấm được nút.
- `test/http-client.test.js` **không đỏ** vì công thức chấm giữ nguyên. Hai file sẽ đỏ:
  `test/permission-match.test.js` (khoá khử trùng đổi) và `test/request-count.test.js` (số request
  đổi). Cập nhật hay bỏ hai file đó nằm ngoài phạm vi này.

## Kiểm chứng

Không viết test tự động. Verify trực tiếp bằng Claude in Chrome:

1. Mở tool, import file endpoints + file phân quyền, khai UC1/UC2/UC3.
2. Khai một dòng ENDPOINTS CHUNG `kind: 'oracle'`, dán `files/data_test/curl1.txt`.
3. Bấm **Đối soát cURL** với cả `curl1.txt` và `curl2.txt` — cả hai function phải `✓`. Nếu `✗` thì
   dừng ở đây, sửa cột FUNCTION trước khi chạy.
4. Bấm CHECK PERM, đọc Network tab: mỗi endpoint phải thấy đúng hai request, oracle đi trước.
5. Đọc hai cột `Status` và `Status Check Perm` cạnh nhau ở dòng của hai function trong curl mẫu. Đây
   là chỗ nhìn ra 403 giả: `Status Check Perm = 200` (IAM cho phép) mà `Status = 403` nghĩa là 403
   không đến từ phân quyền. Tool không kết luận hộ — chỉ đặt hai con số cạnh nhau.
6. Mở drawer một dòng lệch, đối chiếu body oracle với `files/data_test/curl1.txt`: `function`,
   `action`, `user.role` phải trùng curl mẫu, chỉ `function`/`action` đổi theo endpoint.

## Không làm

- Không đụng `src/server/runner.js` (trừ một dòng đổi `sendRequest` → `sendPair` ở nhánh inline),
  `worker-pool.js`, luồng SSE.
- **Không đụng công thức chấm điểm.** `evaluatePermission` và `evaluateUc2Permission` giữ nguyên;
  `status_permission` vẫn đọc `status` của request nghiệp vụ đúng như `require.md`.
- **Không sinh cột dẫn xuất từ hai status.** Không có `endpoint_khop`, không có ma trận quy đổi. Hai
  cột thô, người đọc tự đối chiếu.
- Không đụng Excel export.
- Không cache kết quả oracle theo `(auth, function, action)`. Hai endpoint cùng function sẽ gọi oracle
  hai lần. Cache đúng cần chia sẻ state giữa các worker thread — đắt hơn cái nó tiết kiệm ở quy mô
  hiện tại.
- Không decode JWT để suy ra `user.id`/`accountId`. Mỗi profile dán curl riêng, danh tính đi kèm curl.
- Không viết test tự động.
