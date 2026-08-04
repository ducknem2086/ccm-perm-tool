import { applyPermFilter } from '../shared/permission-filter-logic.js';
import { bodyPreview } from '../shared/response-body.js';

const truncate = (s, n = 120) => (s.length > n ? `${s.slice(0, n)}…` : s);

const COLUMNS = [
  { key: 'action', header: 'Action' },
  { key: 'status', header: 'Status' },
  // Status THO cua endpoint checkPermission chung, dat NGAY CANH status — mat
  // doi chieu duoc khong phai keo ngang. Khong co cot dan xuat nao tu hai cot nay.
  { key: 'permStatus', header: 'Status Check Perm' },
  { key: 'perm', header: 'Status Perm' },
  { key: 'auth', header: 'Auth' },
  { key: 'endpoint', header: 'Endpoint' },
  { key: 'role', header: 'Role' },
  { key: 'epName', header: 'Endpoint Name' },
  { key: 'permName', header: 'UC2 Name' },
  { key: 'body', header: 'Response Body' },
];

function cellText(rec, key) {
  switch (key) {
    case 'status': return rec.response.status === null ? '—' : String(rec.response.status);
    case 'permStatus': return rec.oracle?.status == null ? '—' : String(rec.oracle.status);
    case 'perm': return rec.statusPermission ?? 'empty';
    case 'auth': return rec.authName || '—';
    case 'endpoint': return rec.pathTemplate || '—';
    case 'role': return rec.sheetName || '—';
    case 'epName': return rec.endpointName || '—';
    case 'permName': return rec.permissionMatchedName || '—';
    case 'body': return truncate(bodyPreview(rec)) || '—';
    default: return '';
  }
}

export function initPermissionTable({ getRecords, getFilter, filterCell, onRowClick }) {
  const table = document.getElementById('perm-table');

  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');
  table.replaceChildren(thead, tbody);

  let rows = [];
  let headBuilt = false;

  function paintHead() {
    if (headBuilt) return;
    headBuilt = true;

    const headRow = document.createElement('tr');
    const filterRow = document.createElement('tr');
    filterRow.className = 'filter-row';

    for (const col of COLUMNS) {
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

  function detailButton(rec) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-icon';
    btn.textContent = '👁';
    btn.title = 'Xem chi tiết';
    btn.addEventListener('click', () => onRowClick?.(rec));
    return btn;
  }

  function buildRow(rec) {
    const tr = document.createElement('tr');
    tr.dataset.index = String(rec.index);
    for (const col of COLUMNS) {
      const td = document.createElement('td');
      if (col.key === 'action') {
        td.className = 'cell-actions';
        td.append(detailButton(rec));
        tr.append(td);
        continue;
      }
      td.textContent = cellText(rec, col.key);
      td.title = cellText(rec, col.key);
      if (col.key === 'perm') {
        td.classList.toggle('status-up', rec.statusPermission === 'true');
        td.classList.toggle('status-down', rec.statusPermission === 'false');
      }
      if (col.key === 'status') {
        const ok = rec.response.status !== null && rec.response.status < 400;
        td.classList.add(ok ? 'status-up' : 'status-down');
      }
      if (col.key === 'permStatus' && rec.oracle?.status != null) {
        td.classList.add(rec.oracle.status < 400 ? 'status-up' : 'status-down');
      }
      tr.append(td);
    }
    return tr;
  }

  function paint() {
    paintHead();

    const body = [];
    if (rows.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = COLUMNS.length;
      td.className = 'el-empty';
      td.textContent = 'Chưa có kết quả nào khớp bộ lọc.';
      tr.append(td);
      body.push(tr);
    } else {
      for (const rec of rows) body.push(buildRow(rec));
    }

    tbody.replaceChildren(...body);
  }

  return {
    render() {
      rows = applyPermFilter(getRecords(), getFilter());
      paint();
    },
    getVisibleIndexes() {
      return rows.map((r) => r.index);
    },
  };
}
