# CHECK PERMISSION screen upgrade — nut Check loc hang loat + gop control panel

Ngay: 2026-08-03

## Boi canh

Man hinh CHECK PERMISSION (`panel-perm`) hien co hai van de:

1. **Khong co cach xem nhanh nhieu ban ghi cung luc.** Bang "HAS PERMISSIONS"
   (`perm-sheet-table`, ben phai) va bang log endpoint (`perm-table`, ben trai)
   da co san co che khop dung cho **mot** ban ghi: moi ban ghi log da mang san
   `rec.permissionMatchedName` — chinh la bename da khop qua thuat toan
   `hitsForRow` (`permission-match.js`) luc dung config chay CHECK PERM. Nguoi
   dung muon xem nhanh TAT CA cac ban ghi has-permission dang loc (theo
   checkbox YES/NO) thi phai go tay tung ten mot vao o loc "UC2 Name" — khong
   co cach xem gop.

2. **Thong tin dieu khien bi chia lam hai noi.** Nut trigger `#btn-check-perm`
   (hien so request uoc tinh, canh bao khong khop phan quyen qua `title` chi
   thay khi hover) nam o topbar — thay duoc tu moi tab. Con tien trinh chay,
   tom tat sau chay, nut Dung/Export lai nam trong `.runbar` rieng cua
   `panel-perm`. Nguoi dung phai nhin hai cho khac nhau moi thay het thong tin
   lien quan mot luong CHECK PERM.

Spec nay gop hai thay doi (lien quan truc tiep, cung mot man hinh) thanh mot
spec de trien khai gon.

## Phan 1 — Nut "Check": loc bang log theo toan bo bang HAS PERMISSIONS dang hien

### Co che

- Bam nut `#btn-perm-check` ("🔎 Check"):
  1. Doc cac dong dang hien trong bang HAS PERMISSIONS **tai thoi diem bam**
     (ap dung filter YES/NO — `chk-perm-granted`/`chk-perm-denied` — dung logic
     `applySheetFilter` da co).
  2. Gom cot dinh danh (bename, qua `identifierColumnIndex`) cua cac dong do —
     bo dong rong, chuan hoa (trim + lowercase), khu trung → thanh mot tap ten.
  3. Ap tap ten nay lam MOT dieu kien loc moi (`checkNames`) len bang log
     (`perm-table`): giu ban ghi neu `normalize(rec.permissionMatchedName)`
     nam trong tap. Dieu kien nay **AND** voi moi filter khac dang co tren
     bang log (status, auth, method, endpoint, UC2 Name, body, role,
     permStatus, perm).
  4. Bam Check lan nua → tinh lai snapshot moi (thay han tap cu) — **khong
     phai toggle bat/tat**.
  5. Sau khi ap, hien mot badge nho canh nut: "khop N ban ghi has permission"
     kem nut nho "Bo check ✕" — bam ✕ chi xoa RIENG dieu kien `checkNames`,
     giu nguyen cac filter khac dang co.
  6. Bang HAS PERMISSIONS dang hien 0 dong (chua nap file / chua khai cot UC2
     / ca hai checkbox YES-NO tat / loc ra 0 dong) → bam Check chi hien toast
     bao, khong doi filter bang log.
  7. Bam chay lai CHECK PERM moi (`#btn-check-perm`) → tu xoa dieu kien Check
     cu (badge an di) vi index/ban ghi cu da doi het, giu lai se gay hieu lam
     bang trong.

### Vi sao dung `rec.permissionMatchedName` thay vi tinh lai thuat toan khop

`matchPermissionEndpoints` (permission-match.js) da chay thuat toan
`hitsForRow` (khop bename vs endpoint qua `joinValueOf`, co fallback ve
`endpoint.name`) **mot lan** luc dung config chay, gan ket qua vao
`permName`/`permRowIndex` cho tung endpoint. Ket qua nay troi qua
`request-builder.js` → server → tra ve trong record la
`rec.permissionMatchedName`. Day la nguon-su-that duy nhat da duoc kiem chung
dung cho tung ban ghi rieng le — tinh lai thuat toan fuzzy o client luc bam
Check se: (a) trung logic, (b) co nguy co lech ket qua neu hai duong tinh sai
khac nhau. Nut Check chi can so khop CHINH XAC (sau normalize) bename hien
dang thay o bang HAS PERMISSIONS voi gia tri da co san trong
`permissionMatchedName` — khong can fuzzy-match lai.

### File thay doi

- **`public/js/shared/permission-filter-logic.js`**
  - `emptyPermFilter()` them field `checkNames: null`.
  - `matchPermRecord(rec, filter)` them nhanh: neu `filter.checkNames` khac
    null va `!filter.checkNames.has(normalize(rec.permissionMatchedName))` →
    loai ban ghi. `normalize` la ham cuc bo `(s) => String(s ?? '').trim().toLowerCase()`
    (khong import cheo module khac, tranh phu thuoc thua).

- **`public/js/ui/permission-filters.js`** (`initPermissionFilters`)
  - Them method `applyCheckNames(names)`: set `filter.checkNames = new Set(names.map(normalize))`
    (rong → khong goi ham nay, xu ly o main.js truoc khi goi), roi goi
    `onChange?.()`.
  - Them method `clearCheckNames()`: set `filter.checkNames = null`, goi
    `onChange?.()`.
  - Them method `hasCheckNames()`: tra `filter.checkNames !== null` — main.js
    dung de quyet dinh hien/an badge sau khi tu-clear (vi du luc bam chay lai
    CHECK PERM).

- **`public/js/shared/permission-sheet-filter.js`**
  - Ham moi, thuan (khong doc `state`, giong het style cac ham con lai trong
    file nay — de test truc tiep trong `permission-sheet-filter.test.js` nhu
    `applySheetFilter`/`identifierColumnIndex` da co):
    ```js
    // Danh sach GIA TRI cot dinh danh (bename) cua cac dong dang hien theo
    // filter YES/NO — nguon cho nut Check o main.js. Bo dong rong, khu trung.
    export function visibleIdentifierValues(headers, rows, uc1, uc2, sheetFilter) {
      const idIdx = identifierColumnIndex(headers, uc2);
      if (idIdx === -1) return [];
      const roleIdxs = roleColumnIndexes(headers, uc1);
      const visible = applySheetFilter(rows, roleIdxs, sheetFilter);
      const names = new Set();
      for (const v of visible) {
        const val = String(v.row[idIdx] ?? '').trim();
        if (val) names.add(val);
      }
      return [...names];
    }
    ```

- **`public/js/main.js`**
  - Import them `visibleIdentifierValues` tu `./shared/permission-sheet-filter.js`
    (da import san `roleColumns` cung file).
  - Wire `#btn-perm-check` click: goi
    `visibleIdentifierValues(savedSheet()?.headers ?? [], savedSheet()?.rows ?? [], savedMapping().usecase1, savedMapping().usecase2, permSheetFilterBar.getFilter())`
    → rong thi
    `window.ccmToast('Khong co ban ghi has permission nao dang hien de check', 'error')`
    va return; khac rong thi `permFilters.applyCheckNames(names)`,
    `renderPermResults()`, hien badge voi so luong `names.length`, hien nut
    "Bo check ✕".
  - Wire nut "Bo check ✕" (`#btn-perm-check-clear`): `permFilters.clearCheckNames()`,
    `renderPermResults()`, an badge.
  - Trong handler click `#btn-check-perm` (bat dau CHECK PERM run moi), sau
    dong `resetPermResults(); renderPermResults();` them
    `permFilters.clearCheckNames(); ` va an badge (goi cung 1 ham
    `hidePermCheckBadge()` dung chung voi nut Bo check).

### Truong hop bien

| Tinh huong | Xu ly |
|---|---|
| Bang HAS PERMISSIONS rong luc bam Check | Toast loi, khong doi filter |
| Sheet phan quyen da luu bi mat / chua khai cot UC2 | `identifierColumnIndex` tra -1 → coi nhu rong, toast loi |
| Bename trung lap giua nhieu dong | Tu khu trung qua `Set`, khong anh huong ket qua |
| Ban ghi log chua khop dong nao (`permissionMatchedName == null`) | Khong bao gio nam trong tap check (tap chi chua bename khong rong) → tu dong bi loai, dung y muon |
| Doi checkbox YES/NO SAU khi da bam Check | Khong tu cap nhat (snapshot) — phai bam lai Check de tinh tap moi |
| Bam Check trong luc dang chay CHECK PERM (permRunning) | Van cho phep — Check chi loc du lieu da co trong `permResults`, khong phu thuoc trang thai chay |

## Phan 2 — Gop control panel cua CHECK PERMISSION thanh mot khoi

### Hien trang (2 noi tach roi)

- Topbar (`.topbar-right`, hien moi tab): `#btn-check-perm` — label
  `"🔐 CHECK PERM (N cap · M request)"`, canh bao unmatched/noFunction/collapsed
  chi nam o `title` (hover moi thay). Bam xong tu `tabs.select('perm')`.
- `panel-perm` rieng: `.runbar` voi `#perm-progress` (tien trinh luc chay),
  `#perm-stats` (tom tat sau chay — co gom so unmatched thuc te), nut
  `#btn-perm-cancel` (Dung) + `#btn-perm-export` (Export Excel).

### Thiet ke moi — mot khoi duy nhat trong `panel-perm`

Doi hen: **doi han nut trigger vao trong tab CHECK PERMISSION**, xoa khoi
topbar — nguoi dung phai mo tab CHECK PERMISSION truoc moi bam chay duoc (RUN
ALL / `#btn-run` o topbar khong doi, ngoai pham vi spec nay).

```html
<!-- index.html: topbar-right BOT #btn-check-perm -->
<div class="topbar-right">
  <button id="btn-run" class="btn btn-primary" type="button">▶ RUN ALL (0)</button>
  <button id="btn-export-config" class="btn btn-secondary btn-sm" type="button">⤒ Export config</button>
  <button id="btn-import-config" class="btn btn-secondary btn-sm" type="button">⤓ Import config</button>
</div>
```

```html
<!-- index.html: panel-perm — khoi runbar hop nhat -->
<section id="panel-perm" class="panel" role="tabpanel" aria-labelledby="tab-perm" tabindex="0" hidden>
  <div class="runbar">
    <div class="runbar-left">
      <button id="btn-check-perm" class="btn btn-primary" type="button">🔐 CHECK PERM</button>
      <span id="perm-progress" class="mono">0/0</span>
      <span id="perm-stats" class="mono muted"></span>
    </div>
    <div class="runbar-right">
      <button id="btn-perm-check" class="btn btn-secondary" type="button">🔎 Check</button>
      <span id="perm-check-badge" class="muted mono" hidden>
        khớp <span id="perm-check-count">0</span> bản ghi has permission
        <button id="btn-perm-check-clear" class="btn btn-secondary btn-sm" type="button">Bỏ check ✕</button>
      </span>
      <button id="btn-perm-cancel" class="btn btn-secondary" type="button" disabled>■ Dừng</button>
      <button id="btn-perm-export" class="btn btn-secondary" type="button" disabled>⬇ Export Excel</button>
    </div>
  </div>
  <p id="perm-warnings" class="warning" hidden></p>

  <div id="perm-split" class="split-pane">
    ... (khong doi)
  </div>
</section>
```

Tai dung CSS co san — khong them class moi:
- `.runbar` da co `flex-wrap: wrap` (app.css:344-349) — du cho nhieu phan tu
  hon tren mot hang, tu xuong hang tren man hinh hep.
- `.warning` (app.css:208) dung mau canh bao co san, giong cach `#token-warning`
  dang dung — tai dung cho `#perm-warnings`.

### JS thay doi (`main.js`)

- `refreshCheckPermButton()`:
  - Bo dong gan `btnCheckPerm.title = ...` (canh bao qua tooltip).
  - Them: lay `const warnEl = document.getElementById('perm-warnings');`
    — neu `warns.length > 0` thi `warnEl.textContent = \`⚠ ${warns.join(' · ')}\`; warnEl.hidden = false;`,
    nguoc lai `warnEl.hidden = true;`.
  - Nhanh "chua nap file phan quyen" (dau ham) cung phai an `#perm-warnings`
    (`warnEl.hidden = true`) truoc khi return.
  - Giu nguyen logic tinh `pairs/total/unmatched/noFunction/collapsed` va
    disable button.
- Handler click `#btn-check-perm`: bo dong `tabs.select('perm');` (du thua —
  nut gio nam san trong tab do, nguoi dung da o san tab nay moi bam duoc).
- Cac bien `permProgressEl`, `permStatsEl`, `btnPermCancel`, `btnPermExport`,
  `btnCheckPerm` van `document.getElementById` binh thuong — khong doi cach
  lay, chi doi vi tri DOM cua the `<button id="btn-check-perm">` trong file
  HTML nen khong anh huong.

### Test can cap nhat/them

- `test/layout.test.js`:
  - Test `'topbar gom ca tabs-left, tabs-right (run-filter-bar) va topbar-right (btn-run, run-breakdown, btn-export-config, btn-import-config)'`
    (dong 72-85): khong assert gi ve `btn-check-perm` trong topbar — khong
    can sua, nhung se them assert moi `!topbar[1].includes('id="btn-check-perm"')`
    de khoa cung cau truc moi (tranh regressions).
  - Test `'co tab CHECK PERMISSION, panel-perm, nut btn-check-perm va btn-perm-export'`
    (dong 87-94): van dung nguyen (chi check `html.includes(...)`, khong quan
    tam vi tri) — them assert `btn-check-perm` nam trong block `panel-perm`
    (dung regex tuong tu cach test khac trong file nay tach block bang
    `<section id="panel-perm"...>...</section>`).
- `test/permission-filter-logic.test.js` (da xac nhan ton tai): them case cho
  `checkNames` — co match, khong match, `null` (tat).
- `test/permission-sheet-filter.test.js` (da xac nhan ton tai, dung style thuan
  ham nhu cac test hien co): them case cho `visibleIdentifierValues` — co dong
  hop le, bo dong rong, khu trung, tra rong khi `identifierColumnIndex === -1`.
- Khong co `test/main.test.js` trong repo — wiring trong `main.js` (click
  handler, badge show/hide) khong co unit test truc tiep, dung quy uoc hien
  tai cua repo (main.js chi wiring, logic thuan nam o `shared/` da test rieng).

## Tom tat pham vi

- Khong dong toi `btn-run` / RUN ALL / OUTPUT tab — giu nguyen kien truc
  topbar-trigger + panel-runbar rieng cho luong do (ngoai pham vi yeu cau).
- Khong doi thuat toan khop `hitsForRow` / `matchPermissionEndpoints` — chi
  tai su dung ket qua da tinh san.
- Hai phan (nut Check + gop panel) cung cham vao `panel-perm` va `main.js` nen
  gop chung mot spec/plan de tranh xung dot khi sua cung file hai lan.
