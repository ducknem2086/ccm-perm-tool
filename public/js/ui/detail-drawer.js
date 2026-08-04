import { contentType, hasJsonBody, bodyPretty } from '../shared/response-body.js';
import { curlOf, curlFilename } from '../shared/curl.js';
import { downloadBlob } from '../shared/download.js';

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const JSON_TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

// To mau tren chuoi goc roi escape tung manh — an toan hon la escape truoc roi
// bam regex vao chuoi da co &quot;.
function highlightJson(json) {
  let out = '';
  let last = 0;
  for (const m of json.matchAll(JSON_TOKEN)) {
    out += escapeHtml(json.slice(last, m.index));
    const [full, str, colon, lit, num] = m;
    if (str) {
      out += `<span class="tok-${colon ? 'key' : 'str'}">${escapeHtml(str)}</span>${colon ? escapeHtml(colon) : ''}`;
    } else if (lit) {
      out += `<span class="tok-lit">${escapeHtml(lit)}</span>`;
    } else {
      out += `<span class="tok-num">${escapeHtml(num)}</span>`;
    }
    last = m.index + full.length;
  }
  return out + escapeHtml(json.slice(last));
}

function kvTable(obj) {
  const rows = Object.entries(obj ?? {});
  if (rows.length === 0) {
    return '<table class="kv"><tbody><tr><td class="el-empty" colspan="2">(không có)</td></tr></tbody></table>';
  }
  const body = rows
    .map(([k, v]) => `<tr><td class="kv-k mono">${escapeHtml(k)}</td><td class="kv-v mono">${escapeHtml(v)}</td></tr>`)
    .join('');
  return `<table class="kv"><tbody>${body}</tbody></table>`;
}

const canPretty = (rec) => hasJsonBody(rec);
const canPreview = (rec) => /text\/html|xml/i.test(contentType(rec));

function prettyHtml(rec) {
  if (!canPretty(rec)) return '';
  return highlightJson(bodyPretty(rec));
}

const rawText = (rec) => rec.response.bodyText || rec.errorMessage || '(rỗng)';

// Chang cuoi khac URL goi di nghia la da qua 3xx — hay gap nhat la bi day ve
// trang dang nhap, luc do status 200 va body HTML hoan toan gay hieu nham.
function redirectNote(rec) {
  if (!rec.response.redirected) return '';
  return '<span class="label">ĐÃ CHUYỂN HƯỚNG TỚI</span>'
    + `<pre class="status-down">${escapeHtml(rec.response.finalUrl ?? '')}</pre>`;
}

// suffix phan biet tab/pane cua cot NGHIỆP VỤ va cot CHECK PERMISSION khi ca
// hai cung hien — rong khi record chi co mot cot (khong co oracle). Ten
// (vd 'pretty_business') la khoa duy nhat de scope click handler ve dung
// nhom, khong dua vao long DOM.
function bodyPanes(rec, suffix = '') {
  const active = canPretty(rec) ? 'pretty' : 'raw';
  const pane = (name, inner) => (
    `<div class="body-pane" data-pane="${name}${suffix}"${name === active ? '' : ' hidden'}>${inner}</div>`
  );

  return [
    pane('pretty', `<pre class="body-view">${prettyHtml(rec)}</pre>`),
    pane('raw', `<pre class="body-view">${escapeHtml(rawText(rec))}</pre>`),
    pane('preview', canPreview(rec)
      ? `<iframe class="preview-frame" sandbox srcdoc="${escapeHtml(rec.response.bodyText ?? '')}"></iframe>`
      : '<p class="hint">Response không phải HTML/XML nên không xem trước được.</p>'),
  ].join('');
}

function tabBar(rec, suffix = '') {
  const active = canPretty(rec) ? 'pretty' : 'raw';
  const tab = (name, label, enabled) => (
    `<button type="button" class="body-tab${name === active ? ' is-active' : ''}" `
    + `data-tab="${name}${suffix}"${enabled ? '' : ' disabled'}>${label}</button>`
  );
  return '<div class="body-tabs">'
    + tab('pretty', 'Pretty', canPretty(rec))
    + tab('raw', 'Raw', true)
    + tab('preview', 'Preview', canPreview(rec))
    + '</div>';
}

// Header dung cho ca hai cot: ten cot + hai nut export cURL. cURL xuat ra
// mang cookie/token NGUYEN VEN, khong che — khac Excel export co radio
// Che/Day du — vi file nay de replay lai request, che thi vo dung.
function colHead(title, kind) {
  return `
    <div class="detail-col-head">
      <span class="label">${title}</span>
      <div class="detail-col-actions">
        <button type="button" class="btn btn-secondary btn-sm" data-curl-copy="${kind}"
          title="Copy lệnh cURL — chứa cookie/token nguyên vẹn, không che, dùng để replay request">⧉ Copy cURL</button>
        <button type="button" class="btn btn-secondary btn-sm" data-curl-download="${kind}"
          title="Tải file .txt — chứa cookie/token nguyên vẹn, không che, dùng để replay request">⤓ .txt</button>
      </div>
    </div>
  `;
}

function businessColumn(rec) {
  const ok = rec.response.status !== null && rec.response.status < 400;
  const suffix = rec.oracle ? '_business' : '';
  return `
    <div class="detail-col">
      ${colHead('NGHIỆP VỤ', 'business')}
      <p class="mono ${ok ? 'status-up' : 'status-down'}">
        ${rec.request.method} · ${rec.response.status ?? '—'} ${rec.response.statusText ?? ''}
        · ${rec.durationMs}ms ${rec.errorCode ? `· ${rec.errorCode}` : ''}
      </p>
      <span class="label">URL</span>
      <pre class="url-box">${escapeHtml(rec.request.url)}</pre>
      ${redirectNote(rec)}
      ${rec.errorMessage ? `<p class="warning">${escapeHtml(rec.errorMessage)}</p>` : ''}
      <div class="kv-grid">
        <div><span class="label">REQUEST HEADERS</span>${kvTable(rec.request.headers)}</div>
        <div><span class="label">RESPONSE HEADERS</span>${kvTable(rec.response.headers)}</div>
        <div><span class="label">PATH PARAMS</span>${kvTable(rec.request.pathParams)}</div>
        <div><span class="label">QUERY PARAMS</span>${kvTable(rec.request.queryParams)}</div>
        <div><span class="label">AUTH</span>${kvTable({ profile: rec.authName ?? '—' })}</div>
      </div>
      <span class="label">RESPONSE BODY${rec.errorMessage ? ' / lỗi' : ''}</span>
      ${tabBar(rec, suffix)}
      ${bodyPanes(rec, suffix)}
    </div>
  `;
}

// Cot CHECK PERMISSION — chi hien khi record co gan oracle (CHECK PERM voi
// UC3 da khai). Day la cho soi khi Status va Status Check Perm lech nhau:
// phai thay duoc IAM tra gi va API tra gi canh nhau, kem body day du.
function oracleColumn(rec) {
  const o = rec.oracle;
  if (!o) return '';
  const ok = o.status !== null && o.status < 400;
  // canPretty/tabBar/bodyPanes doc rec.response.* — boc lai hinh dang cua o
  // (co, khong lien so voi rec.response that) de dung chung logic Pretty/Raw/
  // Preview voi cot NGHIỆP VỤ thay vi dump text tho.
  const pseudo = {
    response: {
      status: o.status, headers: o.headers, body: o.body, bodyText: o.bodyText,
    },
    errorMessage: o.errorMessage,
  };
  return `
    <div class="detail-col">
      ${colHead('CHECK PERMISSION', 'oracle')}
      <p class="mono ${ok ? 'status-up' : 'status-down'}">
        ${o.request.method ?? '—'} · ${o.status ?? '—'} ${o.statusText ?? ''}
        ${o.errorCode ? `· ${o.errorCode}` : ''}
      </p>
      <span class="label">URL</span>
      <pre class="url-box">${escapeHtml(o.request.url ?? '')}</pre>
      ${o.errorMessage ? `<p class="warning">${escapeHtml(o.errorMessage)}</p>` : ''}
      <div class="kv-grid">
        <div><span class="label">REQUEST HEADERS</span>${kvTable(o.request.headers)}</div>
        <div><span class="label">RESPONSE HEADERS</span>${kvTable(o.headers)}</div>
        <div><span class="label">FUNCTION / ACTION</span>${kvTable({ function: rec.oracleFunction ?? '—', action: rec.oracleAction ?? '—' })}</div>
      </div>
      <span class="label">REQUEST BODY</span>
      <pre class="body-view">${escapeHtml(typeof o.request.body === 'string' ? o.request.body : JSON.stringify(o.request.body ?? null))}</pre>
      <span class="label">RESPONSE BODY${o.errorMessage ? ' / lỗi' : ''}</span>
      ${tabBar(pseudo, '_oracle')}
      ${bodyPanes(pseudo, '_oracle')}
    </div>
  `;
}

function requestOf(rec, kind) {
  return kind === 'oracle' ? (rec.oracle?.request ?? null) : rec.request;
}

async function copyCurl(rec, kind) {
  const cmd = curlOf(requestOf(rec, kind));
  try {
    await navigator.clipboard.writeText(cmd);
    window.ccmToast?.('Đã copy lệnh cURL vào clipboard', 'ok');
    return;
  } catch { /* Clipboard API bi chan (khong phai secure context, quyen bi tu choi) — thu fallback */ }

  const ta = document.createElement('textarea');
  ta.value = cmd;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.append(ta);
  ta.focus();
  ta.select?.();
  try {
    document.execCommand('copy');
    window.ccmToast?.('Đã copy lệnh cURL vào clipboard', 'ok');
  } catch {
    window.ccmToast?.('Không copy được — trình duyệt chặn Clipboard API', 'error');
  } finally {
    ta.remove();
  }
}

function downloadCurl(rec, kind) {
  const cmd = curlOf(requestOf(rec, kind));
  downloadBlob(curlFilename(rec, kind), cmd, 'text/plain;charset=utf-8');
  window.ccmToast?.('Đã tải file cURL — chứa cookie/token nguyên vẹn', 'ok');
}

export function initDetailDrawer() {
  const drawer = document.getElementById('drawer');

  function close() {
    drawer.hidden = true;
    drawer.setAttribute('aria-hidden', 'true');
    drawer.innerHTML = '';
  }

  // Ten tab/pane mang hau to nhom (vd 'pretty_business') — tach nhom bang
  // chinh chuoi ten, khong dua vao long DOM, de bam Pretty o cot nay khong
  // lat pane cua cot kia.
  const groupOf = (name) => (name.includes('_') ? name.slice(name.indexOf('_')) : '');

  function open(rec) {
    const cols = rec.oracle ? `${businessColumn(rec)}${oracleColumn(rec)}` : businessColumn(rec);
    drawer.innerHTML = `
      <div class="el-head">
        <h2 class="card-title">Request #${rec.index}${rec.authName ? ` · ${escapeHtml(rec.authName)}` : ''}</h2>
        <button type="button" class="btn btn-secondary btn-sm" data-close>Đóng</button>
      </div>
      <div class="detail-cols">${cols}</div>
    `;
    drawer.hidden = false;
    drawer.setAttribute('aria-hidden', 'false');

    for (const btn of drawer.querySelectorAll('[data-tab]')) {
      btn.addEventListener('click', () => {
        if (btn.attributes?.disabled !== undefined || btn.disabled) return;
        const name = btn.getAttribute('data-tab');
        const group = groupOf(name);
        for (const other of drawer.querySelectorAll('[data-tab]')) {
          if (groupOf(other.getAttribute('data-tab')) !== group) continue;
          other.classList.toggle('is-active', other === btn);
        }
        for (const pane of drawer.querySelectorAll('[data-pane]')) {
          const paneName = pane.getAttribute('data-pane');
          if (groupOf(paneName) !== group) continue;
          pane.hidden = paneName !== name;
        }
      });
    }

    for (const btn of drawer.querySelectorAll('[data-curl-copy]')) {
      btn.addEventListener('click', () => copyCurl(rec, btn.getAttribute('data-curl-copy')));
    }
    for (const btn of drawer.querySelectorAll('[data-curl-download]')) {
      btn.addEventListener('click', () => downloadCurl(rec, btn.getAttribute('data-curl-download')));
    }

    drawer.querySelector('[data-close]').addEventListener('click', close);
    drawer.querySelector('[data-close]').focus();
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !drawer.hidden) close();
  });

  // Row cua ca hai bang ket qua deu mo drawer nay, nen click vao chung khong
  // duoc tinh la click ra ngoai — neu khong drawer vua mo se bi dong ngay.
  const isResultRow = (target) => (
    target.closest('#result-table tbody tr') !== null
    || target.closest('#perm-table tbody tr') !== null
  );

  document.addEventListener('click', (e) => {
    if (drawer.hidden) return;
    if (!drawer.contains(e.target) && !isResultRow(e.target)) close();
  });

  return { open, close };
}
