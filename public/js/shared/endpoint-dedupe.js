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
