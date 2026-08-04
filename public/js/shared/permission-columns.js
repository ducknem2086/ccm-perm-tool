// Nguon su that DUY NHAT cho cot bang CHECK PERMISSION — bang (permission-table.js)
// va export Excel (excel-export.js) deu doc tu day. Truoc day hai noi khai
// rieng nen them cot o bang khong tu dong co tren export.

export const PERM_COLUMNS = [
  { key: 'status', header: 'Status', width: 16 },
  { key: 'permStatus', header: 'Status Check Perm', width: 20 },
  { key: 'perm', header: 'Status Perm', width: 14 },
  { key: 'auth', header: 'Auth', width: 18 },
  { key: 'endpoint', header: 'Endpoint', width: 45 },
  { key: 'role', header: 'Role', width: 20 },
  { key: 'epName', header: 'Endpoint Name', width: 35 },
  { key: 'permName', header: 'UC2 Name', width: 35 },
  { key: 'fnName', header: 'Function Name', width: 30 },
];

function methodStatus(method, status) {
  const m = method ?? '—';
  const s = status === null || status === undefined ? '—' : String(status);
  return `${m} · ${s}`;
}

export function permCellText(rec, key) {
  switch (key) {
    case 'status': return methodStatus(rec.request?.method, rec.response.status);
    case 'permStatus': return rec.oracle ? methodStatus(rec.oracle.request?.method, rec.oracle.status) : '—';
    case 'perm': return rec.statusPermission ?? 'empty';
    case 'auth': return rec.authName || '—';
    case 'endpoint': return rec.pathTemplate || '—';
    case 'role': return rec.sheetName || '—';
    case 'epName': return rec.endpointName || '—';
    case 'permName': return rec.permissionMatchedName || '—';
    case 'fnName': return rec.oracleFunction || '—';
    default: return '';
  }
}
