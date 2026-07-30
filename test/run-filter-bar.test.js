import test from 'node:test';
import assert from 'node:assert/strict';
import { MockElement, installMockDocument } from './helpers/mock-dom.js';
import { state, defaultConfig, makeAuth } from '../public/js/state.js';
import { initRunFilterBar } from '../public/js/ui/run-filter-bar.js';

function setup(over = {}) {
  const host = new MockElement('div', 'run-filter-bar');
  const breakdown = new MockElement('span', 'run-breakdown');
  installMockDocument({ 'run-filter-bar': host, 'run-breakdown': breakdown });

  Object.assign(state, defaultConfig());
  state.msisdns = ['0912345678', '0912000111', '0988123999'];
  state.endpoints = [
    { id: 'e1', enabled: true, method: 'GET', attachMsisdn: true },
    { id: 'e2', enabled: true, method: 'POST', attachMsisdn: true },
  ];
  state.auths = [makeAuth({ name: 'PROD' }), makeAuth({ name: 'UAT' })];
  Object.assign(state, over);

  const bar = initRunFilterBar();
  return { host, breakdown, bar };
}

test('go vao o msisdn hien goi y cac so chua chuoi do', () => {
  const { host } = setup();
  host.querySelector('.rf-msisdn-input').input('0912');
  const items = host.querySelectorAll('.rf-suggest-item');
  assert.equal(items.length, 2);
  assert.ok(items[0].textContent.includes('0912345678'));
});

test('bam goi y tao chip la so day du', () => {
  const { host } = setup();
  host.querySelector('.rf-msisdn-input').input('0912');
  host.querySelectorAll('.rf-suggest-item')[0].click();
  assert.deepEqual(state.runFilter.msisdnPatterns, ['0912345678']);
});

test('Enter khong tro goi y tao chip la chuoi dang go', () => {
  const { host } = setup();
  const input = host.querySelector('.rf-msisdn-input');
  input.value = '0912';
  input.keydown('Enter');
  assert.deepEqual(state.runFilter.msisdnPatterns, ['0912']);
});

test('chip trung khong them hai lan', () => {
  const { host } = setup();
  const input = () => host.querySelector('.rf-msisdn-input');
  input().value = '0912';
  input().keydown('Enter');
  input().value = '0912';
  input().keydown('Enter');
  assert.deepEqual(state.runFilter.msisdnPatterns, ['0912']);
});

test('chip mau hien so khop khi khop nhieu hon mot', () => {
  const { host } = setup();
  const input = host.querySelector('.rf-msisdn-input');
  input.value = '0912';
  input.keydown('Enter');
  assert.ok(host.querySelector('.rf-chip').textContent.includes('(2)'));
});

test('Backspace o o rong xoa chip cuoi', () => {
  const { host } = setup({ runFilter: { methods: [], msisdnPatterns: ['0912', '0988'], authIds: [] } });
  const input = host.querySelector('.rf-msisdn-input');
  input.value = '';
  input.keydown('Backspace');
  assert.deepEqual(state.runFilter.msisdnPatterns, ['0912']);
});

test('bam x tren chip xoa dung chip do', () => {
  const { host } = setup({ runFilter: { methods: [], msisdnPatterns: ['0912', '0988'], authIds: [] } });
  host.querySelectorAll('.rf-chip-del')[0].click();
  assert.deepEqual(state.runFilter.msisdnPatterns, ['0988']);
});

test('chon auth luu id chu khong luu name', () => {
  const { host } = setup();
  const id = state.auths[1].id;
  host.querySelector(`[data-auth="${id}"]`).click();
  assert.deepEqual(state.runFilter.authIds, [id]);
});

test('chua chon auth nao thi hien chip chua chon (0)', () => {
  const { host } = setup();
  assert.ok(host.querySelector('.rf-auth-none').textContent.includes('chưa chọn (0)'));
});

test('dong phan ra hien dung ba thua so', () => {
  const auths = [{ id: 'a1', name: 'PROD' }, { id: 'a2', name: 'UAT' }];
  const { breakdown } = setup({ auths, runFilter: { methods: [], msisdnPatterns: [], authIds: ['a1', 'a2'] } });
  assert.equal(breakdown.textContent, '2 endpoint × 3 msisdn × 2 auth');
});

test('dong phan ra cap nhat sau khi loc', () => {
  // Filter method gio nam o endpoint-list.js (canh o tim ten), nhung van ghi
  // vao cung state.runFilter.methods ma run-filter-bar doc de tinh dong phan ra.
  const auths = [{ id: 'a1', name: 'PROD' }, { id: 'a2', name: 'UAT' }];
  const { bar, breakdown } = setup({ auths, runFilter: { methods: [], msisdnPatterns: [], authIds: ['a1', 'a2'] } });
  state.runFilter.methods = ['GET'];
  bar.render();
  assert.equal(breakdown.textContent, '1 endpoint × 3 msisdn × 2 auth');
});
