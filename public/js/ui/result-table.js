import { ALL_COLUMNS, applyFilter } from '../shared/filter-logic.js';

const ROW_H = 34;              // khop --row-h trong tokens.css
const BUFFER = 10;
const VIRTUAL_THRESHOLD = 500; // duoi nguong nay render thang cho don gian

const truncate = (s, n = 120) => (s.length > n ? `${s.slice(0, n)}…` : s);

function statusText(rec) {
  const bits = [
    rec.response.status === null ? '—' : String(rec.response.status),
    rec.errorCode ?? '',
    `${rec.durationMs}ms`,
  ];
  return bits.filter(Boolean).join(' · ');
}

function cellText(rec, key) {
  switch (key) {
    case 'index': return String(rec.index);
    case 'name': return rec.endpointName || '—';
    case 'path': return rec.pathTemplate || '—';
    case 'msisdn': return rec.msisdn ?? '—';
    case 'request': return `${rec.request.method} ${rec.request.url}`;
    case 'response': return truncate(rec.response.bodyText || rec.errorMessage || '');
    case 'status': return statusText(rec);
    default: return '';
  }
}

const NUMERIC = new Set(['index', 'msisdn']);

export function initResultTable({ getRecords, getFilter, getVisibleColumns, onRowClick }) {
  const viewport = document.getElementById('result-viewport');
  const table = document.getElementById('result-table');
  let rows = [];
  let scheduled = false;

  function columns() {
    const keys = getVisibleColumns();
    return ALL_COLUMNS.filter((c) => keys.includes(c.key));
  }

  function buildRow(rec, cols) {
    const tr = document.createElement('tr');
    tr.dataset.index = String(rec.index);
    for (const col of cols) {
      const td = document.createElement('td');
      td.textContent = cellText(rec, col.key);
      if (NUMERIC.has(col.key)) td.classList.add('num', 'mono');
      if (col.key === 'status') {
        const ok = rec.response.status !== null && rec.response.status < 400;
        td.classList.add(ok ? 'status-up' : 'status-down');
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

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (const col of cols) {
      const th = document.createElement('th');
      th.textContent = col.header;
      headRow.append(th);
    }
    thead.append(headRow);

    const tbody = document.createElement('tbody');

    if (rows.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = cols.length;
      td.className = 'el-empty';
      td.textContent = 'Chưa có kết quả nào khớp bộ lọc.';
      tr.append(td);
      tbody.append(tr);
    } else if (rows.length <= VIRTUAL_THRESHOLD) {
      for (const rec of rows) tbody.append(buildRow(rec, cols));
    } else {
      const start = Math.max(0, Math.floor(viewport.scrollTop / ROW_H) - BUFFER);
      const visible = Math.ceil(viewport.clientHeight / ROW_H) + BUFFER * 2;
      const end = Math.min(rows.length, start + visible);
      if (start > 0) tbody.append(spacer(start * ROW_H));
      for (let i = start; i < end; i += 1) tbody.append(buildRow(rows[i], cols));
      if (end < rows.length) tbody.append(spacer((rows.length - end) * ROW_H));
    }

    table.replaceChildren(thead, tbody);
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
