// Tim theo name hoac pathTemplate, khong phan biet hoa thuong, trim ca gia
// tri luu lan chuoi go — du lieu dan vao co the dinh khoang trang thua.
export function matchesEndpointSearch(ep, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (q === '') return true;

  const name = String(ep?.name ?? '').trim().toLowerCase();
  const path = String(ep?.pathTemplate ?? '').trim().toLowerCase();
  return name.includes(q) || path.includes(q);
}
