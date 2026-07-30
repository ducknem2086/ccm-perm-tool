// Ba truc loc dung chung cho ca nut dem o client lan buildRequests o server.
// Quy uoc xuyen suot: danh sach dieu kien rong nghia la lay tat ca.

export function filterEndpoints(endpoints, runFilter, selectedSheet) {
  const wanted = new Set((runFilter?.methods ?? []).map((m) => String(m).toUpperCase()));
  return (endpoints ?? []).filter(
    (e) => {
      if (!e.enabled) return false;
      if (wanted.size > 0 && !wanted.has(String(e.method || 'GET').toUpperCase())) return false;
      if (selectedSheet && selectedSheet !== 'all' && (e.sheetName ?? 'Sheet 1') !== selectedSheet) return false;
      return true;
    }
  );
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
