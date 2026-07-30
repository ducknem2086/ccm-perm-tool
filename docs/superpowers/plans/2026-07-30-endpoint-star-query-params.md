# Endpoint Global Query Parameters & {*} Behavior Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modify `src/server/request-builder.js` so that global query parameters (`config.globalQueryParams`, such as `fromDate` and `toDate`) are only attached to request URLs when the endpoint's `pathTemplate` contains `{*}`, and update unit tests accordingly.

**Architecture:** Update `buildOne` in `src/server/request-builder.js` to inspect whether `endpoint.pathTemplate` contains `{*}`. If missing, pass an empty array instead of `activeOnly(config.globalQueryParams)` when merging query parameters. Update affected tests in `test/request-builder.test.js` to use `{*}` where date query params are expected and add tests for endpoints without `{*}`.

**Tech Stack:** Node.js native test runner (`node:test`, `node:assert/strict`), ES Modules.

## Global Constraints

- Preserve all existing functionality for endpoints containing `{*}`, header merging, body parsing, and auth profiles.
- Run tests via `node --test test/request-builder.test.js` and `npm test`.

---

### Task 1: Update `request-builder.js` and test suite for `{*}` query parameter logic

**Files:**
- Modify: `src/server/request-builder.js:183-196`
- Test: `test/request-builder.test.js`

**Interfaces:**
- Consumes: `endpoint.pathTemplate`, `config.globalQueryParams`
- Produces: `buildOne`, `buildRequests` with conditional global query parameter merging

- [ ] **Step 1: Write failing unit test for endpoints without `{*}`**

Add test in `test/request-builder.test.js`:
```javascript
test('buildRequests does not attach globalQueryParams when pathTemplate does not contain {*}', () => {
  const cfg = baseConfig();
  // endpoint pathTemplate without {*}
  cfg.endpoints[0].pathTemplate = '/query/abc-information';
  const reqs = buildRequests(cfg);
  assert.equal(reqs[0].url, 'https://abc.vn/query/abc-information/0912345678');
  assert.deepEqual(reqs[0].queryParams, {});
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `node --test test/request-builder.test.js`
Expected: FAIL due to global query params `?fromDate=25032026&toDate=01042026` currently being attached to endpoints without `{*}`.

- [ ] **Step 3: Update `buildOne` in `src/server/request-builder.js`**

Update `buildOne` in `src/server/request-builder.js`:
```javascript
  const hasStar = String(endpoint.pathTemplate ?? '').includes('{*}');
  const { path: rawPath, inlineQuery } = splitTemplate(endpoint.pathTemplate);
  let path = take(rawPath);
  if (msisdn && !hasMsisdnPlaceholder(rawPath)) {
    path = `${path.replace(/\/+$/, '')}/${msisdn}`;
  }

  // Uu tien: cau hinh rieng endpoint > query dinh sau {*} trong path > cau hinh chung (chi khi co {*}).
  const queryParams = {};
  const globalQueries = hasStar ? activeOnly(config.globalQueryParams) : [];
  for (const [k, v] of mergePairs(
    effectiveQueryPairs(endpoint), parseInlineQuery(inlineQuery), globalQueries,
  )) {
    queryParams[take(k)] = take(v);
  }
```

- [ ] **Step 4: Update existing tests in `test/request-builder.test.js`**

Update `baseConfig` or specific tests in `test/request-builder.test.js` where endpoints expect `fromDate`/`toDate` to include `{*}`, e.g. `pathTemplate: '/query/abc-information/{*}'`.

- [ ] **Step 5: Run unit tests to verify all pass**

Run: `node --test test/request-builder.test.js`
Expected: PASS

- [ ] **Step 6: Run full test suite to ensure no regressions**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit changes**

```bash
git add src/server/request-builder.js test/request-builder.test.js docs/superpowers/plans/2026-07-30-endpoint-star-query-params.md
git commit -m "feat: attach global query params only when pathTemplate contains {*}"
```
