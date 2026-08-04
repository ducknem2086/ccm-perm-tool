import { state, persist, notify } from '../state.js';
import { createKvTable } from './kv-table.js';

const KV_RAW_MODES = [{ value: 'kv', label: 'Key-value' }, { value: 'raw', label: 'Chuỗi thô' }];
const BODY_MODES = [
  { value: 'none', label: 'None' },
  { value: 'json', label: 'JSON' },
  { value: 'text', label: 'Text' },
  { value: 'kv', label: 'Key-value' },
];
const NO_BODY_METHODS = new Set(['GET', 'HEAD']);
const SECTIONS = [
  { key: 'query', label: 'QUERY' },
  { key: 'headers', label: 'HEADERS' },
  { key: 'body', label: 'BODY' },
];

function makeSelect(options, value, onChange) {
  const select = document.createElement('select');
  select.className = 'input input-sm';
  for (const o of options) {
    const opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.label;
    select.append(opt);
  }
  select.value = value;
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

function fieldRow(labelText, control) {
  const row = document.createElement('div');
  row.className = 'ed-mode-row';
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = labelText;
  row.append(label, control);
  return row;
}

function hint(text, extraClass = '') {
  const p = document.createElement('p');
  p.className = extraClass ? `hint ${extraClass}` : 'hint';
  p.textContent = text;
  return p;
}

function addRowButton(onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-secondary btn-sm';
  btn.textContent = '+ Thêm dòng';
  btn.addEventListener('click', onClick);
  return btn;
}

function validateJsonTextarea(ta) {
  const text = ta.value.trim();
  if (text === '') {
    ta.classList.remove('is-invalid');
    ta.title = '';
    return;
  }
  try {
    JSON.parse(text);
    ta.classList.remove('is-invalid');
    ta.title = '';
  } catch (err) {
    ta.classList.add('is-invalid');
    ta.title = `JSON không hợp lệ: ${err.message}`;
  }
}

export function initEndpointDrawer() {
  const drawer = document.getElementById('endpoint-drawer');
  let currentIndex = -1;

  const ep = () => state.endpoints[currentIndex];

  function update(patch) {
    state.endpoints[currentIndex] = { ...ep(), ...patch };
    persist();
    notify();
  }

  function close() {
    drawer.hidden = true;
    drawer.setAttribute('aria-hidden', 'true');
    drawer.replaceChildren();
    currentIndex = -1;
  }

  function renderKvOrRaw(pane, {
    modeKey, rawKey, rowsKey, keyPlaceholder, valPlaceholder, rawPlaceholder, footHint,
  }) {
    pane.replaceChildren();
    const e = ep();
    const mode = e[modeKey] ?? 'kv';
    const select = makeSelect(KV_RAW_MODES, mode, (v) => {
      update({ [modeKey]: v });
      renderKvOrRaw(pane, {
        modeKey, rawKey, rowsKey, keyPlaceholder, valPlaceholder, rawPlaceholder, footHint,
      });
    });
    pane.append(fieldRow('Kiểu nhập:', select));

    if (mode === 'raw') {
      const ta = document.createElement('textarea');
      ta.className = 'input mono ed-textarea';
      ta.placeholder = rawPlaceholder;
      ta.value = e[rawKey] ?? '';
      ta.addEventListener('input', () => update({ [rawKey]: ta.value }));
      pane.append(ta);
    } else {
      const tableHost = document.createElement('div');
      pane.append(tableHost);
      const table = createKvTable({
        host: tableHost,
        getRows: () => ep()[rowsKey] ?? [],
        setRows: (rows) => update({ [rowsKey]: rows }),
        keyPlaceholder,
        valPlaceholder,
      });
      pane.append(addRowButton(() => table.addRow()));
    }
    pane.append(hint(footHint));
  }

  function renderQueryTab(pane) {
    renderKvOrRaw(pane, {
      modeKey: 'queryMode', rawKey: 'queryRaw', rowsKey: 'queryParams',
      keyPlaceholder: 'page', valPlaceholder: '1', rawPlaceholder: 'page=1&size=50',
      footHint: 'Cấu hình chung vẫn áp dụng cho các key endpoint này không khai.',
    });
  }

  function renderHeaderTab(pane) {
    renderKvOrRaw(pane, {
      modeKey: 'headerMode', rawKey: 'headerRaw', rowsKey: 'headers',
      keyPlaceholder: 'Content-Type', valPlaceholder: 'application/json',
      rawPlaceholder: 'Accept: application/json\nX-Request-Id: {{msisdn}}',
      footHint: 'Cấu hình chung vẫn áp dụng cho các header endpoint này không khai.',
    });
  }

  function renderBodyTab(pane) {
    pane.replaceChildren();
    const e = ep();
    const mode = e.bodyMode ?? 'none';
    const method = (e.method || 'GET').toUpperCase();

    if (NO_BODY_METHODS.has(method)) {
      pane.append(hint(`Method ${method} không gửi được body.`, 'status-down'));
    }

    const select = makeSelect(BODY_MODES, mode, (v) => {
      update({ bodyMode: v });
      renderBodyTab(pane);
    });
    pane.append(fieldRow('Body:', select));

    if (mode === 'none') {
      pane.append(hint('Request này không gửi body.'));
      pane.append(hint('Nếu tab BODY CHUNG có khai (khác None), endpoint này sẽ dùng body chung đó — trừ khi method không hỗ trợ body.'));
      return;
    }

    if (mode === 'json' || mode === 'text') {
      const ta = document.createElement('textarea');
      ta.className = 'input mono ed-textarea';
      ta.placeholder = mode === 'json' ? '{\n  "msisdn": "{{msisdn}}"\n}' : '';
      ta.value = e.bodyRaw ?? '';
      ta.addEventListener('input', () => {
        update({ bodyRaw: ta.value });
        if (mode === 'json') validateJsonTextarea(ta);
      });
      if (mode === 'json') validateJsonTextarea(ta);
      pane.append(ta);
      return;
    }

    const tableHost = document.createElement('div');
    pane.append(tableHost);
    const table = createKvTable({
      host: tableHost,
      getRows: () => ep().bodyParams ?? [],
      setRows: (rows) => update({ bodyParams: rows }),
      keyPlaceholder: 'msisdn',
      valPlaceholder: '{{msisdn}}',
    });
    pane.append(addRowButton(() => table.addRow()));
    pane.append(hint('Các cặp bên dưới sẽ được gửi đi dưới dạng JSON object.'));
  }

  const RENDERERS = { query: renderQueryTab, headers: renderHeaderTab, body: renderBodyTab };

  function open(index) {
    currentIndex = index;
    const e = ep();
    drawer.replaceChildren();

    const head = document.createElement('div');
    head.className = 'el-head';
    const title = document.createElement('h2');
    title.className = 'card-title';
    title.textContent = `CẤU HÌNH RIÊNG — ${(e.method || 'GET').toUpperCase()} ${e.pathTemplate || ''}`;
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn btn-secondary btn-sm';
    closeBtn.textContent = 'Đóng';
    closeBtn.dataset.close = '';
    closeBtn.addEventListener('click', close);
    head.append(title, closeBtn);

    const panesHost = document.createElement('div');
    panesHost.className = 'drawer-panes';

    for (const s of SECTIONS) {
      const title = document.createElement('h3');
      title.className = 'card-title ed-section-title';
      title.textContent = s.label;

      const pane = document.createElement('div');
      pane.className = 'body-pane';
      pane.dataset.pane = s.key;
      RENDERERS[s.key](pane);

      panesHost.append(title, pane);
    }

    drawer.append(head, panesHost);

    drawer.hidden = false;
    drawer.setAttribute('aria-hidden', 'false');
    closeBtn.focus();
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !drawer.hidden) close();
  });

  return { open, close };
}
