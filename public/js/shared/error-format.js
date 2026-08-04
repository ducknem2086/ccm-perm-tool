// validateConfig() gan field 'endpoint:<id>' cho loi thuoc ve mot endpoint cu
// the — dich id do sang so thu tu + ten/path de nguoi dung biet ngay dong nao
// trong danh sach ENDPOINTS dang loi, khong phai doi qua tung dong do.
export function describeConfigError(err, endpoints) {
  const m = /^endpoint:(.+)$/.exec(err.field ?? '');
  if (!m) return err.message;

  const id = m[1];
  const idx = (endpoints ?? []).findIndex((ep) => ep.id === id);
  if (idx === -1) return `Endpoint ${id}: ${err.message}`;

  const ep = endpoints[idx];
  const label = ep.name || ep.pathTemplate || id;
  return `Endpoint #${idx + 1} "${label}": ${err.message}`;
}

export function formatConfigErrors(errors, endpoints) {
  return (errors ?? []).map((e) => `• ${describeConfigError(e, endpoints)}`).join('\n');
}
