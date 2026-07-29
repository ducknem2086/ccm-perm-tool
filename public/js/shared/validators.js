export const MSISDN_RE = /^[0-9+][0-9]{6,14}$/;

export function isMsisdn(value) {
  return MSISDN_RE.test(String(value ?? '').trim());
}

export function isEndpointPath(value) {
  const v = String(value ?? '').trim();
  return v.startsWith('/') && !/\s/.test(v);
}

export const VALIDATORS = {
  msisdn: isMsisdn,
  endpoint: isEndpointPath,
};

export const VALIDATOR_MESSAGES = {
  msisdn: 'Số điện thoại chỉ gồm chữ số (có thể bắt đầu bằng +), dài 7-15 ký tự',
  endpoint: 'Path phải bắt đầu bằng / và không chứa khoảng trắng',
};
