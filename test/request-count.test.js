import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countRequests } from '../public/js/shared/request-count.js';

const st = (endpoints, msisdns = ['0912345678', '0913000111']) => ({ endpoints, msisdns });

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
