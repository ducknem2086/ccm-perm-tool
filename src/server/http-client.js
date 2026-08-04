import axios from 'axios';
import { extractErrorCode, DEFAULT_ERROR_CODE_PATHS } from './error-code.js';
import { matchPermissionRow, matchPermissionName } from '../../public/js/shared/permission-scope.js';

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

// Duong CHECK PERM da bake san dong UC2 khop endpoint tu client (xem
// permission-match.js) — cham O(1) bang req.permRowIndex, khong quet rows,
// khong loc theo sheet. Cot quyen doc theo auth dang chay, khong con theo
// endpointSheet cua request nhu nhanh RUN ALL ben duoi.
function evaluateUc2Permission({ req, status, permissionFile, permissionMapping }) {
  if (status === null) return 'empty';

  const row = (permissionFile?.rows ?? [])[req.permRowIndex];
  if (!row) return 'empty';

  const headers = permissionFile?.headers ?? [];
  const uc1 = permissionMapping?.usecase1 ?? [];
  const reqAuthNameClean = String(req.authName ?? '').trim().toLowerCase();
  const mapping = uc1.find((m) => (
    String(m.authProfileName ?? '').trim().toLowerCase() === reqAuthNameClean
  ));
  if (!mapping) return 'empty';

  const colIdx = headers.indexOf(mapping.permissionColumn);
  const cellVal = colIdx !== -1 ? String(row[colIdx] ?? '').trim().toLowerCase() : '';

  if (cellVal === 'x') return status !== 403 ? 'true' : 'false';
  return status === 403 ? 'true' : 'false';
}

export function evaluatePermission({ req, status, permissionFile, permissionMapping }) {
  if (!permissionFile || !permissionFile.filename) {
    return null;
  }

  if (req.permRowIndex != null) {
    return evaluateUc2Permission({ req, status, permissionFile, permissionMapping });
  }

  // CHECK PERM chay ca endpoint khong ghep duoc dong phan quyen nao. Khong co
  // dong thi khong cham duoc gi — tra 'empty', KHONG roi xuong nhanh RUN ALL
  // ben duoi (nhanh do lock theo endpointSheet, khac ngu canh CHECK PERM).
  if (req.permRun) {
    return 'empty';
  }

  const mapping = permissionMapping || {};
  const uc2 = mapping.usecase2 || {};
  const uc1 = mapping.usecase1 || [];

  const sheetMappings = uc1.filter((m) => m.endpointSheet === req.sheetName);
  if (sheetMappings.length === 0) {
    return 'empty';
  }

  const headers = permissionFile.headers || [];
  const matchedRow = matchPermissionRow(req.endpointName, permissionFile, uc2);

  if (!matchedRow) {
    return 'empty';
  }

  const reqAuthNameClean = String(req.authName ?? '').trim().toLowerCase();
  const exactMatch = sheetMappings.find((m) => (
    String(m.authProfileName ?? '').trim().toLowerCase() === reqAuthNameClean
  ));

  if (exactMatch) {
    const colIdx = headers.indexOf(exactMatch.permissionColumn);
    const cellVal = colIdx !== -1 ? String(matchedRow[colIdx] ?? '').trim().toLowerCase() : '';
    if (cellVal === 'x') {
      return status === 200 ? 'true' : 'false';
    }
    return 'empty';
  }

  const anyHasPermission = sheetMappings.some((m) => {
    const colIdx = headers.indexOf(m.permissionColumn);
    const cellVal = colIdx !== -1 ? String(matchedRow[colIdx] ?? '').trim().toLowerCase() : '';
    return cellVal === 'x';
  });

  if (anyHasPermission) {
    return status === 403 ? 'true' : 'false';
  }
  return 'empty';
}

function finalize({
  req, startedAt, t0, oracle = null,
  status = null, statusText = '', resHeaders = {},
  body = null, bodyText = '',
  redirected = false, finalUrl = '',
  errorCode = null, errorMessage = null,
  errorCodePaths = DEFAULT_ERROR_CODE_PATHS,
  permissionFile = null,
  permissionMapping = null,
}) {
  // KHONG doc oracle — cong thuc cham diem giu nguyen tu truoc thay doi nay,
  // chi doc status cua request nghiep vu. Oracle la cot thong tin dat canh,
  // khong phai nguon chấm điểm moi.
  const statusPermission = evaluatePermission({ req, status, permissionFile, permissionMapping });
  // CHECK PERM dat permName: null cho endpoint khong dong UC2 nao keo ve. Dung
  // '??' o day thi no roi xuong matchPermissionName — ham khop EXACT thuoc
  // duong RUN ALL — nen endpoint ma include co tinh bo qua van hien ten, mau
  // thuan voi statusPermission 'empty' ngay canh.
  const permissionMatchedName = req.permRun
    ? (req.permName ?? null)
    : (req.permName ?? (permissionFile?.filename
      ? matchPermissionName(req.endpointName, permissionFile, permissionMapping?.usecase2 ?? {})
      : null));

  return {
    index: req.index,
    endpointId: req.endpointId,
    endpointName: req.endpointName,
    sheetName: req.sheetName ?? 'Sheet 1',
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
    // Status THO cua endpoint checkPermission chung, dat canh response de
    // nguoi doc tu doi chieu. null khi endpoint khong co function (khong goi
    // checkPermission) — KHONG co cong thuc nao doc tu day.
    oracle: req.oracle ? {
      request: {
        method: req.oracle.method ?? null,
        url: req.oracle.url ?? null,
        headers: req.oracle.headers ?? {},
        body: req.oracle.body ?? null,
      },
      status: oracle?.status ?? null,
      statusText: oracle?.statusText ?? '',
      headers: oracle?.resHeaders ?? {},
      body: oracle?.body ?? null,
      bodyText: oracle?.bodyText ?? '',
      sizeBytes: Buffer.byteLength(oracle?.bodyText ?? '', 'utf8'),
      redirected: oracle?.redirected ?? false,
      finalUrl: oracle?.finalUrl || req.oracle.url || '',
      errorCode: oracle?.errorCode ?? null,
      errorMessage: oracle?.errorMessage ?? null,
    } : null,
    oracleFunction: req.oracle?.permFunction ?? null,
    oracleAction: req.oracle?.permAction ?? null,
    statusPermission,
    permissionMatchedName,
    errorCode: errorCode ?? extractErrorCode(body, errorCodePaths),
    errorMessage,
    durationMs: Math.round(performance.now() - t0),
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
  };
}

// Goi mot request tho, tra ket qua tho — khong dung toi req.index/permRun/...
// Dung chung cho ca request nghiep vu lan request oracle (sendPair goi ham
// nay hai lan). Tach khoi finalize() de finalize chi lo dung record, khong lo
// goi mang.
async function send(req, options = {}) {
  const { timeoutMs = 30000, signal, errorCodePaths = DEFAULT_ERROR_CODE_PATHS } = options;

  if (req.unresolved?.length) {
    return {
      status: null, statusText: '', resHeaders: {}, body: null, bodyText: '',
      redirected: false, finalUrl: req.url ?? '',
      errorCode: 'UNRESOLVED_VAR',
      errorMessage: `Thiếu giá trị cho biến: ${req.unresolved.join(', ')}`,
    };
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

    return {
      status: res.status,
      statusText: res.statusText,
      resHeaders,
      body, bodyText,
      redirected, finalUrl,
      errorCode: hint?.code ?? null,
      errorMessage: hint?.message ?? null,
    };
  } catch (err) {
    let code;
    if (signal?.aborted) code = 'ABORTED';
    else if (timeoutSignal.aborted) code = 'ETIMEDOUT';
    else code = err.code || err.cause?.code || 'EFETCH';

    return {
      status: null, statusText: '', resHeaders: {}, body: null, bodyText: '',
      redirected: false, finalUrl: req.url,
      errorCode: code,
      errorMessage: err.message || String(err),
    };
  }
}

// Diem vao cua worker (thay sendRequest cu). Chay oracle TRUOC: no khong doi
// trang thai gi tren he thong dich (chi hoi quyen), nen khi request nghiep vu
// la POST/DELETE thi thu tu nay tranh duoc canh "da ghi du lieu roi moi biet
// la khong duoc phep". Mot nua cap chet khong keo nua kia theo — request
// nghiep vu van chay du oracle loi mang/timeout.
export async function sendPair(req, options = {}) {
  const {
    errorCodePaths = DEFAULT_ERROR_CODE_PATHS,
    permissionFile = null, permissionMapping = null,
    ...sendOpts
  } = options;
  const startedAt = new Date();
  const t0 = performance.now();

  let oracle = null;
  if (req.oracle) {
    oracle = req.oracle.error
      ? {
        status: null, statusText: '', resHeaders: {}, body: null, bodyText: '',
        redirected: false, finalUrl: req.oracle.url ?? '',
        errorCode: req.oracle.error,
        errorMessage: 'Body cURL check permission không hợp lệ — thiếu permissionSpecification',
      }
      : await send(req.oracle, sendOpts);
  }

  const main = await send(req, sendOpts);

  return finalize({
    req, startedAt, t0, oracle, ...main, errorCodePaths, permissionFile, permissionMapping,
  });
}
