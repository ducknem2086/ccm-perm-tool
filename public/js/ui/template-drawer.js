import { state, persist } from '../state.js';
import { TARGETS } from '../shared/endpoint-mapping.js';

const TYPES = [
  { value: 'name', label: 'name', placeholder: 'Tên cột trong file' },
  { value: 'index', label: 'index', placeholder: '1' },
];

const TARGET_LABEL = { name: 'name', method: 'method', endpoint: 'endpoint' };

let seq = 0;
const nextId = () => `tpl_${Date.now().toString(36)}_${(seq += 1)}`;

function select(options, value, onChange, className) {
  const el = document.createElement('select');
  el.className = className;
  for (const o of options) {
    const opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.label;
    el.append(opt);
  }
  el.value = value;
  el.addEventListener('change', () => onChange(el.value));
  return el;
}

export function initTemplateDrawer() {
  const drawer = document.getElementById('template-drawer');

  function update(index, patch) {
    state.importTemplate[index] = { ...state.importTemplate[index], ...patch };
    persist();
  }

  function renderRows(host) {
    host.innerHTML = '';
    const rules = state.importTemplate ?? [];

    if (rules.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'el-empty';
      empty.textContent = 'Chưa có dòng nào. Bấm "+ Thêm dòng".';
      host.append(empty);
      return;
    }

    rules.forEach((rule, index) => {
      const row = document.createElement('div');
      row.className = 'pt-row';

      const value = document.createElement('input');
      value.className = 'input pt-val mono';
      value.type = 'text';
      value.spellcheck = false;

      const syncPlaceholder = (type) => {
        value.placeholder = TYPES.find((t) => t.value === type)?.placeholder ?? '';
      };

      const type = select(TYPES, rule.type ?? 'name', (v) => {
        update(index, { type: v });
        syncPlaceholder(v);
      }, 'el-method');

      syncPlaceholder(rule.type ?? 'name');
      value.value = rule.selector ?? '';
      value.addEventListener('input', () => update(index, { selector: value.value }));

      const arrow = document.createElement('span');
      arrow.className = 'tpl-arrow';
      arrow.textContent = '→';

      const target = select(
        TARGETS.map((t) => ({ value: t, label: TARGET_LABEL[t] })),
        rule.target ?? 'endpoint',
        (v) => update(index, { target: v }),
        'el-method tpl-target',
      );

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'el-del';
      del.textContent = '✕';
      del.title = 'Xóa dòng';
      del.addEventListener('click', () => {
        state.importTemplate.splice(index, 1);
        persist();
        renderRows(host);
      });

      row.append(type, value, arrow, target, del);
      host.append(row);
    });
  }

  function close() {
    drawer.hidden = true;
    drawer.setAttribute('aria-hidden', 'true');
    drawer.innerHTML = '';
  }

  function open() {
    drawer.innerHTML = `
      <div class="el-head" style="margin-bottom: 12px;">
        <h2 class="card-title" style="font-size: 16px; color: var(--body);">TEMPLATE MAP CỘT</h2>
        <button type="button" class="btn btn-secondary btn-sm" data-close>✕ Đóng</button>
      </div>
      <section class="card">
        <p class="hint">Khai cột trong file ứng với trường nào. Kiểu <code>name</code> khớp theo tên header ở dòng đầu, kiểu <code>index</code> khớp theo số thứ tự cột.</p>
        <div class="param-table" data-rows></div>
        <div class="el-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-add>+ Thêm dòng</button>
        </div>
      </section>
    `;
    drawer.hidden = false;
    drawer.setAttribute('aria-hidden', 'false');

    const host = drawer.querySelector('[data-rows]');
    renderRows(host);

    drawer.querySelector('[data-close]').addEventListener('click', close);
    drawer.querySelector('[data-add]').addEventListener('click', () => {
      state.importTemplate = [
        ...(state.importTemplate ?? []),
        { id: nextId(), type: 'name', selector: '', target: 'endpoint' },
      ];
      persist();
      renderRows(host);
    });

    drawer.querySelector('[data-close]').focus();
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !drawer.hidden) close();
  });

  return { open, close };
}
