import axios from 'axios';
import { extractErrorCode, DEFAULT_ERROR_CODE_PATHS } from './error-code.js';

const BOM_CODE = 0xfeff;
const stripBom = (s) => {
  const str = String(s ?? '');
  return (str.length > 0 && str.charCodeAt(0) === BOM_CODE ? str.slice(1) : str).trim();
};

const mimeOf = (resHeaders) => String(resHeaders['content-type'] ?? '').split(';')[0].trim();

// Chi bao dong khi nhan HTML/XML — day la dau hieu "duoc tra ve mot trang web
// thay vi du lieu API". text/plain van co the la response that cua API nen de
// yen, khong bat nguoi dung phai loc them mot ma loi gia.
const PAGE_MIME = /html|xml/i;

// Response khong parse duoc thanh JSON thi phai noi ro vi sao, khong de nguoi
// dung tu doan qua mot cuc HTML. Hai nguyen nhan rat khac nhau ve cach xu ly.
function diagnose({ status, resHeaders, bodyText, redirected, finalUrl, requestUrl }) {
  if (String(bodyText ?? '').trim() === '') return null;

  const mime = mimeOf(resHeaders);
  if (!PAGE_MIME.test(mime)) return null;

  if (redirected) {
    return {
      code: 'REDIRECTED',
      message: `Bị chuyển hướng sang ${finalUrl} và nhận ${mime}.`
        + ' Thường là token/cookie hết hạn nên bị đẩy về trang đăng nhập.',
    };
  }
  if (status >= 400) return null; // status da noi len van de, khong can them ma loi
  return {
    code: 'NOT_JSON',
    message: `Server trả về ${mime} thay vì JSON tại ${requestUrl}.`
      + ' Kiểm tra domain/path có đúng endpoint API không, hoặc request bị WAF chặn.',
  };
}

// In ra console server moi khi mot request khong ra JSON, kem day du header
// da gui — de doi chieu truc tiep voi Network tab cua trinh duyet ma khong
// phai mo tung dong trong bang ket qua.
function logDiagnostic(req, { status, resHeaders, hint, redirected, finalUrl }) {
  if (!hint) return;
  console.error(
    `[ccm] ${hint.code} — ${req.method} ${req.url}\n`
    + `  status=${status} content-type=${resHeaders['content-type'] ?? '(none)'}`
    + `${redirected ? ` redirected-to=${finalUrl}` : ''}\n`
    + `  request-headers=${JSON.stringify(req.headers)}`,
  );
}

function finalize({
  req, startedAt, t0,
  status = null, statusText = '', resHeaders = {},
  body = null, bodyText = '',
  redirected = false, finalUrl = '',
  errorCode = null, errorMessage = null,
  errorCodePaths = DEFAULT_ERROR_CODE_PATHS,
}) {
  return {
    index: req.index,
    endpointId: req.endpointId,
    endpointName: req.endpointName,
    authId: req.authId ?? '',
    authName: req.authName ?? '',
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
      redirected,
      finalUrl: finalUrl || req.url,
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
    const res = await axios.request({
      url: req.url,
      method: req.method,
      headers: req.headers,
      data: req.body ?? undefined,
      signal: combined,
      // Luon tra chuoi tho, khong de axios tu JSON.parse — can tu parse lai
      // de xu ly BOM giong het logic cu, va can bodyText cho ca truong hop loi.
      responseType: 'text',
      // Mac dinh axios nem loi voi status >= 400 — tool nay can doc duoc moi
      // status (400, 500...) nhu mot response binh thuong de hien trong bang.
      validateStatus: () => true,
      maxRedirects: 5,
    });

    const bodyText = res.data ?? '';
    // BOM hoac khoang trang dau chuoi lam JSON.parse nem loi, khi do body bi
    // coi la khong phai JSON va UI phai hien chuoi tho — cat truoc khi parse.
    let body = null;
    try { body = JSON.parse(stripBom(bodyText)); } catch { body = null; }

    const resHeaders = { ...res.headers };
    // follow-redirects (adapter http cua axios) luon dien responseUrl la URL
    // sau cung, du co redirect hay khong — so sanh voi URL goc de biet co
    // di qua 3xx khong. Day la dau hieu duy nhat phan biet "API tra HTML"
    // voi "bi day ve trang dang nhap", vi ca hai deu ve toi day 200+text/html.
    const finalUrl = res.request?.res?.responseUrl || req.url;
    const redirected = finalUrl !== req.url;

    const hint = body === null
      ? diagnose({
        status: res.status, resHeaders, bodyText, redirected, finalUrl, requestUrl: req.url,
      })
      : null;
    logDiagnostic(req, { status: res.status, resHeaders, hint, redirected, finalUrl });

    return finalize({
      req, startedAt, t0,
      status: res.status,
      statusText: res.statusText,
      resHeaders,
      body, bodyText,
      redirected, finalUrl,
      errorCode: hint?.code ?? null,
      errorMessage: hint?.message ?? null,
      errorCodePaths,
    });
  } catch (err) {
    let code;
    if (signal?.aborted) code = 'ABORTED';
    else if (timeoutSignal.aborted) code = 'ETIMEDOUT';
    else code = err.code || err.cause?.code || 'EFETCH';

    return finalize({
      req, startedAt, t0,
      errorCode: code,
      errorMessage: err.message || String(err),
      errorCodePaths,
    });
  }
}
