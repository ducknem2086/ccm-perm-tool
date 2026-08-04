import { state, persist, notify, subscribe, makeCommonEndpoint } from '../state.js';

const KIND_LABEL = { business: 'Nghiệp vụ', oracle: 'Check permission' };

// Danh sach ENDPOINTS CHUNG co phan loai: 'business' vao pool RUN ALL nhu
// truoc, 'oracle' la khai bao endpoint checkPermission mac dinh cho UC3 —
// KHONG vao pool nao, chi con METHOD/path (danh tinh muon tu cURL cua tung
// auth profile — xem auth-identity.js). Cung khuon focus-preservation nhu
// auths-panel.js: state nay tu subscribe lai chinh no de dong bo sau import
// config, nen phai tu nho focus + vi tri con tro qua moi lan render() de
// khong mat ky tu dang go.
export function initCommonEndpoints() {
  const host = document.getElementById('common-endpoints-list');
  if (!host) return { render: () => {} };

  let pendingFocus = null;

  function rememberFocus(id, cls, el) {
    pendingFocus = { id, cls, selStart: el.selectionStart, selEnd: el.selectionEnd };
  }

  function restoreFocus() {
    if (!pendingFocus) return;
    const { id, cls, selStart, selEnd } = pendingFocus;
    pendingFocus = null;
    const box = [...host.querySelectorAll('.ce-group')].find((g) => g.dataset.id === id);
    const el = box?.querySelector(`.${cls}`);
    if (!el) return;
    el.focus?.();
    if (selStart != null && el.setSelectionRange) el.setSelectionRange(selStart, selEnd);
  }

  function update(index, patch) {
    state.commonEndpointList[index] = { ...state.commonEndpointList[index], ...patch };
    persist();
    notify();
  }

  function remove(index) {
    state.commonEndpointList.splice(index, 1);
    persist();
    notify();
  }

  function group(item, index) {
    const box = document.createElement('div');
    box.className = 'ce-group';
    box.dataset.id = item.id;

    const row = document.createElement('div');
    row.className = 'ce-row';

    const lineInput = document.createElement('input');
    lineInput.type = 'text';
    lineInput.className = 'input mono ce-line';
    lineInput.spellcheck = false;
    lineInput.placeholder = 'METHOD /path — vd POST /iam/engage/checkPermission';
    lineInput.value = item.line ?? '';
    lineInput.addEventListener('input', () => {
      rememberFocus(item.id, 'ce-line', lineInput);
      update(index, { line: lineInput.value });
    });

    const kindSel = document.createElement('select');
    kindSel.className = 'input input-sm ce-kind';
    for (const [value, label] of Object.entries(KIND_LABEL)) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      kindSel.append(opt);
    }
    kindSel.value = item.kind ?? 'business';
    kindSel.addEventListener('change', () => update(index, { kind: kindSel.value }));

    const isOracle = (item.kind ?? 'business') === 'oracle';

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'el-del';
    del.title = 'Xoá dòng';
    del.textContent = '✕';
    del.addEventListener('click', () => remove(index));

    row.append(lineInput, kindSel, del);
    box.append(row);

    // Dong 'oracle' luon mo san o cURL mau: no la KHUON cua request
    // checkPermission (URL + moi header cua app that + body skeleton), thieu
    // no thi Origin/Referer/X-Current-Url roi ve origin cua tool va IAM tra
    // 401 — xem buildOracleRequest (request-builder.js).
    if (isOracle) {
      const curlBox = document.createElement('textarea');
      curlBox.className = 'input mono ed-textarea ce-curl';
      curlBox.spellcheck = false;
      curlBox.placeholder = 'Dán nguyên lệnh cURL checkPermission thật (Copy as cURL). Tool giữ lại URL '
        + 'và mọi header của nó, chỉ thay Cookie + khối user bằng danh tính của auth profile đang chạy.';
      curlBox.value = item.curlRaw ?? '';
      curlBox.addEventListener('input', () => {
        rememberFocus(item.id, 'ce-curl', curlBox);
        update(index, { curlRaw: curlBox.value });
      });

      const hint = document.createElement('p');
      hint.className = 'hint ce-curl-hint';
      hint.textContent = String(item.curlRaw ?? '').trim() === ''
        ? '⚠ Chưa dán cURL mẫu — request sẽ mang Origin/Referer của tool, IAM nhiều khả năng trả 401.'
        : 'Đã có khuôn. Cookie và user trong lệnh này bị thay bằng danh tính của auth profile.';

      box.append(curlBox, hint);
    }

    return box;
  }

  function render() {
    const list = state.commonEndpointList ?? [];
    if (list.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'el-empty';
      empty.textContent = 'Chưa có dòng nào. Bấm "+ Thêm dòng".';
      host.replaceChildren(empty);
    } else {
      host.replaceChildren(...list.map((item, i) => group(item, i)));
    }
    restoreFocus();
  }

  document.getElementById('btn-common-endpoints-add')?.addEventListener('click', () => {
    state.commonEndpointList = [...(state.commonEndpointList ?? []), makeCommonEndpoint()];
    persist();
    notify();
  });

  subscribe(render);
  render();
  return { render };
}
