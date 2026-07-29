const pretty = (rec) => {
  if (rec.response.body !== null) {
    try { return JSON.stringify(rec.response.body, null, 2); } catch { /* roi xuong duoi */ }
  }
  return rec.response.bodyText || rec.errorMessage || '(rỗng)';
};

const table = (obj) => Object.entries(obj ?? {})
  .map(([k, v]) => `${k}: ${v}`)
  .join('\n') || '(không có)';

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
      <span class="label">Request headers</span>
      <pre>${escapeHtml(table(rec.request.headers))}</pre>
      <span class="label">Path params</span>
      <pre>${escapeHtml(table(rec.request.pathParams))}</pre>
      <span class="label">Query params</span>
      <pre>${escapeHtml(table(rec.request.queryParams))}</pre>
      <span class="label">Response headers</span>
      <pre>${escapeHtml(table(rec.response.headers))}</pre>
      <span class="label">Response body${rec.errorMessage ? ' / lỗi' : ''}</span>
      <pre>${escapeHtml(pretty(rec))}</pre>
    `;
    drawer.hidden = false;
    drawer.setAttribute('aria-hidden', 'false');
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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
