# Endpoint Global Query Parameters & {*} Behavior Design

## Overview
Currently, `buildRequests` in `src/server/request-builder.js` merges `config.globalQueryParams` (e.g., `fromDate`, `toDate`) into every generated request URL regardless of the endpoint's `pathTemplate`.

This design updates the request building logic so that endpoints without `{*}` in their `pathTemplate` default to only appending `msisdn` without attaching global query parameters (date parameters). Global query parameters are only attached when `{*}` is present in the endpoint's `pathTemplate`.

## Design Details

### 1. Conditional Inclusion of Global Query Parameters
- Check `const hasStar = String(endpoint.pathTemplate ?? '').includes('{*}');`.
- If `hasStar` is `true`:
  - Include `config.globalQueryParams` (e.g. `fromDate`, `toDate`).
  - URL format: `https://domain/path/msisdn?fromDate=...&toDate=...` (plus any inline or per-endpoint query params).
- If `hasStar` is `false`:
  - Exclude `config.globalQueryParams`.
  - Append `msisdn` (if `attachMsisdn !== false` and `msisdn` is provided).
  - URL format: `https://domain/path/msisdn` (or with per-endpoint query params if explicitly defined on the endpoint).

### 2. Affected Files
- `src/server/request-builder.js`: Update `buildOne` function to check `hasStar` before merging `config.globalQueryParams`.
- `test/request-builder.test.js`: Update test cases to reflect the `{*}` requirement for global date query parameters and add specific tests verifying behavior with and without `{*}`.

## Verification Plan
- Run existing and updated unit tests: `node --test test/request-builder.test.js`
- Run full test suite: `npm test`
