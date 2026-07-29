# Spec: Auth profiles + filter trước RUN ALL

Ngày: 2026-07-30

## 1. Mục tiêu

Ba việc, làm cùng một lần vì cùng chạm vào đường sinh request:

1. **Auth profiles** — tab `AUTHS` mới chứa nhiều bộ credential. Một lần RUN chạy được nhiều profile cùng lúc, để so sánh phản hồi giữa các tài khoản mà không phải dán lại token từng lượt.
2. **Filter trước RUN ALL** — thu hẹp tập request theo method, theo msisdn, theo profile. Không tick gì nghĩa là chạy tất cả.
3. **Gỡ tab bar trong drawer cấu hình endpoint** — ba mục QUERY / HEADERS / BODY hiện cùng một màn hình cuộn dọc, thay vì phải bấm qua từng tab.

## 2. Phạm vi

Thuộc phạm vi:

- Tab `AUTHS`: danh sách profile, mỗi profile hai kiểu nhập (ba ô riêng, hoặc dán cURL).
- Chuyển `token` / `cookie` / `refreshToken` từ `state` phẳng vào `state.auths[]`, kèm migration cho config đã lưu.
- `state.runFilter` với ba trục: method, msisdn, auth.
- Module lọc dùng chung `shared/run-filter.js`, dùng cho cả nút đếm ở client lẫn `buildRequests()` ở server.
- Sinh request theo tích ba chiều `auth × endpoint × msisdn`.
- Cột `Auth` trong bảng OUTPUT, trong file Excel, và trong drawer chi tiết.
- Bỏ `.body-tabs` khỏi `endpoint-drawer.js`.

Ngoài phạm vi:

- Domain riêng cho từng profile. Một domain dùng chung cho cả run — đã cân nhắc và bỏ.
- Headers riêng cho profile ở dạng bảng key-value. Muốn header riêng thì dùng kiểu nhập cURL.
- Chạy lại chỉ một profile từ kết quả đã có. Muốn thì lọc rồi RUN lại.
- Che credential khác nhau theo từng profile khi export. Radio `Kèm đầy đủ` / `Che` vẫn là một công tắc chung cho cả file.
- Nhập body ở tab INPUT. Body đã có sẵn trong drawer từ spec `2026-07-29-per-endpoint-config`; việc còn thiếu chỉ là làm nó lộ ra, tức mục 3 của phạm vi này.

## 3. Data model

### 3.1. `state.auths`

```js
auths: [
  {
    id:           'auth_lx3k_1',
    name:         'PROD-A',   // bắt buộc, không rỗng, không trùng
    mode:         'fields',   // 'fields' | 'curl'
    token:        '',         // dùng khi mode 'fields'
    cookie:       '',         // dùng khi mode 'fields'
    refreshToken: '',         // dùng khi mode 'fields'
    curlRaw:      '',         // dùng khi mode 'curl'
  },
]
```

Ba khóa `token` / `cookie` / `refreshToken` ở cấp `state` bị bỏ.

`id` sinh theo đúng khuôn `nextId()` của `endpoint-list.js:10` — `auth_${Date.now().toString(36)}_${seq}`. Chỉ dùng nội bộ, không hiện ra giao diện.

`mode: 'curl'` không lưu mảng headers đã parse — parse lại từ `curlRaw` mỗi lần build, đúng cách `globalHeaderMode: 'raw'` đang làm với `globalHeaderRaw`. Một nguồn sự thật, không có bản sao để lệch.

Hai nguồn `fields` và `curl` tồn tại song song; đổi mode qua lại không xóa dữ liệu ở mode kia. Cùng nguyên tắc với query/header/body của endpoint.

### 3.2. `state.runFilter`

```js
runFilter: {
  methods:        [],  // [] = mọi method; ['GET','POST'] = chỉ hai method đó
  msisdnPatterns: [],  // [] = mọi msisdn; ['0912','0988123999'] = khớp include, OR
  authIds:        [],  // [] = mọi profile; ['auth_x'] = chỉ profile đó
}
```

**Rỗng nghĩa là tất cả, trên cả ba trục.** Không có ngoại lệ nào.

`msisdnPatterns` không phân biệt chip chọn từ gợi ý với chip gõ tay — cả hai đều lưu thành chuỗi và khớp theo `String.includes`. Một số điện thoại đầy đủ chỉ là substring tình cờ khớp đúng một phần tử. Không dùng `RegExp`: đầu vào là chuỗi người dùng gõ, đưa thẳng vào `RegExp` sẽ ném lỗi với `(`, `[`, `+` và biến `.` thành ký tự bất kỳ.

`runFilter` được `persist()` cùng `state`, nên đóng tool mở lại vẫn giữ filter. Cũng nằm trong file export config.

### 3.3. Migration

`load()` và `applyConfig()` trong `state.js` gọi chung một hàm `migrateAuths(saved)`:

```js
// config cũ: { token, cookie, refreshToken } ở cấp state
// -> auths: [{ id, name: 'Default', mode: 'fields', token, cookie, refreshToken, curlRaw: '' }]
```

Điều kiện chạy: `saved.auths` không phải mảng, hoặc là mảng rỗng. Sau khi gói xong, `delete` ba khóa cũ khỏi `state`. Cùng khuôn với đoạn xử lý `advanced.concurrency` đang có ở `state.js:76-80`.

Profile `Default` sinh ra kể cả khi ba ô cũ đều rỗng — `auths` không bao giờ được rỗng, xem mục 6.

`defaultConfig()` trả về sẵn một profile `Default` trống, để lần chạy đầu tiên không rơi vào trạng thái không có profile nào.

## 4. Lọc và sinh request

### 4.1. `public/js/shared/run-filter.js` (mới)

Bốn hàm thuần, không đụng DOM, không đụng `state` toàn cục — dùng được ở cả hai phía:

```js
export function filterEndpoints(endpoints, runFilter)
export function filterMsisdns(msisdns, runFilter)
export function selectedAuths(auths, runFilter)
export function countRequests(state)   // gọi ba hàm trên
```

`filterEndpoints` giữ nguyên điều kiện `enabled` đang có, cộng thêm điều kiện method:

```js
export function filterEndpoints(endpoints, runFilter) {
  const wanted = new Set((runFilter?.methods ?? []).map((m) => m.toUpperCase()));
  return (endpoints ?? []).filter(
    (e) => e.enabled && (wanted.size === 0 || wanted.has((e.method || 'GET').toUpperCase())),
  );
}
```

Dùng `Set` chứ không `Array.includes`: hàm này chạy một lần mỗi build nhưng danh sách endpoint có thể lên vài trăm dòng sau khi import Excel, và `Set` diễn đạt đúng ý "tập method muốn chạy".

`filterMsisdns` khớp OR — một msisdn qua được nếu chứa **bất kỳ** pattern nào:

```js
export function filterMsisdns(msisdns, runFilter) {
  const pats = (runFilter?.msisdnPatterns ?? []).map((p) => String(p).trim()).filter(Boolean);
  if (pats.length === 0) return msisdns ?? [];
  return (msisdns ?? []).filter((m) => pats.some((p) => String(m).includes(p)));
}
```

`selectedAuths` lọc theo `id`, và bỏ qua id trỏ tới profile đã xóa:

```js
export function selectedAuths(auths, runFilter) {
  const ids = new Set(runFilter?.authIds ?? []);
  if (ids.size === 0) return auths ?? [];
  return (auths ?? []).filter((a) => ids.has(a.id));
}
```

### 4.2. `request-count.js`

File giữ nguyên vị trí và tên hàm; thân hàm viết lại:

```js
import { filterEndpoints, filterMsisdns, selectedAuths } from './run-filter.js';

export function countRequests(state) {
  const f = state?.runFilter ?? {};
  const auths = selectedAuths(state?.auths, f);
  const msisdnCount = filterMsisdns(state?.msisdns, f).length;
  const perAuth = filterEndpoints(state?.endpoints, f)
    .reduce((sum, ep) => sum + (ep.attachMsisdn !== false ? msisdnCount : 1), 0);
  return auths.length * perAuth;
}
```

Không gộp `countRequests` vào `run-filter.js`: `test/request-count.test.js` đang có 7 test bám vào đường dẫn module này, và tách "lọc" khỏi "đếm" vẫn đúng một module một việc.

Bảy test đó phải sửa: helper `st()` chưa có `auths` nên `selectedAuths` sẽ trả mảng rỗng và mọi kỳ vọng thành 0. Thêm `auths: [{ id: 'a1', name: 'A' }]` vào helper là đủ; các con số kỳ vọng giữ nguyên.

### 4.3. `buildRequests()`

Ba lời gọi lọc **hoist ra ngoài** mọi vòng lặp — để trong vòng thì `filterMsisdns` chạy lại `auths.length × endpoints.length` lần vô ích:

```js
const f = config.runFilter ?? {};
const auths   = selectedAuths(config.auths, f);
const eps     = filterEndpoints(config.endpoints, f);
const msisdns = filterMsisdns(config.msisdns, f);

const requests = [];
let index = 0;

for (const auth of auths) {
  for (const endpoint of eps) {
    const list = wantsMsisdn(endpoint) ? msisdns : [null];
    for (const msisdn of list) {
      index += 1;
      requests.push(buildOne({
        config, auth, endpoint, msisdn, index,
        scope: { ...baseScope, msisdn },
      }));
    }
  }
}
return requests;
```

Auth ở vòng ngoài cùng: request của cùng một profile nằm liền khối, đọc bảng OUTPUT theo cụm dễ hơn là xen kẽ.

Ba vòng lồng là tích Descartes — cần đúng `a × e × m` phần tử nên không hàm nào bỏ được số lần lặp. `flatMap` viết gọn hơn nhưng sinh `a + a×e` mảng trung gian và phải thêm một lượt `.map` để đánh `index`, tức copy lại toàn bộ object. Giữ `for` + `push`.

### 4.4. `buildOne()`

Thêm tham số `auth`. Ba chỗ đổi:

**Headers.** Pairs của profile chèn giữa endpoint và global:

```js
mergePairs(effectiveHeaderPairs(endpoint), authHeaderPairs(auth), globalHeaderPairs(config))

function authHeaderPairs(auth) {
  return (auth?.mode ?? 'fields') === 'curl' ? parseRawHeaders(auth.curlRaw ?? '') : [];
}
```

`parseRawHeaders()` đã có sẵn ở `shared/endpoint-path.js:100` và đã xử lý cả hai kiểu — dán nguyên lệnh cURL (lọc `-H` / `-b`, bỏ dòng URL và các cờ khác) lẫn gõ tay từng dòng `Key: Value`. Không viết thêm.

**Credential.** Ba dòng `putIfAbsent` đổi nguồn từ `config` sang `auth`:

```js
putIfAbsent(headers, 'Authorization', auth.token ? `Bearer ${auth.token}` : '');
putIfAbsent(headers, 'Cookie', auth.cookie);
putIfAbsent(headers, 'refresh_token', auth.refreshToken);
```

Với `mode: 'curl'` thì ba trường này rỗng nên `putIfAbsent` bỏ qua — `Authorization` và `Cookie` đã vào từ chuỗi cURL. Không cần nhánh `if` riêng.

**Record.** Thêm `authId: auth.id` và `authName: auth.name`.

Thứ tự ưu tiên đầy đủ, từ mạnh xuống yếu:

```
endpoint (drawer) > profile (cURL) > HEADERS chung > credential profile
  > Origin/Referer/X-Current-Url > BROWSER_HEADERS
```

Luật "khai tường minh thì thắng" của `putIfAbsent` giữ nguyên, không đổi.

## 5. Lỗi chặn trước khi chạy

`validateConfig()` thêm bốn kiểm tra:

| Điều kiện | Thông điệp | `field` |
|---|---|---|
| `auths` rỗng | `Cần ít nhất 1 auth profile` | `auths` |
| `name` rỗng | `Auth profile thứ <n> chưa có tên` | `auth:<id>` |
| `name` trùng (so sánh sau `trim`, phân biệt hoa thường) | `Tên auth profile "<name>" bị trùng` | `auth:<id>` |
| Filter lọc ra 0 endpoint, 0 msisdn, hoặc 0 auth | `Filter không khớp dòng nào — không có request để chạy` | `runFilter` |

`runFilter.authIds` chứa id không còn tồn tại: không báo lỗi, `selectedAuths` bỏ qua. Xóa profile là thao tác bình thường; nhưng nếu bỏ hết id thành mảng rỗng thì rơi vào "rỗng = tất cả", nên `auths-panel` phải gỡ id khỏi `runFilter.authIds` ngay lúc xóa profile, và nếu gỡ xong mảng rỗng thì để rỗng — chạy tất cả — chứ không giữ id chết.

Không có dòng nào khớp filter thì **không chạy**: nút RUN ALL tự `disabled` khi `countRequests()` trả 0 (cơ chế `refreshRunButton()` đã có ở `main.js:99`), và `validateConfig` chặn lần hai ở server phòng khi client bị bỏ qua.

Chặn sớm ngay trên UI, không đợi tới lúc bấm: ô `name` rỗng hoặc trùng thì viền đỏ (`is-invalid`) khi gõ.

## 6. Giao diện

### 6.1. Thanh tab

`INPUT | AUTHS | OUTPUT`. `tabs.js:1` đang là `const TAB_IDS = ['input', 'output']` — thêm `'auths'` vào giữa. Phần còn lại của module đã lặp theo mảng này nên không phải sửa gì thêm, kể cả điều hướng bằng phím mũi tên.

`index.html` thêm `<button id="tab-auths">` và `<section id="panel-auths">` theo đúng khuôn hai tab hiện có, đủ `role` / `aria-controls` / `aria-selected` / `tabindex`.

### 6.2. Card CONNECTION

Rút còn mỗi ô Domain và đoạn hint về `api-`. Ba ô credential chuyển đi, thay bằng một dòng: `Credential nằm ở tab AUTHS.`

Indicator ở topbar đổi nghĩa: `● 2/3 auth có token` thay cho `● token ok`. "Có token" nghĩa là `mode: 'fields'` với `token` không rỗng, hoặc `mode: 'curl'` với chuỗi parse ra có key `authorization`.

Nút `⟳ Reload Token` ghi vào profile **đầu tiên đang chọn** trong `runFilter.authIds`, hoặc `auths[0]` khi chưa chọn gì. Toast nói rõ tên profile vừa ghi vào.

### 6.3. Panel AUTHS

```
AUTHS                                              [＋ Thêm profile]
┌────────────────────────────────────────────────────────────────┐
│ ▾  [PROD-A            ]  ● token ok              [⧉]  [✕]     │
│    Cách nhập:  (•) 3 ô riêng   ( ) Dán cURL                    │
│    Bearer token   [eyJhbGciOiJSUzI1NiIsInR5cCI6...          ]  │
│    Cookie         [BIGipServerpool_ccos=...                 ]  │
│    Refresh token  [                                         ]  │
├────────────────────────────────────────────────────────────────┤
│ ▸  [UAT               ]  ● token ok · 14 header  [⧉]  [✕]     │
├────────────────────────────────────────────────────────────────┤
│ ▸  [                  ]  ○ chưa có token         [⧉]  [✕]     │
│    ↑ viền đỏ: tên không được rỗng                              │
└────────────────────────────────────────────────────────────────┘
```

Module mới `public/js/ui/auths-panel.js`. Mỗi profile là một `<details>` gập được, chỉ profile đang mở mới render phần thân — danh sách 10 profile không dựng 30 ô nhập cùng lúc.

- `⧉` nhân bản profile, tên thành `<name> (copy)`. Thao tác hay gặp: cùng cookie hạ tầng, khác token.
- `✕` xóa. Không cho xóa profile cuối cùng — nút `disabled` kèm title giải thích. Xóa xong thì gỡ `id` khỏi `runFilter.authIds`.
- Chọn `Dán cURL` thì ba ô ẩn, hiện `<textarea class="mono ed-textarea">` cùng dòng đếm `đã nhận 14 header, có Authorization và Cookie` — cùng khuôn `#header-raw-count` đang chạy ở HEADERS chung.
- Mọi thay đổi ghi thẳng `state` rồi `persist()` + `notify()`. Không có nút Lưu, giống mọi ô nhập khác.

### 6.4. Filter bar

Đặt trong `.actionbar` của tab INPUT, ngay trên nút RUN ALL. Module mới `public/js/ui/run-filter-bar.js`.

```
FILTER   method [GET ×][POST ×] ▾    msisdn [0912 ×][0988123999 ×]    auth [PROD-A ×][UAT ×]

         ▶ RUN ALL (24)      2 endpoint × 6 msisdn × 2 auth
```

**method** — nút mở dropdown chứa 5 checkbox `GET / POST / PUT / PATCH / DELETE`, mỗi dòng kèm số endpoint đang bật thuộc method đó: `GET (7)`, `DELETE (0)`. Không tick gì thì nút hiện `mọi method`.

**msisdn** — ô nhập kèm chips. Gõ vào thì popup `<ul>` gợi ý các số trong `state.msisdns` chứa chuỗi đang gõ, tối đa 20 dòng kèm dòng cuối `… và N số nữa`. `Enter` khi đang trỏ vào một gợi ý thì lấy số đó; `Enter` khi không trỏ gợi ý nào thì lấy chính chuỗi đang gõ làm chip mẫu. Chip hiện số khớp khi khớp nhiều hơn một: `0912 (4)`. `Backspace` ở ô trống xóa chip cuối. Rỗng thì placeholder `mọi msisdn`.

Không dùng `<datalist>`: nó không cho chip, không cho hiện số khớp, và trên Windows chỉ lọc theo tiền tố.

**auth** — chips chọn từ danh sách profile. Chip **hiện `name`** nhưng **lưu `id`** vào `runFilter.authIds`; đổi tên profile không làm mất lựa chọn. Rỗng thì hiện chip mờ `tất cả (3)`.

**Dòng phân rã** `2 endpoint × 6 msisdn × 2 auth` nằm cạnh nút RUN ALL. Bắt buộc có, không phải trang trí: từ khi "rỗng = tất cả" áp cho cả trục auth, ba profile làm số request gấp ba mà không có thao tác nào của người dùng báo hiệu điều đó.

Bar chỉ đọc/ghi `state.runFilter` rồi `notify()`. `refreshRunButton()` đã đăng ký qua `subscribe()` nên số trên nút tự cập nhật, không phải nối dây thêm.

### 6.5. Drawer cấu hình endpoint — gỡ tab bar

`endpoint-drawer.js` hiện dựng `.body-tabs` với ba nút và hàm `selectTab()` ẩn/hiện `.body-pane`. Bỏ cả cụm đó: ba pane render thẳng, xếp dọc, mỗi pane có tiêu đề `QUERY` / `HEADERS` / `BODY` dạng `.card-title` và một đường kẻ phân cách.

Xóa: hằng `TABS`, biến `tabBar`, hàm `selectTab`, lời gọi `selectTab('query')`. Giữ nguyên `RENDERERS` và ba hàm render — chúng không biết gì về tab.

Body cho POST **không phải viết mới**. `renderBodyTab()` đã có 4 mode và `buildBody()` ở `request-builder.js:92` đã dựng body; việc duy nhất còn thiếu là nó bị chôn sau hai cú bấm.

Drawer giữ nguyên chiều rộng, thêm cuộn dọc. `test/endpoint-drawer.test.js` đang khẳng định hành vi đổi tab — phải cập nhật cùng lúc.

## 7. OUTPUT và Excel

**`filter-logic.js`**

```js
ALL_COLUMNS   += { key: 'auth', header: 'Auth', default: true }   // sau 'name'
emptyFilter() += { auth: '' }
matchesFilter += if (filter.auth && rec.authName !== filter.auth) return false
collectAuthNames(records)   // cùng khuôn collectStatuses
```

**`filters.js`** — thêm một `<select>` ở ô filter của cột Auth, danh sách sinh từ record thật qua `fillSelect`. Chạy một profile thì select chỉ có một lựa chọn; muốn gọn thì tắt cột bằng nút `⚙ cột` sẵn có.

**`detail-drawer.js`** — thêm dòng `Auth` vào khối thông tin request, cạnh MSISDN.

**`curl.js`** — `toCurl()` không sửa: nó đọc `rec.request.headers` nên đã mang đúng credential của profile. `curlFilename()` phải chèn `authName`, không thì tải hai dòng cùng endpoint khác profile sẽ ra hai file trùng tên.

**`excel-export.js`** — `EXPORT_COLUMNS` thêm `{ header: 'Auth', key: 'auth', width: 18 }` ngay sau MSISDN; `toRow()` thêm `auth: rec.authName ?? ''`.

Phần che credential không sửa. `serializeHeaders()` che theo tên header (`authorization`, `cookie`, `refresh_token`, `id_token`, `access_token`) chứ không theo config, nên mỗi dòng tự che token của chính nó. Radio `Kèm đầy đủ` vẫn là công tắc chung; đổi chữ cảnh báo thành "file sẽ chứa token và cookie của **mọi** profile".

## 8. Tệp thay đổi

Thêm mới:

| Tệp | Việc |
|---|---|
| `public/js/shared/run-filter.js` | Ba hàm lọc thuần |
| `public/js/ui/auths-panel.js` | Panel quản lý profile |
| `public/js/ui/run-filter-bar.js` | Filter bar + autocomplete chips |
| `test/run-filter.test.js` | Test ba hàm lọc |
| `test/auths-panel.test.js` | Test panel (migration test nằm ở `test/state.test.js`) |
| `test/run-filter-bar.test.js` | Test chips và gợi ý |

Sửa:

| Tệp | Việc |
|---|---|
| `public/index.html` | Tab + panel AUTHS; CONNECTION rút gọn; filter bar trong actionbar |
| `public/css/app.css` | Style panel AUTHS, chips, popup gợi ý, ba section dọc trong drawer |
| `public/js/state.js` | `auths`, `runFilter`, bỏ 3 khóa cũ, `migrateAuths()` |
| `public/js/ui/tabs.js` | Thêm `'auths'` vào `TAB_IDS` |
| `public/js/ui/connection-panel.js` | Bỏ 3 ô credential; indicator đếm profile; Reload Token ghi vào profile đang chọn |
| `public/js/ui/endpoint-drawer.js` | Gỡ tab bar, ba section xếp dọc |
| `public/js/ui/filters.js` | Select lọc theo Auth |
| `public/js/ui/detail-drawer.js` | Dòng Auth |
| `public/js/shared/filter-logic.js` | Cột `auth`, `collectAuthNames`, khớp filter |
| `public/js/shared/request-count.js` | Nhân thêm trục auth, dùng `run-filter.js` |
| `public/js/shared/curl.js` | `curlFilename()` chèn `authName` |
| `public/js/main.js` | Khởi tạo `auths-panel` và `run-filter-bar` |
| `src/server/request-builder.js` | Vòng lặp ba chiều; `authHeaderPairs`; credential từ `auth`; 4 lỗi mới |
| `src/server/excel-export.js` | Cột Auth |
| `test/request-count.test.js` | Thêm `auths` vào helper `st()` |
| `test/request-builder.test.js` | Nhân profile, credential, thứ tự đè |
| `test/excel-export.test.js` | Cột Auth, không rò token chéo profile |
| `test/endpoint-drawer.test.js` | Bỏ khẳng định về tab |
| `test/state.test.js` | Migration |

## 9. Kiểm thử

**`run-filter.js`**
- Ba trục rỗng → trả nguyên danh sách đầu vào.
- `methods: ['get']` khớp endpoint `method: 'GET'` — không phân biệt hoa thường.
- Endpoint thiếu `method` được coi là `GET`.
- Endpoint `enabled: false` bị loại kể cả khi method khớp.
- `msisdnPatterns: ['0912','0988']` khớp OR, không phải AND.
- Pattern chỉ có khoảng trắng bị bỏ qua, không làm rỗng kết quả.
- `authIds` chứa id không tồn tại → profile đó không xuất hiện, không ném lỗi.
- `authIds` toàn id không tồn tại → trả mảng rỗng, không phải trả tất cả.

**Bất biến quan trọng nhất** — `countRequests(state) === buildRequests(state).length`, kiểm với ít nhất 5 tổ hợp filter khác nhau. Hai hàm nằm hai phía; lệch nhau là con số trên nút nói dối.

**`buildRequests()`**
- 2 profile × 3 endpoint × 4 msisdn = 24 request, `index` chạy liên tục 1..24.
- Request của cùng profile nằm liền khối.
- Mỗi request mang đúng `Authorization` của profile mình.
- `mode: 'curl'` → header từ chuỗi cURL vào được, `Authorization` không bị `putIfAbsent` ghi đè.
- Endpoint có header trùng tên với header của profile → endpoint thắng.
- Header profile trùng tên với HEADERS chung → profile thắng.
- Filter loại hết endpoint → trả mảng rỗng, không ném lỗi.
- Một profile duy nhất, filter rỗng → kết quả y hệt trước spec này. Chốt chặn không phá hành vi cũ.

**`validateConfig()`**
- `auths: []` → một lỗi.
- Hai profile cùng tên → một lỗi, `field` trỏ đúng profile sau.
- Tên chỉ có khoảng trắng → tính là rỗng.
- `PROD` và `prod` → **không** trùng, phân biệt hoa thường.
- Filter khớp 0 endpoint → một lỗi `runFilter`.
- `authIds` trỏ id đã xóa nhưng vẫn còn id hợp lệ khác → không lỗi.

**Migration (`state.js`)**
- Config cũ có token → `auths[0].name === 'Default'`, giữ nguyên cả ba giá trị.
- Config cũ ba ô đều rỗng → vẫn sinh `Default`.
- Config mới đã có `auths` → không đụng vào.
- Config cũ sau migration không còn khóa `token` / `cookie` / `refreshToken` ở cấp `state`.
- `applyConfig()` với file config cũ cho kết quả giống `load()`.

**`filter-logic.js`**
- Lọc theo `authName` khớp chính xác, không phải substring.
- `collectAuthNames` trả danh sách không trùng, đã sắp xếp.

**`excel-export.js`**
- Cột Auth có mặt, đúng vị trí sau MSISDN.
- Dòng của profile A không chứa token của profile B, ở cả hai chế độ `Kèm đầy đủ` và `Che`.

**`auths-panel.js`**
- Thêm profile sinh `id` không trùng.
- Nhân bản giữ nguyên credential, tên thành `<name> (copy)`.
- Không xóa được profile cuối cùng.
- Xóa profile gỡ luôn `id` khỏi `runFilter.authIds`.
- Tên rỗng hoặc trùng gắn class `is-invalid`.
- Đổi mode qua lại không mất dữ liệu ở mode kia.

**`run-filter-bar.js`**
- Gõ `0912` gợi ý đúng các số chứa `0912`.
- `Enter` trên gợi ý tạo chip là số đầy đủ.
- `Enter` không trỏ gợi ý tạo chip là chuỗi đang gõ.
- Chip trùng không thêm hai lần.
- `Backspace` ở ô trống xóa chip cuối.
- Bỏ hết chip đưa `runFilter` về rỗng, nút RUN ALL quay lại tổng đầy đủ.

**`endpoint-drawer.js`**
- Ba section QUERY / HEADERS / BODY cùng hiện, không section nào `hidden`.
- Không còn phần tử `.body-tabs` trong drawer.
- Hành vi đổi mode và ghi state giữ nguyên như trước.

Toàn bộ test hiện có phải tiếp tục xanh, trừ những file đã liệt kê ở mục 8 là phải sửa cùng lúc.
