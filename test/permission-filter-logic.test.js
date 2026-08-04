import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyPermFilter, matchPermRecord, applyPermFilter,
  collectPermStatuses, collectPermCheckStatuses, collectPermAuths, collectPermRoles,
} from '../public/js/shared/permission-filter-logic.js';

function rec(over = {}) {
  return {
    index: 1,
    statusPermission: 'true',
    authName: 'User Profile',
    sheetName: 'Sheet 1',
    pathTemplate: '/api/v1/user',
    endpointName: 'Tra cuu thue bao',
    permissionMatchedName: 'Tra cuu TB',
    response: { status: 200, bodyText: '{"data":"ok"}' },
    oracle: null,
    ...over,
  };
}

test('emptyPermFilter tra ve 10 khoa rong', () => {
  assert.deepEqual(emptyPermFilter(), {
    status: '', permStatus: '', perm: '', auth: '', endpoint: '', role: '', epName: '', permName: '', body: '',
    checkNames: null,
  });
});

test('o rong khong loc gi', () => {
  assert.equal(matchPermRecord(rec(), emptyPermFilter()), true);
});

test('loc theo status', () => {
  const filter = { ...emptyPermFilter(), status: '200' };
  assert.equal(matchPermRecord(rec({ response: { status: 200 } }), filter), true);
  assert.equal(matchPermRecord(rec({ response: { status: 403 } }), filter), false);
});

test('loc theo status N/A khi response.status null', () => {
  const filter = { ...emptyPermFilter(), status: 'N/A' };
  assert.equal(matchPermRecord(rec({ response: { status: null } }), filter), true);
});

// permStatus doc rec.oracle?.status — status THO cua checkPermission, khac
// hoan toan 'perm' (statusPermission da cham diem true/false/empty).
test('loc theo permStatus (status tho cua checkPermission)', () => {
  const filter = { ...emptyPermFilter(), permStatus: '403' };
  assert.equal(matchPermRecord(rec({ oracle: { status: 403 } }), filter), true);
  assert.equal(matchPermRecord(rec({ oracle: { status: 200 } }), filter), false);
});

test('loc theo permStatus N/A khi khong co oracle (endpoint khong khai FUNCTION)', () => {
  const filter = { ...emptyPermFilter(), permStatus: 'N/A' };
  assert.equal(matchPermRecord(rec({ oracle: null }), filter), true);
  assert.equal(matchPermRecord(rec({ oracle: { status: 200 } }), filter), false);
});

test('loc theo permStatus N/A khi co oracle nhung status null (loi mang)', () => {
  const filter = { ...emptyPermFilter(), permStatus: 'N/A' };
  assert.equal(matchPermRecord(rec({ oracle: { status: null } }), filter), true);
});

test('loc theo perm', () => {
  const filter = { ...emptyPermFilter(), perm: 'false' };
  assert.equal(matchPermRecord(rec({ statusPermission: 'false' }), filter), true);
  assert.equal(matchPermRecord(rec({ statusPermission: 'true' }), filter), false);
});

test('loc theo auth (so khop chinh xac)', () => {
  const filter = { ...emptyPermFilter(), auth: 'Admin Profile' };
  assert.equal(matchPermRecord(rec({ authName: 'Admin Profile' }), filter), true);
  assert.equal(matchPermRecord(rec({ authName: 'User Profile' }), filter), false);
});

test('loc theo role (so khop chinh xac)', () => {
  const filter = { ...emptyPermFilter(), role: 'Sheet 2' };
  assert.equal(matchPermRecord(rec({ sheetName: 'Sheet 2' }), filter), true);
  assert.equal(matchPermRecord(rec({ sheetName: 'Sheet 1' }), filter), false);
});

test('loc theo endpoint khop chuoi con khong phan biet hoa thuong', () => {
  const filter = { ...emptyPermFilter(), endpoint: 'USER' };
  assert.equal(matchPermRecord(rec({ pathTemplate: '/api/v1/user' }), filter), true);
  assert.equal(matchPermRecord(rec({ pathTemplate: '/api/v1/report' }), filter), false);
});

test('loc theo epName khop chuoi con khong phan biet hoa thuong', () => {
  const filter = { ...emptyPermFilter(), epName: 'thue bao' };
  assert.equal(matchPermRecord(rec({ endpointName: 'Tra cuu Thue Bao' }), filter), true);
  assert.equal(matchPermRecord(rec({ endpointName: 'Doi SIM' }), filter), false);
});

test('loc theo permName khop chuoi con khong phan biet hoa thuong', () => {
  const filter = { ...emptyPermFilter(), permName: 'tra cuu' };
  assert.equal(matchPermRecord(rec({ permissionMatchedName: 'Tra cuu TB' }), filter), true);
  assert.equal(matchPermRecord(rec({ permissionMatchedName: 'Doi SIM' }), filter), false);
});

test('loc theo body khop chuoi con khong phan biet hoa thuong', () => {
  const filter = { ...emptyPermFilter(), body: 'error' };
  assert.equal(matchPermRecord(rec({ response: { status: 500, bodyText: '{"ERROR":"boom"}' } }), filter), true);
  assert.equal(matchPermRecord(rec({ response: { status: 200, bodyText: '{"data":"ok"}' } }), filter), false);
});

test('loc theo checkNames (tap bename tu nut Check) so khop CHINH XAC sau normalize', () => {
  const filter = { ...emptyPermFilter(), checkNames: new Set(['tra cuu tb', 'doi sim']) };
  assert.equal(matchPermRecord(rec({ permissionMatchedName: 'Tra cuu TB' }), filter), true);
  assert.equal(matchPermRecord(rec({ permissionMatchedName: '  DOI SIM  ' }), filter), true);
  assert.equal(matchPermRecord(rec({ permissionMatchedName: 'Khoa SIM' }), filter), false);
});

test('checkNames khong khop chuoi con — chi khop CHINH XAC', () => {
  const filter = { ...emptyPermFilter(), checkNames: new Set(['tra cuu']) };
  assert.equal(matchPermRecord(rec({ permissionMatchedName: 'Tra cuu TB' }), filter), false);
});

test('checkNames null (mac dinh) khong loc gi', () => {
  assert.equal(matchPermRecord(rec({ permissionMatchedName: null }), emptyPermFilter()), true);
});

test('checkNames ket hop AND voi filter khac', () => {
  const filter = { ...emptyPermFilter(), checkNames: new Set(['tra cuu tb']), auth: 'Admin Profile' };
  assert.equal(matchPermRecord(rec({ permissionMatchedName: 'Tra cuu TB', authName: 'User Profile' }), filter), false);
  assert.equal(matchPermRecord(rec({ permissionMatchedName: 'Tra cuu TB', authName: 'Admin Profile' }), filter), true);
});

test('nhieu dieu kien dat cung luc ket hop AND', () => {
  const filter = { ...emptyPermFilter(), perm: 'true', role: 'Sheet 1', auth: 'User Profile' };
  assert.equal(matchPermRecord(rec({ statusPermission: 'true', sheetName: 'Sheet 1', authName: 'User Profile' }), filter), true);
  assert.equal(matchPermRecord(rec({ statusPermission: 'true', sheetName: 'Sheet 2', authName: 'User Profile' }), filter), false);
  assert.equal(matchPermRecord(rec({ statusPermission: 'false', sheetName: 'Sheet 1', authName: 'User Profile' }), filter), false);
});

test('applyPermFilter loc va sap xep theo index', () => {
  const records = [
    rec({ index: 3, statusPermission: 'true' }),
    rec({ index: 1, statusPermission: 'false' }),
    rec({ index: 2, statusPermission: 'true' }),
  ];
  const out = applyPermFilter(records, { ...emptyPermFilter(), perm: 'true' });
  assert.deepEqual(out.map((r) => r.index), [2, 3]);
});

test('collectPermStatuses/Auths/Roles khong lap gia tri', () => {
  const records = [
    rec({ response: { status: 200 }, authName: 'User Profile', sheetName: 'Sheet 1' }),
    rec({ response: { status: 200 }, authName: 'User Profile', sheetName: 'Sheet 1' }),
    rec({ response: { status: 403 }, authName: 'Admin Profile', sheetName: 'Sheet 2' }),
  ];
  assert.deepEqual(collectPermStatuses(records), ['200', '403']);
  assert.deepEqual(collectPermAuths(records), ['Admin Profile', 'User Profile']);
  assert.deepEqual(collectPermRoles(records), ['Sheet 1', 'Sheet 2']);
});

test('collectPermCheckStatuses gom status tho cua oracle, N/A xep cuoi', () => {
  const records = [
    rec({ oracle: { status: 403 } }),
    rec({ oracle: { status: 200 } }),
    rec({ oracle: { status: 200 } }),
    rec({ oracle: null }),
  ];
  assert.deepEqual(collectPermCheckStatuses(records), ['200', '403', 'N/A']);
});
