import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterEndpoints, filterMsisdns, selectedAuths } from '../public/js/shared/run-filter.js';

const eps = [
  { id: 'e1', enabled: true, method: 'GET' },
  { id: 'e2', enabled: true, method: 'POST' },
  { id: 'e3', enabled: false, method: 'GET' },
  { id: 'e4', enabled: true },
];
const msisdns = ['0912345678', '0912000111', '0988123999'];
const auths = [{ id: 'a1', name: 'A' }, { id: 'a2', name: 'B' }];

const ids = (list) => list.map((x) => x.id);

test('filterEndpoints methods rong tra moi endpoint dang bat', () => {
  assert.deepEqual(ids(filterEndpoints(eps, { methods: [] })), ['e1', 'e2', 'e4']);
});

test('filterEndpoints loai endpoint bi tat ke ca khi method khop', () => {
  assert.deepEqual(ids(filterEndpoints(eps, { methods: ['GET'] })), ['e1', 'e4']);
});

test('filterEndpoints khong phan biet hoa thuong', () => {
  assert.deepEqual(ids(filterEndpoints(eps, { methods: ['get', 'post'] })), ['e1', 'e2', 'e4']);
});

test('filterEndpoints coi endpoint thieu method la GET', () => {
  assert.deepEqual(ids(filterEndpoints(eps, { methods: ['POST'] })), ['e2']);
});

test('filterEndpoints chiu duoc runFilter undefined', () => {
  assert.deepEqual(ids(filterEndpoints(eps, undefined)), ['e1', 'e2', 'e4']);
});

test('filterMsisdns patterns rong tra tat ca', () => {
  assert.deepEqual(filterMsisdns(msisdns, { msisdnPatterns: [] }), msisdns);
});

test('filterMsisdns khop include chu khong phai bang tuyet doi', () => {
  assert.deepEqual(filterMsisdns(msisdns, { msisdnPatterns: ['0912'] }), ['0912345678', '0912000111']);
});

test('filterMsisdns nhieu pattern khop kieu OR', () => {
  assert.deepEqual(
    filterMsisdns(msisdns, { msisdnPatterns: ['345678', '0988'] }),
    ['0912345678', '0988123999'],
  );
});

test('filterMsisdns bo qua pattern chi co khoang trang', () => {
  assert.deepEqual(filterMsisdns(msisdns, { msisdnPatterns: ['   '] }), msisdns);
});

test('filterMsisdns khong khop gi tra mang rong', () => {
  assert.deepEqual(filterMsisdns(msisdns, { msisdnPatterns: ['0777'] }), []);
});

test('selectedAuths authIds rong tra tat ca profile', () => {
  assert.deepEqual(ids(selectedAuths(auths, { authIds: [] })), ['a1', 'a2']);
});

test('selectedAuths loc dung profile duoc chon', () => {
  assert.deepEqual(ids(selectedAuths(auths, { authIds: ['a2'] })), ['a2']);
});

test('selectedAuths bo qua id khong con ton tai', () => {
  assert.deepEqual(ids(selectedAuths(auths, { authIds: ['a2', 'a-da-xoa'] })), ['a2']);
});

test('selectedAuths toan id khong ton tai tra mang rong chu khong tra tat ca', () => {
  assert.deepEqual(selectedAuths(auths, { authIds: ['x'] }), []);
});

test('ba ham chiu duoc dau vao undefined', () => {
  assert.deepEqual(filterEndpoints(undefined, {}), []);
  assert.deepEqual(filterMsisdns(undefined, {}), []);
  assert.deepEqual(selectedAuths(undefined, {}), []);
});
