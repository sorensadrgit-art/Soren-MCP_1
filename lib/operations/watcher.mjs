import {HttpError} from '../security/auth.mjs';

export function validateWatcherReceipt(value, {now = Date.now()} = {}) {
  const keys = ['observedAt','scheduledSlot','probeIdentity','status','gatewayReachable','dispatcherFresh','failureDomain','environment','sourceRevision','evidenceRef'];
  if (!value || Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !(key in value))
    || !['HEALTHY','DEGRADED','UNHEALTHY','UNKNOWN'].includes(value.status)
    || typeof value.gatewayReachable !== 'boolean' || typeof value.dispatcherFresh !== 'boolean'
    || !/^[\w:.-]{1,160}$/.test(value.probeIdentity || '') || !/^[\w:./-]{1,160}$/.test(value.failureDomain || '')
    || !/^[\w.-]{1,80}$/.test(value.environment || '') || !/^[\w:./-]{1,256}$/.test(value.evidenceRef || '')
    || (value.sourceRevision !== null && !/^[a-f0-9]{40}$/.test(value.sourceRevision || ''))
    || !Number.isFinite(Date.parse(value.observedAt)) || !Number.isFinite(Date.parse(value.scheduledSlot))
    || Date.parse(value.observedAt) > now + 5000 || Date.parse(value.scheduledSlot) > Date.parse(value.observedAt)
    || (value.status === 'HEALTHY' && (!value.gatewayReachable || !value.dispatcherFresh))) throw new HttpError(400, 'invalid_watcher_receipt');
  return value;
}
