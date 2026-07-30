import { state, persist, notify, subscribe } from '../state.js';
import { createEditableList } from './editable-list.js';
import { mapRows } from '../shared/endpoint-mapping.js';
import { importGrid } from '../api.js';
import { matchesEndpointSearch } from '../shared/endpoint-search.js';
import { createMethodFilterGroup } from './method-filter.js';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const MAX_SHOWN_ERRORS = 10;
let seq = 0;
const nextId = () => `ep_${Date.now().toString(36)}_${(seq += 1)}`;

// Endpoint cu trong localStorage thieu 7 truong nay — them mac dinh de chay
// y het truoc khi co cau hinh rieng.
const CONFIG_DEFAULTS = {
  queryMode: 'kv', queryRaw: '',
  headerMode: 'kv', headerRaw: '',
  bodyMode: 'none', bodyRaw: '', bodyParams: [],
};

function makeEndpoint(path, sheetName = 'Sheet 1') {
  return {
    id: nextId(), enabled: true, name: '', method: 'GET',
    pathTemplate: String(path ?? ''), attachMsisdn: true,
    sheetName: String(sheetName ?? 'Sheet 1'),
    queryParams: [], headers: [],
    ...CONFIG_DEFAULTS,
  };
}

function fromRecord(rec) {
  return {
    ...makeEndpoint(rec.endpoint, rec.sheetName),
    name: rec.name,
    method: rec.method,
    sheetName: rec.sheetName ?? 'Sheet 1',
  };
}

function allEnabled(endpoints) {
  return endpoints.length > 0 && endpoints.every((e) => e.enabled !== false);
}

// "Da co cau hinh rieng" duoc tinh theo mode dang chon — kv thi xet dong bat
// trong bang, raw thi xet chuoi co rong hay khong.
function hasCustomConfig(ep) {
  const queryActive = (ep.queryMode ?? 'kv') === 'raw'
    ? String(ep.queryRaw ?? '').trim() !== ''
    : (ep.queryParams ?? []).some((p) => p.enabled !== false);
  const headerActive = (ep.headerMode ?? 'kv') === 'raw'
    ? String(ep.headerRaw ?? '').trim() !== ''
    : (ep.headers ?? []).some((p) => p.enabled !== false);
  return queryActive || headerActive || (ep.bodyMode ?? 'none') !== 'none';
}

export function initEndpointList({ onOpenTemplate, onOpenConfig } = {}) {
  // Du lieu cu trong localStorage co the la mang chuoi, thieu name hoac thieu attachMsisdn.
  state.endpoints = (state.endpoints ?? []).map((e) => (
    typeof e === 'string' ? makeEndpoint(e) : { name: '', attachMsisdn: true, ...CONFIG_DEFAULTS, ...e }
  ));

  const host = document.getElementById('list-endpoint');

  // Nut check-all (toggle): thay vi luon mac dinh tat ca endpoint deu enabled,
  // cho phep bat/tat hang loat de chi dinh nhanh nhung API nao tao request.
  function setAllEnabled(value) {
    state.endpoints = state.endpoints.map((e) => ({ ...e, enabled: value }));
    persist();
    notify();
  }

  function toggleAllEnabled() {
    setAllEnabled(!allEnabled(state.endpoints));
  }

  function showErrors(errors) {
    host.querySelector('.el-errors')?.remove();
    if (errors.length === 0) return;

    const box = document.createElement('div');
    box.className = 'el-errors';

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'el-del';
    close.textContent = '✕';
    close.title = 'Ẩn danh sách lỗi';
    close.addEventListener('click', () => box.remove());
    box.append(close);

    for (const e of errors.slice(0, MAX_SHOWN_ERRORS)) {
      const line = document.createElement('div');
      line.textContent = `Dòng ${e.row}: ${e.reason}`;
      box.append(line);
    }
    if (errors.length > MAX_SHOWN_ERRORS) {
      const more = document.createElement('div');
      more.textContent = `… và ${errors.length - MAX_SHOWN_ERRORS} dòng lỗi nữa`;
      box.append(more);
    }
    host.append(box);
  }

  async function handleImport(file) {
    try {
      const grid = await importGrid(file);
      const { records, errors, skipped } = mapRows(
        grid, state.importTemplate, { dedupe: state.advanced.dedupeOnImport },
      );

      showErrors(errors);

      if (records.length === 0) {
        window.ccmToast?.(`Không nạp được endpoint nào từ ${file.name}`, 'error');
        return;
      }

      const current = state.endpoints;
      const incoming = records.map(fromRecord);
      let next;
      if (current.length === 0) {
        next = incoming;
      } else {
        const append = confirm(
          `Danh sách "ENDPOINTS" đang có ${current.length} dòng.\n\n`
          + 'OK = Nối thêm vào cuối\nCancel = Thay thế toàn bộ'
        );
        next = append ? [...current, ...incoming] : incoming;
      }

      state.endpoints = next;
      persist();
      notify();

      const bits = [];
      if (skipped > 0) bits.push(`bỏ ${skipped} dòng trùng`);
      if (errors.length > 0) bits.push(`${errors.length} dòng lỗi`);
      window.ccmToast?.(
        `Đã nạp ${records.length} endpoint từ ${file.name}`
        + (bits.length > 0 ? ` (${bits.join(', ')})` : ''),
        errors.length > 0 ? 'error' : 'ok',
      );
    } catch (err) {
      window.ccmToast?.(`Import thất bại: ${err.message}`, 'error');
    }
  }

  const extraActions = [];
  if (onOpenTemplate) {
    extraActions.push({ label: '⊢ Template', title: 'Cấu hình cột khi import', onClick: onOpenTemplate });
  }
  const checkAllActionIndex = extraActions.length;
  extraActions.push({
    label: '☑ Check all',
    title: 'Bật/tắt tất cả endpoint để tạo request',
    onClick: toggleAllEnabled,
  });

  const list = createEditableList({
    host,
    title: 'ENDPOINTS',
    kind: 'endpoint',
    placeholder: '/DataAggregationEngine/query/abc-information/{*}',
    getItems: () => state.endpoints,
    setItems: (v) => { state.endpoints = v; persist(); },
    onChange: notify,
    getValue: (ep) => ep.pathTemplate,
    setValue: (ep, v) => ({ ...ep, pathTemplate: v }),
    makeItem: makeEndpoint,
    onImport: handleImport,
    search: {
      placeholder: 'Tìm theo tên hoặc endpoint...',
      match: matchesEndpointSearch,
    },
    extraActions,
    renderExtra: (ep, index, row) => {
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = ep.enabled !== false;
      check.title = 'Bật/tắt endpoint này';
      check.addEventListener('change', () => {
        state.endpoints[index] = { ...state.endpoints[index], enabled: check.checked };
        persist();
        notify();
      });

      const method = document.createElement('select');
      method.className = 'el-method';
      for (const m of METHODS) {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        method.append(opt);
      }
      method.value = ep.method ?? 'GET';
      method.addEventListener('change', () => {
        state.endpoints[index] = { ...state.endpoints[index], method: method.value };
        persist();
        notify();
      });

      const name = document.createElement('input');
      name.className = 'el-input el-name';
      name.type = 'text';
      name.spellcheck = false;
      name.placeholder = 'Tên API';
      name.value = ep.name ?? '';
      name.addEventListener('input', () => {
        state.endpoints[index] = { ...state.endpoints[index], name: name.value };
        persist();
        notify();
      });

      const msisdnBox = document.createElement('span');
      msisdnBox.className = 'el-msisdn-toggle';
      msisdnBox.title = 'Gắn msisdn vào cuối path của endpoint này';

      const groupName = `attach_${ep.id}`;
      for (const opt of [{ v: true, label: 'Có' }, { v: false, label: 'Không' }]) {
        const wrap = document.createElement('label');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = groupName;
        radio.checked = (ep.attachMsisdn !== false) === opt.v;
        radio.addEventListener('change', () => {
          state.endpoints[index] = { ...state.endpoints[index], attachMsisdn: opt.v };
          persist();
          notify();
        });
        wrap.append(radio, document.createTextNode(opt.label));
        msisdnBox.append(wrap);
      }

      const gearBtn = document.createElement('button');
      gearBtn.type = 'button';
      gearBtn.className = 'btn btn-secondary btn-sm el-gear';
      gearBtn.classList.toggle('has-config', hasCustomConfig(ep));
      gearBtn.textContent = '⚙';
      gearBtn.title = 'Cấu hình riêng cho endpoint này (query, headers, body)';
      gearBtn.addEventListener('click', () => onOpenConfig?.(index));

      row.append(check, method, name, msisdnBox, gearBtn);
    },
  });

  // Filter method dat canh o tim endpoint theo ten — cung mot bang runFilter
  // voi run-filter-bar, chi doi cho hien thi.
  const methodFilter = createMethodFilterGroup();
  const searchInput = host.querySelector('[data-search]');
  if (searchInput) {
    const row = document.createElement('div');
    row.className = 'el-search-row';
    searchInput.replaceWith(row);
    row.append(methodFilter.el, searchInput);
  }

  const checkAllBtn = host.querySelector(`[data-extra-action="${checkAllActionIndex}"]`);

  function refreshCheckAllBtn() {
    if (!checkAllBtn) return;
    const on = allEnabled(state.endpoints);
    checkAllBtn.textContent = on ? '☐ Bỏ chọn tất cả' : '☑ Chọn tất cả';
    checkAllBtn.title = on
      ? 'Bỏ chọn tất cả endpoint (không tạo request)'
      : 'Chọn tất cả endpoint để tạo request';
  }
  refreshCheckAllBtn();

  // Drawer cau hinh rieng ghi thang vao state roi notify() — can render lai
  // de cham "has-config" tren nut gear cap nhat ngay.
  subscribe(() => { list.render(); methodFilter.render(); refreshCheckAllBtn(); });

  return list;
}

