import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchPermissionEndpoints, endpointColumns, endpointColumnsOfSheet } from '../public/js/shared/permission-match.js';

// pathTemplate mac dinh khac nhau tung endpoint (Math.random) de fixture
// khong vo tinh dinh khu trung METHOD:pathTemplate khi test chi muon xet
// logic ghep dong UC2, khong lien quan khu trung.
function endpoint(over = {}) {
  return {
    id: `ep_${Math.random()}`, enabled: true, name: 'ep', method: 'GET',
    pathTemplate: `/x/${Math.random()}`, sheetName: 'Sheet 1', attachMsisdn: true,
    raw: { 'Ten API': 'Tra cuu whitelist' },
    ...over,
  };
}

const uc1 = [
  { endpointSheet: 'Sheet 1', permissionColumn: 'Sheet 1 - User', authProfileName: 'User Profile' },
];

// Fixture nhan permissionFile dang phang (headers/rows) cho gon, roi dung
// thanh sheets + savedConfig — matchPermissionEndpoints doc ban DA LUU.
function state(over = {}) {
  const {
    endpoints = [endpoint()],
    permissionFile = {
      filename: 'permissions.xlsx',
      headers: ['Ten Chuc Nang', 'Sheet 1 - User'],
      rows: [['Tra cuu whitelist', 'x']],
    },
    permissionMapping = {
      usecase1: uc1,
      usecase2: { permissionColumn: 'Ten Chuc Nang', endpointColumn: 'Ten API' },
    },
    runFilter = { methods: [] },
    ...rest
  } = over;

  return {
    endpoints,
    permissionFile: {
      filename: permissionFile.filename,
      sheets: [{
        name: 'Perm',
        headers: permissionFile.headers ?? [],
        rows: permissionFile.rows ?? [],
      }],
      selectedSheet: 'Perm',
    },
    savedConfig: { permissionMapping, methods: runFilter.methods ?? [], permissionSheet: 'Perm' },
    ...rest,
  };
}

// Trong ket qua cua matchPermissionEndpoints, tim entry cua mot endpoint id cu the.
function find(matches, id) {
  return matches.find((m) => m.endpoint.id === id);
}

/* ---------- endpointColumns ---------- */

test('endpointColumns tra ve union header cua endpoint thuoc sheet UC1, giu thu tu gap lan dau', () => {
  const cols = endpointColumns([
    endpoint({ sheetName: 'Sheet 1', raw: { A: '1', B: '2' } }),
    endpoint({ sheetName: 'Sheet 1', raw: { B: '2', C: '3' } }),
    endpoint({ sheetName: 'Sheet 2', raw: { D: '4' } }),
  ], uc1);
  assert.deepEqual(cols, ['A', 'B', 'C']);
});

/* ---------- endpointColumnsOfSheet ---------- */

test('endpointColumnsOfSheet chi tra cot cua sheet duoc hoi, khong lan sheet khac', () => {
  const cols = endpointColumnsOfSheet([
    endpoint({ sheetName: 'Sheet 1', raw: { A: '1', B: '2' } }),
    endpoint({ sheetName: 'Sheet 2', raw: { C: '3' } }),
  ], 'Sheet 1');
  assert.deepEqual(cols, ['A', 'B']);
});

test('endpointColumnsOfSheet giu thu tu gap lan dau', () => {
  const cols = endpointColumnsOfSheet([
    endpoint({ sheetName: 'Sheet 1', raw: { B: '2', A: '1' } }),
    endpoint({ sheetName: 'Sheet 1', raw: { A: '1', C: '3' } }),
  ], 'Sheet 1');
  assert.deepEqual(cols, ['B', 'A', 'C']);
});

test('endpointColumnsOfSheet tra mang rong khi sheetName khong khop endpoint nao', () => {
  const cols = endpointColumnsOfSheet([endpoint({ sheetName: 'Sheet 1' })], 'Sheet Khong Ton Tai');
  assert.deepEqual(cols, []);
});

test('endpointColumnsOfSheet tra mang rong khi sheetName rong hoac undefined', () => {
  assert.deepEqual(endpointColumnsOfSheet([endpoint()], ''), []);
  assert.deepEqual(endpointColumnsOfSheet([endpoint()], undefined), []);
});

test('endpointColumnsOfSheet bo qua endpoint thieu raw, khong nem loi', () => {
  const cols = endpointColumnsOfSheet([
    endpoint({ sheetName: 'Sheet 1', raw: undefined }),
    endpoint({ sheetName: 'Sheet 1', raw: { A: '1' } }),
  ], 'Sheet 1');
  assert.deepEqual(cols, ['A']);
});

test('endpointColumnsOfSheet tinh endpoint thieu sheetName la Sheet 1', () => {
  const cols = endpointColumnsOfSheet([
    endpoint({ sheetName: undefined, raw: { A: '1' } }),
  ], 'Sheet 1');
  assert.deepEqual(cols, ['A']);
});

/* ---------- matchPermissionEndpoints ---------- */

test('vong 0 dung include: endpoint CHUA ten phan quyen deu khop, khong doi bang nhau', () => {
  const eps = [
    endpoint({ id: 'exact', raw: { 'Ten API': 'Tra cuu whitelist' } }),
    endpoint({ id: 'superset', raw: { 'Ten API': 'Tra cuu whitelist mo rong' } }),
  ];
  const s = state({
    endpoints: eps,
    permissionFile: {
      filename: 'p.xlsx',
      headers: ['Ten Chuc Nang', 'Sheet 1 - User'],
      rows: [['Tra cuu whitelist', 'x']],
    },
  });
  const matches = matchPermissionEndpoints(s);
  assert.equal(matches.length, 2);
  assert.equal(find(matches, 'exact').permRowIndex, 0);
  assert.equal(find(matches, 'superset').permRowIndex, 0);
});

test('chieu include mot phia: ten phan quyen CHUA endpoint thi KHONG khop', () => {
  // hay = "tra cuu" ngan hon needle. Neu khop hai chieu, endpoint nay se dinh.
  const eps = [endpoint({ id: 'e1', raw: { 'Ten API': 'Tra cuu' } })];
  const s = state({
    endpoints: eps,
    permissionFile: {
      filename: 'p.xlsx',
      headers: ['Ten Chuc Nang', 'Sheet 1 - User'],
      rows: [['Tra cuu whitelist roaming VIP', 'x']],
    },
  });
  const matches = matchPermissionEndpoints(s);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].permRowIndex, null);
});

test('doc ban DA LUU, khong doc ban nhap dang sua', () => {
  const s = state({ endpoints: [endpoint({ id: 'e1', raw: { 'Ten API': 'Tra cuu whitelist' } })] });
  // Ban nhap tro vao cot khong ton tai — neu bi doc nham, ghep se hong.
  s.permissionMapping = {
    usecase1: [],
    usecase2: { permissionColumn: 'Cot Ma', endpointColumn: 'Cot Ma' },
  };
  s.runFilter = { methods: ['DELETE'] };

  const matches = matchPermissionEndpoints(s);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].permRowIndex, 0);
});

test('sheet da luu bien mat khoi file: endpoint van tra ve het, permRowIndex null', () => {
  const s = state({ endpoints: [endpoint({ id: 'e1' })] });
  s.savedConfig.permissionSheet = 'Sheet Da Bi Xoa';

  const matches = matchPermissionEndpoints(s);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].permRowIndex, null);
});

test('bot tu DAU, khong phai tu cuoi', () => {
  const eps = [
    endpoint({ id: 'e1', raw: { 'Ten API': 'cuu whitelist roaming VIP' } }),
    endpoint({ id: 'e2', raw: { 'Ten API': 'Tra cuu whitelist' } }),
  ];
  const s = state({
    endpoints: eps,
    permissionFile: {
      filename: 'p.xlsx',
      headers: ['Ten Chuc Nang', 'Sheet 1 - User'],
      rows: [['Tra cuu whitelist roaming VIP', 'x']],
    },
  });
  const matches = matchPermissionEndpoints(s);
  // vong 1 bot tu dau "Tra" ra "cuu whitelist roaming VIP" khop e1.
  assert.equal(find(matches, 'e1').permRowIndex, 0);
  assert.equal(find(matches, 'e2').permRowIndex, null);
});

test('toi da 4 vong (k=0..3), khong noi sang vong thu 5', () => {
  const eps = [endpoint({ id: 'e1', raw: { 'Ten API': 'E' } })];
  const s = state({
    endpoints: eps,
    permissionFile: {
      filename: 'p.xlsx',
      headers: ['Ten Chuc Nang', 'Sheet 1 - User'],
      // 5 tu: A B C D E. 4 vong (k=0..3) bot toi da 3 tu dau, needle ngan
      // nhat con lai la "D E" (2 tu) — khong bao gio con lai "E" mot minh du
      // vong thu 5 (k=4, bot 4 tu) se cho khop dung hay "e".
      rows: [['A B C D E', 'x']],
    },
  });
  const matches = matchPermissionEndpoints(s);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].permRowIndex, null);
});

test('keyword it hon 4 tu: dung khi het tu, khong sinh needle rong', () => {
  const eps = [endpoint({ id: 'e1', raw: { 'Ten API': 'B' } })];
  const s = state({
    endpoints: eps,
    permissionFile: {
      filename: 'p.xlsx',
      headers: ['Ten Chuc Nang', 'Sheet 1 - User'],
      rows: [['A B', 'x']], // 2 tu: vong 0 "A B", vong 1 "B" — dung o vong 1
    },
  });
  const matches = matchPermissionEndpoints(s);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].permName, 'A B');
});

test('dung o vong dau tien co ket qua, khong noi sang vong long hon', () => {
  const eps = [
    endpoint({ id: 'tight', raw: { 'Ten API': 'cuu whitelist roaming' } }),
    endpoint({ id: 'loose', raw: { 'Ten API': 'whitelist' } }),
  ];
  const s = state({
    endpoints: eps,
    permissionFile: {
      filename: 'p.xlsx',
      headers: ['Ten Chuc Nang', 'Sheet 1 - User'],
      rows: [['Tra cuu whitelist roaming', 'x']],
    },
  });
  const matches = matchPermissionEndpoints(s);
  assert.equal(find(matches, 'tight').permRowIndex, 0);
  assert.equal(find(matches, 'loose').permRowIndex, null);
});

test('vong co ket qua nhung moi endpoint da bi giu cho — van thoat, khong noi vong sau', () => {
  const eps = [endpoint({ id: 'e1', raw: { 'Ten API': 'cuu whitelist roaming' } })];
  const s = state({
    endpoints: eps,
    permissionFile: {
      filename: 'p.xlsx',
      headers: ['Ten Chuc Nang', 'Sheet 1 - User'],
      rows: [
        ['Tra cuu whitelist roaming', 'x'], // vong 1 lay e1 truoc
        ['X Y cuu whitelist roaming', 'x'], // cung khop e1 o vong 1, nhung da bi giu cho
      ],
    },
  });
  const matches = matchPermissionEndpoints(s);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].permName, 'Tra cuu whitelist roaming');
});

test('khu trung METHOD:pathTemplate — hai endpoint cung path o cung sheet chi giu ban dau tien', () => {
  const eps = [
    endpoint({ id: 'e1', sheetName: 'Sheet 1', pathTemplate: '/trung', raw: { 'Ten API': 'Tra cuu whitelist' } }),
    endpoint({ id: 'e2', sheetName: 'Sheet 1', pathTemplate: '/trung', raw: { 'Ten API': 'Tra cuu whitelist' } }),
  ];
  const s = state({ endpoints: eps });
  const matches = matchPermissionEndpoints(s);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].endpoint.id, 'e1');
});

test('khu trung METHOD:pathTemplate — cung path nhung khac method thi khong khu lan nhau', () => {
  const eps = [
    endpoint({ id: 'get1', method: 'GET', pathTemplate: '/a', raw: { 'Ten API': 'Tra cuu whitelist' } }),
    endpoint({ id: 'post1', method: 'POST', pathTemplate: '/a', raw: { 'Ten API': 'Tra cuu whitelist' } }),
  ];
  const s = state({ endpoints: eps });
  const matches = matchPermissionEndpoints(s);
  assert.equal(matches.length, 2);
});

test('dong UC2 dung truoc trong file giu cho khi hai dong cung voi toi mot endpoint', () => {
  const eps = [endpoint({ id: 'e1', raw: { 'Ten API': 'Tra cuu whitelist roaming VIP' } })];
  const s = state({
    endpoints: eps,
    permissionFile: {
      filename: 'p.xlsx',
      headers: ['Ten Chuc Nang', 'Sheet 1 - User'],
      rows: [
        ['Z whitelist roaming VIP', 'x'],   // vong 1 khop truoc
        ['Tra cuu whitelist roaming VIP', 'x'], // khop o vong 0 nhung den sau
      ],
    },
  });
  const matches = matchPermissionEndpoints(s);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].permName, 'Z whitelist roaming VIP');
});

test('endpoint thieu raw hoac o cot dich rong khong tham gia khop, nhung van co mat trong ket qua', () => {
  const s = state({
    endpoints: [
      endpoint({ id: 'no-raw', raw: undefined }),
      endpoint({ id: 'empty-target', raw: { 'Ten API': '' } }),
      endpoint({ id: 'ok', raw: { 'Ten API': 'Tra cuu whitelist' } }),
    ],
  });
  const matches = matchPermissionEndpoints(s);
  assert.equal(matches.length, 3);
  assert.equal(find(matches, 'no-raw').permRowIndex, null);
  assert.equal(find(matches, 'empty-target').permRowIndex, null);
  assert.equal(find(matches, 'ok').permRowIndex, 0);
});

test('checkbox enabled cua bang ENDPOINTS KHONG anh huong pool CHECK PERM', () => {
  const s = state({
    endpoints: [endpoint({ id: 'e1', enabled: false, raw: { 'Ten API': 'Tra cuu whitelist' } })],
  });
  const matches = matchPermissionEndpoints(s);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].endpoint.id, 'e1');
  assert.equal(matches[0].permRowIndex, 0);
});

test('bo loc method ap dung o buoc gom, truoc khi ghep', () => {
  const s = state({
    endpoints: [endpoint({ id: 'e1', method: 'POST', raw: { 'Ten API': 'Tra cuu whitelist' } })],
    runFilter: { methods: ['GET'] },
  });
  assert.deepEqual(matchPermissionEndpoints(s), []);
});

test('permName la gia tri goc trong file, khong normalize', () => {
  const s = state({
    endpoints: [endpoint({ raw: { 'Ten API': 'tra cuu whitelist' } })],
    permissionFile: {
      filename: 'p.xlsx',
      headers: ['Ten Chuc Nang', 'Sheet 1 - User'],
      rows: [['  Tra Cuu Whitelist  ', 'x']],
    },
  });
  const matches = matchPermissionEndpoints(s);
  assert.equal(matches[0].permName, '  Tra Cuu Whitelist  ');
});

test('chua chon cot Name (UC2) hoac cot dich — endpoint van tra ve het, permRowIndex null', () => {
  const noSrc = matchPermissionEndpoints(state({
    permissionMapping: { usecase1: uc1, usecase2: { permissionColumn: '', endpointColumn: 'Ten API' } },
  }));
  assert.equal(noSrc.length, 1);
  assert.equal(noSrc[0].permRowIndex, null);

  const noTarget = matchPermissionEndpoints(state({
    permissionMapping: { usecase1: uc1, usecase2: { permissionColumn: 'Ten Chuc Nang', endpointColumn: '' } },
  }));
  assert.equal(noTarget.length, 1);
  assert.equal(noTarget[0].permRowIndex, null);
});
