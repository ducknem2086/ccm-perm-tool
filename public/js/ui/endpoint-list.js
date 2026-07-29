import { state, persist, notify } from '../state.js';
import { createEditableList } from './editable-list.js';
import { mapRows } from '../shared/endpoint-mapping.js';
import { importGrid } from '../api.js';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const MAX_SHOWN_ERRORS = 10;
let seq = 0;
const nextId = () => `ep_${Date.now().toString(36)}_${(seq += 1)}`;

function makeEndpoint(path) {
  return {
    id: nextId(), enabled: true, name: '', method: 'GET',
    pathTemplate: String(path ?? ''), queryParams: [], headers: [],
  };
}

function fromRecord(rec) {
  return { ...makeEndpoint(rec.endpoint), name: rec.name, method: rec.method };
}

export function initEndpointList({ onOpenTemplate } = {}) {
  // Du lieu cu trong localStorage co the la mang chuoi hoac thieu truong name.
  state.endpoints = (state.endpoints ?? []).map((e) => (
    typeof e === 'string' ? makeEndpoint(e) : { name: '', ...e }
  ));

  const host = document.getElementById('list-endpoint');

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
    extraActions: onOpenTemplate
      ? [{ label: '⊢ Template', title: 'Cấu hình cột khi import', onClick: onOpenTemplate }]
      : [],
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

      row.append(check, method, name);
    },
  });

  return list;
}

