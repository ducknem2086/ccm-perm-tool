import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countRequests } from '../public/js/shared/request-count.js';

const st = (endpoints, msisdns = ['0912345678', '0913000111'], over = {}) => ({
  endpoints,
  msisdns,
  auths: [{ id: 'a1', name: 'A' }],
  runFilter: { methods: [], msisdnPatterns: [], authIds: [] },
  ...over,
});

test('countRequests nhan endpoint voi so luong msisdn', () => {
  assert.equal(countRequests(st([{ enabled: true, attachMsisdn: true }])), 2);
});

test('countRequests dem 1 cho endpoint attachMsisdn false', () => {
  assert.equal(countRequests(st([{ enabled: true, attachMsisdn: false }])), 1);
});

test('countRequests coi thieu attachMsisdn la true', () => {
  assert.equal(countRequests(st([{ enabled: true }])), 2);
});

test('countRequests bo qua endpoint bi tat', () => {
  assert.equal(countRequests(st([{ enabled: false, attachMsisdn: true }])), 0);
});

test('countRequests cong don nhieu endpoint', () => {
  assert.equal(
    countRequests(st([{ enabled: true, attachMsisdn: true }, { enabled: true, attachMsisdn: false }])),
    3,
  );
});

test('countRequests tra 0 khi danh sach msisdn rong ma endpoint can msisdn', () => {
  assert.equal(countRequests(st([{ enabled: true, attachMsisdn: true }], [])), 0);
});

test('countRequests chiu duoc state rong', () => {
  assert.equal(countRequests({}), 0);
});

test('countRequests nhan them so profile duoc chon', () => {
  const s = st([{ enabled: true, attachMsisdn: true }], ['0912345678', '0913000111'], {
    auths: [{ id: 'a1', name: 'A' }, { id: 'a2', name: 'B' }],
    runFilter: { methods: [], msisdnPatterns: [], authIds: ['a1', 'a2'] },
  });
  assert.equal(countRequests(s), 4);
});

test('countRequests chi dem profile duoc chon trong runFilter', () => {
  const s = st([{ enabled: true, attachMsisdn: true }], ['0912345678', '0913000111'], {
    auths: [{ id: 'a1', name: 'A' }, { id: 'a2', name: 'B' }],
    runFilter: { methods: [], msisdnPatterns: [], authIds: ['a1'] },
  });
  assert.equal(countRequests(s), 2);
});

test('countRequests loc theo method', () => {
  const s = st(
    [{ enabled: true, attachMsisdn: true, method: 'GET' }, { enabled: true, attachMsisdn: true, method: 'POST' }],
    ['0912345678', '0913000111'],
    { runFilter: { methods: ['GET'], msisdnPatterns: [], authIds: [] } },
  );
  assert.equal(countRequests(s), 2);
});

test('countRequests loc theo pattern msisdn', () => {
  const s = st([{ enabled: true, attachMsisdn: true }], ['0912345678', '0913000111'], {
    runFilter: { methods: [], msisdnPatterns: ['0913'], authIds: [] },
  });
  assert.equal(countRequests(s), 1);
});

test('countRequests khong nhan msisdn cho endpoint attachMsisdn false', () => {
  const s = st([{ enabled: true, attachMsisdn: false }], ['0912345678', '0913000111'], {
    auths: [{ id: 'a1', name: 'A' }, { id: 'a2', name: 'B' }],
    runFilter: { methods: [], msisdnPatterns: ['0913'], authIds: ['a1', 'a2'] },
  });
  assert.equal(countRequests(s), 2);
});
