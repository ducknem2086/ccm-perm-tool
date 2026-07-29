import { extractVariables, resolve } from './variables.js';
import { validateRange, formatDate } from './date-format.js';
import { isEndpointPath } from '../../public/js/shared/validators.js';

const usesMsisdn = (tpl) => extractVariables(tpl).includes('msisdn');
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
    if (!isEndpointPath(ep.pathTemplate)) {
      errors.push({ field: `endpoint:${ep.id}`, message: `Path "${ep.pathTemplate}" phải bắt đầu bằng / và không chứa khoảng trắng` });
      continue;
    }
    if (usesMsisdn(ep.pathTemplate) && msisdns.length === 0) {
      errors.push({ field: `endpoint:${ep.id}`, message: 'Endpoint dùng :msisdn nhưng danh sách MSISDN đang rỗng' });
    }
  }

  return errors;
}

function mergePairs(globalList, endpointList) {
  const map = new Map();
  for (const p of activeOnly(globalList)) map.set(p.key, p.value);
  for (const p of activeOnly(endpointList)) map.set(p.key, p.value);
  return map;
}

function buildOne({ config, endpoint, msisdn, scope, index }) {
  const missing = new Set();
  const take = (tpl) => {
    const r = resolve(tpl, scope);
    for (const m of r.missing) missing.add(m);
    return r.value;
  };

  const path = take(endpoint.pathTemplate);

  const queryParams = {};
  for (const [k, v] of mergePairs(config.globalQueryParams, endpoint.queryParams)) {
    if (!k) continue;
    queryParams[take(k)] = take(v);
  }

  const headers = {};
  for (const [k, v] of mergePairs(config.globalHeaders, endpoint.headers)) {
    if (!k) continue;
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
    const list = usesMsisdn(endpoint.pathTemplate) ? (config.msisdns ?? []) : [null];
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
