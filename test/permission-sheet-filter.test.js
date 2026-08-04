import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  identifierColumnIndex,
  rowHasPermission, emptySheetFilter, applySheetFilter, visibleIdentifierValues,
} from '../public/js/shared/permission-sheet-filter.js';

test('identifierColumnIndex tra ve vi tri cot Name cua UC2', () => {
  const headers = ['BE Name', 'Action BE', 'Name'];
  assert.equal(identifierColumnIndex(headers, { permissionColumn: 'Name' }), 2);
});

test('identifierColumnIndex tra ve -1 khi chua chon hoac cot da mat', () => {
  const headers = ['BE Name'];
  assert.equal(identifierColumnIndex(headers, {}), -1);
  assert.equal(identifierColumnIndex(headers, { permissionColumn: 'Khong ton tai' }), -1);
});

test('rowHasPermission nhan x, X, co khoang trang', () => {
  assert.equal(rowHasPermission(['a', 'x'], [1]), true);
  assert.equal(rowHasPermission(['a', 'X'], [1]), true);
  assert.equal(rowHasPermission(['a', ' x '], [1]), true);
});

test('rowHasPermission tu choi rong, null, gia tri khac x', () => {
  assert.equal(rowHasPermission(['a', ''], [1]), false);
  assert.equal(rowHasPermission(['a', null], [1]), false);
  assert.equal(rowHasPermission(['a', '-'], [1]), false);
});

test('rowHasPermission dung khi it nhat mot trong nhieu cot role co x', () => {
  assert.equal(rowHasPermission(['a', '', 'x'], [1, 2]), true);
});

test('rowHasPermission roleIdxs rong luon false', () => {
  assert.equal(rowHasPermission(['x', 'x'], []), false);
});

test('emptySheetFilter mac dinh ca hai checkbox deu true, search rong', () => {
  assert.deepEqual(emptySheetFilter(), { granted: true, denied: true, search: '' });
});

test('applySheetFilter ca hai tich thi giu du dong, kem index goc', () => {
  const rows = [['a', 'x'], ['b', '']];
  const out = applySheetFilter(rows, [1], emptySheetFilter());
  assert.deepEqual(out, [
    { row: ['a', 'x'], index: 0, granted: true },
    { row: ['b', ''], index: 1, granted: false },
  ]);
});

test('applySheetFilter chi granted thi chi giu dong co quyen', () => {
  const rows = [['a', 'x'], ['b', '']];
  const out = applySheetFilter(rows, [1], { granted: true, denied: false });
  assert.deepEqual(out.map((r) => r.index), [0]);
});

test('applySheetFilter chi denied thi chi giu dong khong quyen', () => {
  const rows = [['a', 'x'], ['b', '']];
  const out = applySheetFilter(rows, [1], { granted: false, denied: true });
  assert.deepEqual(out.map((r) => r.index), [1]);
});

test('applySheetFilter khong tich gi thi rong', () => {
  const rows = [['a', 'x'], ['b', '']];
  const out = applySheetFilter(rows, [1], { granted: false, denied: false });
  assert.deepEqual(out, []);
});

test('applySheetFilter search loc theo cot dinh danh (idIdx), khong phan biet hoa thuong', () => {
  const rows = [['Tra cuu thue bao', 'x'], ['Doi SIM', ''], ['Tra cuu goi cuoc', 'x']];
  const out = applySheetFilter(rows, [1], { granted: true, denied: true, search: 'TRA CUU' }, 0);
  assert.deepEqual(out.map((r) => r.row[0]), ['Tra cuu thue bao', 'Tra cuu goi cuoc']);
});

test('applySheetFilter search khong loc tren cot role, chi tren idIdx', () => {
  const rows = [['a', 'x'], ['b', '']];
  const out = applySheetFilter(rows, [1], { granted: true, denied: true, search: 'x' }, 0);
  assert.deepEqual(out, []);
});

test('applySheetFilter bo qua search khi idIdx = -1 (chua chon cot dinh danh)', () => {
  const rows = [['a', 'x'], ['b', '']];
  const out = applySheetFilter(rows, [1], { granted: true, denied: true, search: 'khong khop gi' });
  assert.deepEqual(out.map((r) => r.index), [0, 1]);
});

test('applySheetFilter roleIdxs rong thi moi dong la khong co quyen', () => {
  const rows = [['a', 'x']];
  const out = applySheetFilter(rows, [], { granted: true, denied: false });
  assert.deepEqual(out, []);
  const out2 = applySheetFilter(rows, [], { granted: false, denied: true });
  assert.deepEqual(out2.map((r) => r.index), [0]);
});

test('visibleIdentifierValues gom bename cua dong dang hien, bo rong, khu trung', () => {
  const headers = ['Name', 'Role A'];
  const rows = [['Tra cuu TB', 'x'], ['Doi SIM', ''], ['', 'x'], ['Tra cuu TB', 'x']];
  const uc1 = [{ permissionColumn: 'Role A' }];
  const uc2 = { permissionColumn: 'Name' };
  const out = visibleIdentifierValues(headers, rows, uc1, uc2, emptySheetFilter());
  assert.deepEqual(out, ['Tra cuu TB', 'Doi SIM']);
});

test('visibleIdentifierValues chi granted khi filter denied tat', () => {
  const headers = ['Name', 'Role A'];
  const rows = [['Tra cuu TB', 'x'], ['Doi SIM', '']];
  const uc1 = [{ permissionColumn: 'Role A' }];
  const uc2 = { permissionColumn: 'Name' };
  const out = visibleIdentifierValues(headers, rows, uc1, uc2, { granted: true, denied: false });
  assert.deepEqual(out, ['Tra cuu TB']);
});

test('visibleIdentifierValues tra rong khi chua chon cot Name (UC2)', () => {
  const headers = ['Name', 'Role A'];
  const rows = [['Tra cuu TB', 'x']];
  const out = visibleIdentifierValues(headers, rows, [{ permissionColumn: 'Role A' }], {}, emptySheetFilter());
  assert.deepEqual(out, []);
});
