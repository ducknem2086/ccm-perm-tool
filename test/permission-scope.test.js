import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeName, matchPermissionName, uc1AuthNames,
  validatePermissionScope, buildPermissionRunConfig, savedPermissionPayload,
} from '../public/js/shared/permission-scope.js';

const permissionFile = {
  filename: 'permissions.xlsx',
  headers: ['API Name', 'Sheet 1 - User', 'Sheet 1 - Admin', 'Sheet 2 - Cskh'],
  rows: [
    ['Tra cuu TB', 'x', '', ''],
    ['Doi SIM', '', 'x', ''],
    ['Xem Goi Cuoc', '', '', 'x'],
  ],
};

const uc2 = { permissionColumn: 'API Name', columnSheet: 'Sheet 1', endpointColumn: 'Ten API' };

const uc1 = [
  { endpointSheet: 'Sheet 1', permissionColumn: 'Sheet 1 - User', authProfileName: 'User Profile' },
  { endpointSheet: 'Sheet 1', permissionColumn: 'Sheet 1 - Admin', authProfileName: 'Admin Profile' },
  { endpointSheet: 'Sheet 2', permissionColumn: 'Sheet 2 - Cskh', authProfileName: 'Cskh Profile' },
];

// pathTemplate mac dinh khac nhau tung endpoint (Math.random) de fixture
// khong vo tinh dinh khu trung METHOD:pathTemplate o cac test khong lien quan.
function endpoint(over = {}) {
  return {
    id: `ep_${Math.random()}`, enabled: true, name: 'Tra cuu TB', method: 'GET',
    pathTemplate: `/x/${Math.random()}`, sheetName: 'Sheet 1', attachMsisdn: true,
    raw: { 'Ten API': 'Tra cuu TB' },
    ...over,
  };
}

// Nhan permissionFile dang phang (headers/rows) cho gon, roi dung thanh
// sheets + savedConfig. permissionMapping dung CHUNG tham chieu voi savedConfig
// (ban nhap == ban da luu, coi nhu vua bam Luu). runFilter/selectedSheet nam
// ngoai gate — pool CHECK PERM doc thang chung nhu nut RUN ALL.
function baseState(over = {}) {
  const {
    permissionFile: pf = permissionFile,
    permissionMapping: pm = { usecase1: uc1, usecase2: uc2 },
    runFilter: rf = { methods: [], msisdnPatterns: [], authIds: [] },
    ...rest
  } = over;

  return {
    endpoints: [
      endpoint({ id: 'e1', name: 'Tra cuu TB', sheetName: 'Sheet 1', raw: { 'Ten API': 'Tra cuu TB' } }),
      endpoint({ id: 'e2', name: 'Doi SIM', sheetName: 'Sheet 1', raw: { 'Ten API': 'Doi SIM' } }),
      endpoint({ id: 'e3', name: 'Xem Goi Cuoc', sheetName: 'Sheet 2', raw: { 'Ten API': 'Xem Goi Cuoc' } }),
      endpoint({
        id: 'e4', name: 'Khong Trong File Quyen', sheetName: 'Sheet 1',
        raw: { 'Ten API': 'Khong Trong File Quyen' },
      }),
      endpoint({ id: 'common1', name: 'Common 1', sheetName: 'Common', raw: { 'Ten API': 'Common 1' } }),
    ],
    auths: [
      { id: 'a_user', name: 'User Profile' },
      { id: 'a_admin', name: 'Admin Profile' },
      { id: 'a_cskh', name: 'Cskh Profile' },
      { id: 'a_extra', name: 'Extra Profile' },
    ],
    msisdns: ['0912345678', '0987654321'],
    runFilter: rf,
    permissionFile: {
      filename: pf.filename,
      sheets: [{ name: 'Perm', headers: pf.headers ?? [], rows: pf.rows ?? [] }],
      selectedSheet: 'Perm',
    },
    permissionMapping: pm,
    savedConfig: { permissionMapping: pm, permissionSheet: 'Perm' },
    // Tab ALL — pool CHECK PERM bam theo tab dang chon, giong nut RUN ALL.
    selectedSheet: 'all',
    commonEndpoints: '',
    commonEndpointsEnabled: true,
    ...rest,
  };
}

test('normalizeName trim va lowercase', () => {
  assert.equal(normalizeName('  Admin Profile  '), 'admin profile');
  assert.equal(normalizeName(undefined), '');
});

test('matchPermissionName tra ve gia tri goc trong file, khong phai ten endpoint', () => {
  assert.equal(matchPermissionName('  tra cuu tb  ', permissionFile, uc2), 'Tra cuu TB');
});

test('matchPermissionName tra ve null khi cot UC2 chua cau hinh', () => {
  assert.equal(matchPermissionName('Tra cuu TB', permissionFile, { permissionColumn: '' }), null);
});

test('matchPermissionName tra ve null khi cot da bien mat khoi headers', () => {
  assert.equal(matchPermissionName('Tra cuu TB', permissionFile, { permissionColumn: 'Cot Da Xoa' }), null);
});

test('matchPermissionName tra ve null khi khong co dong nao khop', () => {
  assert.equal(matchPermissionName('Khong Ton Tai', permissionFile, uc2), null);
});

test('uc1AuthNames la union moi dong UC1, ke ca profile chi xuat hien o mot sheet', () => {
  const names = uc1AuthNames(uc1);
  assert.ok(names.has('user profile'));
  assert.ok(names.has('admin profile'));
  assert.ok(names.has('cskh profile'));
  assert.equal(names.size, 3);
});

/* ---------- buildPermissionRunConfig ---------- */

test('buildPermissionRunConfig KHONG con loc theo sheet khai o UC1 — lay het pool cua RUN ALL', () => {
  const state = baseState();
  // Khong dong UC1 nao khai 'Common', nhung endpoint do van thuoc tab ALL.
  const { config } = buildPermissionRunConfig(state);
  assert.ok(config.endpoints.some((e) => e.sheetName === 'Common'));
});

test('buildPermissionRunConfig endpoint khong duoc dong UC2 nao keo ve VAN chay, permRowIndex null', () => {
  const { config } = buildPermissionRunConfig(baseState());
  const orphan = config.endpoints.find((e) => e.name === 'Khong Trong File Quyen');
  assert.ok(orphan, 'endpoint thuoc sheet UC1 nhung khong khop dong UC2 nao van phai duoc giu');
  assert.equal(orphan.permRowIndex, null);
  assert.equal(orphan.permName, null);
});

test('buildPermissionRunConfig gan permName + permRowIndex tu UC2, khong mutate state.endpoints', () => {
  const state = baseState();
  const original = state.endpoints.find((e) => e.id === 'e1');
  const { config } = buildPermissionRunConfig(state);
  const matched = config.endpoints.find((e) => e.id === 'e1');
  assert.equal(matched.permName, 'Tra cuu TB');
  assert.equal(matched.permRowIndex, 0);
  assert.equal(original.permName, undefined);
});

test('buildPermissionRunConfig moi endpoint deu mang permRun true', () => {
  const { config } = buildPermissionRunConfig(baseState());
  assert.ok(config.endpoints.length > 0);
  assert.ok(config.endpoints.every((e) => e.permRun === true));
});

test('buildPermissionRunConfig loai common endpoints go tay o o nhap', () => {
  const state = baseState();
  state.commonEndpoints = 'GET /api/common/health';
  state.commonEndpointsEnabled = true;
  const { config } = buildPermissionRunConfig(state);
  assert.ok(!config.endpoints.some((e) => String(e.id).startsWith('common_')));
});

test('buildPermissionRunConfig KHONG loc theo checkbox enabled — CHECK PERM chay het endpoint thuoc sheet UC1', () => {
  const state = baseState();
  state.endpoints[0].enabled = false; // e1 bi bo tick o bang ENDPOINTS
  const { config } = buildPermissionRunConfig(state);
  assert.ok(config.endpoints.some((e) => e.id === 'e1'), 'checkbox enabled thuoc RUN ALL, khong duoc anh huong CHECK PERM');
});

test('buildPermissionRunConfig giu nguyen gia tri enabled goc — khong con ai doc khoa nay', () => {
  const state = baseState();
  state.endpoints[0].enabled = false;
  const { config } = buildPermissionRunConfig(state);
  assert.equal(config.endpoints.find((e) => e.id === 'e1').enabled, false);
});

test('buildPermissionRunConfig doc bo loc method tu BAN NHAP state.runFilter', () => {
  const state = baseState();
  state.endpoints[0].method = 'POST';
  state.runFilter.methods = ['GET'];
  const { config } = buildPermissionRunConfig(state);
  assert.ok(!config.endpoints.some((e) => e.id === 'e1'));
  assert.ok(config.endpoints.some((e) => e.id === 'e2'));
});

test('buildPermissionRunConfig tab ALL lay het moi sheet', () => {
  const { config } = buildPermissionRunConfig(baseState());
  assert.ok(config.endpoints.some((e) => e.sheetName === 'Sheet 1'));
  assert.ok(config.endpoints.some((e) => e.sheetName === 'Sheet 2'));
});

test('buildPermissionRunConfig tab mot sheet cu the thu hep pool theo tab do', () => {
  const { config } = buildPermissionRunConfig(baseState({ selectedSheet: 'Sheet 2' }));
  assert.ok(config.endpoints.every((e) => e.sheetName === 'Sheet 2'));
  assert.ok(config.endpoints.length > 0);
});

// Config gui server phai la 'all': client da nuong san danh sach cuoi vao
// config.endpoints, de server loc lai lan nua la loc hai lan tren hai state.
test('buildPermissionRunConfig gui selectedSheet all cho server du tab dang hep', () => {
  const { config } = buildPermissionRunConfig(baseState({ selectedSheet: 'Sheet 2' }));
  assert.equal(config.selectedSheet, 'all');
  assert.deepEqual(config.runFilter.methods, []);
});

test('buildPermissionRunConfig tra unmatched = so endpoint khong ghep duoc dong nao', () => {
  const { unmatched } = buildPermissionRunConfig(baseState());
  // e4 'Khong Trong File Quyen' + common1 'Common 1' khong dong UC2 nao keo ve.
  assert.equal(unmatched, 2);
});

test('buildPermissionRunConfig unmatched = 0 khi moi endpoint deu ghep duoc', () => {
  const state = baseState({
    endpoints: [endpoint({ id: 'e1', sheetName: 'Sheet 1', raw: { 'Ten API': 'Tra cuu TB' } })],
  });
  assert.equal(buildPermissionRunConfig(state).unmatched, 0);
});

test('buildPermissionRunConfig msisdns con dung 1 phan tu', () => {
  const { config } = buildPermissionRunConfig(baseState());
  assert.equal(config.msisdns.length, 1);
  assert.equal(config.msisdns[0], '0912345678');
});

test('buildPermissionRunConfig auths dung bang union UC1, loai profile ngoai mapping', () => {
  const { config, authCount } = buildPermissionRunConfig(baseState());
  const names = config.auths.map((a) => a.name).sort();
  assert.deepEqual(names, ['Admin Profile', 'Cskh Profile', 'User Profile']);
  assert.equal(authCount, 3);
});

test('buildPermissionRunConfig runFilter.authIds liet ke du id cua auths da loc', () => {
  const { config } = buildPermissionRunConfig(baseState());
  assert.deepEqual(config.runFilter.authIds.sort(), config.auths.map((a) => a.id).sort());
});

test('buildPermissionRunConfig tat endpoints chung', () => {
  const { config } = buildPermissionRunConfig(baseState());
  assert.equal(config.commonEndpointsEnabled, false);
});

/* ---------- savedPermissionPayload ---------- */

test('savedPermissionPayload lam phang headers/rows tu sheet DA LUU', () => {
  const { permissionFile: pf, permissionMapping: pm } = savedPermissionPayload(baseState());
  assert.equal(pf.filename, 'permissions.xlsx');
  assert.deepEqual(pf.headers, permissionFile.headers);
  assert.deepEqual(pf.rows, permissionFile.rows);
  assert.deepEqual(pm.usecase1, uc1);
});

test('savedPermissionPayload tra headers/rows rong khi sheet da luu bien mat', () => {
  const state = baseState();
  state.savedConfig.permissionSheet = 'Sheet Da Bi Xoa';
  const { permissionFile: pf } = savedPermissionPayload(state);
  assert.deepEqual(pf.headers, []);
  assert.deepEqual(pf.rows, []);
});

test('buildPermissionRunConfig gui permissionFile phang va mapping DA LUU, khong phai ban nhap', () => {
  const state = baseState();
  // Ban nhap bi sua hong sau khi Luu — config gui len phai khong bi anh huong.
  state.permissionMapping = { usecase1: [], usecase2: { permissionColumn: 'Hong' } };
  state.permissionFile.selectedSheet = 'Sheet Khac';

  const { config } = buildPermissionRunConfig(state);
  assert.deepEqual(config.permissionFile.headers, permissionFile.headers);
  assert.deepEqual(config.permissionMapping.usecase1, uc1);
});

/* ---------- khu trung METHOD:pathTemplate ---------- */

test('khu trung: endpoint trung METHOD:pathTemplate o hai sheet UC1 chi giu ban dau tien', () => {
  const state = baseState({
    endpoints: [
      endpoint({ id: 'dup1', sheetName: 'Sheet 1', pathTemplate: '/trung/{*}', raw: { 'Ten API': 'Tra cuu TB' } }),
      endpoint({ id: 'dup2', sheetName: 'Sheet 2', pathTemplate: '/trung/{*}', raw: { 'Ten API': 'Tra cuu TB' } }),
      endpoint({ id: 'rieng', sheetName: 'Sheet 2', pathTemplate: '/rieng/{*}', raw: { 'Ten API': 'Doi SIM' } }),
    ],
  });
  const { config, endpointCount } = buildPermissionRunConfig(state);
  assert.deepEqual(config.endpoints.map((e) => e.id), ['dup1', 'rieng']);
  assert.equal(endpointCount, 2);
});

test('khu trung: cung path nhung khac METHOD thi khong khu lan nhau', () => {
  const state = baseState({
    endpoints: [
      endpoint({ id: 'get1', method: 'GET', sheetName: 'Sheet 1', pathTemplate: '/a', raw: { 'Ten API': 'Tra cuu TB' } }),
      endpoint({ id: 'post1', method: 'POST', sheetName: 'Sheet 1', pathTemplate: '/a', raw: { 'Ten API': 'Tra cuu TB' } }),
    ],
  });
  const { config } = buildPermissionRunConfig(state);
  assert.deepEqual(config.endpoints.map((e) => e.id).sort(), ['get1', 'post1']);
});

test('khu trung: mot API cung URL o 4 sheet role chi sinh 1 ban ghi', () => {
  const uc1Four = [
    ...uc1,
    { endpointSheet: 'Sheet 3', permissionColumn: 'Sheet 1 - User', authProfileName: 'User Profile' },
    { endpointSheet: 'Sheet 4', permissionColumn: 'Sheet 1 - User', authProfileName: 'User Profile' },
  ];
  const sheets = ['Sheet 1', 'Sheet 2', 'Sheet 3', 'Sheet 4'];
  const state = baseState({
    permissionMapping: { usecase1: uc1Four, usecase2: uc2 },
    endpoints: sheets.map((s, i) => endpoint({
      id: `r${i}`, sheetName: s, pathTemplate: '/query/whitelist-roaming-vip/{*}',
      raw: { 'Ten API': 'Tra cuu TB' },
    })),
  });
  const { config, endpointCount } = buildPermissionRunConfig(state);
  assert.equal(endpointCount, 1);
  assert.equal(config.endpoints[0].id, 'r0');
});

/* ---------- validatePermissionScope ---------- */

test('validatePermissionScope bao loi khi chua nap file phan quyen', () => {
  const errors = validatePermissionScope(baseState({ permissionFile: { filename: '', headers: [], rows: [] } }));
  assert.ok(errors.some((e) => e.includes('Chưa nạp file phân quyền')));
});

test('validatePermissionScope bao loi khi chua chon cot Name UC2', () => {
  const errors = validatePermissionScope(baseState({
    permissionMapping: { usecase1: uc1, usecase2: { permissionColumn: '' } },
  }));
  assert.ok(errors.some((e) => e.includes('Chưa chọn cột Name')));
});

test('validatePermissionScope bao loi khi cot UC2 da bien mat khoi headers', () => {
  const errors = validatePermissionScope(baseState({
    permissionMapping: { usecase1: uc1, usecase2: { permissionColumn: 'Cot Da Xoa' } },
  }));
  assert.ok(errors.some((e) => e.includes('Chưa chọn cột Name')));
});

test('validatePermissionScope bao loi khi UC1 rong', () => {
  const errors = validatePermissionScope(baseState({
    permissionMapping: { usecase1: [], usecase2: uc2 },
  }));
  assert.ok(errors.some((e) => e.includes('Chưa khai mapping UC1')));
});

test('validatePermissionScope bao loi khi cot mapping UC1 khong con trong headers', () => {
  const badUc1 = [{ endpointSheet: 'Sheet 1', permissionColumn: 'Cot Da Xoa', authProfileName: 'User Profile' }];
  const errors = validatePermissionScope(baseState({
    permissionMapping: { usecase1: badUc1, usecase2: uc2 },
  }));
  assert.ok(errors.some((e) => e.includes('cột "Cot Da Xoa" không có')));
});

test('validatePermissionScope bao loi khi sheet UC1 khong con endpoint nao', () => {
  const badUc1 = [{ endpointSheet: 'Sheet Bien Mat', permissionColumn: 'Sheet 1 - User', authProfileName: 'User Profile' }];
  const errors = validatePermissionScope(baseState({
    permissionMapping: { usecase1: badUc1, usecase2: uc2 },
  }));
  assert.ok(errors.some((e) => e.includes('sheet "Sheet Bien Mat" không còn endpoint')));
});

test('validatePermissionScope bao loi khi auth profile UC1 khong con ton tai — da doi ten', () => {
  const badUc1 = [{ endpointSheet: 'Sheet 1', permissionColumn: 'Sheet 1 - User', authProfileName: 'Ten Da Doi' }];
  const errors = validatePermissionScope(baseState({
    permissionMapping: { usecase1: badUc1, usecase2: uc2 },
  }));
  assert.ok(errors.some((e) => e.includes('auth profile "Ten Da Doi" không tồn tại')));
});

test('validatePermissionScope bao loi khi khong con endpoint nao de chay sau bo loc', () => {
  const state = baseState({
    endpoints: [endpoint({ id: 'e1', sheetName: 'Sheet 1', raw: { 'Ten API': 'Tra cuu TB' } })],
    runFilter: { methods: ['POST'], msisdnPatterns: [], authIds: [] },
  });
  const errors = validatePermissionScope(state);
  assert.ok(errors.some((e) => e.includes('Không endpoint nào để chạy')));
});

test('validatePermissionScope bao loi khi endpoint import tu ban cu (thieu raw)', () => {
  const state = baseState();
  delete state.endpoints.find((e) => e.id === 'e1').raw;
  const errors = validatePermissionScope(state);
  assert.ok(errors.some((e) => e.includes('Endpoints import từ bản cũ')));
});

test('validatePermissionScope bao loi khi chua chon sheet tham chieu (UC2)', () => {
  const errors = validatePermissionScope(baseState({
    permissionMapping: { usecase1: uc1, usecase2: { ...uc2, columnSheet: '' } },
  }));
  assert.ok(errors.some((e) => e.includes('Chưa chọn sheet endpoints tham chiếu')));
});

test('validatePermissionScope bao loi khi sheet tham chieu (UC2) khong co endpoint nao', () => {
  const errors = validatePermissionScope(baseState({
    permissionMapping: { usecase1: uc1, usecase2: { ...uc2, columnSheet: 'Sheet Khong Ton Tai' } },
  }));
  assert.ok(errors.some((e) => e.includes('Chưa chọn sheet endpoints tham chiếu')));
});

test('validatePermissionScope CHAP NHAN columnSheet la sheet khong dong UC1 nao khai', () => {
  const errors = validatePermissionScope(baseState({
    permissionMapping: { usecase1: uc1, usecase2: { ...uc2, columnSheet: 'Common' } },
  }));
  assert.ok(!errors.some((e) => e.includes('sheet endpoints tham chiếu')));
});

test('validatePermissionScope bao loi khi hai dong UC1 cung auth khai cot ROLE khac nhau', () => {
  const moHo = [
    { endpointSheet: 'Sheet 1', permissionColumn: 'Sheet 1 - User', authProfileName: 'User Profile' },
    { endpointSheet: 'Sheet 2', permissionColumn: 'Sheet 1 - Admin', authProfileName: 'User Profile' },
  ];
  const errors = validatePermissionScope(baseState({
    permissionMapping: { usecase1: moHo, usecase2: uc2 },
  }));
  assert.ok(errors.some((e) => e.includes('khai hai cột ROLE khác nhau')));
});

test('validatePermissionScope chi bao mot lan cho moi auth du co ba dong tro len', () => {
  const moHo = [
    { endpointSheet: 'Sheet 1', permissionColumn: 'Sheet 1 - User', authProfileName: 'User Profile' },
    { endpointSheet: 'Sheet 2', permissionColumn: 'Sheet 1 - Admin', authProfileName: 'User Profile' },
    { endpointSheet: 'Sheet 2', permissionColumn: 'Sheet 2 - Cskh', authProfileName: 'User Profile' },
  ];
  const errors = validatePermissionScope(baseState({
    permissionMapping: { usecase1: moHo, usecase2: uc2 },
  }));
  assert.equal(errors.filter((e) => e.includes('khai hai cột ROLE khác nhau')).length, 1);
});

test('validatePermissionScope khong bao loi khi hai dong UC1 cung auth CUNG cot ROLE', () => {
  const lap = [
    { endpointSheet: 'Sheet 1', permissionColumn: 'Sheet 1 - User', authProfileName: 'User Profile' },
    { endpointSheet: 'Sheet 2', permissionColumn: 'Sheet 1 - User', authProfileName: 'User Profile' },
  ];
  const errors = validatePermissionScope(baseState({
    permissionMapping: { usecase1: lap, usecase2: uc2 },
  }));
  assert.ok(!errors.some((e) => e.includes('khai hai cột ROLE khác nhau')));
});

test('validatePermissionScope so khop auth bo hoa/thuong va khoang trang thua', () => {
  const moHo = [
    { endpointSheet: 'Sheet 1', permissionColumn: 'Sheet 1 - User', authProfileName: 'User Profile' },
    { endpointSheet: 'Sheet 2', permissionColumn: 'Sheet 1 - Admin', authProfileName: '  user PROFILE ' },
  ];
  const errors = validatePermissionScope(baseState({
    permissionMapping: { usecase1: moHo, usecase2: uc2 },
  }));
  assert.ok(errors.some((e) => e.includes('khai hai cột ROLE khác nhau')));
});

test('validatePermissionScope khong bao loi khi columnSheet la Sheet 2 nhung cot dich chi co o Sheet 1', () => {
  const errors = validatePermissionScope(baseState({
    permissionMapping: { usecase1: uc1, usecase2: { ...uc2, columnSheet: 'Sheet 2' } },
  }));
  assert.ok(!errors.some((e) => e.includes('sheet endpoints tham chiếu')));
  assert.ok(!errors.some((e) => e.includes('Chưa chọn cột đích')));
});

test('validatePermissionScope bao loi khi chua chon cot dich (UC2)', () => {
  const errors = validatePermissionScope(baseState({
    permissionMapping: { usecase1: uc1, usecase2: { ...uc2, endpointColumn: '' } },
  }));
  assert.ok(errors.some((e) => e.includes('Chưa chọn cột đích')));
});

test('validatePermissionScope bao loi khi cot dich (UC2) da bien mat', () => {
  const errors = validatePermissionScope(baseState({
    permissionMapping: { usecase1: uc1, usecase2: { ...uc2, endpointColumn: 'Cot Bien Mat' } },
  }));
  assert.ok(errors.some((e) => e.includes('Chưa chọn cột đích')));
});

test('validatePermissionScope bao loi khi sheet da luu bien mat khoi file', () => {
  const state = baseState();
  state.savedConfig.permissionSheet = 'Sheet Da Bi Xoa';
  const errors = validatePermissionScope(state);
  assert.ok(errors.some((e) => e.includes('Sheet đã lưu không còn trong file phân quyền')));
});

test('validatePermissionScope tra mang rong khi cau hinh sach', () => {
  const errors = validatePermissionScope(baseState());
  assert.deepEqual(errors, []);
});
