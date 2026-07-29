export const ALL_COLUMNS = [
  { key: 'index', header: '#', default: true },
  { key: 'request', header: 'Request', default: true },
  { key: 'response', header: 'Response body / error', default: true },
  { key: 'status', header: 'Status', default: true },
  { key: 'errorCode', header: 'Error', default: true },
  { key: 'durationMs', header: 'Time', default: true },
  { key: 'endpoint', header: 'Endpoint', default: false },
  { key: 'msisdn', header: 'MSISDN', default: false },
];

export const STATUS_NA = 'N/A';

export function emptyFilter() {
  return { statuses: [], errorCodes: [], timeMin: null, timeMax: null, search: '' };
}

const statusLabel = (rec) => (rec.response.status === null ? STATUS_NA : String(rec.response.status));

export function matchesFilter(rec, filter) {
  if (filter.statuses.length > 0 && !filter.statuses.includes(statusLabel(rec))) return false;
  if (filter.errorCodes.length > 0 && !filter.errorCodes.includes(rec.errorCode ?? '')) return false;
  if (filter.timeMin !== null && rec.durationMs < filter.timeMin) return false;
  if (filter.timeMax !== null && rec.durationMs > filter.timeMax) return false;

  if (filter.search) {
    const needle = filter.search.toLowerCase();
    const haystack = [
      rec.request.url,
      rec.msisdn ?? '',
      rec.endpointName ?? '',
      rec.response.bodyText ?? '',
      rec.errorMessage ?? '',
      rec.errorCode ?? '',
    ].join(' ').toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
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
