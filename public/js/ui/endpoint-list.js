import { state, persist, notify } from '../state.js';
import { createEditableList } from './editable-list.js';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
let seq = 0;
const nextId = () => `ep_${Date.now().toString(36)}_${(seq += 1)}`;

function makeEndpoint(path) {
  return { id: nextId(), enabled: true, method: 'GET', pathTemplate: String(path ?? ''), queryParams: [], headers: [] };
}

export function initEndpointList() {
  // Du lieu cu trong localStorage co the la mang chuoi — nang cap ve dang object.
  state.endpoints = (state.endpoints ?? []).map((e) => (typeof e === 'string' ? makeEndpoint(e) : e));

  const list = createEditableList({
    host: document.getElementById('list-endpoint'),
    title: 'ENDPOINTS',
    kind: 'endpoint',
    placeholder: '/DataAggregationEngine/query/abc-information/:msisdn',
    getItems: () => state.endpoints,
    setItems: (v) => { state.endpoints = v; persist(); },
    onChange: notify,
    getValue: (ep) => ep.pathTemplate,
    setValue: (ep, v) => ({ ...ep, pathTemplate: v }),
    makeItem: makeEndpoint,
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

      row.append(check, method);
    },
  });

  return list;
}
