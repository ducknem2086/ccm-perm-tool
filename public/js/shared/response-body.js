// Response body cua mot record co 2 dang: `body` la object da parse (giong
// res.data cua axios) va `bodyText` la chuoi tho. Cho hien thi thi luon uu tien
// object; chi roi ve chuoi khi server tra ve thu khong phai JSON (HTML, XML...).

export function contentType(rec) {
  const headers = rec?.response?.headers ?? {};
  const key = Object.keys(headers).find((k) => k.toLowerCase() === 'content-type');
  return String(key ? headers[key] : '');
}

export const mimeType = (rec) => contentType(rec).split(';')[0].trim();

export const hasJsonBody = (rec) => rec?.response?.body !== null
  && rec?.response?.body !== undefined;

// Chuoi 1 dong cho o trong bang. JSON thi stringify compact, khong phai JSON
// thi gan nhan mime o dau de nhin phat biet dang nhan HTML chu khong phai JSON.
export function bodyPreview(rec) {
  if (hasJsonBody(rec)) {
    try {
      return JSON.stringify(rec.response.body);
    } catch {
      // vong tron -> roi ve text tho ben duoi
    }
  }
  const raw = String(rec?.response?.bodyText ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return String(rec?.errorMessage ?? '');
  const mime = mimeType(rec);
  return mime && !/json/i.test(mime) ? `[${mime}] ${raw}` : raw;
}

// Dang nhieu dong cho drawer va o Excel: JSON indent 2, khong phai JSON thi
// giu nguyen chuoi tho (khong collapse xuong dong nhu bodyPreview).
export function bodyPretty(rec) {
  if (hasJsonBody(rec)) {
    try {
      return JSON.stringify(rec.response.body, null, 2);
    } catch {
      // vong tron -> roi ve text tho ben duoi
    }
  }
  return String(rec?.response?.bodyText ?? '');
}
