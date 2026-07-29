import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDate, splitRangeInput, validateRange, formatDate, DATE_FORMATS
} from '../src/server/date-format.js';

test('parseDate nhan ngay hop le', () => {
  const d = parseDate('25/03/2026');
  assert.equal(d.getUTCFullYear(), 2026);
  assert.equal(d.getUTCMonth(), 2);
  assert.equal(d.getUTCDate(), 25);
});

test('parseDate tu choi ngay khong ton tai', () => {
  assert.equal(parseDate('32/01/2026'), null);
  assert.equal(parseDate('29/02/2025'), null);
  assert.equal(parseDate('01/13/2026'), null);
  assert.equal(parseDate('1/3/2026'), null);
  assert.equal(parseDate('abc'), null);
});

test('parseDate chap nhan nam nhuan', () => {
  assert.notEqual(parseDate('29/02/2024'), null);
});

test('splitRangeInput tach dung chuoi daterange', () => {
  const r = splitRangeInput('25/03/2026-01/04/2026');
  assert.equal(r.ok, true);
  assert.equal(r.from, '25/03/2026');
  assert.equal(r.to, '01/04/2026');
});

test('splitRangeInput bo qua khoang trang thua', () => {
  const r = splitRangeInput('  25/03/2026 - 01/04/2026  ');
  assert.equal(r.ok, true);
  assert.equal(r.from, '25/03/2026');
  assert.equal(r.to, '01/04/2026');
});

test('splitRangeInput bao loi khi thieu dau gach', () => {
  assert.equal(splitRangeInput('25/03/2026').ok, false);
});

test('validateRange tu choi khi from lon hon to', () => {
  const r = validateRange('01/04/2026', '25/03/2026');
  assert.equal(r.ok, false);
  assert.match(r.error, /trước|bằng|truoc|bang|sau/i);
});

test('validateRange chap nhan from bang to', () => {
  assert.equal(validateRange('25/03/2026', '25/03/2026').ok, true);
});

test('formatDate xuat dung ca ba dinh dang', () => {
  const d = parseDate('05/03/2026');
  assert.equal(formatDate(d, 'ddMMyyyy'), '05032026');
  assert.equal(formatDate(d, 'dd/MM/yyyy'), '05/03/2026');
  assert.equal(formatDate(d, 'yyyy-MM-dd'), '2026-03-05');
});

test('DATE_FORMATS liet ke du ba dinh dang', () => {
  assert.deepEqual(DATE_FORMATS, ['ddMMyyyy', 'dd/MM/yyyy', 'yyyy-MM-dd']);
});
