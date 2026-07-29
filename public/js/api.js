async function asJson(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { error: text }; }
}

export async function startRun(config) {
  const res = await fetch('/api/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(config),
  });
  const json = await asJson(res);
  if (!res.ok) {
    const err = new Error(json.error ?? 'Không chạy được');
    err.errors = json.errors ?? [];
    throw err;
  }
  return json;
}

export function openStream(runId, { onResult, onProgress, onDone } = {}) {
  const es = new EventSource(`/api/run/${runId}/stream`);
  es.addEventListener('result', (e) => onResult?.(JSON.parse(e.data)));
  es.addEventListener('progress', (e) => onProgress?.(JSON.parse(e.data)));
  es.addEventListener('done', (e) => { onDone?.(JSON.parse(e.data)); es.close(); });
  return es;
}

export async function fetchRun(runId) {
  const res = await fetch(`/api/run/${runId}`);
  if (!res.ok) throw new Error('Không tìm thấy run');
  return res.json();
}

export async function cancelRun(runId) {
  await fetch(`/api/run/${runId}/cancel`, { method: 'POST' });
}

export async function importFile(file, kind, dedupe) {
  const res = await fetch('/api/import', {
    method: 'POST',
    headers: {
      'content-type': 'application/octet-stream',
      'x-filename': encodeURIComponent(file.name).replace(/%/g, '_'),
      'x-kind': kind,
      'x-dedupe': String(Boolean(dedupe)),
    },
    body: await file.arrayBuffer(),
  });
  const json = await asJson(res);
  if (!res.ok) throw new Error(json.error ?? 'Import thất bại');
  return json;
}

export async function exportExcel(runId, indexes, includeToken) {
  const res = await fetch(`/api/export/${runId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ indexes, includeToken }),
  });
  if (!res.ok) throw new Error('Export thất bại');

  const disposition = res.headers.get('content-disposition') ?? '';
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'ccm-result.xlsx';
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
