import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  roleColumnIndexes, roleColumns, identifierColumnIndex,
  rowHasPermission, emptySheetFilter, applySheetFilter,
} from '../public/js/shared/permission-sheet-filter.js';

test('roleColumnIndexes tra ve chi so cot theo UC1 mapping', () => {
  const headers = ['BE Name', 'Action BE', 'Name', 'ĐTV đối tác', 'Trưởng ca'];
  const uc1 = [
    { permissionColumn: 'ĐTV đối tác' },
    { permissionColumn: 'Trưởng ca' },
  ];
  assert.deepEqual(roleColumnIndexes(headers, uc1), [3, 4]);
});

test('roleColumnIndexes bo cot khong ton tai trong headers', () => {
  const headers = ['BE Name', 'ĐTV đối tác'];
  const uc1 = [{ permissionColumn: 'ĐTV đối tác' }, { permissionColumn: 'Cot da mat' }];
  assert.deepEqual(roleColumnIndexes(headers, uc1), [1]);
});

test('roleColumnIndexes khu trung khi hai mapping cung cot', () => {
  const headers = ['BE Name', 'ĐTV đối tác'];
  const uc1 = [{ permissionColumn: 'ĐTV đối tác' }, { permissionColumn: 'ĐTV đối tác' }];
  assert.deepEqual(roleColumnIndexes(headers, uc1), [1]);
});

test('roleColumnIndexes rong khi uc1 rong', () => {
  assert.deepEqual(roleColumnIndexes(['a', 'b'], []), []);
});

test('roleColumns tra ve {index,name} theo thu tu header, khu trung', () => {
  const headers = ['BE Name', 'Action BE', 'Name', 'ĐTV đối tác', 'Trưởng ca'];
  const uc1 = [
    { permissionColumn: 'Trưởng ca' },
    { permissionColumn: 'ĐTV đối tác' },
    { permissionColumn: 'ĐTV đối tác' },
  ];
  assert.deepEqual(roleColumns(headers, uc1), [
    { index: 3, name: 'ĐTV đối tác' },
    { index: 4, name: 'Trưởng ca' },
  ]);
});

test('roleColumns bo cot khong ton tai', () => {
  const headers = ['BE Name', 'ĐTV đối tác'];
  const uc1 = [{ permissionColumn: 'ĐTV đối tác' }, { permissionColumn: 'Cot da mat' }];
  assert.deepEqual(roleColumns(headers, uc1), [{ index: 1, name: 'ĐTV đối tác' }]);
});

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

test('emptySheetFilter mac dinh ca hai deu true', () => {
  assert.deepEqual(emptySheetFilter(), { granted: true, denied: true });
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

test('applySheetFilter roleIdxs rong thi moi dong la khong co quyen', () => {
  const rows = [['a', 'x']];
  const out = applySheetFilter(rows, [], { granted: true, denied: false });
  assert.deepEqual(out, []);
  const out2 = applySheetFilter(rows, [], { granted: false, denied: true });
  assert.deepEqual(out2.map((r) => r.index), [0]);
});
