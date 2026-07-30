// Ba truc loc dung chung cho ca nut dem o client lan buildRequests o server.
// Quy uoc xuyen suot: danh sach dieu kien rong nghia la lay tat ca.

export function parseCommonEndpoints(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, idx) => {
      const parts = line.split(/\s+/);
      let method = 'GET';
      let pathTemplate = line;
      if (parts.length > 1 && ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(parts[0].toUpperCase())) {
        method = parts[0].toUpperCase();
        pathTemplate = parts.slice(1).join(' ');
      }
      return {
        id: `common_${idx}`,
        enabled: true,
        name: `Common ${idx + 1}`,
        method,
        pathTemplate,
        attachMsisdn: true,
        sheetName: 'Common',
        queryParams: [],
        headers: [],
        queryMode: 'kv',
        queryRaw: '',
        headerMode: 'kv',
        headerRaw: '',
        bodyMode: 'none',
        bodyRaw: '',
        bodyParams: [],
      };
    });
}

export function filterEndpoints(endpoints, runFilter, selectedSheet, commonEndpointsText) {
  const wanted = new Set((runFilter?.methods ?? []).map((m) => String(m).toUpperCase()));
  const filteredTab = (endpoints ?? []).filter(
    (e) => {
      if (!e.enabled) return false;
      if (wanted.size > 0 && !wanted.has(String(e.method || 'GET').toUpperCase())) return false;
      if (selectedSheet && selectedSheet !== 'all' && (e.sheetName ?? 'Sheet 1') !== selectedSheet) return false;
      return true;
    }
  );

  const common = parseCommonEndpoints(commonEndpointsText);
  const filteredCommon = common.filter(
    (e) => wanted.size === 0 || wanted.has(e.method)
  );

  return [...filteredTab, ...filteredCommon];
}

export function filterMsisdns(msisdns, runFilter) {
  const pats = (runFilter?.msisdnPatterns ?? []).map((p) => String(p).trim()).filter(Boolean);
  if (pats.length === 0) return msisdns ?? [];
  return (msisdns ?? []).filter((m) => pats.some((p) => String(m).includes(p)));
}

export function selectedAuths(auths, runFilter) {
  const list = auths ?? [];
  if (list.length === 1) return list;

  const ids = new Set(runFilter?.authIds ?? []);
  if (ids.size === 0) return [];
  return list.filter((a) => ids.has(a.id));
}
