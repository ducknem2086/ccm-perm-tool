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

### Đã xác minh trên dữ liệu thật

Đọc `localStorage['ccm-tool-config']` của tool đang chạy (1105 endpoint, file
`Đối tượng sử dụng CCOS (3).xlsx`) qua Claude in Chrome:

`importTemplate` map cột `API Mapping` → `target: 'endpoint'` → `pathTemplate`. Nhưng cột đó chứa
**hai loại giá trị khác hẳn nhau**, và cột `BE Category` tách chúng sạch tuyệt đối — không lẫn một
dòng nào:

| `BE Category` | Số dòng | `API Mapping` là gì |
|---|---|---|
| CCM, FSM, Widget, Inbound, GQKN, Bổ trợ | **710** | BE path thật — `/troubleTicket`, `/troubleTicketSpecification/{*}` |
| Phân quyền button | 33 | function code FE — `/ccm-inbound-createTicket` |
| Phần quyền widget *(sai chính tả trong file)* | 91 | function code FE |
| Phân quyền widget | 271 | function code FE |

**395/1105 dòng (36%) không phải API.** Chúng là phân quyền nút/widget trên FE:

```json
{ "Name": "Nút Tạo phiếu inbound CCM", "BE Category": "Phân quyền button",
  "API Mapping": "/ccm-inbound-createTicket", "Method": "GET" }
```

Tool đang dựng chúng thành `GET https://domain/ccm-inbound-createTicket` — URL không tồn tại. Gateway
trả 403, `evaluateUc2Permission` đọc thành "không có quyền" và chấm `'true'`. Đây là nguồn của 36%
kết quả rác, và là lý do hai curl mẫu bị chấm 403 trong khi thực tế 404.

Dòng ứng với hai curl mẫu:

```
ĐTV nội bộ     | GET /ccm-troubleTicket-feedbackTicket | Phân quyền button | Nút Thêm mới CCM GQKN
Nhân viên GQKN | GET /ccm-feedbackTicket               | Phân quyền button | Nút Thêm mới CCM
Nhân viên GQKN | GET /ccm-assignmentTicket             | Phân quyền button | Nút Phân giao CCM
```

`curl2.txt` gửi `/ccm-troubleTicket-assignmentTicket`, file chỉ có `/ccm-assignmentTicket`. Đây chính
là ca "không tìm thấy endpoint khớp với endpoint của curl" — **không phải bộ lọc "all" sai**, mà file
endpoints ghi function code lệch với giá trị FE thật gửi đi. Tool phải phơi được sự lệch đó.

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

CHECK PERM chạy **theo cặp trên mọi dòng**: mỗi endpoint sinh hai request — một tới `checkPermission`
(endpoint chung), một tới API nghiệp vụ — rồi in **hai status thô thành hai cột** trên bảng log.
Không ghép, không dẫn xuất; người đọc tự đối chiếu.

**Không phân loại dòng, không lọc bớt.** Đã cân nhắc và loại phương án tách luồng theo `BE Category`
(dòng "Phân quyền *" chỉ gọi oracle, dòng còn lại chỉ gọi API) và phương án loại 395 dòng function
code khỏi pool. Cả hai bắt tool phán quyết dòng nào là API dựa trên một quy ước đặt tên trong file —
quy ước đó đã sai một lần (`Phần quyền widget` viết nhầm chính tả) và không có gì bảo đảm nó đúng ở
file sau. Chạy cả hai trên mọi dòng thì **số liệu tự nói**:

- Dòng function code (`/ccm-*`): oracle trả kết quả thật, request nghiệp vụ trả 403/404 vì URL bịa →
  hai cột lệch nhau rõ ràng.
- Dòng BE path (`/troubleTicket`): request nghiệp vụ đúng, oracle trả 404/403 vì function không tồn
  tại → cũng lệch, theo chiều ngược lại.

Người đọc nhìn hai cột là biết dòng đó thuộc loại nào, không cần tool dán nhãn.

**Hai status nằm trên cùng một record.** Pool đã khử trùng nên mỗi endpoint là một dòng bảng duy
nhất; cả `Status` lẫn `Status Check Perm` phải ở trên dòng đó, không tách thành hai dòng.

Phần dựng request nghiệp vụ (`buildOne`, `request-builder.js`) **giữ nguyên** — đã chạy đúng.

### Cặp chạy trong cùng một task

Một record vẫn là một dòng bảng, nhưng mang hai response.

```
worker task
  ├─ 1. checkPermission: POST /iam/engage/checkPermission  → oracle.status
  └─ 2. nghiệp vụ:       GET  /query/whitelist-.../{msisdn} → response.status
       ⇒ record { response, oracle }   // hai status, hai cot rieng
```

Đã cân nhắc và loại: đẩy oracle thành request thứ hai trong cùng hàng đợi rồi ghép lại bằng `pairId`.
Cách đó buộc phải sửa cách đếm progress ở `runner.js`, sửa SSE, phải định nghĩa hành vi khi một nửa
cặp chết, và — nặng nhất — hai status rơi vào **hai dòng bảng khác nhau**, đúng cái phải tránh. Gộp
trong task thì hai status nằm sẵn trên một record, còn `runner.js`, `worker-pool.js`, luồng SSE và
cấu trúc bảng kết quả **không đổi dòng nào**.

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

Khoá khử trùng hiện tại là `METHOD:pathTemplate` (`permission-match.js:47-60`). Khi UC3 được khai,
khoá đổi thành `METHOD:pathTemplate:function` — mỗi function là một đơn vị phân quyền riêng nên phải
có cặp request riêng, không được để hai function cùng trỏ một BE API nuốt nhau.

Với file hiện tại người dùng sẽ chọn `uc3.functionColumn = 'API Mapping'` — đúng cột mà
`importTemplate` đang dùng làm `endpoint` — nên `function` trùng `pathTemplate` và khoá mới **tương
đương khoá cũ**, không đổi hành vi. Khoá ba thành phần là để đón trường hợp file sau tách function
code sang cột riêng, lúc đó nhiều function mới thật sự dùng chung một path.

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
// actionColumn de rong la hop le: file endpoints thuc te khong co cot action FE
// ('Action BE' chua mo ta tieng Viet, khong dung duoc). De rong thi giu nguyen
// gia tri action co san trong body cua curl mau — ca curl1 lan curl2 deu 'Read'.
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
2. `uc3.columnSheet` thuộc tập sheet có endpoint; `uc3.functionColumn` nằm trong
   `endpointColumnsOfSheet(state.endpoints, uc3.columnSheet)`. Dùng đúng hàm mà panel dựng option,
   không thì validate qua mà dropdown rỗng. `uc3.actionColumn` để rỗng là hợp lệ; đã chọn thì cũng
   phải nằm trong danh sách cột đó.
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
  `body.permissionSpecification.function = endpoint.oracleFunction`. `action` chỉ ghi đè khi
  `endpoint.oracleAction` khác rỗng — không thì **giữ nguyên giá trị của curl mẫu** (`"Read"`), vì
  file endpoints không có cột action FE. Rồi `JSON.stringify`. Parse hỏng hoặc thiếu
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
<p class="hint">Cột FUNCTION cấp giá trị <code>permissionSpecification.function</code> cho request
<code>checkPermission</code> — với file hiện tại đó là cột <code>API Mapping</code>. Cột ACTION để
trống thì dùng nguyên <code>action</code> trong curl mẫu. Endpoint trống ô FUNCTION vẫn chạy request
nghiệp vụ bình thường, chỉ để trống cột <code>Status Check Perm</code>.</p>
<div class="perm-grid">
  <label class="field"><span class="label">Sheet ENDPOINTS tham chiếu</span>
    <select id="sel-perm-uc3-sheet" class="input input-sm"></select></label>
  <label class="field"><span class="label">Cột FUNCTION</span>
    <select id="sel-perm-uc3-function" class="input input-sm"></select></label>
  <label class="field"><span class="label">Cột ACTION (tuỳ chọn)</span>
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

Kết quả thật với file hiện tại (đã kiểm bằng Claude in Chrome):

```
/ccm-troubleTicket-feedbackTicket    Read   ✓ khớp 1 endpoint (ĐTV nội bộ · Nút Thêm mới CCM GQKN)
/ccm-troubleTicket-assignmentTicket  Read   ✗ KHÔNG endpoint nào khai function này
                                            gần nhất: /ccm-assignmentTicket (Nhân viên GQKN)
Pool hiện tại: 1105 endpoint · 6 sheet
```

Dòng `✗` là câu trả lời trực tiếp cho "không tìm thấy endpoint khớp với endpoint của curl": FE thật
gửi `/ccm-troubleTicket-assignmentTicket`, file endpoints ghi `/ccm-assignmentTicket`. **Không phải
bộ lọc "all" sai — file ghi lệch.** Gợi ý "gần nhất" so bằng cùng thuật toán `hitsForRow` đang dùng
để ghép UC2 (`permission-match.js:71-80`), không thêm thư viện fuzzy nào.

Đối soát đọc pool qua `matchPermissionEndpoints(state)`, đúng danh sách sắp chạy, không dựng lại một
định nghĩa phạm vi thứ hai.

## Hệ quả

- Số request của CHECK PERM tăng gần gấp đôi (`pairs + oracleCalls`). Với file hiện tại — 1105
  endpoint, cột `API Mapping` không ô nào rỗng — nghĩa là gấp đúng đôi. Nhãn nút nói rõ trước khi bấm.
- **Cột `status_permission` không đổi giá trị** với cùng một bộ dữ liệu — công thức không đụng tới.
  36% kết quả rác (395 dòng `Phân quyền button/widget`) **vẫn còn** trong cột đó; cái mới là cột
  `Status Check Perm` đặt cạnh để nhìn ra chúng. Sửa cột `status_permission` là việc riêng, cần dữ
  liệu từ lần chạy đầu tiên có oracle mới quyết được.
- Endpoint trùng METHOD + URL nhưng khác `function` không còn nuốt nhau. Với file hiện tại
  (`functionColumn = 'API Mapping'`) khoá mới tương đương khoá cũ nên số dòng không đổi.
- UC3 để trống → hành vi y hệt trước thay đổi này. Không ép cấu hình lại mới bấm được nút.
- `test/http-client.test.js` **không đỏ** vì công thức chấm giữ nguyên. Hai file sẽ đỏ:
  `test/permission-match.test.js` (khoá khử trùng đổi) và `test/request-count.test.js` (số request
  đổi). Cập nhật hay bỏ hai file đó nằm ngoài phạm vi này.

## Kiểm chứng

Không viết test tự động. Verify trực tiếp bằng Claude in Chrome:

Tool đang chạy sẵn ở `http://localhost:9000` với file thật đã import (state trong
`localStorage['ccm-tool-config']`), nên không phải dựng lại dữ liệu.

1. Mở `localhost:9000`, khai UC3: sheet tham chiếu bất kỳ sheet nào có dữ liệu, `Cột FUNCTION` =
   `API Mapping`, `Cột ACTION` để trống.
2. Khai một dòng ENDPOINTS CHUNG `kind: 'oracle'`, dán `files/data_test/curl1.txt`.
3. Bấm **Đối soát cURL** với cả hai curl. Kỳ vọng: `curl1` ✓, `curl2` ✗ kèm gợi ý
   `/ccm-assignmentTicket` — đúng như đã kiểm bằng Claude in Chrome. `curl1` mà ✗ là công cụ hỏng,
   không phải dữ liệu.
4. Bấm CHECK PERM, đọc Network tab: mỗi endpoint đúng hai request, `checkPermission` đi trước.
5. Lọc bảng lấy một dòng `BE Category = Phân quyền button` (vd `Nút Thêm mới CCM GQKN`). Kỳ vọng:
   `Status` = 403/404 (URL `/ccm-troubleTicket-feedbackTicket` không phải API) trong khi
   `Status Check Perm` có kết quả thật từ IAM. Hai con số lệch nhau chính là chỗ nhìn ra 36% kết quả
   rác đang nằm ở đâu.
6. Lấy tiếp một dòng `BE Category = Widget` (BE path thật). Kỳ vọng lệch theo chiều ngược lại:
   `Status` hợp lệ, `Status Check Perm` = 404/403 vì `/troubleTicket` không phải function code.
7. Mở drawer một dòng, đối chiếu body oracle với `curl1.txt`: `user.role`/`id`/`accountId` giữ nguyên
   từ curl, chỉ `permissionSpecification.function` đổi theo endpoint, `action` vẫn `"Read"`.

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
- **Không phân loại dòng theo `BE Category`, không lọc bớt 395 dòng function code.** Tool chạy cả hai
  request trên mọi dòng và để số liệu tự nói. Dán nhãn "dòng này không phải API" dựa trên một quy ước
  đặt tên trong file là đưa thêm một chỗ đoán vào đúng lúc đang gỡ hậu quả của một chỗ đoán khác.
- Không sửa file endpoints hộ người dùng (tách cột function, sửa `/ccm-assignmentTicket`). Tool chỉ
  phơi chỗ lệch qua **Đối soát cURL**; sửa file là quyết định của người sở hữu dữ liệu.
- Không viết test tự động.
