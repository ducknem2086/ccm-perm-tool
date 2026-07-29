const CURLY_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
const COLON_RE = /:([A-Za-z_][A-Za-z0-9_]*)/g;
const STAR_RE = /\{\*\}/g;

// Placeholder {*} trong file import ung voi path param dau tien, luon la msisdn.
const STAR_NAME = 'msisdn';

export function extractVariables(template) {
  const names = new Set();
  const text = String(template ?? '');
  for (const m of text.matchAll(CURLY_RE)) names.add(m[1]);
  for (const m of text.matchAll(COLON_RE)) names.add(m[1]);
  if (STAR_RE.test(text)) names.add(STAR_NAME);
  STAR_RE.lastIndex = 0;
  return [...names];
}

export function resolve(template, scope = {}) {
  const missing = new Set();
  const text = String(template ?? '');

  const pick = (name) => {
    const v = scope[name];
    if (v === undefined || v === null || v === '') {
      missing.add(name);
      return '';
    }
    return String(v);
  };

  const value = text
    .replace(CURLY_RE, (_, name) => pick(name))
    .replace(STAR_RE, () => pick(STAR_NAME))
    .replace(COLON_RE, (_, name) => pick(name));

  return { value, missing: [...missing] };
}

