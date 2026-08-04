export function dedupeEndpoints(endpoints) {
  if (!Array.isArray(endpoints)) return { unique: [], skipped: 0 };
  const seen = new Set();
  const unique = [];
  let skipped = 0;

  for (const ep of endpoints) {
    const method = String(ep.method ?? 'GET').toUpperCase();
    const path = String(ep.pathTemplate ?? ep.endpoint ?? '').trim();
    const key = `${method}:${path}`;

    if (seen.has(key)) {
      skipped += 1;
    } else {
      seen.add(key);
      unique.push(ep);
    }
  }

  return { unique, skipped };
}

// Danh sach endpoint cua tab "Tất cả (All)" — chi phuc vu HIEN THI bang
// endpoint (endpoint-list.js). Khong dung lam pool chay: ca RUN ALL lan CHECK
// PERM mode 'all' deu doc thang state.endpoints, vi mot API cap cho nhieu sheet
// role la nhieu ban ghi can cham rieng — khu trung METHOD:pathTemplate o day se
// nuot mat moi ban ngoai ban dai dien. He qua: so dong tren tab All co the it
// hon so request thuc chay.
export function allTabEndpoints(endpoints) {
  return dedupeEndpoints(endpoints).unique;
}
