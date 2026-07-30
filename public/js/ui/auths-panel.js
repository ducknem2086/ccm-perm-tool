import { state, persist, notify, makeAuth } from '../state.js';
import { hasToken, findDuplicateNames, authHeaderPairs } from '../shared/auth-utils.js';

const MODES = [
  { value: 'fields', label: '3 ô riêng' },
  { value: 'curl', label: 'Dán cURL' },
];

const FIELDS = [
  { key: 'token', label: 'Bearer token', cls: 'auth-token', placeholder: 'dán token vào đây' },
  { key: 'cookie', label: 'Cookie', cls: 'auth-cookie', placeholder: 'BIGipServerpool_...=...' },
  { key: 'refreshToken', label: 'Refresh token', cls: 'auth-refresh', placeholder: 'để trống trừ khi API đòi' },
];

function textInput(cls, value, placeholder, onInput) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = `input mono ${cls}`;
  input.spellcheck = false;
  input.value = value ?? '';
  input.placeholder = placeholder;
  input.addEventListener('input', () => onInput(input.value));
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

export function initAuthsPanel() {
  const host = document.getElementById('auths-list');
  const addBtn = document.getElementById('btn-add-auth');
  const badge = document.getElementById('tab-auths-badge');

  function update(index, patch) {
    state.auths[index] = { ...state.auths[index], ...patch };
    persist();
    notify();
    render();
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

  function modeRow(auth, index) {
    const row = document.createElement('div');
    row.className = 'auth-mode-row';
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = 'Cách nhập:';
    row.append(label);

    for (const m of MODES) {
      const wrap = document.createElement('label');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = `authmode_${auth.id}`;
      radio.dataset.mode = m.value;
      radio.checked = (auth.mode ?? 'fields') === m.value;
      // Dung 'click' chu khong 'change': DOM gia trong test khong tu ban change.
      radio.addEventListener('click', () => update(index, { mode: m.value }));
      wrap.append(radio, document.createTextNode(m.label));
      row.append(wrap);
    }
    return row;
  }

  function bodyFor(auth, index) {
    const box = document.createElement('div');
    box.className = 'auth-body';

    if ((auth.mode ?? 'fields') === 'curl') {
      const ta = document.createElement('textarea');
      ta.className = 'input mono ed-textarea';
      ta.spellcheck = false;
      ta.placeholder = 'Dán nguyên lệnh Copy as cURL vào đây — dòng URL và các cờ khác tự bị bỏ qua.';
      ta.value = auth.curlRaw ?? '';
      ta.addEventListener('input', () => {
        state.auths[index] = { ...state.auths[index], curlRaw: ta.value };
        persist();
        notify();
        count.textContent = countText(state.auths[index]);
      });

      const count = document.createElement('p');
      count.className = 'hint auth-curl-count';
      count.textContent = countText(auth);

      box.append(ta, count);
      return box;
    }

    for (const f of FIELDS) {
      box.append(labelled(f.label, textInput(f.cls, auth[f.key], f.placeholder, (v) => {
        state.auths[index] = { ...state.auths[index], [f.key]: v.trim() };
        persist();
        notify();
      })));
    }
    return box;
  }

  function countText(auth) {
    const pairs = authHeaderPairs(auth);
    if (pairs.length === 0) return 'Chưa nhận được header nào.';
    const names = pairs.map((p) => p.key.toLowerCase());
    const bits = [];
    if (names.includes('authorization')) bits.push('Authorization');
    if (names.includes('cookie')) bits.push('Cookie');
    return `Đã nhận ${pairs.length} header${bits.length > 0 ? `, có ${bits.join(' và ')}` : ''}.`;
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
    box.open = index === 0;

    const head = document.createElement('summary');
    head.className = 'auth-head';

    const name = textInput('auth-name', auth.name, 'tên profile — bắt buộc', (v) => {
      state.auths[index] = { ...state.auths[index], name: v };
      persist();
      notify();
      refreshNameValidity();
    });
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

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn btn-secondary btn-sm auth-del';
    del.textContent = '✕';
    del.disabled = state.auths.length <= 1;
    del.title = del.disabled ? 'Phải giữ lại ít nhất 1 profile' : 'Xóa profile này';
    del.addEventListener('click', () => remove(index));

    head.append(name, status, dup, del);
    box.append(head, modeRow(auth, index), bodyFor(auth, index));
    return box;
  }

  function render() {
    const dupNames = findDuplicateNames(state.auths);
    host.replaceChildren(...state.auths.map((a, i) => card(a, i, dupNames)));
    if (badge) badge.textContent = String(state.auths.length);
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
