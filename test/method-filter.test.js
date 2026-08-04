import test from 'node:test';
import assert from 'node:assert/strict';
import { installMockDocument } from './helpers/mock-dom.js';
import { state, defaultConfig, notify } from '../public/js/state.js';
import { createMethodFilterGroup } from '../public/js/ui/method-filter.js';

function setup() {
  installMockDocument();
  Object.assign(state, defaultConfig());
  state.endpoints = [
    { id: 'e1', enabled: true, method: 'GET', attachMsisdn: true },
    { id: 'e2', enabled: true, method: 'POST', attachMsisdn: true },
  ];

  const group = createMethodFilterGroup();
  return { group };
}

test('tick method ghi vao runFilter.methods', () => {
  const { group } = setup();
  group.el.querySelector('[data-method=GET]').click();
  assert.deepEqual(state.runFilter.methods, ['GET']);
});

test('bo tick method go khoi runFilter.methods', () => {
  const { group } = setup();
  group.el.querySelector('[data-method=GET]').click();
  group.el.querySelector('[data-method=GET]').click();
  assert.deepEqual(state.runFilter.methods, []);
});

test('moi method hien so endpoint dang bat', () => {
  const { group } = setup();
  const rows = group.el.querySelectorAll('.rf-method').map((n) => n.textContent);
  assert.deepEqual(rows, ['GET (1)', 'POST (1)', 'PUT (0)', 'PATCH (0)', 'DELETE (0)']);
});

test('render lai doc dung checked hien tai tu state', () => {
  const { group } = setup();
  state.runFilter.methods = ['POST'];
  group.render();
  const get = group.el.querySelector('[data-method=GET]');
  const post = group.el.querySelector('[data-method=POST]');
  assert.equal(get.checked, false);
  assert.equal(post.checked, true);
});

test('count doi theo selectedSheet khi notify runtime', () => {
  installMockDocument();
  Object.assign(state, defaultConfig());
  state.endpoints = [
    { id: 'e1', enabled: true, method: 'GET', sheetName: 'Sheet A' },
    { id: 'e2', enabled: true, method: 'POST', sheetName: 'Sheet B' },
    { id: 'e3', enabled: true, method: 'POST', sheetName: 'Sheet B' },
  ];
  state.selectedSheet = 'Sheet A';

  const group = createMethodFilterGroup();
  assert.deepEqual(group.el.querySelectorAll('.rf-method').map((n) => n.textContent), [
    'GET (1)', 'POST (0)', 'PUT (0)', 'PATCH (0)', 'DELETE (0)',
  ]);

  state.selectedSheet = 'Sheet B';
  notify();

  assert.deepEqual(group.el.querySelectorAll('.rf-method').map((n) => n.textContent), [
    'GET (0)', 'POST (2)', 'PUT (0)', 'PATCH (0)', 'DELETE (0)',
  ]);
});
