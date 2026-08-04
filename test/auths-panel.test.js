import test from 'node:test';
import assert from 'node:assert/strict';
import { MockElement, installMockDocument } from './helpers/mock-dom.js';
import { state, defaultConfig, makeAuth, subscribe } from '../public/js/state.js';
import { initAuthsPanel } from '../public/js/ui/auths-panel.js';

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function makeJwt(payload) {
  return `${b64url({ alg: 'RS256' })}.${b64url(payload)}.sig`;
}

const NOW = Math.floor(Date.now() / 1000);

function curlWithToken({
  individualId = 'ind-1', accountId = 'user@vnp.vn', exp = NOW + 3600, bearer = false,
} = {}) {
  const token = makeJwt({ individual_id: individualId, preferred_username: accountId, exp, sid: 's1', azp: 'tmf-api' });
  const authz = bearer ? `\\\n  -H 'Authorization: Bearer ${token}'` : '';
  return `curl 'https://x.vn/api' \\\n  -b 'access_token=${token}'${authz} \\\n  -H 'X-Tenant: vnpt'`;
}

function setup(auths) {
  const list = new MockElement('div', 'auths-list');
  const addBtn = new MockElement('button', 'btn-add-auth');
  const badge = new MockElement('span', 'tab-auths-badge');
  installMockDocument({ 'auths-list': list, 'btn-add-auth': addBtn, 'tab-auths-badge': badge });

  Object.assign(state, defaultConfig());
  state.auths = auths ?? [makeAuth({ name: 'PROD', curlRaw: curlWithToken() })];
  state.runFilter = { methods: [], msisdnPatterns: [], authIds: [] };

  const panel = initAuthsPanel();
  return {
    list, addBtn, badge, panel,
  };
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

test('nhan ban giu nguyen curlRaw va role, them hau to copy vao ten', () => {
  const { list } = setup([makeAuth({ name: 'PROD', curlRaw: curlWithToken(), role: 'core_donvixuly' })]);
  list.querySelector('.auth-dup').click();

  assert.equal(state.auths.length, 2);
  assert.equal(state.auths[1].name, 'PROD (copy)');
  assert.equal(state.auths[1].curlRaw, state.auths[0].curlRaw);
  assert.equal(state.auths[1].role, 'core_donvixuly');
  assert.notEqual(state.auths[1].id, state.auths[0].id);
});

/* ---------- nut Clear: xoa noi dung, giu profile ---------- */

test('nut clear xoa curlRaw va role nhung GIU profile, id va ten', () => {
  const { list } = setup([makeAuth({ name: 'PROD', curlRaw: curlWithToken(), role: 'core_donvixuly' })]);
  const idTruoc = state.auths[0].id;

  list.querySelector('.auth-clear').click();

  assert.equal(state.auths.length, 1, 'khong duoc xoa mat profile');
  assert.equal(state.auths[0].id, idTruoc, 'id phai giu nguyen cho runFilter.authIds');
  assert.equal(state.auths[0].name, 'PROD');
  assert.equal(state.auths[0].curlRaw, '');
  assert.equal(state.auths[0].role, '');
});

test('nut clear khong dung toi runFilter.authIds', () => {
  const a = makeAuth({ name: 'A', curlRaw: curlWithToken() });
  const b = makeAuth({ name: 'B', curlRaw: curlWithToken() });
  const { list } = setup([a, b]);
  state.runFilter.authIds = [a.id, b.id];

  list.querySelectorAll('.auth-clear')[0].click();

  assert.deepEqual(state.runFilter.authIds, [a.id, b.id]);
});

test('nut clear tat khi profile chua nhap gi, bat khi da co cURL hoac role', () => {
  const { list } = setup([
    makeAuth({ name: 'Rong', curlRaw: '', role: '' }),
    makeAuth({ name: 'Co cURL', curlRaw: curlWithToken(), role: '' }),
    makeAuth({ name: 'Chi co role', curlRaw: '', role: 'core_donvixuly' }),
  ]);
  const buttons = list.querySelectorAll('.auth-clear');

  assert.equal(buttons[0].disabled, true);
  assert.equal(buttons[1].disabled, false);
  assert.equal(buttons[2].disabled, false);
});

test('sau khi clear, the profile bao lai la chua co token va nut clear tu tat', () => {
  const { list } = setup([makeAuth({ name: 'PROD', curlRaw: curlWithToken() })]);
  assert.equal(list.querySelector('.token-indicator').classList.contains('is-off'), false);

  list.querySelector('.auth-clear').click();

  assert.equal(list.querySelector('.token-indicator').classList.contains('is-off'), true);
  assert.equal(list.querySelector('.auth-clear').disabled, true);
});

test('clear chi dong vao profile duoc bam, khong dung profile khac', () => {
  const { list } = setup([
    makeAuth({ name: 'A', curlRaw: curlWithToken(), role: 'role-A' }),
    makeAuth({ name: 'B', curlRaw: curlWithToken(), role: 'role-B' }),
  ]);

  list.querySelectorAll('.auth-clear')[0].click();

  assert.equal(state.auths[0].curlRaw, '');
  assert.notEqual(state.auths[1].curlRaw, '');
  assert.equal(state.auths[1].role, 'role-B');
});

/* ---------- nut Verify: verdict ro rang, khong chi canh bao thu dong ---------- */

const verifyBox = (list) => list.querySelector('.auth-verify');

test('chua bam Verify thi khong hien bang ket qua', () => {
  const { list } = setup([makeAuth({ name: 'A', curlRaw: curlWithToken(), role: 'r' })]);
  assert.equal(verifyBox(list).children.length, 0);
});

test('bam Verify hien verdict DAT khi cURL du dieu kien', () => {
  const { list } = setup([makeAuth({
    name: 'A', curlRaw: curlWithToken({ bearer: true }), role: 'core_donvixuly',
  })]);

  list.querySelector('.auth-verify-btn').click();

  const verdict = verifyBox(list).querySelector('.auth-verify-verdict');
  assert.ok(verdict.classList.contains('is-ok'));
  assert.match(verdict.textContent, /ĐẠT/);
});

test('bam Verify hien verdict CHUA DAT va dem so loi chan khi token het han', () => {
  const expired = curlWithToken({ exp: NOW - 3600 });
  const { list } = setup([makeAuth({ name: 'A', curlRaw: expired, role: 'r' })]);

  list.querySelector('.auth-verify-btn').click();

  const verdict = verifyBox(list).querySelector('.auth-verify-verdict');
  assert.ok(verdict.classList.contains('is-bad'));
  assert.match(verdict.textContent, /CHƯA ĐẠT/);
  assert.match(verdict.textContent, /401/);
});

test('bang Verify liet ke tung check kem usecase bi anh huong', () => {
  const { list } = setup([makeAuth({ name: 'A', curlRaw: curlWithToken(), role: 'r' })]);
  list.querySelector('.auth-verify-btn').click();

  const text = verifyBox(list).textContent;
  assert.match(text, /\[NGHIỆP VỤ\] Có Authorization/);
  assert.match(text, /\[CHECK PERM\] Cookie có access_token/);
});

// main.js subscribe lai authsPanel.render() moi lan notify() — mo phong dung
// day wiring do, khong thi o nhap doi ma DOM khong ve lai.
test('sua o cURL sau khi Verify thi bang ket qua bi go — khong de ket qua lac hau', () => {
  const { list, panel } = setup([makeAuth({ name: 'A', curlRaw: curlWithToken(), role: 'r' })]);
  const unsubscribe = subscribe(() => panel.render());

  try {
    list.querySelector('.auth-verify-btn').click();
    assert.ok(verifyBox(list).children.length > 0);

    list.querySelector('.ed-textarea').input('curl khac');

    assert.equal(verifyBox(list).children.length, 0);
  } finally {
    unsubscribe();
  }
});

test('bam Clear cung go bang ket qua Verify', () => {
  const { list } = setup([makeAuth({ name: 'A', curlRaw: curlWithToken(), role: 'r' })]);
  list.querySelector('.auth-verify-btn').click();
  assert.ok(verifyBox(list).children.length > 0);

  list.querySelector('.auth-clear').click();

  assert.equal(verifyBox(list).children.length, 0);
});

test('Verify chi hien ket qua cho dung profile duoc bam', () => {
  const { list } = setup([
    makeAuth({ name: 'A', curlRaw: curlWithToken(), role: 'r' }),
    makeAuth({ name: 'B', curlRaw: curlWithToken(), role: 'r' }),
  ]);

  list.querySelectorAll('.auth-verify-btn')[0].click();

  const boxes = list.querySelectorAll('.auth-verify');
  assert.ok(boxes[0].children.length > 0);
  assert.equal(boxes[1].children.length, 0);
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

test('sua o cURL ghi vao curlRaw, khong con o token/cookie/refreshToken rieng', () => {
  const { list } = setup([makeAuth({ name: 'A' })]);
  const card = list.querySelector('.auth-card');
  assert.equal(card.querySelector('.auth-token'), null);
  assert.equal(card.querySelector('.auth-cookie'), null);
  assert.equal(card.querySelector('[data-mode]'), null);

  const cmd = curlWithToken();
  card.querySelector('.ed-textarea').input(cmd);
  assert.equal(state.auths[0].curlRaw, cmd);
});

test('sua o role ghi vao state.role, trim khoang trang', () => {
  const { list } = setup([makeAuth({ name: 'A' })]);
  list.querySelector('.auth-role').input('  core_donvixuly  ');
  assert.equal(state.auths[0].role, 'core_donvixuly');
});

test('token-indicator bat khi cookie co access_token con han, tat khi khong', () => {
  const { list } = setup([
    makeAuth({ name: 'A', curlRaw: curlWithToken() }),
    makeAuth({ name: 'B', curlRaw: '' }),
  ]);
  const indicators = list.querySelectorAll('.token-indicator');
  assert.equal(indicators[0].classList.contains('is-off'), false);
  assert.equal(indicators[1].classList.contains('is-off'), true);
});

test('dong tom tat danh tinh hien accountId va individualId doc tu cURL', () => {
  const { list } = setup([makeAuth({
    name: 'A', curlRaw: curlWithToken({ individualId: 'ind-XYZ', accountId: 'vnp_x@vnp.vn' }),
  })]);
  const summary = list.querySelector('.auth-identity-summary').textContent;
  assert.match(summary, /vnp_x@vnp\.vn/);
  assert.match(summary, /ind-XYZ/);
});

test('canh bao doi soat hien khi access_token het han', () => {
  const expired = curlWithToken({ exp: NOW - 3600 });
  const { list } = setup([makeAuth({ name: 'A', curlRaw: expired })]);
  const warn = list.querySelector('.auth-identity-summary').querySelector('.warning');
  assert.ok(warn);
  assert.match(warn.textContent, /hết hạn/);
});

test('canh bao doi soat hien khi chua dan cURL', () => {
  const { list } = setup([makeAuth({ name: 'A', curlRaw: '' })]);
  const warn = list.querySelector('.auth-identity-summary').querySelector('.warning');
  assert.ok(warn);
  assert.match(warn.textContent, /Chưa dán cURL/);
});

test('badge tren tab hien so profile', () => {
  const { badge } = setup([makeAuth({ name: 'A' }), makeAuth({ name: 'B' })]);
  assert.equal(badge.textContent, '2');
});

// main.js subscribe lai authsPanel.render() moi lan notify() tu bat ky dau —
// ke ca tu chinh o nhap trong panel nay. Truoc khi sua, render() day pha DOM
// (host.replaceChildren) lam mat focus sau moi ky tu, va box.open tinh theo
// index (== index === 0) nen the nao khac profile dau se tu dong sap lai.
test('go nhieu ky tu vao profile nhan ban khong sap the / khong mat focus', () => {
  const { list, panel } = setup([makeAuth({ name: 'PROD', curlRaw: curlWithToken() })]);
  const unsubscribe = subscribe(() => panel.render());

  try {
    list.querySelector('.auth-dup').click();
    const dupCard = cards(list)[1];
    dupCard.open = true;
    dupCard.dispatchEvent({ type: 'toggle' });

    const roleInput = () => cards(list)[1].querySelector('.auth-role');
    roleInput().input('X');
    roleInput().input('XY');

    assert.equal(state.auths[1].role, 'XY');
    assert.equal(cards(list)[1].open, true, 'the profile nhan ban phai con mo sau khi go');
    assert.equal(roleInput()._focused, true, 'o role phai con focus sau ky tu thu 2');
  } finally {
    unsubscribe();
  }
});
