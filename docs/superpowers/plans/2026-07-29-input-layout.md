# 3-Column Input Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the INPUT tab layout to use 3 columns instead of 2.

**Architecture:** Update HTML structural grouping in `index.html` and modify layout responsive rules in `app.css`.

**Tech Stack:** HTML5, CSS Grid

## Global Constraints

- Toàn bộ project dùng ESM ("type": "module" trong package.json). Không dùng require.
- Chỉ 2 dependency runtime: express và exceljs. Không thêm bất kỳ package nào khác.
- Không build step.
- Port cố định 2345.
- Chuỗi hiển thị cho người dùng viết bằng tiếng Việt có dấu.
- Mỗi file một nhiệm vụ. File nào vượt ~250 dòng thì tách.

---

### Task 1: Viết test thất bại cho cấu trúc layout

**Files:**
- Create: `test/layout.test.js`

**Interfaces:**
- Consumes: không có
- Produces: không có

- [ ] **Step 1: Tạo tệp tin `test/layout.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('HTML co dung 3 cot trong input-grid', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const gridMatch = html.match(/<div class="input-grid">([\s\S]*?)<\/div>\s*<div class="actionbar">/);
  assert.ok(gridMatch, 'phai tim thay the <div class="input-grid">');
  const colCount = (gridMatch[1].match(/class="col"/g) || []).length;
  assert.equal(colCount, 3, 'phai co dung 3 cot class="col" trong input-grid');
});

test('CSS dinh nghia 3 cot cho input-grid', () => {
  const css = fs.readFileSync(path.join(__dirname, '../public/css/app.css'), 'utf8');
  assert.match(css, /grid-template-columns:\s*1fr\s+1fr\s+1fr/);
});
```

- [ ] **Step 2: Chạy test và xác nhận thất bại**

Run: `node --test test/layout.test.js`
Expected: FAIL — `colCount` không bằng 3 (hiện tại là 2), hoặc không tìm thấy cấu trúc CSS tương ứng.

- [ ] **Step 3: Commit**

```bash
git add test/layout.test.js
git commit -m "test: them unit test cho cau truc 3 cot giao dien input"
```

---

### Task 2: Cập nhật cấu trúc HTML cho tab INPUT

**Files:**
- Modify: `public/index.html`

**Interfaces:**
- Consumes: không có
- Produces: cấu trúc HTML 3 cột `col` mới

- [ ] **Step 1: Sửa đổi `public/index.html` để gom các card thành 3 cột**

Thay đổi khối `<div class="input-grid">` từ dòng 28 đến dòng 92 thành:

```html
        <div class="input-grid">
          <div class="col">
            <section class="card">
              <h2 class="card-title">CONNECTION</h2>
              <label class="field">
                <span class="label">Domain</span>
                <input id="inp-domain" class="input" type="text" placeholder="https://abc.vn" spellcheck="false" />
              </label>
              <label class="field">
                <span class="label">Bearer token</span>
                <input id="inp-token" class="input mono" type="text" placeholder="dán token vào đây" spellcheck="false" />
              </label>
            </section>

            <section class="card">
              <h2 class="card-title">DATE RANGE</h2>
              <label class="field">
                <span class="label">dd/mm/yyyy-dd/mm/yyyy</span>
                <input id="inp-daterange" class="input mono" type="text" placeholder="25/03/2026-01/04/2026" spellcheck="false" />
              </label>
              <div class="field-row">
                <label class="field"><span class="label">Từ</span><input id="inp-date-from" class="input" type="date" /></label>
                <label class="field"><span class="label">Đến</span><input id="inp-date-to" class="input" type="date" /></label>
              </div>
              <label class="field">
                <span class="label">Định dạng gửi đi</span>
                <select id="sel-date-format" class="input">
                  <option value="ddMMyyyy">ddMMyyyy</option>
                  <option value="dd/MM/yyyy">dd/MM/yyyy</option>
                  <option value="yyyy-MM-dd">yyyy-MM-dd</option>
                </select>
              </label>
              <p id="date-preview" class="preview mono"></p>
            </section>

            <section class="card">
              <h2 class="card-title">QUERY PARAMS <button class="btn-icon" data-add-param="query" type="button" title="Thêm dòng">＋</button></h2>
              <div id="tbl-query-params" class="param-table"></div>
            </section>

            <section class="card">
              <h2 class="card-title">HEADERS <button class="btn-icon" data-add-param="header" type="button" title="Thêm dòng">＋</button></h2>
              <div id="tbl-headers" class="param-table"></div>
              <p class="hint">Authorization được tự thêm từ token ở trên, trừ khi bạn tự khai đè ở đây.</p>
            </section>
          </div>

          <div class="col">
            <section class="card" id="list-msisdn"></section>
          </div>

          <div class="col">
            <section class="card" id="list-endpoint"></section>

            <details class="card">
              <summary class="card-title">ADVANCED</summary>
              <div class="field-row">
                <label class="field"><span class="label">Concurrency</span><input id="inp-concurrency" class="input mono" type="number" min="1" max="50" value="5" /></label>
                <label class="field"><span class="label">Timeout (ms)</span><input id="inp-timeout" class="input mono" type="number" min="1000" step="1000" value="30000" /></label>
              </div>
              <label class="field">
                <span class="label">Đường dẫn tìm error code (cách nhau bởi dấu phẩy)</span>
                <input id="inp-error-paths" class="input mono" type="text" value="errorCode, error_code, code, error.code" spellcheck="false" />
              </label>
              <label class="check"><input id="chk-dedupe" type="checkbox" checked /> Loại trùng khi import</label>
            </details>
          </div>
        </div>
```

- [ ] **Step 2: Chạy test**

Run: `node --test test/layout.test.js`
Expected: Test `HTML co dung 3 cot trong input-grid` PASS. Test `CSS dinh nghia 3 cot cho input-grid` vẫn FAIL.

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat: chia thanh 3 the col trong input-grid tren HTML"
```

---

### Task 3: Cập nhật CSS định hình giao diện 3 cột

**Files:**
- Modify: `public/css/app.css`

**Interfaces:**
- Consumes: các class HTML mới
- Produces: CSS layout 3 cột responsive

- [ ] **Step 1: Sửa đổi `public/css/app.css`**

Tìm và cập nhật định nghĩa `.input-grid` từ dòng 70 đến 77 trong `public/css/app.css` thành:

```css
.input-grid {
  flex: 1 1 auto; min-height: 0; overflow: auto;
  display: grid; grid-template-columns: 1fr 1fr 1fr;
  gap: var(--sp-md); padding: var(--sp-md);
  align-items: start;
}
.col { display: flex; flex-direction: column; gap: var(--sp-md); min-width: 0; }
@media (max-width: 1280px) { .input-grid { grid-template-columns: 1fr 1fr; } }
@media (max-width: 768px) { .input-grid { grid-template-columns: 1fr; } }
```

- [ ] **Step 2: Chạy kiểm tra toàn bộ unit test**

Run: `npm test`
Expected: PASS toàn bộ 142/142 test (bao gồm cả test layout mới).

- [ ] **Step 3: Commit**

```bash
git add public/css/app.css
git commit -m "style: dinh nghia layout grid 3 cot responsive cho tab input"
```
