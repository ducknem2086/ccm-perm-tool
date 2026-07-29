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
