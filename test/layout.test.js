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
  const gridMatch = html.match(/<div class="input-grid">([\s\S]*?)<div class="actionbar">/);
  assert.ok(gridMatch, 'phai tim thay the <div class="input-grid">');
  const colCount = (gridMatch[1].match(/class="col col-(narrow|wide)"/g) || []).length;
  assert.equal(colCount, 2, 'phai co dung 2 cot trong input-grid');
});

test('CSS dinh nghia grid 300px 1fr cho input-grid', () => {
  assert.match(readCss(), /grid-template-columns:\s*300px\s+1fr/);
});

test('cot hep chua CONNECTION, MSISDN, DATE RANGE, QUERY PARAMS theo dung thu tu', () => {
  const html = readHtml();
  const col = html.match(/<div class="col col-narrow">([\s\S]*?)<div class="col col-wide">/);
  assert.ok(col, 'phai tim thay cot hep');
  const order = [...col[1].matchAll(/>(CONNECTION|MSISDN|DATE RANGE|QUERY PARAMS)/g)].map((m) => m[1]);
  assert.deepEqual(order, ['CONNECTION', 'MSISDN', 'DATE RANGE', 'QUERY PARAMS']);
});

test('cot rong co col-row chua BODY CHUNG va ADVANCED, roi den ENDPOINTS', () => {
  const html = readHtml();
  const col = html.match(/<div class="col col-wide">([\s\S]*?)<div class="actionbar">/);
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
