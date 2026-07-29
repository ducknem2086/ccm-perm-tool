import { extractErrorCode, DEFAULT_ERROR_CODE_PATHS } from './error-code.js';

const stripBom = (s) => String(s ?? '').replace(/^\uFEFF/, '').trim();

function finalize({
  req, startedAt, t0,
  status = null, statusText = '', resHeaders = {},
  body = null, bodyText = '',
  errorCode = null, errorMessage = null,
  errorCodePaths = DEFAULT_ERROR_CODE_PATHS,
}) {
  return {
    index: req.index,
    endpointId: req.endpointId,
    endpointName: req.endpointName,
    pathTemplate: req.pathTemplate,
    msisdn: req.msisdn ?? null,
    request: {
      method: req.method,
      url: req.url,
      headers: req.headers,
      pathParams: req.pathParams ?? {},
      queryParams: req.queryParams ?? {},
      body: req.body ?? null,
    },
    response: {
      status,
      statusText,
      headers: resHeaders,
      body,
      bodyText,
      sizeBytes: Buffer.byteLength(bodyText ?? '', 'utf8'),
    },
    errorCode: errorCode ?? extractErrorCode(body, errorCodePaths),
    errorMessage,
    durationMs: Math.round(performance.now() - t0),
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
  };
}

export async function sendRequest(req, options = {}) {
  const { timeoutMs = 30000, signal, errorCodePaths = DEFAULT_ERROR_CODE_PATHS } = options;
  const startedAt = new Date();
  const t0 = performance.now();

  if (req.unresolved?.length) {
    return finalize({
      req, startedAt, t0,
      errorCode: 'UNRESOLVED_VAR',
      errorMessage: `Thiếu giá trị cho biến: ${req.unresolved.join(', ')}`,
      errorCodePaths,
    });
  }

  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  try {
    const res = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body ?? undefined,
      signal: combined,
      redirect: 'follow',
    });
    const bodyText = await res.text();
    // BOM hoac khoang trang dau chuoi lam JSON.parse nem loi, khi do body bi
    // coi la khong phai JSON va UI phai hien chuoi tho — cat truoc khi parse.
    let body = null;
    try { body = JSON.parse(stripBom(bodyText)); } catch { body = null; }

    return finalize({
      req, startedAt, t0,
      status: res.status,
      statusText: res.statusText,
      resHeaders: Object.fromEntries(res.headers),
      body, bodyText,
      errorCodePaths,
    });
  } catch (err) {
    let code;
    if (signal?.aborted) code = 'ABORTED';
    else if (timeoutSignal.aborted) code = 'ETIMEDOUT';
    else code = err.cause?.code || err.code || 'EFETCH';

    return finalize({
      req, startedAt, t0,
      errorCode: code,
      errorMessage: err.message || String(err),
      errorCodePaths,
    });
  }
}
