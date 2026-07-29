export const ALL_COLUMNS = [
  { key: 'index', header: '#', default: true },
  { key: 'status', header: 'Status · Error · Time', default: true },
  { key: 'name', header: 'Name', default: true },
  { key: 'path', header: 'Path', default: true },
  { key: 'request', header: 'Request', default: true },
  { key: 'responseBody', header: 'Response body', default: true },
  { key: 'responseHeaders', header: 'Response headers', default: true },
];

export const STATUS_NA = 'N/A';

export function emptyFilter() {
  return { msisdn: '', name: '', status: '', errorCode: '' };
}

const statusLabel = (rec) => (rec.response.status === null ? STATUS_NA : String(rec.response.status));
const contains = (hay, needle) => String(hay ?? '').toLowerCase().includes(needle.toLowerCase());

export function matchesFilter(rec, filter) {
  if (filter.status && statusLabel(rec) !== filter.status) return false;
  if (filter.errorCode && (rec.errorCode ?? '') !== filter.errorCode) return false;
  if (filter.name && !contains(rec.endpointName, filter.name)) return false;
  if (filter.msisdn && !contains(rec.msisdn, filter.msisdn)) return false;
  return true;
}

export function applyFilter(records, filter) {
  return records.filter((r) => matchesFilter(r, filter)).sort((a, b) => a.index - b.index);
}

export function collectStatuses(records) {
  const set = new Set(records.map(statusLabel));
  return [...set].sort((a, b) => {
    if (a === STATUS_NA) return 1;
    if (b === STATUS_NA) return -1;
    return Number(a) - Number(b);
  });
}

export function collectErrorCodes(records) {
  return [...new Set(records.map((r) => r.errorCode).filter(Boolean))].sort();
}
