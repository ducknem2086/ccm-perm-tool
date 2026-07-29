export const DEFAULT_ERROR_CODE_PATHS = ['errorCode', 'error_code', 'code', 'error.code'];

export function getByPath(obj, path) {
  return String(path).split('.').reduce((acc, key) => {
    if (acc === null || acc === undefined || typeof acc !== 'object') return undefined;
    return acc[key];
  }, obj);
}

export function extractErrorCode(body, paths = DEFAULT_ERROR_CODE_PATHS) {
  if (body === null || typeof body !== 'object') return null;
  for (const path of paths) {
    const v = getByPath(body, path);
    if (v === undefined || v === null || v === '') continue;
    if (typeof v === 'object') continue;
    return String(v);
  }
  return null;
}
