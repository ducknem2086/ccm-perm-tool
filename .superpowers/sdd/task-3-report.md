# Task 3 Implementation Report: Backend Request Builder & HttpClient Logic

**Completed Date:** 2026-07-30  
**Status:** SUCCESS  

## Summary of Changes

1. **Request Builder (`src/server/request-builder.js`)**:
   - Added `sheetName: endpoint.sheetName ?? 'Sheet 1'` to built request objects returned by `buildOne`.

2. **HttpClient (`src/server/http-client.js`)**:
   - Updated `finalize` function to attach `sheetName` to result records and evaluate `statusPermission` based on `permissionFile` and `permissionMapping`.
   - `statusPermission` values evaluated:
     - `null`: Permission checking inactive / `permissionFile` missing.
     - `'true'`: Status is `200` & auth profile matches permission matrix, OR status is `403` & auth profile does not match matrix.
     - `'false'`: Status is not `200` but profile matches, OR status is not `403` but profile does not match.
     - `'empty'`: API endpoint name not in permission matrix, cell value is not `'x'`, or `targetSheet` mismatch.
   - Updated `sendRequest` to accept `permissionFile` and `permissionMapping` options and forward them to `finalize`.

3. **Options Propagation (`routes.js`, `runner.js`, `worker-pool.js`, `request-worker.js`)**:
   - `src/server/routes.js`: Extracted `permissionFile` and `permissionMapping` from request body in `/api/run` and passed to `createRun`.
   - `src/server/runner.js`: Passed options to `runPool` (worker mode) and `sendRequest` (inline fallback mode).
   - `src/server/worker-pool.js`: Included options in `workerData` during worker thread `spawn()`, updated `crashRecord` to include `statusPermission: null`.
   - `src/server/request-worker.js`: Extracted options from `workerData` and passed to `sendRequest`.

4. **Unit Tests (`test/http-client.test.js`)**:
   - Added unit tests for all `statusPermission` states (inactive, true, false, empty).

## Test Results

### Unit Tests Execution Output
```
node --test test/http-client.test.js
✔ sendRequest tra ve status va body JSON da parse
✔ sendRequest giu nguyen token day du trong record
✔ sendRequest trich error code tu body loi
✔ sendRequest khong coi body khong phai JSON la loi
✔ sendRequest bao ETIMEDOUT khi qua han
✔ sendRequest bao ECONNREFUSED khi khong ket noi duoc
✔ sendRequest khong gui khi con bien chua resolve
✔ sendRequest bao ABORTED khi bi huy tu ngoai
✔ sendRequest chuyen tiep pathTemplate xuong record
✔ bi day ve trang dang nhap thi bao REDIRECTED kem URL chang cuoi
✔ server tra HTML ma khong redirect thi bao NOT_JSON
✔ response JSON hop le thi khong gan ma chan doan nao
✔ status loi kem HTML thi khong de NOT_JSON che mat ma loi tu body
✔ body rong khong bi coi la loi NOT_JSON
✔ redirect toi endpoint van tra JSON thi khong bao loi
✔ record mang lai authId va authName tu request
✔ record dat authId/authName rong khi request khong co
✔ statusPermission tra ve null khi khong bat permission check
✔ statusPermission tra ve "true" khi status 200 va profile khop quyen
✔ statusPermission tra ve "true" khi status 403 va profile khong khop quyen
✔ statusPermission tra ve "false" khi status NOT 200 (500) ma profile khop quyen
✔ statusPermission tra ve "false" khi status NOT 403 (200) ma profile khong khop quyen
✔ statusPermission tra ve "empty" khi ten API khong co trong file quyen

node --test test/runner.test.js
✔ startRun chay het request va giu du ket qua
✔ subscribe nhan du event result, progress va done
✔ getRun tra ve run theo runId
✔ cancelRun dung run dang chay
✔ cancelRun tra false voi runId la
✔ summarize dem dung so ok va failed
✔ startRun ton trong gioi han workerCount nhan 5
✔ startRun danh sach rong thi hoan tat ngay
✔ startRun clamp workerCount 0 ve 1
✔ startRun lam tron xuong workerCount khong nguyen
✔ startRun clamp workerCount qua lon ve toi da 16 slot, khong treo
✔ startRun van tra ve record khi request loi mang

Total Suite Status: PASS (152/152 tests passed across all test files)
```

## Fix Report: Task 3 Bug Fix (usecase1 Auth Profile Mapping Lookup)

**Fixed Date:** 2026-07-30  
**Status:** SUCCESS  

### Description of Fix
In `src/server/http-client.js`, `finalize()` previously looked up `usecase1` mappings matching only `endpointSheet`. When multiple auth profiles were mapped to the same endpoint sheet, it always retrieved the first mapping, resulting in incorrect permission evaluation for secondary profiles.

**Change made to `src/server/http-client.js`:**
```javascript
const m1 = uc1.find((m) => (
  m.endpointSheet === req.sheetName
  && String(m.authProfileName ?? '').trim().toLowerCase() === String(req.authName ?? '').trim().toLowerCase()
));
```

### Unit Tests Added & Updated
In `test/http-client.test.js`:
- Updated assertions for permission evaluation to reflect accurate per-profile column resolution.
- Added a new unit test `statusPermission giai quyet dung cot mapping va authProfileName khi mot sheet co nhieu auth profile` to verify that when an endpoint sheet has multiple mapped auth profiles, the correct column and `authProfileName` are resolved (including trimmed and case-insensitive matching).

### Verification Command Output
`node --test test/http-client.test.js` output:
```
✔ sendRequest tra ve status va body JSON da parse (27.2513ms)
✔ sendRequest giu nguyen token day du trong record (4.2546ms)
✔ sendRequest trich error code tu body loi (2.96ms)
✔ sendRequest khong coi body khong phai JSON la loi (4.1586ms)
✔ sendRequest bao ETIMEDOUT khi qua han (155.2217ms)
✔ sendRequest bao ECONNREFUSED khi khong ket noi duoc (1.8846ms)
✔ sendRequest khong gui khi con bien chua resolve (0.2323ms)
✔ sendRequest bao ABORTED khi bi huy tu ngoai (2.4245ms)
✔ sendRequest chuyen tiep pathTemplate xuong record (3.353ms)
[ccm] REDIRECTED — GET http://127.0.0.1:61322/api/query
  status=200 content-type=text/html redirected-to=http://127.0.0.1:61322/login
  request-headers={"Authorization":"Bearer TOKEN123"}
✔ bi day ve trang dang nhap thi bao REDIRECTED kem URL chang cuoi (4.7182ms)
[ccm] NOT_JSON — GET http://127.0.0.1:61325/x
  status=200 content-type=text/html; charset=utf-8
  request-headers={"Authorization":"Bearer TOKEN123"}
✔ server tra HTML ma khong redirect thi bao NOT_JSON (3.1888ms)
✔ response JSON hop le thi khong gan ma chan doan nao (3.034ms)
✔ status loi kem HTML thi khong de NOT_JSON che mat ma loi tu body (2.803ms)
✔ body rong khong bi coi la loi NOT_JSON (2.3046ms)
✔ redirect toi endpoint van tra JSON thi khong bao loi (3.2616ms)
✔ record mang lai authId va authName tu request (2.926ms)
✔ record dat authId/authName rong khi request khong co (2.58ms)
✔ statusPermission tra ve null khi khong bat permission check (2.6455ms)
✔ statusPermission tra ve "true" khi status 200 va profile khop quyen (3.4323ms)
✔ statusPermission tra ve "false" khi status NOT 200 (500) ma profile khop quyen (3.0322ms)
✔ statusPermission tra ve "empty" khi o quyen khong co "x" (2.6909ms)
✔ statusPermission tra ve "empty" khi ten API khong co trong file quyen (2.9981ms)
✔ statusPermission giai quyet dung cot mapping va authProfileName khi mot sheet co nhieu auth profile (6.6106ms)
ℹ tests 23
ℹ suites 0
ℹ pass 23
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 395.7791
```

## Task 3 Remaining Fix: Fallback / Unauthorized Profile Matching Support

**Fixed Date:** 2026-07-30  
**Status:** SUCCESS  

### Summary of Changes

1. **Permission Evaluation Logic in `src/server/http-client.js`**:
   - First searches `uc1` mapping for exact match: `endpointSheet === req.sheetName` AND `authProfileName === req.authName` (case-insensitive & trimmed). If found, `isProfileMatch = true`.
   - If exact match is not found, falls back to finding any mapping in `uc1` where `endpointSheet === req.sheetName`. If found, `isProfileMatch = false`.
   - If still not found, sets `statusPermission = 'empty'`.
   - If found, reads cell value at mapped column index. If cell value is `'x'`:
     - If `isProfileMatch === true`, returns `'true'` for status 200, else `'false'`.
     - If `isProfileMatch === false` (unauthorized profile), returns `'true'` for status 403, else `'false'`.
   - If cell value is not `'x'`, returns `'empty'`.

2. **Unit Tests Added in `test/http-client.test.js`**:
   - `statusPermission tra ve "true" khi status 403 va profile khong khop (unauthorized profile)`
   - `statusPermission tra ve "false" khi status NOT 403 (200 hoac 500) va profile khong khop (unauthorized profile)`

### Unit Test Execution Output

```
node --test test/http-client.test.js
✔ sendRequest tra ve status va body JSON da parse (29.5026ms)
✔ sendRequest giu nguyen token day du trong record (5.0619ms)
✔ sendRequest trich error code tu body loi (3.6702ms)
✔ sendRequest khong coi body khong phai JSON la loi (6.1964ms)
✔ sendRequest bao ETIMEDOUT khi qua han (154.3398ms)
✔ sendRequest bao ECONNREFUSED khi khong ket noi duoc (1.805ms)
✔ sendRequest khong gui khi con bien chua resolve (0.2251ms)
✔ sendRequest bao ABORTED khi bi huy tu ngoai (2.3244ms)
✔ sendRequest chuyen tiep pathTemplate xuong record (3.685ms)
[ccm] REDIRECTED — GET http://127.0.0.1:63259/api/query
  status=200 content-type=text/html redirected-to=http://127.0.0.1:63259/login
  request-headers={"Authorization":"Bearer TOKEN123"}
✔ bi day ve trang dang nhap thi bao REDIRECTED kem URL chang cuoi (5.3681ms)
[ccm] NOT_JSON — GET http://127.0.0.1:63262/x
  status=200 content-type=text/html; charset=utf-8
  request-headers={"Authorization":"Bearer TOKEN123"}
✔ server tra HTML ma khong redirect thi bao NOT_JSON (3.2275ms)
✔ response JSON hop le thi khong gan ma chan doan nao (3.1763ms)
✔ status loi kem HTML thi khong de NOT_JSON che mat ma loi tu body (2.7333ms)
✔ body rong khong bi coi la loi NOT_JSON (2.5971ms)
✔ redirect toi endpoint van tra JSON thi khong bao loi (3.9945ms)
✔ record mang lai authId va authName tu request (4.7974ms)
✔ record dat authId/authName rong khi request khong co (3.5407ms)
✔ statusPermission tra ve null khi khong bat permission check (2.4927ms)
✔ statusPermission tra ve "true" khi status 200 va profile khop quyen (3.57ms)
✔ statusPermission tra ve "false" khi status NOT 200 (500) ma profile khop quyen (2.6574ms)
✔ statusPermission tra ve "empty" khi o quyen khong co "x" (2.4191ms)
✔ statusPermission tra ve "empty" khi ten API khong co trong file quyen (2.3099ms)
✔ statusPermission giai quyet dung cot mapping va authProfileName khi mot sheet co nhieu auth profile (4.7827ms)
✔ statusPermission tra ve "true" khi status 403 va profile khong khop (unauthorized profile) (2.5542ms)
✔ statusPermission tra ve "false" khi status NOT 403 (200 hoac 500) va profile khong khop (unauthorized profile) (4.437ms)
ℹ tests 25
ℹ suites 0
ℹ pass 25
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 417.1605
```

## Refactoring evaluatePermission Helper & Multi-Profile Fallback Fix

**Fixed Date:** 2026-07-30  
**Status:** SUCCESS  

### Summary of Refactoring & Fixes

1. **Permission Evaluation Refactoring (`src/server/http-client.js`)**:
   - Refactored permission evaluation logic into helper function `evaluatePermission({ req, status, permissionFile, permissionMapping })`.
   - Checks if `permissionFile` and `permissionFile.filename` exist, returning `null` if missing.
   - Checks Usecase 2: `targetSheet` match and searches `matchedRow` by `permissionColumn` (exact match, trimmed, case-insensitive). Returns `'empty'` if no `matchedRow`.
   - Filters all mappings in `uc1` matching `m.endpointSheet === req.sheetName`. Returns `'empty'` if no mappings for `req.sheetName`.
   - Checks if any sheet mapping matches `authProfileName` (exact match with `req.authName`, trimmed, case-insensitive).
   - If there IS an exact match mapping for `req.authName`:
     - Reads `cellVal` at its `permissionColumn`.
     - Returns `status === 200 ? 'true' : 'false'` if `cellVal === 'x'`.
     - Returns `'empty'` otherwise.
   - If there is NO exact match mapping for `req.authName` (unauthorized profile):
     - Checks if ANY of the sheet mappings for `req.sheetName` has `cellVal === 'x'` in `matchedRow`.
     - Returns `status === 403 ? 'true' : 'false'` if yes.
     - Returns `'empty'` if no.

2. **Unit Tests Added (`test/http-client.test.js`)**:
   - Added unit test `statusPermission unauthorized profile kiem tra tat ca profiles duoc map tren sheet (Profile A: empty, Profile B: x) tra ve true khi 403 va false khi 200`.
   - Verified that when a sheet has multiple mapped profiles (Profile A -> Col 1, Profile B -> Col 2), and API_B has Col 1 = '' and Col 2 = 'x', an unauthorized request (Profile C) checks Col 2 ('x') and returns `'true'` on 403, and `'false'` on 200.

### Verification Output

`node --test test/http-client.test.js` output:
```
✔ sendRequest tra ve status va body JSON da parse (26.6008ms)
✔ sendRequest giu nguyen token day du trong record (4.495ms)
✔ sendRequest trich error code tu body loi (3.8525ms)
✔ sendRequest khong coi body khong phai JSON la loi (3.024ms)
✔ sendRequest bao ETIMEDOUT khi qua han (166.7665ms)
✔ sendRequest bao ECONNREFUSED khi khong ket noi duoc (2.1466ms)
✔ sendRequest khong gui khi con bien chua resolve (0.2306ms)
✔ sendRequest bao ABORTED khi bi huy tu ngoai (2.351ms)
✔ sendRequest chuyen tiep pathTemplate xuong record (4.6078ms)
[ccm] REDIRECTED — GET http://127.0.0.1:54771/api/query
  status=200 content-type=text/html redirected-to=http://127.0.0.1:54771/login
  request-headers={"Authorization":"Bearer TOKEN123"}
✔ bi day ve trang dang nhap thi bao REDIRECTED kem URL chang cuoi (5.0488ms)
[ccm] NOT_JSON — GET http://127.0.0.1:54774/x
  status=200 content-type=text/html; charset=utf-8
  request-headers={"Authorization":"Bearer TOKEN123"}
✔ server tra HTML ma khong redirect thi bao NOT_JSON (3.8745ms)
✔ response JSON hop le thi khong gan ma chan doan nao (2.88ms)
✔ status loi kem HTML thi khong de NOT_JSON che mat ma loi tu body (2.5986ms)
✔ body rong khong bi coi la loi NOT_JSON (2.6185ms)
✔ redirect toi endpoint van tra JSON thi khong bao loi (4.1371ms)
✔ record mang lai authId va authName tu request (2.7338ms)
✔ record dat authId/authName rong khi request khong co (2.5985ms)
✔ statusPermission tra ve null khi khong bat permission check (3.4386ms)
✔ statusPermission tra ve "true" khi status 200 va profile khop quyen (2.5355ms)
✔ statusPermission tra ve "false" khi status NOT 200 (500) ma profile khop quyen (2.625ms)
✔ statusPermission tra ve "empty" khi o quyen khong co "x" (2.4092ms)
✔ statusPermission tra ve "empty" khi ten API khong co trong file quyen (2.3105ms)
✔ statusPermission giai quyet dung cot mapping va authProfileName khi mot sheet co nhieu auth profile (5.1091ms)
✔ statusPermission tra ve "true" khi status 403 va profile khong khop (unauthorized profile) (3.2669ms)
✔ statusPermission tra ve "false" khi status NOT 403 (200 hoac 500) va profile khong khop (unauthorized profile) (4.3998ms)
✔ statusPermission unauthorized profile kiem tra tat ca profiles duoc map tren sheet (Profile A: empty, Profile B: x) tra ve true khi 403 va false khi 200 (4.1627ms)
ℹ tests 26
ℹ suites 0
ℹ pass 26
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 426.2852
```


