import test from 'node:test';
import assert from 'node:assert/strict';
import { MockElement, installMockDocument } from './helpers/mock-dom.js';
import { state, defaultConfig, makeAuth } from '../public/js/state.js';
import { initAuthsPanel } from '../public/js/ui/auths-panel.js';

function setup(auths) {
  const list = new MockElement('div', 'auths-list');
  const addBtn = new MockElement('button', 'btn-add-auth');
  const badge = new MockElement('span', 'tab-auths-badge');
  installMockDocument({ 'auths-list': list, 'btn-add-auth': addBtn, 'tab-auths-badge': badge });

  Object.assign(state, defaultConfig());
  state.auths = auths ?? [makeAuth({ name: 'PROD', token: 'T1' })];
  state.runFilter = { methods: [], msisdnPatterns: [], authIds: [] };

  const panel = initAuthsPanel();
  return { list, addBtn, badge, panel };
}

const cards = (list) => list.querySelectorAll('.auth-card');

test('render mot the cho moi profile', () => {
  const { list } = setup([makeAuth({ name: 'A' }), makeAuth({ name: 'B' })]);
  assert.equal(cards(list).length, 2);
});

test('them profile sinh id khac nhau', () => {
  const { list, addBtn } = setup();
  addBtn.click();
  assert.equal(state.auths.length, 2);
  assert.notEqual(state.auths[0].id, state.auths[1].id);
  assert.equal(cards(list).length, 2);
});

test('sua o ten ghi vao state', () => {
  const { list } = setup();
  list.querySelector('.auth-name').input('UAT');
  assert.equal(state.auths[0].name, 'UAT');
});

test('ten rong danh dau is-invalid', () => {
  const { list } = setup();
  const input = list.querySelector('.auth-name');
  input.input('   ');
  assert.equal(list.querySelector('.auth-name').classList.contains('is-invalid'), true);
});

test('ten trung danh dau is-invalid o ca hai the', () => {
  const { list } = setup([makeAuth({ name: 'A' }), makeAuth({ name: 'A' })]);
  const names = list.querySelectorAll('.auth-name');
  assert.equal(names[0].classList.contains('is-invalid'), true);
  assert.equal(names[1].classList.contains('is-invalid'), true);
});

test('nhan ban giu credential va them hau to copy', () => {
  const { list } = setup([makeAuth({ name: 'PROD', token: 'T1', cookie: 'C1' })]);
  list.querySelector('.auth-dup').click();

  assert.equal(state.auths.length, 2);
  assert.equal(state.auths[1].name, 'PROD (copy)');
  assert.equal(state.auths[1].token, 'T1');
  assert.equal(state.auths[1].cookie, 'C1');
  assert.notEqual(state.auths[1].id, state.auths[0].id);
});

test('khong xoa duoc profile cuoi cung', () => {
  const { list } = setup([makeAuth({ name: 'A' })]);
  const del = list.querySelector('.auth-del');
  assert.equal(del.disabled, true);
  del.click();
  assert.equal(state.auths.length, 1);
});

test('xoa profile go luon id khoi runFilter.authIds', () => {
  const a = makeAuth({ name: 'A' });
  const b = makeAuth({ name: 'B' });
  const { list } = setup([a, b]);
  state.runFilter.authIds = [a.id, b.id];

  list.querySelectorAll('.auth-del')[0].click();

  assert.equal(state.auths.length, 1);
  assert.deepEqual(state.runFilter.authIds, [b.id]);
});

test('doi sang mode curl hien textarea va an ba o rieng', () => {
  const { list } = setup();
  list.querySelector('.auth-card').querySelector('[data-mode=curl]').click();

  assert.equal(state.auths[0].mode, 'curl');
  const card = list.querySelector('.auth-card');
  assert.ok(card.querySelector('textarea'));
  assert.equal(card.querySelector('.auth-token'), null);
});

test('doi mode qua lai khong mat du lieu o mode kia', () => {
  const { list } = setup([makeAuth({ name: 'A', token: 'T1', curlRaw: "curl -H 'a: b'" })]);
  const card = () => list.querySelector('.auth-card');

  card().querySelector('[data-mode=curl]').click();
  assert.equal(state.auths[0].token, 'T1');

  card().querySelector('[data-mode=fields]').click();
  assert.equal(state.auths[0].curlRaw, "curl -H 'a: b'");
});

test('mode curl dem so header parse duoc', () => {
  const { list } = setup([makeAuth({
    name: 'A', mode: 'curl',
    curlRaw: "curl 'https://x' -H 'Authorization: Bearer z' -H 'X-Tenant: vnpt'",
  })]);
  assert.ok(list.querySelector('.auth-curl-count').textContent.includes('2'));
});

test('badge tren tab hien so profile', () => {
  const { badge } = setup([makeAuth({ name: 'A' }), makeAuth({ name: 'B' })]);
  assert.equal(badge.textContent, '2');
});
