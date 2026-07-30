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

export function getUniqueSheets(endpoints) {
  if (!Array.isArray(endpoints)) return [];
  const set = new Set(endpoints.map((e) => e?.sheetName).filter(Boolean));
  return Array.from(set);
}

function filterBySheet(endpoints, selectedSheet) {
  if (!selectedSheet || selectedSheet === 'all') return endpoints;
  return endpoints.filter((e) => (e?.sheetName ?? 'Sheet 1') === selectedSheet);
}

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

  const sheetSelect = document.createElement('select');
  sheetSelect.className = 'el-sheet-select';

  function refreshSheetSelect() {
    const sheets = getUniqueSheets(state.endpoints);
    sheetSelect.replaceChildren();

    const optAll = document.createElement('option');
    optAll.value = 'all';
    optAll.textContent = 'Tất cả sheet (All)';
    sheetSelect.append(optAll);

    for (const s of sheets) {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      sheetSelect.append(opt);
    }
    sheetSelect.value = state.selectedSheet ?? 'all';
  }

  sheetSelect.addEventListener('change', () => {
    state.selectedSheet = sheetSelect.value;
    persist();
    notify();
  });

  const sheetTabsContainer = document.createElement('div');
  sheetTabsContainer.className = 'el-sheet-tabs';

  function refreshSheetTabs() {
    sheetTabsContainer.replaceChildren();
    const sheets = getUniqueSheets(state.endpoints);
    if (sheets.length <= 1) {
      sheetTabsContainer.hidden = true;
      return;
    }
    sheetTabsContainer.hidden = false;

    const activeSheet = state.selectedSheet ?? 'all';

    const allTab = document.createElement('button');
    allTab.type = 'button';
    allTab.className = `btn btn-sm ${activeSheet === 'all' ? 'btn-primary' : 'btn-secondary'}`;
    allTab.textContent = 'Tất cả (All)';
    allTab.addEventListener('click', () => {
      state.selectedSheet = 'all';
      persist();
      notify();
    });
    sheetTabsContainer.append(allTab);

    for (const s of sheets) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = `btn btn-sm ${activeSheet === s ? 'btn-primary' : 'btn-secondary'}`;
      tab.textContent = s;
      tab.addEventListener('click', () => {
        state.selectedSheet = s;
        persist();
        notify();
      });
      sheetTabsContainer.append(tab);
    }
  }

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
    getItems: () => filterBySheet(state.endpoints, state.selectedSheet),
    setItems: (v) => {
      const sheet = state.selectedSheet ?? 'all';
      if (!sheet || sheet === 'all') {
        state.endpoints = v;
      } else {
        const others = state.endpoints.filter((e) => (e?.sheetName ?? 'Sheet 1') !== sheet);
        state.endpoints = [...others, ...v];
      }
      persist();
    },
    onChange: notify,
    getValue: (ep) => ep.pathTemplate,
    setValue: (ep, v) => ({ ...ep, pathTemplate: v }),
    makeItem: (path) => makeEndpoint(path, (state.selectedSheet && state.selectedSheet !== 'all') ? state.selectedSheet : 'Sheet 1'),
    onImport: handleImport,
    search: {
      placeholder: 'Tìm theo tên hoặc endpoint...',
      match: matchesEndpointSearch,
    },
    extraActions,
    renderExtra: (ep, index, row) => {
      const realIndex = state.endpoints.findIndex((item) => item.id === ep.id || item === ep);
      const targetIdx = realIndex !== -1 ? realIndex : index;

      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = ep.enabled !== false;
      check.title = 'Bật/tắt endpoint này';
      check.addEventListener('change', () => {
        state.endpoints[targetIdx] = { ...state.endpoints[targetIdx], enabled: check.checked };
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
        state.endpoints[targetIdx] = { ...state.endpoints[targetIdx], method: method.value };
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
        state.endpoints[targetIdx] = { ...state.endpoints[targetIdx], name: name.value };
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
          state.endpoints[targetIdx] = { ...state.endpoints[targetIdx], attachMsisdn: opt.v };
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
      gearBtn.addEventListener('click', () => onOpenConfig?.(targetIdx));

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
    row.append(sheetSelect, methodFilter.el, searchInput);
  }

  const bodyEl = host.querySelector('[data-body]');
  if (typeof host.insertBefore === 'function' && bodyEl) {
    host.insertBefore(sheetTabsContainer, bodyEl);
  } else {
    host.append(sheetTabsContainer);
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

  refreshSheetSelect();
  refreshSheetTabs();
  refreshCheckAllBtn();

  // Drawer cau hinh rieng ghi thang vao state roi notify() — can render lai
  // de cham "has-config" tren nut gear cap nhat ngay.
  subscribe(() => {
    refreshSheetSelect();
    refreshSheetTabs();
    list.render();
    methodFilter.render();
    refreshCheckAllBtn();
  });

  return list;
}

