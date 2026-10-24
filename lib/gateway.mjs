import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash,createHmac} from 'node:crypto';
import {getGatewayStore} from './operations/store.mjs';
import {authenticateRequest} from './security/auth.mjs';

export const requestContext = new AsyncLocalStorage();
export class GatewayError extends Error {
  constructor(code,status=503){super(code);this.status=status;}
}
export function allowedBrowserOrigin(request,{env=process.env}={}){
  const supplied=request.headers.get('origin');if(!supplied)return true;
  try{
    const origin=new URL(supplied).origin;
    const allowed=new Set([new URL(request.url).origin]);
    if(env.SOREN_ADMIN_ORIGIN){try{allowed.add(new URL(env.SOREN_ADMIN_ORIGIN).origin);}catch{}}
    if(env.SOREN_GATEWAY_ORIGIN){try{allowed.add(new URL(env.SOREN_GATEWAY_ORIGIN).origin);}catch{}}
    return allowed.has(origin);
  }catch{return false;}
}

export async function limitRequestBody(request,maxBytes=16384) {
  if(request.method!=='POST')return request;
  if(Number(request.headers.get('content-length')||0)>maxBytes)throw new GatewayError('request_body_too_large',413);
  const reader=request.body?.getReader();if(!reader)return request;
  const chunks=[];let bytes=0;
  for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;
    if(bytes>maxBytes){await reader.cancel();throw new GatewayError('request_body_too_large',413);}chunks.push(value);}
  return new Request(request.url,{method:request.method,headers:request.headers,body:Buffer.concat(chunks),signal:request.signal});
}

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const pending=new Map();
const identities=new WeakMap();
export async function validateSuppliedIdentity(request,{env=process.env,store,authenticate=authenticateRequest}={}){
  if(!request.headers.has('authorization'))return null;
  if(!/^Bearer [\w.-]+$/.test(request.headers.get('authorization')||''))throw new GatewayError('invalid_authorization',401);
  try{store??=getGatewayStore(env);}catch{throw new GatewayError('private_identity_unavailable');}
  const principal=await authenticate(request,{env,store});identities.set(request,principal);return principal;
}
export async function guardedProviderCall(kind,publicArguments,run,{request=requestContext.getStore(),env=process.env,store,authenticate=authenticateRequest}={}) {
  if(!request)throw new GatewayError('request_context_unavailable');
  let principal=null;
  if(request.headers.has('authorization')){
    try{store??=getGatewayStore(env);}catch{throw new GatewayError('private_identity_unavailable');}
    principal=identities.get(request)??await authenticate(request,{env,store,permission:'skills:read'});
    if(principal.permissions&&!principal.permissions.has('skills:read'))throw new GatewayError('discovery_permission_denied',403);
  }
  if(!env.SOREN_RATE_KEY || env.SOREN_RATE_KEY.length<32)throw new GatewayError('shared_provider_budget_unavailable');
  try{store??=getGatewayStore(env);}catch{throw new GatewayError('shared_provider_budget_unavailable');}
  const source=principal ? [principal.workspaceId,principal.subjectId,principal.clientId,principal.grantRevision].join(':') :
    env.VERCEL==='1' ? request.headers.get('x-vercel-forwarded-for')||'unknown' : 'local';
  const subject=createHmac('sha256',env.SOREN_RATE_KEY).update(source).digest('hex');
  const key=digest([kind,publicArguments]);
  let cached;
  try{cached=await store.rpc('get_federation_cache',{p_key:key});}catch{throw new GatewayError('shared_provider_budget_unavailable');}
  // The database returns only an unexpired cached value, using its own clock.
  if(cached&&typeof cached==='object')return {...cached,cacheHit:true};
  // A single public query may share work; its authorization was independently checked above.
  const flightKey=key+':'+Boolean(principal);
  if(pending.has(flightKey))return pending.get(flightKey);
  const operation=(async()=>{
    let budget;
    try{budget=await store.rpc('claim_federation_budget',{p_subject:subject,p_authenticated:Boolean(principal)});}catch{throw new GatewayError('shared_provider_budget_unavailable');}
    if(!budget?.allowed)throw new GatewayError('provider_quota_exceeded',429);
    const value=await run();
    const providerStates=Object.values(value.providers||{});
    const unauthorized=providerStates.some(s=>s.reason==='AUTH_REQUIRED');
    if(!unauthorized){try{await store.rpc('put_federation_cache',{p_key:key,p_value:value,p_negative:value.count===0,p_ttl_seconds:value.count===0?30:600});}catch{/* A cache write is optional after a claimed budget. */}}
    return value;
  })();
  pending.set(flightKey,operation);
  try{return await operation;}finally{pending.delete(flightKey);}
}
