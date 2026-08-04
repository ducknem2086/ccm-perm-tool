import { state, persist, notify, makeAuth } from '../state.js';
import { hasToken, findDuplicateNames } from '../shared/auth-utils.js';
import {
  identityOf, authIdentityErrors, authWarnings, verifyAuth,
} from '../shared/auth-identity.js';

function textInput(cls, value, placeholder, onInput, onFocusChange) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = `input mono ${cls}`;
  input.spellcheck = false;
  input.value = value ?? '';
  input.placeholder = placeholder;
  input.addEventListener('input', () => {
    onFocusChange?.(input);
    onInput(input.value);
  });
  return input;
}

function labelled(text, control) {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  const span = document.createElement('span');
  span.className = 'label';
  span.textContent = text;
  wrap.append(span, control);
  return wrap;
}

function fmtExp(exp) {
  if (!exp) return null;
  const d = new Date(exp * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

export function initAuthsPanel() {
  const host = document.getElementById('auths-list');
  const addBtn = document.getElementById('btn-add-auth');
  const badge = document.getElementById('tab-auths-badge');

  // AUTHS tu subscribe lai chinh no (main.js) de cap nhat status/badge moi lan
  // notify() tu bat ky dau. Nhung go phim trong panel nay cung goi notify(),
  // nen render() se tu pha DOM cua chinh no giua luc dang go: mat focus (chi
  // go duoc 1 ky tu) va cac the profile khac index 0 sap lai vi `open` truoc
  // day tinh theo index thay vi nho theo id. Hai bien duoi day sua ca hai:
  // openIds nho the nao dang mo theo id (khong phu thuoc index), pendingFocus
  // nho o dang go + vi tri con tro de gan lai focus sau khi cay DOM moi dung xong.
  const openIds = new Set();
  // Ket qua Verify theo id profile. Chi hien sau khi nguoi dung bam — va bi
  // xoa ngay khi ho sua o cURL/role, vi luc do ket qua cu da lac hau.
  const verified = new Map();
  let pendingFocus = null;

  function rememberFocus(authId, cls, el) {
    pendingFocus = { authId, cls, selStart: el.selectionStart, selEnd: el.selectionEnd };
  }

  function restoreFocus() {
    if (!pendingFocus) return;
    const { authId, cls, selStart, selEnd } = pendingFocus;
    pendingFocus = null;
    const box = [...host.querySelectorAll('.auth-card')].find((c) => c.dataset.authId === authId);
    const el = box?.querySelector(`.${cls}`);
    if (!el) return;
    el.focus?.();
    if (selStart != null && el.setSelectionRange) el.setSelectionRange(selStart, selEnd);
  }

  function remove(index) {
    if (state.auths.length <= 1) return;
    const [gone] = state.auths.splice(index, 1);
    state.runFilter.authIds = (state.runFilter.authIds ?? []).filter((id) => id !== gone.id);
    persist();
    notify();
    render();
  }

  function duplicate(index) {
    // Bo id ra khoi ban sao truoc khi goi makeAuth: makeAuth spread `over` sau
    // `id`, nen de nguyen id cu (hay id: undefined) deu ghi de mat id moi.
    const { id, ...rest } = state.auths[index];
    state.auths.splice(index + 1, 0, makeAuth({ ...rest, name: `${rest.name} (copy)` }));
    persist();
    notify();
    render();
  }

  // Xoa NOI DUNG da nhap, giu lai chinh profile — khac han nut '✕' (xoa ca
  // profile). Giu `id` va `name` de runFilter.authIds va mapping UC1 khai
  // theo ten khong bi dut. Duong thoat khi credential cu con sot lai dang de
  // len HEADERS CHUNG (xem migrateAuths, state.js).
  function clearEntry(index) {
    verified.delete(state.auths[index].id);
    state.auths[index] = { ...state.auths[index], curlRaw: '', role: '' };
    persist();
    notify();
    render();
  }

  const hasEntry = (auth) => (
    String(auth?.curlRaw ?? '').trim() !== '' || String(auth?.role ?? '').trim() !== ''
  );

  const STATUS_ICON = {
    pass: '✓', fail: '✕', warn: '!', skip: '·',
  };

  // Bang ket qua Verify: tra loi thang cau "cURL nay co du dieu kien de
  // KHONG bi 401 chua", tach theo tung usecase vi hai duong xac thuc bang
  // hai thu khac nhau.
  function verifyReport(auth) {
    const report = verified.get(auth.id);
    const wrap = document.createElement('div');
    wrap.className = 'auth-verify';
    if (!report) return wrap;

    const failed = report.checks.filter((c) => c.status === 'fail');
    const warned = report.checks.filter((c) => c.status === 'warn');

    const verdict = document.createElement('p');
    verdict.className = `auth-verify-verdict ${report.ok ? 'is-ok' : 'is-bad'}`;
    if (!report.ok) {
      verdict.textContent = `✕ CHƯA ĐẠT — ${failed.length} lỗi chặn. Chạy sẽ dính 401.`;
    } else if (warned.length > 0) {
      verdict.textContent = `! ĐẠT MỘT PHẦN — ${warned.length} cảnh báo, xem bên dưới.`;
    } else {
      verdict.textContent = '✓ ĐẠT — đủ điều kiện cho cả request nghiệp vụ lẫn CHECK PERM.';
    }
    wrap.append(verdict);

    const list = document.createElement('ul');
    list.className = 'auth-verify-list';
    for (const c of report.checks) {
      const li = document.createElement('li');
      li.className = `auth-verify-item is-${c.status}`;
      const head = document.createElement('span');
      head.className = 'auth-verify-head';
      head.textContent = `${STATUS_ICON[c.status] ?? '·'} [${c.scope}] ${c.label}`;
      const detail = document.createElement('span');
      detail.className = 'auth-verify-detail mono';
      detail.textContent = c.detail;
      li.append(head, detail);
      list.append(li);
    }
    wrap.append(list);
    return wrap;
  }

  // Dong tom tat danh tinh doc tu chinh cURL da dan — nguoi dung thay ngay
  // minh dan nham cURL cua ai, hoac vi sao khong chay duoc, khong phai bam
  // CHECK PERM roi doi loi moi biet.
  function identitySummary(auth) {
    const wrap = document.createElement('div');
    wrap.className = 'auth-identity-summary';

    const id = identityOf(auth);
    const errors = authIdentityErrors(auth);

    if (id) {
      const line = document.createElement('p');
      line.className = 'hint mono';
      const bits = [`● ${id.accountId ?? '—'}`, `id ${id.individualId ?? '—'}`];
      const exp = fmtExp(id.exp);
      if (exp) bits.push(`hết hạn ${exp}`);
      bits.push(id.source === 'claims' ? 'nguồn claims_*' : 'nguồn access_token');
      line.textContent = bits.join(' · ');
      wrap.append(line);
    }

    for (const msg of errors) {
      const warn = document.createElement('p');
      warn.className = 'hint warning';
      warn.textContent = `⚠ ${msg}`;
      wrap.append(warn);
    }

    // Canh bao khong chan chay — vd dan nham cURL checkPermission (khong co
    // Authorization) vao AUTHS thi request nghiep vu di khong Bearer -> 401.
    for (const msg of authWarnings(auth)) {
      const note = document.createElement('p');
      note.className = 'hint auth-warn';
      note.textContent = `⚠ ${msg}`;
      wrap.append(note);
    }

    return wrap;
  }

  function bodyFor(auth, index) {
    const box = document.createElement('div');
    box.className = 'auth-body';

    const ta = document.createElement('textarea');
    ta.className = 'input mono ed-textarea';
    ta.spellcheck = false;
    ta.placeholder = 'Dán Copy as cURL của một request NGHIỆP VỤ đã đăng nhập (không phải checkPermission)'
      + ' — lệnh đó mang cả Authorization cho request nghiệp vụ lẫn cookie access_token cho CHECK PERM.';
    ta.value = auth.curlRaw ?? '';
    ta.addEventListener('input', () => {
      rememberFocus(auth.id, 'ed-textarea', ta);
      // Ket qua Verify cu noi ve ban dan cu — bo di ngay khi noi dung doi.
      verified.delete(auth.id);
      state.auths[index] = { ...state.auths[index], curlRaw: ta.value };
      persist();
      notify(); // global subscribe (main.js) goi lai render() cua chinh module nay
    });

    const role = textInput('auth-role', auth.role, 'role (vd core_donvixuly) — cần khi dùng CHECK PERM', (v) => {
      verified.delete(auth.id);
      state.auths[index] = { ...state.auths[index], role: v.trim() };
      persist();
      notify();
    }, (el) => rememberFocus(auth.id, 'auth-role', el));

    box.append(ta, identitySummary(auth), labelled('Role (CHECK PERM)', role), verifyReport(auth));
    return box;
  }

  // Chi to do / bo do o ten. Render lai ca danh sach giua luc dang go se lam
  // o nhap mat focus sau moi ky tu.
  function refreshNameValidity() {
    const dupNames = findDuplicateNames(state.auths);
    const inputs = host.querySelectorAll('.auth-name');
    state.auths.forEach((a, i) => {
      const trimmed = String(a.name ?? '').trim();
      inputs[i]?.classList.toggle('is-invalid', trimmed === '' || dupNames.has(trimmed));
    });
  }

  function card(auth, index, dupNames) {
    const box = document.createElement('details');
    box.className = 'card auth-card';
    box.dataset.authId = auth.id;
    box.open = openIds.has(auth.id);
    box.addEventListener('toggle', () => {
      if (box.open) openIds.add(auth.id); else openIds.delete(auth.id);
    });

    const head = document.createElement('summary');
    head.className = 'auth-head';

    const name = textInput('auth-name', auth.name, 'tên profile — bắt buộc', (v) => {
      state.auths[index] = { ...state.auths[index], name: v };
      persist();
      notify();
      refreshNameValidity();
    }, (el) => rememberFocus(auth.id, 'auth-name', el));
    // O ten nam trong <summary>: khong chan thi moi cu click deu gap/mo the.
    name.addEventListener('click', (e) => e.stopPropagation?.());
    const trimmed = String(auth.name ?? '').trim();
    name.classList.toggle('is-invalid', trimmed === '' || dupNames.has(trimmed));

    const status = document.createElement('span');
    status.className = `token-indicator ${hasToken(auth) ? '' : 'is-off'}`;
    status.textContent = hasToken(auth) ? '● token ok' : '○ chưa có token';

    const dup = document.createElement('button');
    dup.type = 'button';
    dup.className = 'btn btn-secondary btn-sm auth-dup';
    dup.textContent = '⧉';
    dup.title = 'Nhân bản profile này';
    dup.addEventListener('click', () => duplicate(index));

    // Bam mo luon the neu dang gap — ket qua nam trong body, khong thay thi
    // bam Verify tuong nhu khong co gi xay ra.
    const verify = document.createElement('button');
    verify.type = 'button';
    verify.className = 'btn btn-secondary btn-sm auth-verify-btn';
    verify.textContent = '✓ Verify';
    verify.title = 'Kiểm cURL đã đủ điều kiện auth chưa — có Bearer, có access_token, còn hạn, khớp phiên';
    verify.addEventListener('click', () => {
      verified.set(auth.id, verifyAuth(state.auths[index]));
      openIds.add(auth.id);
      render();
    });

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'btn btn-secondary btn-sm auth-clear';
    clear.textContent = '⌫';
    clear.disabled = !hasEntry(auth);
    clear.title = clear.disabled
      ? 'Chưa nhập gì để xoá'
      : 'Xoá cURL và role đã nhập — giữ lại profile';
    clear.addEventListener('click', () => clearEntry(index));

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn btn-secondary btn-sm auth-del';
    del.textContent = '✕';
    del.disabled = state.auths.length <= 1;
    del.title = del.disabled ? 'Phải giữ lại ít nhất 1 profile' : 'Xóa profile này';
    del.addEventListener('click', () => remove(index));

    head.append(name, status, verify, clear, dup, del);
    box.append(head, bodyFor(auth, index));
    return box;
  }

  function render() {
    const dupNames = findDuplicateNames(state.auths);
    // Chua the nao dang mo (vd sau khi xoa dung profile dang mo) thi mo lai
    // profile dau tien, giu hanh vi mac dinh nhu truoc.
    if (state.auths.length > 0 && !state.auths.some((a) => openIds.has(a.id))) {
      openIds.add(state.auths[0].id);
    }
    host.replaceChildren(...state.auths.map((a, i) => card(a, i, dupNames)));
    if (badge) badge.textContent = String(state.auths.length);
    restoreFocus();
  }

  addBtn.addEventListener('click', () => {
    state.auths.push(makeAuth({ name: `Profile ${state.auths.length + 1}` }));
    persist();
    notify();
    render();
  });

  render();
  return { render };
}
