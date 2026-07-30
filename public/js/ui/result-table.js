import { ALL_COLUMNS, ACTIONS_COLUMN, applyFilter } from '../shared/filter-logic.js';
import { bodyPreview } from '../shared/response-body.js';
import { state } from '../state.js';

const ROW_H = 34;              // khop --row-h trong tokens.css
const BUFFER = 10;
const VIRTUAL_THRESHOLD = 500; // duoi nguong nay render thang cho don gian

const truncate = (s, n = 120) => (s.length > n ? `${s.slice(0, n)}…` : s);

function statusText(rec, hasPermissions) {
  if (hasPermissions && rec.statusPermission != null) {
    return `${rec.response.status === null ? '—' : String(rec.response.status)} · ${rec.statusPermission}`;
  }
  const bits = [
    rec.response.status === null ? '—' : String(rec.response.status),
    rec.errorCode ?? '',
    `${rec.durationMs}ms`,
  ];
  return bits.filter(Boolean).join(' · ');
}

const headerLine = (headers) => Object.entries(headers ?? {})
  .map(([k, v]) => `${k}: ${v}`)
  .join(' · ');

function cellText(rec, key) {
  switch (key) {
    case 'index': return String(rec.index);
    case 'name': return rec.endpointName || '—';
    case 'auth': return rec.authName || '—';
    case 'path': return rec.pathTemplate || '—';
    case 'request': return `${rec.request.method} ${rec.request.url}`;
    case 'responseBody': return truncate(bodyPreview(rec)) || '—';
    case 'responseHeaders': return truncate(headerLine(rec.response.headers)) || '—';
    case 'status': {
      const hasPermissions = Boolean(state.permissionFile?.filename);
      return statusText(rec, hasPermissions);
    }
    default: return '';
  }
}

const NUMERIC = new Set(['index']);

export function initResultTable({
  getRecords, getFilter, getVisibleColumns, onRowClick, onCurlClick, filterCell,
}) {
  const viewport = document.getElementById('result-viewport');
  const table = document.getElementById('result-table');

  // thead va tbody duoc tao mot lan roi giu nguyen node. Neu paint lai ma thay
  // ca thead thi o input trong hang filter se mat focus giua luc dang go.
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');
  table.replaceChildren(thead, tbody);

  let rows = [];
  let scheduled = false;
  let headKeys = '';

  function columns() {
    const keys = getVisibleColumns();
    return [...ALL_COLUMNS.filter((c) => keys.includes(c.key)), ACTIONS_COLUMN];
  }

  function paintHead(cols) {
    const signature = cols.map((c) => c.key).join(',');
    if (signature === headKeys) return;
    headKeys = signature;

    const headRow = document.createElement('tr');
    const filterRow = document.createElement('tr');
    filterRow.className = 'filter-row';

    for (const col of cols) {
      const th = document.createElement('th');
      th.textContent = col.header;
      headRow.append(th);

      const ftd = document.createElement('th');
      ftd.className = 'filter-cell';
      const node = filterCell?.(col.key);
      if (node) ftd.append(node);
      filterRow.append(ftd);
    }

    thead.replaceChildren(headRow, filterRow);
  }

  function curlButton(rec) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-secondary btn-sm';
    btn.textContent = 'cURL';
    btn.title = 'Tải file .txt chứa lệnh cURL để import vào Postman';
    // Chan noi bot, khong thi bam nut se mo luon drawer chi tiet cua hang.
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onCurlClick?.(rec);
    });
    return btn;
  }

  function buildRow(rec, cols) {
    const tr = document.createElement('tr');
    tr.dataset.index = String(rec.index);
    for (const col of cols) {
      const td = document.createElement('td');
      if (col.key === 'actions') {
        td.className = 'cell-actions';
        td.append(curlButton(rec));
        tr.append(td);
        continue;
      }
      td.textContent = cellText(rec, col.key);
      if (NUMERIC.has(col.key)) td.classList.add('num', 'mono');
      if (col.key === 'status') {
        const hasPermissions = Boolean(state.permissionFile?.filename);
        if (hasPermissions && rec.statusPermission != null) {
          td.classList.toggle('status-up', rec.statusPermission === 'true');
          td.classList.toggle('status-down', rec.statusPermission === 'false');
        } else {
          const ok = rec.response.status !== null && rec.response.status < 400;
          td.classList.add(ok ? 'status-up' : 'status-down');
        }
      }
      td.title = cellText(rec, col.key);
      tr.append(td);
    }
    tr.addEventListener('click', () => onRowClick?.(rec));
    return tr;
  }

  function spacer(height) {
    const tr = document.createElement('tr');
    tr.className = 'spacer-row';
    const td = document.createElement('td');
    td.colSpan = 99;
    td.style.height = `${height}px`;
    tr.append(td);
    return tr;
  }

  function paint() {
    scheduled = false;
    const cols = columns();
    paintHead(cols);

    const body = [];

    if (rows.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = cols.length;
      td.className = 'el-empty';
      td.textContent = 'Chưa có kết quả nào khớp bộ lọc.';
      tr.append(td);
      body.push(tr);
    } else if (rows.length <= VIRTUAL_THRESHOLD) {
      for (const rec of rows) body.push(buildRow(rec, cols));
    } else {
      const start = Math.max(0, Math.floor(viewport.scrollTop / ROW_H) - BUFFER);
      const visible = Math.ceil(viewport.clientHeight / ROW_H) + BUFFER * 2;
      const end = Math.min(rows.length, start + visible);
      if (start > 0) body.push(spacer(start * ROW_H));
      for (let i = start; i < end; i += 1) body.push(buildRow(rows[i], cols));
      if (end < rows.length) body.push(spacer((rows.length - end) * ROW_H));
    }

    tbody.replaceChildren(...body);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(paint);
  }

  viewport.addEventListener('scroll', () => {
    if (rows.length > VIRTUAL_THRESHOLD) schedule();
  });

  return {
    render() {
      rows = applyFilter(getRecords(), getFilter());
      schedule();
    },
    getVisibleIndexes() {
      return rows.map((r) => r.index);
    },
  };
}
