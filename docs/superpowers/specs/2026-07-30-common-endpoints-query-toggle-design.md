# Design Spec: Common Endpoints Checkbox, Common Query Option, and Batch Toggles

**Date:** 2026-07-30  
**Status:** Approved  

---

## 1. Overview & Objectives

Enhance the Endpoint List and Common Endpoints configuration in `ccm-tool` by introducing:
1. **Common Endpoints Enable Checkbox:** A checkbox to quickly enable/disable all "ENDPOINTS CHUNG" without deleting their text.
2. **Common Query Toggle per Endpoint:** An option (`attachCommonQuery`, default `true`) on every endpoint record to specify whether global/common query parameters should be applied to that request.
3. **Batch Toggles ("Apply to All"):** Batch controls in the Endpoint List toolbar to set MSISDN attachment (`attachMsisdn`) and Common Query attachment (`attachCommonQuery`) for all endpoints in the active tab to "Có" (Yes) or "Không" (No) at once.

---

## 2. Requirements & UI Design

### 2.1 Common Endpoints Enable Checkbox
- **Location:** Inside the header of the `ENDPOINTS CHUNG` card in `index.html`.
- **UI Element:** `<label class="check"><input id="chk-common-enabled" type="checkbox" checked /> Bật Endpoints chung</label>
- **State Property:** `state.commonEndpointsEnabled` (boolean, default `true`).
- **Behavior:** When unchecked, common endpoints are not included in request counts, request builds, or filter counters.

### 2.2 Common Query Toggle per Endpoint Record
- **Endpoint Property:** `ep.attachCommonQuery` (boolean, default `true`).
- **UI Element:** Next to the MSISDN toggle on each endpoint row:
  - MSISDN: `MSISDN: [Có / Không]`
  - Query chung: `Query chung: [Có / Không]`
- **Behavior:** If `ep.attachCommonQuery === false`, global/common query params (`state.queryParams`) are omitted from request generation for this endpoint.

### 2.3 Batch Controls ("Apply to All")
- **Location:** In the `extraActions` toolbar of the Endpoint List (next to `☑ Check all`).
- **Buttons / Actions:**
  - **MSISDN All:** Toggles or sets `attachMsisdn` for all endpoints in the current tab to `true` or `false`.
  - **Query chung All:** Toggles or sets `attachCommonQuery` for all endpoints in the current tab to `true` or `false`.

---

## 3. Data Schema & State Updates

### `state.js`
- `defaultConfig.commonEndpointsEnabled = true`

### Endpoint Object Schema (`CONFIG_DEFAULTS` in `endpoint-list.js`)
```javascript
{
  id: string,
  enabled: boolean,
  name: string,
  method: string,
  pathTemplate: string,
  attachMsisdn: boolean,         // default: true
  attachCommonQuery: boolean,     // default: true
  sheetName: string,
  queryParams: [],
  headers: [],
  ...
}
```

---

## 4. Backend & Shared Logic Changes

### `src/server/request-builder.js` & `public/js/shared/run-filter.js`
- Check `config.commonEndpointsEnabled !== false`. If `false`, do not parse or add common endpoints.
- When generating requests for an endpoint, if `ep.attachCommonQuery === false`, skip merging global `config.queryParams`.

---

## 5. Testing Plan

1. **`request-builder.test.js`:**
   - Test that `commonEndpointsEnabled: false` disables common endpoints in `buildRequests` and `validateConfig`.
   - Test that `attachCommonQuery: false` prevents global query params from being added to request URLs.
2. **`endpoint-list.test.js`:**
   - Test batch toggle for `attachMsisdn` across current tab endpoints.
   - Test batch toggle for `attachCommonQuery` across current tab endpoints.
   - Test that new endpoints default `attachCommonQuery` to `true`.
