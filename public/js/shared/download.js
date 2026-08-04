// Tai mot chuoi xuong may nguoi dung dang mot file — dung chung cho export
// config, export cURL... Excel export (api.js) khac o cho no bat dau tu
// Blob co san tu response, khong phai chuoi + type nen khong dung chung ham nay.
export function downloadBlob(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
