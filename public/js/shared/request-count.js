import { filterEndpoints, filterMsisdns, selectedAuths, businessCommonText } from './run-filter.js';

export function countRequests(state) {
  const runFilter = state?.runFilter ?? {};
  const auths = selectedAuths(state?.auths, runFilter);
  const msisdnCount = filterMsisdns(state?.msisdns, runFilter).length;

  const perAuth = filterEndpoints(
    state?.endpoints, runFilter, state?.selectedSheet,
    businessCommonText(state?.commonEndpointList), state?.commonEndpointsEnabled,
  )
    .reduce((sum, ep) => sum + (ep.attachMsisdn !== false ? msisdnCount : 1), 0);

  return auths.length * perAuth;
}
