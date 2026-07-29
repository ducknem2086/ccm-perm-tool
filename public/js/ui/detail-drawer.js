import { contentType, hasJsonBody, bodyPretty } from '../shared/response-body.js';

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

function bodyPanes(rec) {
  const active = canPretty(rec) ? 'pretty' : 'raw';
  const pane = (name, inner) => (
    `<div class="body-pane" data-pane="${name}"${name === active ? '' : ' hidden'}>${inner}</div>`
  );

  return [
    pane('pretty', `<pre class="body-view">${prettyHtml(rec)}</pre>`),
    pane('raw', `<pre class="body-view">${escapeHtml(rawText(rec))}</pre>`),
    pane('preview', canPreview(rec)
      ? `<iframe class="preview-frame" sandbox srcdoc="${escapeHtml(rec.response.bodyText ?? '')}"></iframe>`
      : '<p class="hint">Response không phải HTML/XML nên không xem trước được.</p>'),
  ].join('');
}

function tabBar(rec) {
  const active = canPretty(rec) ? 'pretty' : 'raw';
  const tab = (name, label, enabled) => (
    `<button type="button" class="body-tab${name === active ? ' is-active' : ''}" `
    + `data-tab="${name}"${enabled ? '' : ' disabled'}>${label}</button>`
  );
  return '<div class="body-tabs">'
    + tab('pretty', 'Pretty', canPretty(rec))
    + tab('raw', 'Raw', true)
    + tab('preview', 'Preview', canPreview(rec))
    + '</div>';
}

export function initDetailDrawer() {
  const drawer = document.getElementById('drawer');

  function close() {
    drawer.hidden = true;
    drawer.setAttribute('aria-hidden', 'true');
    drawer.innerHTML = '';
  }

  function open(rec) {
    const ok = rec.response.status !== null && rec.response.status < 400;
    drawer.innerHTML = `
      <div class="el-head">
        <h2 class="card-title">Request #${rec.index}</h2>
        <button type="button" class="btn btn-secondary btn-sm" data-close>Đóng</button>
      </div>
      <p class="mono ${ok ? 'status-up' : 'status-down'}">
        ${rec.request.method} · ${rec.response.status ?? '—'} ${rec.response.statusText ?? ''}
        · ${rec.durationMs}ms ${rec.errorCode ? `· ${rec.errorCode}` : ''}
      </p>
      <span class="label">URL</span>
      <pre>${escapeHtml(rec.request.url)}</pre>
      <div class="kv-grid">
        <div><span class="label">REQUEST HEADERS</span>${kvTable(rec.request.headers)}</div>
        <div><span class="label">RESPONSE HEADERS</span>${kvTable(rec.response.headers)}</div>
        <div><span class="label">PATH PARAMS</span>${kvTable(rec.request.pathParams)}</div>
        <div><span class="label">QUERY PARAMS</span>${kvTable(rec.request.queryParams)}</div>
      </div>
      <span class="label">RESPONSE BODY${rec.errorMessage ? ' / lỗi' : ''}</span>
      ${tabBar(rec)}
      ${bodyPanes(rec)}
    `;
    drawer.hidden = false;
    drawer.setAttribute('aria-hidden', 'false');

    for (const btn of drawer.querySelectorAll('[data-tab]')) {
      btn.addEventListener('click', () => {
        if (btn.attributes?.disabled !== undefined || btn.disabled) return;
        const name = btn.getAttribute('data-tab');
        for (const other of drawer.querySelectorAll('[data-tab]')) {
          other.classList.toggle('is-active', other === btn);
        }
        for (const pane of drawer.querySelectorAll('[data-pane]')) {
          pane.hidden = pane.getAttribute('data-pane') !== name;
        }
      });
    }

    drawer.querySelector('[data-close]').addEventListener('click', close);
    drawer.querySelector('[data-close]').focus();
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !drawer.hidden) close();
  });

  document.addEventListener('click', (e) => {
    if (drawer.hidden) return;
    if (!drawer.contains(e.target) && e.target.closest('#result-table tbody tr') === null) close();
  });

  return { open, close };
}
