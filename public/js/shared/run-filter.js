// Ba truc loc dung chung cho ca nut dem o client lan buildRequests o server.
// Quy uoc xuyen suot: danh sach dieu kien rong nghia la lay tat ca.

export function filterEndpoints(endpoints, runFilter) {
  const wanted = new Set((runFilter?.methods ?? []).map((m) => String(m).toUpperCase()));
  return (endpoints ?? []).filter(
    (e) => e.enabled && (wanted.size === 0 || wanted.has(String(e.method || 'GET').toUpperCase())),
  );
}

export function filterMsisdns(msisdns, runFilter) {
  const pats = (runFilter?.msisdnPatterns ?? []).map((p) => String(p).trim()).filter(Boolean);
  if (pats.length === 0) return msisdns ?? [];
  return (msisdns ?? []).filter((m) => pats.some((p) => String(m).includes(p)));
}

export function selectedAuths(auths, runFilter) {
  const ids = new Set(runFilter?.authIds ?? []);
  if (ids.size === 0) return auths ?? [];
  return (auths ?? []).filter((a) => ids.has(a.id));
}
