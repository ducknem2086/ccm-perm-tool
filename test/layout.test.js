import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readHtml = () => fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const readCss = () => fs.readFileSync(path.join(__dirname, '../public/css/app.css'), 'utf8');

test('HTML co dung 2 cot trong input-grid', () => {
  const html = readHtml();
  const gridMatch = html.match(/<div class="input-grid">([\s\S]*?)<section id="panel-auths"/);
  assert.ok(gridMatch, 'phai tim thay the <div class="input-grid">');
  const colCount = (gridMatch[1].match(/class="col col-(narrow|wide)"/g) || []).length;
  assert.equal(colCount, 2, 'phai co dung 2 cot trong input-grid');
});

test('CSS dinh nghia grid 300px 1fr cho input-grid', () => {
  assert.match(readCss(), /grid-template-columns:\s*300px\s+1fr/);
});

test('cot hep chua MSISDN, DATE RANGE, QUERY PARAMS theo dung thu tu', () => {
  const html = readHtml();
  const col = html.match(/<div class="col col-narrow">([\s\S]*?)<div class="col col-wide">/);
  assert.ok(col, 'phai tim thay cot hep');
  const order = [...col[1].matchAll(/>(MSISDN|DATE RANGE|QUERY PARAMS)/g)].map((m) => m[1]);
  assert.deepEqual(order, ['MSISDN', 'DATE RANGE', 'QUERY PARAMS']);
});

test('cot rong co card CONNECTION/BODY CHUNG gop lam mot, roi den ADVANCED+ENDPOINTS CHUNG+PERMISSIONS, roi den ENDPOINTS', () => {
  const html = readHtml();
  const col = html.match(/<div class="col col-wide">([\s\S]*?)<section id="panel-auths"/);
  assert.ok(col, 'phai tim thay cot rong');
  assert.ok(col[1].includes('id="card-connection"'), 'phai co card CONNECTION gop voi BODY CHUNG');
  assert.ok(col[1].includes('id="inp-domain"'), 'card gop phai chua Domain (goc tu CONNECTION)');
  assert.ok(col[1].includes('id="sel-body-mode"'), 'card gop phai chua BODY CHUNG config');
  assert.ok(col[1].includes('class="cfg-row"'), 'phai co div cfg-row');
  assert.ok(col[1].includes('class="cfg-stack"'), 'phai co div cfg-stack (ADVANCED + ENDPOINTS CHUNG)');
  assert.ok(col[1].includes('>ADVANCED'), 'phai co card ADVANCED');
  assert.ok(col[1].includes('>ENDPOINTS CHUNG'), 'phai co card ENDPOINTS CHUNG');
  assert.ok(col[1].includes('id="card-permissions"'), 'phai co card PERMISSIONS');
  assert.ok(col[1].includes('id="list-endpoint"'), 'phai co card ENDPOINTS (danh sach)');

  assert.ok(
    col[1].indexOf('id="card-connection"') < col[1].indexOf('class="cfg-row"'),
    'CONNECTION/BODY CHUNG phai truoc cfg-row (ADVANCED nam duoi BODY CHUNG)',
  );
  assert.ok(
    col[1].indexOf('class="cfg-stack"') < col[1].indexOf('id="card-permissions"'),
    'ADVANCED/ENDPOINTS CHUNG (cfg-stack) phai nam ben trai PERMISSIONS',
  );
  assert.ok(
    col[1].indexOf('class="cfg-row"') < col[1].indexOf('id="list-endpoint"'),
    'cfg-row phai truoc card ENDPOINTS list',
  );
});

test('ENDPOINTS CHUNG va PERMISSIONS luon hien thi (khong bi boc trong <details>)', () => {
  const html = readHtml();
  const endpointsChungBlock = html.match(/<section class="card">\s*<h2 class="card-title">ENDPOINTS CHUNG<\/h2>[\s\S]*?<\/section>/);
  assert.ok(endpointsChungBlock, 'ENDPOINTS CHUNG phai la section (luon mo), khong phai details');

  const permissionsBlock = html.match(/<section class="card" id="card-permissions">[\s\S]*?<\/section>/);
  assert.ok(permissionsBlock, 'PERMISSIONS phai la section (luon mo), khong phai details');
});

test('CSS dinh nghia cfg-row hai cot 1fr 2fr', () => {
  assert.match(readCss(), /\.cfg-row\s*\{[^}]*grid-template-columns:\s*1fr\s+2fr/);
});

test('topbar gom ca tabs-left, tabs-right (run-filter-bar) va topbar-right (btn-run, run-breakdown, btn-export-config, btn-import-config)', () => {
  const html = readHtml();
  const topbar = html.match(/<header class="topbar">([\s\S]*?)<\/header>/);
  assert.ok(topbar, 'phai co topbar');
  assert.ok(topbar[1].includes('class="tabs-left"'), 'phai co tabs-left');
  assert.ok(topbar[1].includes('class="tabs-right"'), 'phai co tabs-right');
  assert.ok(topbar[1].includes('id="run-filter-bar"'), 'phai co run-filter-bar');
  assert.ok(topbar[1].includes('id="btn-run"'), 'phai co btn-run');
  assert.ok(topbar[1].includes('id="run-breakdown"'), 'phai co run-breakdown');
  assert.ok(topbar[1].includes('id="btn-export-config"'), 'phai co btn-export-config');
  assert.ok(topbar[1].includes('id="btn-import-config"'), 'phai co btn-import-config');
  assert.ok(!topbar[1].includes('id="token-indicator"'), 'khong duoc co token-indicator');
  assert.ok(!topbar[1].includes('id="btn-reload-token"'), 'khong duoc co btn-reload-token');
});

test('co tab CHECK PERMISSION, panel-perm, nut btn-check-perm va btn-perm-export', () => {
  const html = readHtml();
  assert.ok(html.includes('id="tab-perm"'), 'phai co tab-perm');
  assert.ok(html.includes('id="panel-perm"'), 'phai co panel-perm');
  assert.ok(html.includes('id="btn-check-perm"'), 'phai co nut btn-check-perm');
  assert.ok(html.includes('id="btn-perm-export"'), 'phai co nut btn-perm-export');
  assert.ok(html.includes('id="perm-table"'), 'phai co bang perm-table');
});

test('panel-perm chia split-pane voi bang phan quyen va 2 checkbox loc', () => {
  const html = readHtml();
  assert.ok(html.includes('id="perm-split"'), 'phai co perm-split');
  assert.ok(html.includes('id="perm-split-handle"'), 'phai co perm-split-handle');
  assert.ok(html.includes('id="perm-sheet-table"'), 'phai co bang perm-sheet-table');
  assert.ok(html.includes('id="chk-perm-granted"'), 'phai co checkbox chk-perm-granted');
  assert.ok(html.includes('id="chk-perm-denied"'), 'phai co checkbox chk-perm-denied');
  assert.ok(html.includes('id="btn-perm-col-filter"'), 'phai co nut btn-perm-col-filter');
  assert.ok(html.includes('id="perm-col-popup"'), 'phai co popup perm-col-popup');
});

test('mac dinh mo tab chi tich Khong quyen, bo tich Co quyen', () => {
  const html = readHtml();
  assert.match(html, /id="chk-perm-granted"\s+type="checkbox"\s*\/>/, 'chk-perm-granted phai KHONG co checked mac dinh');
  assert.match(html, /id="chk-perm-denied"\s+type="checkbox"\s+checked\s*\/>/, 'chk-perm-denied phai co checked mac dinh');
});

test('UC2 co du 4 select: cot Name, sheet tham chieu, cot dich, cot khu trung', () => {
  const html = readHtml();
  assert.ok(html.includes('id="sel-permissions-name-col"'), 'phai co sel-permissions-name-col');
  assert.ok(html.includes('id="sel-permissions-endpoint-sheet"'), 'phai co sel-permissions-endpoint-sheet');
  assert.ok(html.includes('id="sel-permissions-endpoint-col"'), 'phai co sel-permissions-endpoint-col');
  assert.ok(html.includes('id="sel-permissions-dedupe-col"'), 'phai co sel-permissions-dedupe-col');
});
