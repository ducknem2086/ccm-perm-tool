import { state, persist, notify, subscribe } from '../state.js';
import { createEditableList } from './editable-list.js';
import { mapRows } from '../shared/endpoint-mapping.js';
import { importGrid } from '../api.js';
import { matchesEndpointSearch } from '../shared/endpoint-search.js';
import { createMethodFilterGroup } from './method-filter.js';
import { allTabEndpoints } from '../shared/endpoint-dedupe.js';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const MAX_SHOWN_ERRORS = 5;
let seq = 0;
const nextId = () => `ep_${Date.now().toString(36)}_${(seq += 1)}`;

// Endpoint cu trong localStorage thieu 7 truong nay — them mac dinh de chay
// y het truoc khi co cau hinh rieng.
const CONFIG_DEFAULTS = {
  queryMode: 'kv', queryRaw: '',
  headerMode: 'kv', headerRaw: '',
  bodyMode: 'none', bodyRaw: '', bodyParams: [],
  attachCommonQuery: true,
};

export function getUniqueSheets(endpoints) {
  if (!Array.isArray(endpoints)) return [];
  const set = new Set(endpoints.map((e) => e?.sheetName).filter(Boolean));
  return Array.from(set);
}

// getUniqueSheets chi thay sheet co it nhat mot dong map thanh cong. Sheet bi
// lech cot theo template dang chon (mapSingleSheetRows tra 0 record) bien mat
// khoi tab/dropdown du van co trong file — day la nguyen nhan "khong hien du
// sheet" nguoi dung bao. Ba ham duoi day giu lai TEN sheet tho tu grid da doc,
// doc lap voi ket qua mapping, de tab luon hien het sheet trong file goc.
export function sheetNamesFromGrid(grid) {
  const sheets = Array.isArray(grid?.sheets) && grid.sheets.length > 0
    ? grid.sheets
    : [{ name: 'Sheet 1' }];
  return Array.from(new Set(sheets.map((s) => s?.name ?? 'Sheet 1')));
}

export function mergeSheetNames(existing, incoming, { replace = false } = {}) {
  const base = replace ? [] : (Array.isArray(existing) ? existing : []);
  return Array.from(new Set([...base, ...incoming]));
}

export function combineKnownSheetNames(knownNames, endpoints) {
  const known = Array.isArray(knownNames) ? knownNames : [];
  return Array.from(new Set([...known, ...getUniqueSheets(endpoints)]));
}

export function filterBySheet(endpoints, selectedSheet) {
  if (!selectedSheet || selectedSheet === 'all') {
    return allTabEndpoints(endpoints);
  }
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

export function fromRecord(rec) {
  return {
    ...makeEndpoint(rec.endpoint, rec.sheetName),
    name: rec.name,
    method: rec.method,
    sheetName: rec.sheetName ?? 'Sheet 1',
    raw: rec.raw ?? {},
  };
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

export function getEndpointsInCurrentTab() {
  const selected = state.selectedSheet ?? 'all';
  if (!selected || selected === 'all') return state.endpoints;
  return state.endpoints.filter((e) => (e?.sheetName ?? 'Sheet 1') === selected);
}

export function allEnabledInCurrentTab() {
  const list = getEndpointsInCurrentTab();
  return list.length > 0 && list.every((e) => e.enabled !== false);
}

export function setAllEnabledInCurrentTab(value) {
  const selected = state.selectedSheet ?? 'all';
  if (!selected || selected === 'all') {
    state.endpoints = state.endpoints.map((e) => ({ ...e, enabled: value }));
  } else {
    state.endpoints = state.endpoints.map((e) => {
      if ((e?.sheetName ?? 'Sheet 1') === selected) {
        return { ...e, enabled: value };
      }
      return e;
    });
  }
  persist();
  notify();
}

export function toggleAllEnabled() {
  setAllEnabledInCurrentTab(!allEnabledInCurrentTab());
}

export function allMsisdnInCurrentTab() {
  const list = getEndpointsInCurrentTab();
  return list.length > 0 && list.every((e) => e.attachMsisdn !== false);
}

export function setAllMsisdnInCurrentTab(val) {
  const selected = state.selectedSheet ?? 'all';
  if (!selected || selected === 'all') {
    state.endpoints = state.endpoints.map((e) => ({ ...e, attachMsisdn: val }));
  } else {
    state.endpoints = state.endpoints.map((e) => {
      if ((e?.sheetName ?? 'Sheet 1') === selected) {
        return { ...e, attachMsisdn: val };
      }
      return e;
    });
  }
  persist();
  notify();
}

export function toggleAllMsisdn() {
  setAllMsisdnInCurrentTab(!allMsisdnInCurrentTab());
}

export function allCommonQueryInCurrentTab() {
  const list = getEndpointsInCurrentTab();
  return list.length > 0 && list.every((e) => e.attachCommonQuery !== false);
}

export function setAllCommonQueryInCurrentTab(val) {
  const selected = state.selectedSheet ?? 'all';
  if (!selected || selected === 'all') {
    state.endpoints = state.endpoints.map((e) => ({ ...e, attachCommonQuery: val }));
  } else {
    state.endpoints = state.endpoints.map((e) => {
      if ((e?.sheetName ?? 'Sheet 1') === selected) {
        return { ...e, attachCommonQuery: val };
      }
      return e;
    });
  }
  persist();
  notify();
}

export function toggleAllCommonQuery() {
  setAllCommonQueryInCurrentTab(!allCommonQueryInCurrentTab());
}

// Khoa dong nhat voi dedupeEndpoints (endpoint-dedupe.js:8-10) — cung mot dinh
// nghia "trung endpoint" voi cho khu trung tab All.
export function endpointKey(ep) {
  const method = String(ep?.method ?? 'GET').toUpperCase();
  const path = String(ep?.pathTemplate ?? '').trim();
  return `${method}:${path}`;
}

export function allFieldOnVisible(visible, field) {
  const list = visible ?? [];
  return list.length > 0 && list.every((e) => e?.[field] !== false);
}

// Pham vi ghi = pool cua tab hien tai; dieu kien = khoa nam trong tap dang
// hien. Tab All: pool la toan bo state.endpoints nen ban trung bi khu di khi
// hien thi van doi theo — RUN ALL doc thang state.endpoints, bo sot ban trung
// la sinh request lech cau hinh ma khong co gi bao. Tab mot sheet: pool bo hep
// lai dung sheet do nen khong ro sang sheet khac du trung METHOD:path.
export function setFieldForVisible(visible, field, val) {
  const keys = new Set((visible ?? []).map(endpointKey));
  if (keys.size === 0) return;

  const sheet = state.selectedSheet ?? 'all';
  state.endpoints = state.endpoints.map((e) => {
    const inScope = sheet === 'all' || (e?.sheetName ?? 'Sheet 1') === sheet;
    if (!inScope || !keys.has(endpointKey(e))) return e;
    return { ...e, [field]: val };
  });
  persist();
  notify();
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
    const sheets = combineKnownSheetNames(state.endpointSheetNames, state.endpoints);
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
    const sheets = combineKnownSheetNames(state.endpointSheetNames, state.endpoints);
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

  function showErrors(errors) {
    // Vung loi nam ngoai card ENDPOINTS (xem #endpoint-import-errors trong
    // index.html). Fallback ve host de panel van bao loi neu markup do thieu.
    const errHost = document.getElementById('endpoint-import-errors') ?? host;
    errHost.querySelector('.el-errors')?.remove();
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
    errHost.append(box);
  }

  async function handleImport(file) {
    try {
      const grid = await importGrid(file);
      const { records, errors, skipped } = mapRows(
        grid, state.importTemplate, { dedupe: false },
      );

      showErrors(errors);

      if (records.length === 0) {
        window.ccmToast?.(`Không nạp được endpoint nào từ ${file.name}`, 'error');
        return;
      }

      const current = state.endpoints;
      const incoming = records.map(fromRecord);
      let next;
      let replace = true;
      if (current.length === 0) {
        next = incoming;
      } else {
        const append = confirm(
          `Danh sách "ENDPOINTS" đang có ${current.length} dòng.\n\n`
          + 'OK = Nối thêm vào cuối\nCancel = Thay thế toàn bộ'
        );
        next = append ? [...current, ...incoming] : incoming;
        replace = !append;
      }

      state.endpoints = next;
      state.endpointSheetNames = mergeSheetNames(
        state.endpointSheetNames, sheetNamesFromGrid(grid), { replace },
      );
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

  const msisdnAllActionIndex = extraActions.length;
  extraActions.push({
    label: '☑ MSISDN: Tất cả Có',
    title: 'Bật/tắt MSISDN cho tất cả endpoint trong tab hiện tại',
    onClick: toggleAllMsisdn,
  });

  const commonQueryAllActionIndex = extraActions.length;
  extraActions.push({
    label: '☑ Query: Tất cả Có',
    title: 'Bật/tắt Query chung cho tất cả endpoint trong tab hiện tại',
    onClick: toggleAllCommonQuery,
  });

  const msisdnFilteredActionIndex = extraActions.length;
  extraActions.push({
    label: '☐ MSISDN (lọc): chưa lọc',
    title: 'Bật/tắt MSISDN cho các dòng đang hiện trên bảng',
    onClick: () => {
      const visible = list.getVisibleItems();
      setFieldForVisible(visible, 'attachMsisdn', !allFieldOnVisible(visible, 'attachMsisdn'));
    },
  });

  const commonQueryFilteredActionIndex = extraActions.length;
  extraActions.push({
    label: '☐ Query (lọc): chưa lọc',
    title: 'Bật/tắt Query chung cho các dòng đang hiện trên bảng',
    onClick: () => {
      const visible = list.getVisibleItems();
      setFieldForVisible(visible, 'attachCommonQuery', !allFieldOnVisible(visible, 'attachCommonQuery'));
    },
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
    onClear: () => {
      if (state.endpoints.length === 0) return;
      if (!confirm(`Xóa toàn bộ ${state.endpoints.length} endpoint trên tất cả các tab?`)) return;
      state.endpoints = [];
      state.endpointSheetNames = [];
      persist();
      notify();
    },
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

      const commonQueryBox = document.createElement('span');
      commonQueryBox.className = 'el-common-query-toggle';
      commonQueryBox.title = 'Gắn query params chung vào URL của endpoint này';

      const commonQueryGroupName = `attach_cq_${ep.id}`;
      for (const opt of [{ v: true, label: 'Q.Chung' }, { v: false, label: 'Ko Q.Chung' }]) {
        const wrap = document.createElement('label');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = commonQueryGroupName;
        radio.checked = (ep.attachCommonQuery !== false) === opt.v;
        radio.addEventListener('change', () => {
          state.endpoints[targetIdx] = { ...state.endpoints[targetIdx], attachCommonQuery: opt.v };
          persist();
          notify();
        });
        wrap.append(radio, document.createTextNode(opt.label));
        commonQueryBox.append(wrap);
      }

      const gearBtn = document.createElement('button');
      gearBtn.type = 'button';
      gearBtn.className = 'btn btn-secondary btn-sm el-gear';
      gearBtn.classList.toggle('has-config', hasCustomConfig(ep));
      gearBtn.textContent = '⚙';
      gearBtn.title = 'Cấu hình riêng cho endpoint này (query, headers, body)';
      gearBtn.addEventListener('click', () => onOpenConfig?.(targetIdx));

      row.append(check, method, name, msisdnBox, commonQueryBox, gearBtn);
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
  const msisdnAllBtn = host.querySelector(`[data-extra-action="${msisdnAllActionIndex}"]`);
  const commonQueryAllBtn = host.querySelector(`[data-extra-action="${commonQueryAllActionIndex}"]`);
  const msisdnFilteredBtn = host.querySelector(`[data-extra-action="${msisdnFilteredActionIndex}"]`);
  const commonQueryFilteredBtn = host.querySelector(`[data-extra-action="${commonQueryFilteredActionIndex}"]`);

  function refreshFilteredBtn(btn, field, name) {
    if (!btn) return;
    const filtering = (searchInput?.value ?? '').trim() !== '';
    const visible = filtering ? list.getVisibleItems() : [];

    btn.disabled = !filtering || visible.length === 0;
    if (!filtering) {
      btn.textContent = `☐ ${name} (lọc): chưa lọc`;
      btn.title = 'Gõ vào ô tìm kiếm để bật nút này';
      return;
    }
    if (visible.length === 0) {
      btn.textContent = `☐ ${name} (lọc 0): —`;
      btn.title = 'Không có dòng nào khớp tìm kiếm';
      return;
    }

    const on = allFieldOnVisible(visible, field);
    btn.textContent = on
      ? `☑ ${name} (lọc ${visible.length}): Tất cả Có`
      : `☐ ${name} (lọc ${visible.length}): Tất cả Không`;
    btn.title = on
      ? `Tắt ${name} cho ${visible.length} dòng đang hiện`
      : `Bật ${name} cho ${visible.length} dòng đang hiện`;
  }

  function refreshCheckAllBtn() {
    const isSingleTab = state.selectedSheet && state.selectedSheet !== 'all';

    if (checkAllBtn) {
      const on = allEnabledInCurrentTab();
      checkAllBtn.textContent = on ? '☐ Bỏ chọn tất cả' : '☑ Chọn tất cả';
      checkAllBtn.title = on
        ? (isSingleTab ? `Bỏ chọn tất cả endpoint trong ${state.selectedSheet}` : 'Bỏ chọn tất cả endpoint')
        : (isSingleTab ? `Chọn tất cả endpoint trong ${state.selectedSheet}` : 'Chọn tất cả endpoint');
    }

    if (msisdnAllBtn) {
      const msisdnOn = allMsisdnInCurrentTab();
      msisdnAllBtn.textContent = msisdnOn ? '☑ MSISDN: Tất cả Có' : '☐ MSISDN: Tất cả Không';
      msisdnAllBtn.title = msisdnOn
        ? (isSingleTab ? `Tắt MSISDN cho tất cả endpoint trong ${state.selectedSheet}` : 'Tắt MSISDN cho tất cả endpoint')
        : (isSingleTab ? `Bật MSISDN cho tất cả endpoint trong ${state.selectedSheet}` : 'Bật MSISDN cho tất cả endpoint');
    }

    if (commonQueryAllBtn) {
      const queryOn = allCommonQueryInCurrentTab();
      commonQueryAllBtn.textContent = queryOn ? '☑ Query: Tất cả Có' : '☐ Query: Tất cả Không';
      commonQueryAllBtn.title = queryOn
        ? (isSingleTab ? `Tắt Query chung cho tất cả endpoint trong ${state.selectedSheet}` : 'Tắt Query chung cho tất cả endpoint')
        : (isSingleTab ? `Bật Query chung cho tất cả endpoint trong ${state.selectedSheet}` : 'Bật Query chung cho tất cả endpoint');
    }

    refreshFilteredBtn(msisdnFilteredBtn, 'attachMsisdn', 'MSISDN');
    refreshFilteredBtn(commonQueryFilteredBtn, 'attachCommonQuery', 'Query');
  }

  // Go tim kiem khong doi state nen subscribe() khong bat duoc — nut moi phai
  // tu nghe o search de nhan/mo va nhan so dong cap nhat ngay.
  searchInput?.addEventListener('input', refreshCheckAllBtn);

  refreshSheetSelect();
  refreshSheetTabs();
  refreshCheckAllBtn();

  // Drawer cau hinh rieng ghi thang vao state roi notify() — can render lai
  // de cham "has-config" tren nut gear cap nhat ngay.
  subscribe(() => {
    refreshSheetSelect();
    refreshSheetTabs();
    list.render();
    refreshCheckAllBtn();
  });

  return list;
}
