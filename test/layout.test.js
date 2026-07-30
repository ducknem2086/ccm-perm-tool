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

test('cot hep chua CONNECTION, MSISDN, DATE RANGE theo dung thu tu', () => {
  const html = readHtml();
  const col = html.match(/<div class="col col-narrow">([\s\S]*?)<div class="col col-wide">/);
  assert.ok(col, 'phai tim thay cot hep');
  const order = [...col[1].matchAll(/>(CONNECTION|MSISDN|DATE RANGE)/g)].map((m) => m[1]);
  assert.deepEqual(order, ['CONNECTION', 'MSISDN', 'DATE RANGE']);
});

test('cot rong co col-row chua BODY CHUNG va ADVANCED, roi den ENDPOINTS', () => {
  const html = readHtml();
  const col = html.match(/<div class="col col-wide">([\s\S]*?)<\/div>\s*<\/div>/);
  assert.ok(col, 'phai tim thay cot rong');
  assert.ok(col[1].includes('class="col-row"'), 'phai co div col-row');
  assert.ok(!col[1].includes('>HEADERS'), 'khong co card HEADERS');
  assert.ok(col[1].includes('BODY CHUNG'), 'phai co card BODY CHUNG');
  assert.ok(col[1].includes('>ADVANCED'), 'phai co card ADVANCED');
  assert.ok(col[1].includes('id="list-endpoint"'), 'phai co card ENDPOINTS');
  assert.ok(col[1].indexOf('class="col-row"') < col[1].indexOf('id="list-endpoint"'));
});

test('CSS dinh nghia col-row ba cot', () => {
  assert.match(readCss(), /\.col-row\s*\{[^}]*grid-template-columns:\s*1fr\s+1fr\s+1fr/);
});

test('topbar chua topbar-right voi btn-run, run-breakdown, btn-export-config va btn-import-config', () => {
  const html = readHtml();
  const topbar = html.match(/<header class="topbar">([\s\S]*?)<\/header>/);
  assert.ok(topbar, 'phai co topbar');
  assert.ok(topbar[1].includes('id="btn-run"'), 'phai co btn-run');
  assert.ok(topbar[1].includes('id="run-breakdown"'), 'phai co run-breakdown');
  assert.ok(topbar[1].includes('id="btn-export-config"'), 'phai co btn-export-config');
  assert.ok(topbar[1].includes('id="btn-import-config"'), 'phai co btn-import-config');
});

test('tabs header chua tabs-left va tabs-right voi run-filter-bar', () => {
  const html = readHtml();
  const tabs = html.match(/<div class="tabs"[\s\S]*?<\/div>\s*<\/div>/);
  assert.ok(tabs, 'phai co tabs header');
  assert.ok(tabs[0].includes('class="tabs-left"'), 'phai co tabs-left');
  assert.ok(tabs[0].includes('class="tabs-right"'), 'phai co tabs-right');
  assert.ok(tabs[0].includes('id="run-filter-bar"'), 'phai co run-filter-bar');
});

