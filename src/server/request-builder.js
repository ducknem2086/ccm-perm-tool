import { resolve } from './variables.js';
import { validateRange, formatDate } from './date-format.js';
import { isEndpointPath } from '../../public/js/shared/validators.js';
import {
  splitTemplate, parseInlineQuery, hasMsisdnPlaceholder, parseRawHeaders,
} from '../../public/js/shared/endpoint-path.js';
import {
  filterEndpoints, filterMsisdns, selectedAuths, parseCommonEndpoints, businessCommonText,
} from '../../public/js/shared/run-filter.js';
import { authHeaderPairs, findDuplicateNames } from '../../public/js/shared/auth-utils.js';
import { identityOf, authCookieString } from '../../public/js/shared/auth-identity.js';
import { parseCurlRequest } from '../../public/js/shared/curl-parse.js';

// Endpoint cu chua co field nay thi mac dinh la co gan msisdn.
const wantsMsisdn = (ep) => ep?.attachMsisdn !== false;
const activeOnly = (list) => (list ?? []).filter((p) => p.enabled !== false);
const NO_BODY_METHODS = new Set(['GET', 'HEAD']);

export function validateConfig(config) {
  const errors = [];

  if (!/^https?:\/\/\S+$/i.test(String(config?.domain ?? '').trim())) {
    errors.push({ field: 'domain', message: 'Domain phải bắt đầu bằng http:// hoặc https://' });
  }

  const range = validateRange(config?.dateRange?.from, config?.dateRange?.to);
  if (!range.ok) errors.push({ field: 'dateRange', message: range.error });

  const commonEndpointsEnabled = config?.commonEndpointsEnabled;
  // commonEndpointList thay cho chuoi commonEndpoints cu — noi lai text cua
  // rieng muc 'business', dong 'oracle' khong bao gio vao pool nay.
  const commonEndpointsText = businessCommonText(config?.commonEndpointList);
  const common = commonEndpointsEnabled !== false ? parseCommonEndpoints(commonEndpointsText) : [];
  // Moi endpoint deu tinh — checkbox enabled khong con thu hep pham vi chay.
  const enabled = config?.endpoints ?? [];
  if (enabled.length === 0 && common.length === 0) {
    errors.push({ field: 'endpoints', message: 'Cần bật ít nhất 1 endpoint hoặc có endpoint chung' });
  }

  const auths = config?.auths ?? [];
  if (auths.length === 0) {
    errors.push({ field: 'auths', message: 'Cần ít nhất 1 auth profile' });
  }

  const dupNames = findDuplicateNames(auths);
  auths.forEach((a, i) => {
    const name = String(a?.name ?? '').trim();
    if (name === '') {
      errors.push({ field: `auth:${a?.id ?? i}`, message: `Auth profile thứ ${i + 1} chưa có tên` });
    } else if (dupNames.has(name)) {
      errors.push({ field: `auth:${a?.id ?? i}`, message: `Tên auth profile "${name}" bị trùng` });
    }
  });

  const msisdns = config?.msisdns ?? [];
  for (const ep of [...enabled, ...common]) {
    // Chi kiem tra phan path, query rieng sau {*} duoc phep chua dau cach.
    const { path } = splitTemplate(ep.pathTemplate);
    if (!isEndpointPath(path)) {
      errors.push({ field: `endpoint:${ep.id}`, message: `Path "${path}" phải bắt đầu bằng / và không chứa khoảng trắng` });
      continue;
    }
    if (wantsMsisdn(ep) && msisdns.length === 0) {
      errors.push({ field: `endpoint:${ep.id}`, message: 'Endpoint cần msisdn nhưng danh sách MSISDN đang rỗng' });
    }

    const bodyMode = ep.bodyMode ?? 'none';
    if (bodyMode === 'json' && String(ep.bodyRaw ?? '').trim() !== '') {
      try {
        JSON.parse(ep.bodyRaw);
      } catch (err) {
        errors.push({ field: `endpoint:${ep.id}`, message: `Body JSON của endpoint không hợp lệ: ${err.message}` });
      }
    }
    if (bodyMode !== 'none' && NO_BODY_METHODS.has((ep.method || 'GET').toUpperCase())) {
      errors.push({
        field: `endpoint:${ep.id}`,
        message: `Method ${(ep.method || 'GET').toUpperCase()} không gửi được body. Đổi method hoặc đặt Body về None.`,
      });
    }
  }

  // Filter loc sach thi khong co gi de chay — bao ngay chu khong chay 0 request
  // roi bao "xong".
  const runFilter = config?.runFilter ?? {};
  const selectedSheet = config?.selectedSheet;
  const hasRows = selectedAuths(auths, runFilter).length > 0
    && filterEndpoints(config?.endpoints, runFilter, selectedSheet, commonEndpointsText, commonEndpointsEnabled).length > 0
    && (filterMsisdns(msisdns, runFilter).length > 0
      || filterEndpoints(config?.endpoints, runFilter, selectedSheet, commonEndpointsText, commonEndpointsEnabled).every((e) => !wantsMsisdn(e)));

  if ((enabled.length > 0 || common.length > 0) && auths.length > 0 && !hasRows) {
    errors.push({ field: 'runFilter', message: 'Filter không khớp dòng nào — không có request để chạy' });
  }

  return errors;
}

// Danh sach truyen vao phai da duoc loc active san — ham chi lo thu tu uu
// tien, danh sach dau tien thang khi trung key.
function mergePairs(...lists) {
  const map = new Map();
  const put = (k, v) => { if (k && !map.has(k)) map.set(k, v); };
  for (const list of lists) {
    for (const p of list ?? []) put(p.key, p.value);
  }
  return map;
}

// Cau hinh rieng cua endpoint: mode 'raw' la chuoi nguoi dung go tay, mode
// 'kv' la bang key-value — hai nguon luu song song, chi nguon khop mode duoc dung.
function effectiveQueryPairs(ep) {
  return (ep.queryMode ?? 'kv') === 'raw'
    ? parseInlineQuery(ep.queryRaw ?? '')
    : activeOnly(ep.queryParams);
}

function effectiveHeaderPairs(ep) {
  return (ep.headerMode ?? 'kv') === 'raw'
    ? parseRawHeaders(ep.headerRaw ?? '')
    : activeOnly(ep.headers);
}

// HEADERS chung cung co 2 kieu nhap: bang key-value, hoac o dan nguyen lenh cURL.
function globalHeaderPairs(config) {
  return (config.globalHeaderMode ?? 'kv') === 'raw'
    ? parseRawHeaders(config.globalHeaderRaw ?? '')
    : activeOnly(config.globalHeaders);
}

// Endpoint tu khai Body (khac 'none') thi dung rieng, khong cong don voi
// body chung. Endpoint de 'none' — hoac chua tung khai — moi roi xuong dung
// body chung, giong cach QUERY/HEADERS chung ap dung cho key endpoint khong khai.
function effectiveBodyMode(ep, config) {
  const own = ep.bodyMode ?? 'none';
  return own !== 'none' ? own : (config.globalBodyMode ?? 'none');
}

function buildBody(ep, config, take) {
  const mode = effectiveBodyMode(ep, config);
  if (mode === 'none') return null;

  const useGlobal = (ep.bodyMode ?? 'none') === 'none';
  if (mode === 'kv') {
    const obj = {};
    const rows = useGlobal ? activeOnly(config.globalBodyParams) : activeOnly(ep.bodyParams);
    for (const p of rows) obj[take(p.key)] = take(p.value);
    return JSON.stringify(obj);
  }
  return take((useGlobal ? config.globalBodyRaw : ep.bodyRaw) ?? '');
}

const CONTENT_TYPE_BY_BODY_MODE = {
  json: 'application/json', kv: 'application/json', text: 'text/plain', raw: 'application/json',
};

// Request di tu Node nen khong co cac header trinh duyet tu gan. Thieu chung
// thi API/WAF phia sau co the tra ve trang HTML chan thay vi JSON — dac biet
// la User-Agent 'node' va Accept '*/*' mac dinh cua undici.
const BROWSER_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en,vi;q=0.9',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    + ' (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'cross-site',
  'Sec-Fetch-Storage-Access': 'active',
  'sec-ch-ua': '"Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
};

// Nguoi dung tu khai header cung ten (o HEADERS chung hoac rieng) thi ton
// trong khai bao do — mac dinh chi lap vao cho con trong.
function putIfAbsent(headers, name, value) {
  if (!value) return;
  const lower = name.toLowerCase();
  if (Object.keys(headers).some((k) => k.toLowerCase() === lower)) return;
  headers[name] = value;
}

// Xoa header theo ten khong phan biet hoa/thuong — dung khi doi danh tinh
// tu cURL mau sang auth dang chay (xem buildOracleRequest).
function deleteHeaderCI(headers, name) {
  const lower = name.toLowerCase();
  for (const k of Object.keys(headers)) if (k.toLowerCase() === lower) delete headers[k];
}

// Sub-request oracle di kem request nghiep vu, dinh vao req.oracle boi
// buildOne — chay trong CUNG mot task worker, khong phai mot phan tu rieng
// trong mang requests (xem sendPair, http-client.js).
//
// cURL mau o ENDPOINTS CHUNG la KHUON cua request: URL, toan bo header
// (Origin/Referer/X-Current-Url/Sec-Fetch-Site... cua app THAT) va body
// skeleton. Chi DANH TINH bi thay bang danh tinh cua auth dang chay.
//
// Khong tu dung request tu dau: Origin/Referer/X-Current-Url khi do roi ve
// origin cua chinh tool (localhost:9000) va Sec-Fetch-Site thanh 'cross-site',
// IAM sau WAF tra 401. Do la ly do khuon phai giu — xem bang doi soat trong
// docs/superpowers/specs/2026-08-03-auth-single-cookie-design.md.
function buildOracleRequest({ config, auth, endpoint }) {
  const fn = String(endpoint.oracleFunction ?? '').trim();
  if (!fn) return null;

  const tpl = config?.oracleTemplate;
  if (!tpl) return null;

  const id = identityOf(auth);
  if (!id?.individualId || !id?.accountId) return { error: 'ORACLE_IDENTITY_MISSING' };
  const role = String(auth?.role ?? '').trim();
  if (!role) return { error: 'ORACLE_ROLE_MISSING' };

  const curlRaw = String(tpl.curlRaw ?? '').trim();
  const parsed = curlRaw ? parseCurlRequest(curlRaw) : null;
  if (curlRaw && !parsed) return { error: 'ORACLE_TEMPLATE_INVALID' };

  // Khuon body lay tu cURL mau de giu nguyen @type va moi field la neu IAM
  // doi schema; khong co mau thi dung khuon toi thieu da biet.
  let body = null;
  if (parsed?.body) {
    try { body = JSON.parse(parsed.body); } catch { body = null; }
  }
  if (!body?.permissionSpecification) {
    body = {
      '@type': 'CheckPermission',
      permissionSpecification: { '@type': 'PermissionSpecification' },
      user: { '@type': 'PartyRef' },
    };
  }

  body.permissionSpecification.function = fn;
  // Cot ACTION rong = giu nguyen action cua cURL mau; khong co mau thi 'Read'
  // (gia tri ca hai cURL checkPermission that dang dung).
  const action = String(endpoint.oracleAction ?? '').trim()
    || String(body.permissionSpecification.action ?? '').trim()
    || 'Read';
  body.permissionSpecification.action = action;
  // user cua cURL mau thuoc VE NGUOI DA DAN — ba khoa danh tinh phai doi sang
  // auth dang chay, cac khoa khac trong khoi user giu nguyen.
  body.user = { ...(body.user ?? {}), role, id: id.individualId, accountId: id.accountId };

  // Header cua khuon truoc, roi moi lap phan con thieu — nguoc lai la de len
  // Origin/Referer/X-Current-Url that bang gia tri cua tool.
  const headers = { ...(parsed?.headers ?? {}) };
  // Danh tinh cua nguoi da dan khuon: bo han. Authorization khong duoc dat
  // lai — cURL checkPermission that cua FE khong gui header nay.
  deleteHeaderCI(headers, 'Cookie');
  deleteHeaderCI(headers, 'Authorization');
  headers.Cookie = authCookieString(auth);

  putIfAbsent(headers, 'Content-Type', 'application/json');
  const origin = String(config.origin ?? '').trim().replace(/\/+$/, '');
  putIfAbsent(headers, 'Origin', origin);
  putIfAbsent(headers, 'Referer', origin ? `${origin}/` : '');
  putIfAbsent(headers, 'X-Current-Url', origin ? `${origin}/` : '');
  for (const [k, v] of Object.entries(BROWSER_HEADERS)) putIfAbsent(headers, k, v);

  // URL tuyet doi trong khuon dung nguyen; khong co khuon thi ghep tu dong
  // 'METHOD /path' khai o ENDPOINTS CHUNG.
  const base = String(config.domain ?? '').trim().replace(/\/+$/, '');
  let method = parsed?.method || 'POST';
  let url = parsed?.url ?? '';
  if (!url) {
    const [line] = parseCommonEndpoints(tpl.line ?? '');
    if (!line) return { error: 'ORACLE_LINE_INVALID' };
    method = line.method;
    url = line.pathTemplate;
  }
  if (!/^https?:\/\//i.test(url)) url = `${base}${url.startsWith('/') ? '' : '/'}${url}`;

  return {
    method, url, headers, body: JSON.stringify(body), permFunction: fn, permAction: action,
  };
}

function buildOne({ config, auth, endpoint, msisdn, scope, index }) {
  const missing = new Set();
  const take = (tpl) => {
    const r = resolve(tpl, scope);
    for (const m of r.missing) missing.add(m);
    return r.value;
  };

  const hasStar = String(endpoint.pathTemplate ?? '').includes('{*}');
  const { path: rawPath, inlineQuery } = splitTemplate(endpoint.pathTemplate);
  let path = take(rawPath);
  if (msisdn && !hasMsisdnPlaceholder(rawPath)) {
    path = `${path.replace(/\/+$/, '')}/${msisdn}`;
  }

  // Uu tien: cau hinh rieng endpoint > query dinh sau {*} trong path > cau hinh chung (chi khi co {*} va attachCommonQuery !== false).
  const queryParams = {};
  const globalQueries = (hasStar && endpoint.attachCommonQuery !== false) ? activeOnly(config.globalQueryParams) : [];
  for (const [k, v] of mergePairs(
    effectiveQueryPairs(endpoint), parseInlineQuery(inlineQuery), globalQueries,
  )) {
    queryParams[take(k)] = take(v);
  }

  const headers = {};
  for (const [k, v] of mergePairs(
    effectiveHeaderPairs(endpoint), authHeaderPairs(auth), globalHeaderPairs(config),
  )) {
    headers[take(k)] = take(v);
  }

  const method = (endpoint.method || 'GET').toUpperCase();
  let body = NO_BODY_METHODS.has(method) ? null : buildBody(endpoint, config, take);
  if (!NO_BODY_METHODS.has(method) && (body === null || body === '')) {
    body = '{}';
  }
  if (body !== null) {
    putIfAbsent(headers, 'Content-Type', CONTENT_TYPE_BY_BODY_MODE[effectiveBodyMode(endpoint, config)] || 'application/json');
  }

  // Origin la origin cua chinh tool, khong phai domain dich — giong app that
  // goi API cross-site. Referer phai co dau '/' cuoi nhu trinh duyet gui.
  const origin = String(config.origin ?? '').trim().replace(/\/+$/, '');
  putIfAbsent(headers, 'Origin', origin);
  putIfAbsent(headers, 'Referer', origin ? `${origin}/` : '');
  // App that gui URL trang dang xem. Khong doan duoc route cu the nen dung
  // origin lam gia tri toi thieu; khai de o HEADERS neu API soi ky hon.
  putIfAbsent(headers, 'X-Current-Url', origin ? `${origin}/` : '');

  for (const [k, v] of Object.entries(BROWSER_HEADERS)) putIfAbsent(headers, k, v);

  const base = String(config.domain).trim().replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  const qs = new URLSearchParams(queryParams).toString();

  return {
    index,
    endpointId: endpoint.id,
    endpointName: endpoint.name ?? '',
    sheetName: endpoint.sheetName ?? 'Sheet 1',
    authId: auth?.id ?? '',
    authName: auth?.name ?? '',
    pathTemplate: endpoint.pathTemplate,
    msisdn: msisdn ?? null,
    method,
    url: `${base}${suffix}${qs ? `?${qs}` : ''}`,
    headers,
    queryParams,
    pathParams: msisdn ? { msisdn } : {},
    body,
    unresolved: [...missing],
    permName: endpoint.permName ?? null,
    permRowIndex: endpoint.permRowIndex ?? null,
    permRun: endpoint.permRun === true,
    oracle: buildOracleRequest({ config, auth, endpoint }),
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

  const runFilter = config.runFilter ?? {};
  // Loc mot lan roi dung lai — de trong vong lap thi filterMsisdns chay lai
  // auths.length x endpoints.length lan vo ich.
  const auths = selectedAuths(config.auths, runFilter);
  const eps = filterEndpoints(
    config.endpoints, runFilter, config.selectedSheet,
    businessCommonText(config.commonEndpointList), config.commonEndpointsEnabled,
  );
  const msisdns = filterMsisdns(config.msisdns, runFilter);

  const requests = [];
  let index = 0;

  // Auth o vong ngoai cung: request cua cung mot profile nam lien khoi.
  for (const auth of auths) {
    for (const endpoint of eps) {
      const list = wantsMsisdn(endpoint) ? msisdns : [null];
      for (const msisdn of list) {
        index += 1;
        requests.push(buildOne({
          config, auth, endpoint, msisdn, index,
          scope: { ...baseScope, msisdn },
        }));
      }
    }
  }

  return requests;
}
