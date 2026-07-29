import { resolve } from './variables.js';
import { validateRange, formatDate } from './date-format.js';
import { isEndpointPath } from '../../public/js/shared/validators.js';
import { splitTemplate, parseInlineQuery, hasMsisdnPlaceholder } from '../../public/js/shared/endpoint-path.js';

// Endpoint cu chua co field nay thi mac dinh la co gan msisdn.
const wantsMsisdn = (ep) => ep?.attachMsisdn !== false;
const activeOnly = (list) => (list ?? []).filter((p) => p.enabled !== false);

export function validateConfig(config) {
  const errors = [];

  if (!/^https?:\/\/\S+$/i.test(String(config?.domain ?? '').trim())) {
    errors.push({ field: 'domain', message: 'Domain phải bắt đầu bằng http:// hoặc https://' });
  }

  const range = validateRange(config?.dateRange?.from, config?.dateRange?.to);
  if (!range.ok) errors.push({ field: 'dateRange', message: range.error });

  const enabled = (config?.endpoints ?? []).filter((e) => e.enabled);
  if (enabled.length === 0) {
    errors.push({ field: 'endpoints', message: 'Cần bật ít nhất 1 endpoint' });
  }

  const msisdns = config?.msisdns ?? [];
  for (const ep of enabled) {
    // Chi kiem tra phan path, query rieng sau {*} duoc phep chua dau cach.
    const { path } = splitTemplate(ep.pathTemplate);
    if (!isEndpointPath(path)) {
      errors.push({ field: `endpoint:${ep.id}`, message: `Path "${path}" phải bắt đầu bằng / và không chứa khoảng trắng` });
      continue;
    }
    if (wantsMsisdn(ep) && msisdns.length === 0) {
      errors.push({ field: `endpoint:${ep.id}`, message: 'Endpoint cần msisdn nhưng danh sách MSISDN đang rỗng' });
    }
  }

  return errors;
}

// Thu tu chen quyet dinh ca thu tu trong URL lan do uu tien: cai vao truoc thang.
function mergePairs(inlineList, endpointList, globalList) {
  const map = new Map();
  const put = (k, v) => { if (k && !map.has(k)) map.set(k, v); };
  for (const p of inlineList ?? []) put(p.key, p.value);
  for (const p of activeOnly(endpointList)) put(p.key, p.value);
  for (const p of activeOnly(globalList)) put(p.key, p.value);
  return map;
}

function buildOne({ config, endpoint, msisdn, scope, index }) {
  const missing = new Set();
  const take = (tpl) => {
    const r = resolve(tpl, scope);
    for (const m of r.missing) missing.add(m);
    return r.value;
  };

  const { path: rawPath, inlineQuery } = splitTemplate(endpoint.pathTemplate);
  let path = take(rawPath);
  if (msisdn && !hasMsisdnPlaceholder(rawPath)) {
    path = `${path.replace(/\/+$/, '')}/${msisdn}`;
  }

  const queryParams = {};
  for (const [k, v] of mergePairs(parseInlineQuery(inlineQuery), endpoint.queryParams, config.globalQueryParams)) {
    queryParams[take(k)] = take(v);
  }

  const headers = {};
  for (const [k, v] of mergePairs([], endpoint.headers, config.globalHeaders)) {
    headers[take(k)] = take(v);
  }

  const hasAuth = Object.keys(headers).some((k) => k.toLowerCase() === 'authorization');
  if (config.token && !hasAuth) headers.Authorization = `Bearer ${config.token}`;

  const base = String(config.domain).trim().replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  const qs = new URLSearchParams(queryParams).toString();

  return {
    index,
    endpointId: endpoint.id,
    endpointName: endpoint.name ?? '',
    pathTemplate: endpoint.pathTemplate,
    msisdn: msisdn ?? null,
    method: (endpoint.method || 'GET').toUpperCase(),
    url: `${base}${suffix}${qs ? `?${qs}` : ''}`,
    headers,
    queryParams,
    pathParams: msisdn ? { msisdn } : {},
    body: endpoint.body ?? null,
    unresolved: [...missing],
  };
}

export function buildRequests(config) {
  const range = validateRange(config?.dateRange?.from, config?.dateRange?.to);
  if (!range.ok) throw new Error(range.error);

  const fmt = config.dateFormat || 'ddMMyyyy';
  const baseScope = {
    fromDate: formatDate(range.from, fmt),
    toDate: formatDate(range.to, fmt),
  };

  const requests = [];
  let index = 0;

  for (const endpoint of (config.endpoints ?? []).filter((e) => e.enabled)) {
    const list = wantsMsisdn(endpoint) ? (config.msisdns ?? []) : [null];
    for (const msisdn of list) {
      index += 1;
      requests.push(buildOne({
        config, endpoint, msisdn, index,
        scope: { ...baseScope, msisdn },
      }));
    }
  }

  return requests;
}
