# Task 4: Worker Pool Report

## What was implemented
We implemented Task 4: Worker pool to parallelize HTTP requests using Node.js Worker Threads:
1. Created `src/server/request-worker.js`: Instantiates a worker thread context, listening for `run` and `cancel` messages. It delegates HTTP requests using the `sendRequest` function imported from `src/server/http-client.js`.
2. Created `src/server/worker-pool.js`: Manages a pool of up to `MAX_WORKERS` threads (defaulting to 4, capped at 16). Each worker can handle up to `MAX_INFLIGHT` (5) concurrent requests. It implements task queueing, worker crash recovery/retry (allowing exactly 1 retry per request on worker crash), and request cancellation via `AbortSignal`.
3. Created `test/worker-pool.test.js`: Implemented the full test suite verifying:
   - Exported constants `MAX_INFLIGHT = 5`.
   - Correct pool run execution (sending all requests and returning all expected records).
   - Maximum concurrency enforcement (never exceeding `workerCount * MAX_INFLIGHT` requests).
   - Immediate resolution for empty queue.
   - Quick termination upon `AbortSignal` trigger.
   - Workers cap limit (16).
   - Handling/resolving network error gracefully without crashing the whole execution.

---

## TDD Evidence

### RED Phase
* **Command run**: `npm test -- --test-name-pattern="runPool"`
* **Relevant failing output**:
  ```
  node:internal/modules/esm/resolve:271
      throw new ERR_MODULE_NOT_FOUND(
            ^

  Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'D:\VNPT_ODA\poc-folder\migrate-folder\app-dynamic-clone\ccm-tool\src\server\worker-pool.js' imported from D:\VNPT_ODA\poc-folder\migrate-folder\app-dynamic-clone\ccm-tool\test\worker-pool.test.js
      at finalizeResolution (node:internal/modules/esm/resolve:271:11)
      ...
  ✖ test\worker-pool.test.js (85.7935ms)
  ℹ tests 209
  ℹ suites 0
  ℹ pass 208
  ℹ fail 1
  ```
* **Why the failure was expected**: Since the production code file `src/server/worker-pool.js` had not yet been created, importing it from the newly created test file failed with a module resolution error.

### GREEN Phase
* **Command run**: `npm test -- --test-name-pattern="runPool|MAX_INFLIGHT"`
* **Relevant passing output**:
  ```
  ✔ MAX_INFLIGHT la 5 (1.5988ms)
  ✔ runPool chay het request va tra du record (104.8598ms)
  ✔ runPool khong vuot qua workerCount nhan MAX_INFLIGHT (264.8477ms)
  ✔ runPool tra ve ngay khi danh sach rong (0.4342ms)
  ✔ runPool dung khi signal bi abort (407.399ms)
  ✔ runPool gioi han so worker toi da 16 (62.6324ms)
  ✔ runPool van tra record khi request loi mang (47.9694ms)
  ℹ tests 215
  ℹ suites 0
  ℹ pass 215
  ℹ fail 0
  ```

---

## Files Changed
* `src/server/request-worker.js` (Created)
* `src/server/worker-pool.js` (Created)
* `test/worker-pool.test.js` (Created)

---

## Self-Review Findings
1. **Completeness**: All specifications and interface exports (e.g. `runPool`, `MAX_INFLIGHT = 5`, `MAX_WORKERS = 16`, `onRecord`) have been fully implemented.
2. **Quality**: Names are clear and standard. File responsibilities are well-isolated.
3. **Discipline**: Strictly stuck to requirements. No overbuilding.
4. **Testing**: Comprehensive automated test coverage using the standard Node.js test runner. Output is pristine and without warnings.

---

## Issues or Concerns
None. All tests passed.

---

## Fix Report (2026-07-29)

### Fixes Applied
1. **Worker crash recovery/retry tests**: Added a unit test verifying worker crash recovery and retry behavior. The test subclasses `Worker`, terminates the worker during execution, and verifies that the requests are retried once and then correctly logged as `WORKER_CRASH` upon the second failure.
2. **Worker exit code check**: Modified the worker exit event handler check from `worker.on('exit', (code) => { if (code !== 0 && !settled) recycle(slot); });` to `worker.on('exit', (code) => { if (!settled) recycle(slot); });`. This avoids hangs when worker threads exit with code 0 unexpectedly before settling.
3. **Clamping logic for workerCount: 0**: Fixed the `clampWorkers` logic so that passing `workerCount: 0` evaluates to `1` (which is the min worker count) rather than default `4`.

### Verification Commands Run
- Test suite run command: `node --test test/worker-pool.test.js`

### Test Results Output
```
✔ MAX_INFLIGHT la 5 (0.4987ms)
✔ runPool chay het request va tra du record (113.8205ms)
✔ runPool khong vuot qua workerCount nhan MAX_INFLIGHT (257.5763ms)
✔ runPool tra ve ngay khi danh sach rong (0.3946ms)
✔ runPool dung khi signal bi abort (392.5561ms)
✔ runPool gioi han so worker toi da 16 (87.807ms)
✔ runPool van tra record khi request loi mang (45.5163ms)
✔ runPool tu dong retry khi worker crash va tra ve WORKER_CRASH khi that bai lan 2 (96.8656ms)
✔ runPool clamp workerCount 0 ve 1 (53.7849ms)
ℹ tests 9
ℹ suites 0
ℹ pass 9
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1185.6525
```

## Second Round Fix Report (2026-07-29)

### Fixes Applied
1. **Clean up abort listener**: Stored a reference to the `abort` event handler registered on `signal`. Inside the `finish()` function, we safely remove the listener using `signal.removeEventListener('abort', abortHandler)` after guarding against the signal's presence to prevent errors if the signal is aborted after the pool has finished.
2. **Abort termination in `maybeFinish`**: Removed the `cancelled` check inside `maybeFinish()`. This allows the pool to naturally settle when `finished >= total`, or be terminated after `CANCEL_GRACE_MS` by the abort timeout handler. This ensures workers have enough time to return aborted/cancelled records.
3. **Spawn replacement worker only when needed**: Inside `recycle(slot)`, added a check `if (queue.length > 0)` before calling `pump(spawn())`. This prevents spawning idle replacement workers when no more requests remain in the queue.
4. **Non-integer worker count clamping**: Updated the `clampWorkers` helper to use `Math.floor(Number(n)) || 4` to truncate non-integer inputs to an integer and handle them gracefully.
5. **Remove unused ready message**: Removed `parentPort.postMessage({ type: 'ready' })` from `src/server/request-worker.js`.
6. **Added covering unit tests**: Added tests verifying:
   - Clamping non-integer worker counts (`2.7` clamps to `2`).
   - Cleanup of the abort listener on the `signal` object.
   - Prevention of spawning replacement workers when the queue is empty.

### Verification Commands Run
- Run test command: `node --test test/worker-pool.test.js`

### Test Results Output
```
✔ MAX_INFLIGHT la 5 (0.5693ms)
✔ runPool chay het request va tra du record (83.8702ms)
✔ runPool khong vuot qua workerCount nhan MAX_INFLIGHT (260.0048ms)
✔ runPool tra ve ngay khi danh sach rong (0.2875ms)
✔ runPool dung khi signal bi abort (408.5364ms)
✔ runPool gioi han so worker toi da 16 (80.923ms)
✔ runPool van tra record khi request loi mang (47.2154ms)
✔ runPool tu dong retry khi worker crash va tra ve WORKER_CRASH khi that bai lan 2 (95.2066ms)
✔ runPool clamp workerCount 0 ve 1 (63.0923ms)
✔ runPool clamp non-integer workerCount to floor integer (55.5215ms)
✔ runPool removes abort listener after finished (60.4887ms)
✔ runPool does not spawn replacement worker when queue is empty (44.7504ms)
ℹ tests 12
ℹ suites 0
ℹ pass 12
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1376.4286
```

