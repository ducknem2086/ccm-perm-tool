export function countRequests(state) {
  const msisdnCount = (state?.msisdns ?? []).length;
  return (state?.endpoints ?? [])
    .filter((e) => e.enabled)
    .reduce((sum, ep) => sum + (ep.attachMsisdn !== false ? msisdnCount : 1), 0);
}
