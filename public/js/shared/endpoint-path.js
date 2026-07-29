const STAR = '{*}';
const MSISDN_PLACEHOLDER = /:msisdn\b|\{\{\s*msisdn\s*\}\}/;

// "/a/b/{*}?x=1" -> { path: "/a/b", inlineQuery: "x=1" }
// Dau sao la ranh gioi: ben trai la path, ben phai la query rieng cua endpoint.
export function splitTemplate(template) {
  const text = String(template ?? '').trim();
  const at = text.indexOf(STAR);

  if (at === -1) {
    const q = text.indexOf('?');
    if (q === -1) return { path: text, inlineQuery: '' };
    return { path: text.slice(0, q), inlineQuery: text.slice(q + 1) };
  }

  return {
    path: text.slice(0, at).replace(/\/+$/, ''),
    inlineQuery: text.slice(at + STAR.length).replace(/^\?/, ''),
  };
}

// Khong decode gia tri vi no co the con chua {{fromDate}} chua resolve.
export function parseInlineQuery(qs) {
  const out = [];
  for (const part of String(qs ?? '').split('&')) {
    if (part === '') continue;
    const eq = part.indexOf('=');
    const key = eq === -1 ? part : part.slice(0, eq);
    if (key === '') continue;
    out.push({ key, value: eq === -1 ? '' : part.slice(eq + 1) });
  }
  return out;
}

export function hasMsisdnPlaceholder(path) {
  return MSISDN_PLACEHOLDER.test(String(path ?? ''));
}
