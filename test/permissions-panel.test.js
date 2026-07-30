import test from 'node:test';
import assert from 'node:assert/strict';
import { MockElement, installMockDocument } from './helpers/mock-dom.js';
import { state, defaultConfig, notify } from '../public/js/state.js';
import { initPermissionsPanel } from '../public/js/ui/permissions-panel.js';

function setup(permissionFile = { filename: '', headers: [], rows: [] }) {
  const btnImport = new MockElement('button', 'btn-import-permissions');
  const fileInfo = new MockElement('span', 'permissions-file-info');
  const mappingArea = new MockElement('div', 'permissions-mapping-area');
  const selNameCol = new MockElement('select', 'sel-permissions-name-col');
  const selTargetSheet = new MockElement('select', 'sel-permissions-target-sheet');
  const usecase1Table = new MockElement('div', 'permissions-usecase1-table');
  const btnAddMapping = new MockElement('button', 'btn-permissions-add-usecase1');

  installMockDocument({
    'btn-import-permissions': btnImport,
    'permissions-file-info': fileInfo,
    'permissions-mapping-area': mappingArea,
    'sel-permissions-name-col': selNameCol,
    'sel-permissions-target-sheet': selTargetSheet,
    'permissions-usecase1-table': usecase1Table,
    'btn-permissions-add-usecase1': btnAddMapping,
  });

  Object.assign(state, defaultConfig());
  state.permissionFile = permissionFile;
  state.permissionMapping = {
    usecase1: [],
    usecase2: { permissionColumn: '', targetSheet: 'all' }
  };
  state.endpoints = [
    { sheetName: 'SheetA', method: 'GET', pathTemplate: '/api/a' },
    { sheetName: 'SheetB', method: 'POST', pathTemplate: '/api/b' }
  ];
  state.auths = [{ id: 'a1', name: 'AUTH_1' }, { id: 'a2', name: 'AUTH_2' }];

  initPermissionsPanel();

  return { btnImport, fileInfo, mappingArea, selNameCol, selTargetSheet, usecase1Table, btnAddMapping };
}

test('hien thi mac dinh khi chưa nap file', () => {
  const { fileInfo, mappingArea } = setup();
  assert.equal(fileInfo.textContent, 'chưa nạp file');
  assert.equal(mappingArea.hidden, true);
});

test('hien thi thông tin khi đă nap file va populate selectors', () => {
  const { fileInfo, mappingArea, selNameCol, selTargetSheet } = setup({
    filename: 'permissions.xlsx',
    headers: ['Role', 'User', 'Scope'],
    rows: []
  });

  assert.equal(fileInfo.textContent, 'permissions.xlsx');
  assert.equal(mappingArea.hidden, false);
  assert.equal(selNameCol.children.length, 3);
  assert.equal(selNameCol.value, 'Role');
  // 'all' + 2 sheets ('SheetA', 'SheetB')
  assert.equal(selTargetSheet.children.length, 3);
});

test('them va xoa usecase 1 mapping row', () => {
  const { btnAddMapping, usecase1Table } = setup({
    filename: 'permissions.xlsx',
    headers: ['Role', 'User'],
    rows: []
  });

  btnAddMapping.click();

  assert.equal(state.permissionMapping.usecase1.length, 1);
  assert.equal(usecase1Table.children.length, 1);

  // Click delete button on the row
  const row = usecase1Table.children[0];
  const delBtn = row.children.find(c => c.tagName === 'BUTTON');
  assert.ok(delBtn);
  delBtn.click();

  assert.equal(state.permissionMapping.usecase1.length, 0);
  assert.equal(usecase1Table.children.length, 0);
});

test('thay doi usecase 2 selectors cap nhat state', () => {
  const { selNameCol, selTargetSheet } = setup({
    filename: 'permissions.xlsx',
    headers: ['Role', 'User'],
    rows: []
  });

  selNameCol.change('User');
  assert.equal(state.permissionMapping.usecase2.permissionColumn, 'User');

  selTargetSheet.change('SheetA');
  assert.equal(state.permissionMapping.usecase2.targetSheet, 'SheetA');
});
