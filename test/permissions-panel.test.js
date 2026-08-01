import test from 'node:test';
import assert from 'node:assert/strict';
import { MockElement, installMockDocument } from './helpers/mock-dom.js';
import { state, defaultConfig, notify } from '../public/js/state.js';
import { initPermissionsPanel } from '../public/js/ui/permissions-panel.js';

// Nhan permissionFile dang phang (headers/rows) cho gon roi dung thanh sheets —
// state khong con hai khoa do, panel doc qua draftSheet().
function toSheets(pf) {
  if (Array.isArray(pf.sheets) && pf.sheets.length > 0) {
    return { sheets: pf.sheets, selectedSheet: pf.selectedSheet ?? pf.sheets[0].name };
  }
  if (!pf.filename) return { sheets: [], selectedSheet: '' };
  return {
    sheets: [{ name: 'Default', headers: pf.headers ?? [], rows: pf.rows ?? [] }],
    selectedSheet: 'Default',
  };
}

function setup(permissionFile = { filename: '', sheets: [], selectedSheet: '' }) {
  const btnImport = new MockElement('button', 'btn-import-permissions');
  const fileInfo = new MockElement('span', 'permissions-file-info');
  const wrapFileSheet = new MockElement('label', 'wrap-permissions-file-sheet');
  const mappingArea = new MockElement('div', 'permissions-mapping-area');
  const selFileSheet = new MockElement('select', 'sel-permissions-file-sheet');
  const selNameCol = new MockElement('select', 'sel-permissions-name-col');
  const selEndpointSheet = new MockElement('select', 'sel-permissions-endpoint-sheet');
  const selEndpointCol = new MockElement('select', 'sel-permissions-endpoint-col');
  const usecase1Table = new MockElement('div', 'permissions-usecase1-table');
  const btnAddMapping = new MockElement('button', 'btn-permissions-add-usecase1');
  const btnSave = new MockElement('button', 'btn-permissions-save');
  const btnDelete = new MockElement('button', 'btn-permissions-delete');
  const dirtyBadge = new MockElement('span', 'perm-dirty-badge');
  const saveErrors = new MockElement('p', 'perm-save-errors');

  installMockDocument({
    'btn-permissions-save': btnSave,
    'btn-permissions-delete': btnDelete,
    'perm-dirty-badge': dirtyBadge,
    'perm-save-errors': saveErrors,
    'btn-import-permissions': btnImport,
    'permissions-file-info': fileInfo,
    'wrap-permissions-file-sheet': wrapFileSheet,
    'permissions-mapping-area': mappingArea,
    'sel-permissions-file-sheet': selFileSheet,
    'sel-permissions-name-col': selNameCol,
    'sel-permissions-endpoint-sheet': selEndpointSheet,
    'sel-permissions-endpoint-col': selEndpointCol,
    'permissions-usecase1-table': usecase1Table,
    'btn-permissions-add-usecase1': btnAddMapping,
  });

  // Panel goi window.ccmToast?.() sau khi Luu — mock-dom khong dung window.
  globalThis.window = globalThis.window ?? {};

  Object.assign(state, defaultConfig());
  state.permissionFile = { filename: permissionFile.filename ?? '', ...toSheets(permissionFile) };
  state.savedConfig.permissionSheet = state.permissionFile.selectedSheet;
  state.permissionMapping = {
    usecase1: [],
    usecase2: { permissionColumn: '', columnSheet: '', endpointColumn: '' }
  };
  state.endpoints = [
    { sheetName: 'SheetA', method: 'GET', pathTemplate: '/api/a' },
    { sheetName: 'SheetB', method: 'POST', pathTemplate: '/api/b' }
  ];
  state.auths = [{ id: 'a1', name: 'AUTH_1' }, { id: 'a2', name: 'AUTH_2' }];

  initPermissionsPanel();

  return {
    btnImport, fileInfo, mappingArea, selFileSheet, selNameCol,
    selEndpointSheet, selEndpointCol, usecase1Table, btnAddMapping,
    btnSave, btnDelete, dirtyBadge, saveErrors,
  };
}

test('hien thi mac dinh khi chưa nap file', () => {
  const { fileInfo, mappingArea } = setup();
  assert.equal(fileInfo.textContent, 'chưa nạp file');
  assert.equal(mappingArea.hidden, true);
});

test('hien thi thông tin khi đă nap file va populate selectors', () => {
  const { fileInfo, mappingArea, selNameCol } = setup({
    filename: 'permissions.xlsx',
    headers: ['Role', 'User', 'Scope'],
    rows: []
  });

  assert.equal(fileInfo.textContent, 'permissions.xlsx');
  assert.equal(mappingArea.hidden, false);
  assert.equal(selNameCol.children.length, 3);
  assert.equal(selNameCol.value, 'Role');
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
  const { selNameCol } = setup({
    filename: 'permissions.xlsx',
    headers: ['Role', 'User'],
    rows: []
  });

  selNameCol.change('User');
  assert.equal(state.permissionMapping.usecase2.permissionColumn, 'User');
});

test('thay doi sheet file phan quyen cap nhat headers, rows va dropdowns', () => {
  const sheets = [
    { name: 'Sheet1', headers: ['HeaderA1', 'HeaderA2'], rows: [['1', '2']] },
    { name: 'Sheet2', headers: ['HeaderB1', 'HeaderB2', 'HeaderB3'], rows: [['x', 'y', 'z']] }
  ];
  const { selFileSheet, selNameCol } = setup({
    filename: 'multi_perm.xlsx',
    sheets,
    selectedSheet: 'Sheet1',
    headers: sheets[0].headers,
    rows: sheets[0].rows
  });

  assert.equal(selFileSheet.children.length, 2);
  assert.equal(selFileSheet.value, 'Sheet1');
  assert.equal(selNameCol.children.length, 2);
  assert.equal(selNameCol.children[0].value, 'HeaderA1');

  selFileSheet.change('Sheet2');

  // Doi sheet chi dong vao BAN NHAP — ban da luu van tro Sheet1 toi khi bam Luu.
  assert.equal(state.permissionFile.selectedSheet, 'Sheet2');
  assert.equal(state.savedConfig.permissionSheet, 'Sheet1');
  assert.equal(selNameCol.children.length, 3);
  assert.equal(selNameCol.children[0].value, 'HeaderB1');
});

// Pham vi quet CHECK PERM khong con do UC1 quyet dinh, nen picker sheet tham
// chieu liet ke MOI sheet co endpoint — UC1 rong khong lam no rong theo.
test('UC1 rong: sheet tham chieu van liet ke moi sheet co endpoint', () => {
  const { selEndpointSheet, selEndpointCol } = setup({
    filename: 'permissions.xlsx', headers: ['API Name'], rows: [],
  });
  assert.deepEqual(selEndpointSheet.children.map((o) => o.value), ['SheetA', 'SheetB']);
  // Endpoint cua fixture khong co raw nen khong sinh cot nao.
  assert.equal(selEndpointCol.children.length, 0);
});

test('sheet tham chieu liet ke ca sheet khong dong UC1 nao khai', () => {
  const { selEndpointSheet } = setup({
    filename: 'permissions.xlsx', headers: ['API Name'], rows: [],
  });
  state.endpoints = [
    { sheetName: 'Sheet 1', raw: { A: '1' } },
    { sheetName: 'Sheet 2', raw: { B: '2' } },
  ];
  state.permissionMapping.usecase1 = [
    { endpointSheet: 'Sheet 1', permissionColumn: 'API Name', authProfileName: 'X' },
  ];
  notify();

  assert.deepEqual(selEndpointSheet.children.map((o) => o.value), ['Sheet 1', 'Sheet 2']);
});

test('UC1 khai 2 sheet: sheet tham chieu mac dinh la sheet UC1 dau tien, cot lay tu sheet do', () => {
  const { selEndpointSheet, selEndpointCol } = setup({
    filename: 'permissions.xlsx', headers: ['API Name'], rows: [],
  });
  state.endpoints = [
    { sheetName: 'Sheet 1', raw: { 'Ten API': 'A', 'Ma CN': 'K1' } },
    { sheetName: 'Sheet 2', raw: { 'Cot Rieng': 'B' } },
  ];
  state.permissionMapping.usecase1 = [
    { endpointSheet: 'Sheet 1', permissionColumn: 'API Name', authProfileName: 'X' },
    { endpointSheet: 'Sheet 2', permissionColumn: 'API Name', authProfileName: 'Y' },
  ];
  notify();

  assert.deepEqual(selEndpointSheet.children.map((c) => c.value), ['Sheet 1', 'Sheet 2']);
  assert.equal(selEndpointSheet.value, 'Sheet 1');
  assert.deepEqual(selEndpointCol.children.map((c) => c.value), ['Ten API', 'Ma CN']);
});

test('doi sheet tham chieu doi option cot, khong doi gia tri cot dang chon', () => {
  const { selEndpointSheet, selEndpointCol } = setup({
    filename: 'permissions.xlsx', headers: ['API Name'], rows: [],
  });
  state.endpoints = [
    { sheetName: 'Sheet 1', raw: { 'Ten API': 'A' } },
    { sheetName: 'Sheet 2', raw: { 'Cot Rieng': 'B' } },
  ];
  state.permissionMapping.usecase1 = [
    { endpointSheet: 'Sheet 1', permissionColumn: 'API Name', authProfileName: 'X' },
    { endpointSheet: 'Sheet 2', permissionColumn: 'API Name', authProfileName: 'Y' },
  ];
  state.permissionMapping.usecase2.endpointColumn = 'Ten API';
  notify();

  selEndpointSheet.change('Sheet 2');

  assert.equal(state.permissionMapping.usecase2.columnSheet, 'Sheet 2');
  assert.equal(state.permissionMapping.usecase2.endpointColumn, 'Ten API');
  assert.deepEqual(selEndpointCol.children.map((c) => c.value), ['Ten API', 'Cot Rieng']);
});

test('cot dang chon khong co trong sheet dang xem: hien option danh dau, gia tri giu nguyen', () => {
  const { selEndpointCol } = setup({
    filename: 'permissions.xlsx', headers: ['API Name'], rows: [],
  });
  state.endpoints = [
    { sheetName: 'Sheet 1', raw: { 'Ten API': 'A' } },
  ];
  state.permissionMapping.usecase1 = [
    { endpointSheet: 'Sheet 1', permissionColumn: 'API Name', authProfileName: 'X' },
  ];
  state.permissionMapping.usecase2.endpointColumn = 'Cot Da Mat';
  notify();

  const marker = selEndpointCol.children.find((c) => c.value === 'Cot Da Mat');
  assert.ok(marker);
  assert.ok(marker.textContent.includes('không có trong sheet này'));
  assert.equal(selEndpointCol.value, 'Cot Da Mat');
});

test('cot Sheet cua dong UC1 khong bi disabled', () => {
  const { usecase1Table } = setup({
    filename: 'permissions.xlsx', headers: ['API Name'], rows: [],
  });
  state.endpoints = [{ sheetName: 'Sheet 1', raw: { A: '1' } }];
  state.permissionMapping.usecase1 = [
    { endpointSheet: 'Sheet 1', permissionColumn: 'API Name', authProfileName: 'AUTH_1' },
  ];
  notify();

  const sheetSel = usecase1Table.children[0].children.filter((c) => c.tagName === 'SELECT')[1];
  assert.equal(sheetSel.disabled, false);
  assert.equal(sheetSel.value, 'Sheet 1');
});

test('columnSheet tro sheet khong dong UC1 nao khai: GIU NGUYEN, khong reset', () => {
  const { selEndpointSheet } = setup({
    filename: 'permissions.xlsx', headers: ['API Name'], rows: [],
  });
  state.endpoints = [
    { sheetName: 'Sheet 1', raw: { A: '1' } },
    { sheetName: 'Sheet 2', raw: { B: '2' } },
  ];
  state.permissionMapping.usecase1 = [
    { endpointSheet: 'Sheet 1', permissionColumn: 'API Name', authProfileName: 'X' },
  ];
  state.permissionMapping.usecase2.columnSheet = 'Sheet 2';
  notify();

  assert.equal(state.permissionMapping.usecase2.columnSheet, 'Sheet 2');
  assert.equal(selEndpointSheet.value, 'Sheet 2');
});

test('columnSheet tro sheet da bien mat khoi file endpoints: render ve sheet dau tien', () => {
  const { selEndpointSheet } = setup({
    filename: 'permissions.xlsx', headers: ['API Name'], rows: [],
  });
  state.endpoints = [
    { sheetName: 'Sheet 1', raw: { A: '1' } },
    { sheetName: 'Sheet 2', raw: { B: '2' } },
  ];
  state.permissionMapping.usecase2.columnSheet = 'Sheet Da Bi Xoa';
  notify();

  assert.equal(state.permissionMapping.usecase2.columnSheet, 'Sheet 1');
  assert.equal(selEndpointSheet.value, 'Sheet 1');
});


/* ---------- doi sheet file phan quyen khong duoc pha cau hinh cot ---------- */

const TWO_SHEETS = () => [
  { name: 'Quyen theo Role', headers: ['BE Name', 'DTV doi tac', 'Truong ca'], rows: [['A', 'x', '']] },
  { name: 'Danh muc', headers: ['Ma', 'Mo ta'], rows: [['M1', 'abc']] },
];

function setupTwoSheets() {
  const sheets = TWO_SHEETS();
  const els = setup({
    filename: 'perm.xlsx',
    sheets,
    selectedSheet: 'Quyen theo Role',
    headers: sheets[0].headers,
    rows: sheets[0].rows,
  });
  state.endpoints = [{ sheetName: 'Sheet 1', raw: { 'Ten API': 'A' } }];
  state.permissionMapping.usecase2.permissionColumn = 'BE Name';
  state.permissionMapping.usecase1 = [
    { endpointSheet: 'Sheet 1', permissionColumn: 'DTV doi tac', authProfileName: 'AUTH_1' },
  ];
  notify();
  return els;
}

test('doi sheet file phan quyen: cot Name UC2 giu nguyen, khong bi ghi de ve header dau', () => {
  const { selFileSheet, selNameCol } = setupTwoSheets();

  selFileSheet.change('Danh muc');

  assert.equal(state.permissionMapping.usecase2.permissionColumn, 'BE Name');
  assert.equal(selNameCol.value, 'BE Name');
  const marker = selNameCol.children.find((c) => c.value === 'BE Name');
  assert.ok(marker, 'phai co option danh dau cho cot da bien mat');
  assert.ok(marker.textContent.includes('không có trong sheet này'));
});

test('doi sheet file phan quyen: cot quyen UC1 giu nguyen, khong bi ghi de ve header dau', () => {
  const { selFileSheet, usecase1Table } = setupTwoSheets();

  selFileSheet.change('Danh muc');

  assert.equal(state.permissionMapping.usecase1[0].permissionColumn, 'DTV doi tac');
  const colSel = usecase1Table.children[0].children.filter((c) => c.tagName === 'SELECT')[0];
  assert.equal(colSel.value, 'DTV doi tac');
  const marker = colSel.children.find((c) => c.value === 'DTV doi tac');
  assert.ok(marker, 'phai co option danh dau cho cot quyen da bien mat');
  assert.ok(marker.textContent.includes('không có trong sheet này'));
});

test('doi sheet roi doi ve sheet cu: cau hinh cot khop lai nguyen ven', () => {
  const { selFileSheet, selNameCol, usecase1Table } = setupTwoSheets();

  selFileSheet.change('Danh muc');
  selFileSheet.change('Quyen theo Role');

  assert.equal(state.permissionMapping.usecase2.permissionColumn, 'BE Name');
  assert.equal(state.permissionMapping.usecase1[0].permissionColumn, 'DTV doi tac');
  assert.equal(selNameCol.value, 'BE Name');
  assert.ok(!selNameCol.children.some((c) => c.textContent.includes('không có trong sheet này')));
  const colSel = usecase1Table.children[0].children.filter((c) => c.tagName === 'SELECT')[0];
  assert.equal(colSel.value, 'DTV doi tac');
  assert.ok(!colSel.children.some((c) => c.textContent.includes('không có trong sheet này')));
});

// Header dau tien cua file phan quyen gan nhu luon la cot TEN (khoa ghep UC2),
// nen lay no lam mac dinh la sinh ra dong UC1 invalid ngay luc them.
test('them mapping UC1: mac dinh cot ROLE bo qua cot dang lam khoa ghep UC2', () => {
  const { btnAddMapping } = setup({
    filename: 'perm.xlsx', headers: ['BE Name', 'Truong ca', 'DTV doi tac'], rows: [],
  });
  state.permissionMapping.usecase2.permissionColumn = 'BE Name';

  btnAddMapping.click();

  assert.equal(state.permissionMapping.usecase1[0].permissionColumn, 'Truong ca');
});

test('them mapping UC1: khoa ghep UC2 chua chon thi van lay header dau tien', () => {
  const { btnAddMapping } = setup({
    filename: 'perm.xlsx', headers: ['BE Name', 'Truong ca'], rows: [],
  });
  btnAddMapping.click();

  assert.equal(state.permissionMapping.usecase1[0].permissionColumn, 'BE Name');
});

test('them mapping UC1: sheet chi co dung mot cot va no la khoa ghep thi de rong', () => {
  const { btnAddMapping } = setup({
    filename: 'perm.xlsx', headers: ['BE Name'], rows: [],
  });
  state.permissionMapping.usecase2.permissionColumn = 'BE Name';

  btnAddMapping.click();

  assert.equal(state.permissionMapping.usecase1[0].permissionColumn, '');
});

test('doi cot quyen UC1 tren select ghi thang vao state', () => {
  const { usecase1Table } = setupTwoSheets();

  const colSel = usecase1Table.children[0].children.filter((c) => c.tagName === 'SELECT')[0];
  colSel.change('Truong ca');

  assert.equal(state.permissionMapping.usecase1[0].permissionColumn, 'Truong ca');
});

/* ---------- gate Luu / Xoa ---------- */

test('nut Luu tat khi cau hinh sach, bat khi ban nhap lech', () => {
  const { selNameCol, btnSave, dirtyBadge } = setup({
    filename: 'perm.xlsx', headers: ['Role', 'User'], rows: [],
  });

  assert.equal(btnSave.disabled, true);
  assert.equal(dirtyBadge.hidden, true);

  selNameCol.change('User');

  assert.equal(btnSave.disabled, false);
  assert.equal(dirtyBadge.hidden, false);
  assert.ok(dirtyBadge.textContent.includes('mapping UC1/UC2'));
});

test('nut Xoa chi hien khi da nap file', () => {
  const { btnDelete } = setup();
  assert.equal(btnDelete.hidden, true);

  const withFile = setup({ filename: 'perm.xlsx', headers: ['Role'], rows: [] });
  assert.equal(withFile.btnDelete.hidden, false);
});

test('bam Luu commit ban nhap sang savedConfig va tat badge', () => {
  const { selNameCol, btnSave, dirtyBadge } = setup({
    filename: 'perm.xlsx', headers: ['Role', 'User'], rows: [],
  });

  selNameCol.change('User');
  btnSave.click();

  assert.equal(state.savedConfig.permissionMapping.usecase2.permissionColumn, 'User');
  assert.equal(btnSave.disabled, true);
  assert.equal(dirtyBadge.hidden, true);
});

test('Luu khong bi chan boi loi validate, loi hien ra o perm-save-errors', () => {
  const { selNameCol, btnSave, saveErrors } = setup({
    filename: 'perm.xlsx', headers: ['Role', 'User'], rows: [],
  });

  selNameCol.change('User');
  btnSave.click();

  // UC1 con rong -> validate bao loi, nhung savedConfig van duoc ghi.
  assert.equal(state.savedConfig.permissionMapping.usecase2.permissionColumn, 'User');
  assert.equal(saveErrors.hidden, false);
  assert.ok(saveErrors.textContent.includes('Chưa khai mapping UC1'));
});

test('bam Xoa go ca file, ban nhap va ban da luu', () => {
  const { selNameCol, btnSave, btnDelete, fileInfo, mappingArea } = setup({
    filename: 'perm.xlsx', headers: ['Role', 'User'], rows: [],
  });

  selNameCol.change('User');
  btnSave.click();
  btnDelete.click();

  assert.equal(state.permissionFile.filename, '');
  assert.deepEqual(state.permissionFile.sheets, []);
  assert.equal(state.permissionMapping.usecase2.permissionColumn, '');
  assert.deepEqual(state.permissionMapping.usecase1, []);
  // savedConfig phai sach theo, khong thi CHECK PERM van cham diem tren cot cua
  // file vua bi xoa.
  assert.equal(state.savedConfig.permissionMapping.usecase2.permissionColumn, '');
  assert.equal(state.savedConfig.permissionSheet, '');
  assert.equal(fileInfo.textContent, 'chưa nạp file');
  assert.equal(mappingArea.hidden, true);
  assert.equal(btnDelete.hidden, true);
});

test('doi sheet lam doi NGAY danh sach cot trong panel, badge bao sheet phan quyen', () => {
  const sheets = [
    { name: 'Sheet1', headers: ['A1', 'A2'], rows: [] },
    { name: 'Sheet2', headers: ['B1'], rows: [] },
  ];
  const { selFileSheet, selNameCol, dirtyBadge } = setup({
    filename: 'perm.xlsx', sheets, selectedSheet: 'Sheet1',
  });

  selFileSheet.change('Sheet2');

  assert.deepEqual(selNameCol.children.map((c) => c.value), ['B1']);
  assert.ok(dirtyBadge.textContent.includes('sheet phân quyền'));
});
