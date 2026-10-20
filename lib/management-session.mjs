import {createCipheriv,createDecipheriv,createHash,randomBytes,timingSafeEqual} from 'node:crypto';

const configurationError=()=>{throw new Error('management_oauth_not_configured');};
export function managementConfiguration(env=process.env){
  if(!env.SOREN_ADMIN_ORIGIN||!env.SOREN_MANAGEMENT_CLIENT_ID||!env.SOREN_SESSION_SECRET||env.SOREN_SESSION_SECRET.length<32)configurationError();
  let origin,authorization,token;
  try{origin=new URL(env.SOREN_ADMIN_ORIGIN);authorization=new URL(env.SOREN_OAUTH_AUTHORIZATION_URL);token=new URL(env.SOREN_OAUTH_TOKEN_URL);}catch{configurationError();}
  for(const value of [origin,authorization,token])if(value.protocol!=='https:'||value.username||value.password||value.hash)configurationError();
  if(origin.origin!==env.SOREN_ADMIN_ORIGIN||!env.SOREN_AUTH_RESOURCE)configurationError();
  return {origin:origin.origin,authorization:authorization.href,token:token.href,clientId:env.SOREN_MANAGEMENT_CLIENT_ID,redirectUri:origin.origin+'/api/auth/callback',resource:env.SOREN_AUTH_RESOURCE};
}
function key(env){if(!env.SOREN_SESSION_SECRET||env.SOREN_SESSION_SECRET.length<32)configurationError();return createHash('sha256').update(env.SOREN_SESSION_SECRET).digest();}
function seal(value,purpose,env){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(env),iv);
  cipher.setAAD(Buffer.from('soren-management-v1:'+purpose+':'+env.SOREN_ADMIN_ORIGIN));
  const content=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),content]).toString('base64url');
}
function unseal(value,purpose,env){
  if(typeof value!=='string'||value.length>6000||!/^[\w-]+$/.test(value))return null;
  try{const bytes=Buffer.from(value,'base64url');if(bytes.length<29)return null;
    const decipher=createDecipheriv('aes-256-gcm',key(env),bytes.subarray(0,12));
    decipher.setAAD(Buffer.from('soren-management-v1:'+purpose+':'+env.SOREN_ADMIN_ORIGIN));decipher.setAuthTag(bytes.subarray(12,28));
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8'));
  }catch{return null;}
}
const sessionCookie='__Host-soren-management';
const stateCookie='__Host-soren-oauth';
function cookieValue(request,name){
  const matches=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(name+'='));
  return matches.length===1?matches[0].slice(name.length+1):null;
}
const cookie=(name,value,seconds,sameSite='Strict')=>`${name}=${value}; Path=/; HttpOnly; Secure; SameSite=${sameSite}; Max-Age=${seconds}`;
export function readManagementSession(request,env=process.env,now=Date.now()){
  const value=unseal(cookieValue(request,sessionCookie),'session',env);
  return value&&Number.isFinite(value.expiresAt)&&value.expiresAt>now&&typeof value.accessToken==='string'?value.accessToken:null;
}
export function issueManagementSession(accessToken,expiresAt,env=process.env,now=Date.now()){
  if(typeof accessToken!=='string'||accessToken.length>3500||!Number.isFinite(expiresAt)||expiresAt<=now)throw new Error('invalid_management_session');
  const expiry=Math.min(expiresAt,now+15*60*1000),value=seal({accessToken,expiresAt:expiry},'session',env);
  if(value.length>3900)throw new Error('management_session_too_large');
  return cookie(sessionCookie,value,Math.floor((expiry-now)/1000));
}
export const clearManagementSession=()=>cookie(sessionCookie,'',0);
export function startManagementLogin(request,env=process.env,now=Date.now()){
  const config=managementConfiguration(env);
  if(new URL(request.url).origin!==config.origin)throw new Error('management_origin_denied');
  const state=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url');
  const authorization=new URL(config.authorization);
  for(const [name,value] of Object.entries({response_type:'code',client_id:config.clientId,redirect_uri:config.redirectUri,scope:'openid profile',resource:config.resource,state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',prompt:'login',max_age:'0'}))authorization.searchParams.set(name,value);
  return {url:authorization.href,cookie:cookie(stateCookie,seal({state,verifier,expiresAt:now+5*60*1000,redirectUri:config.redirectUri},'oauth',env),300,'Lax')};
}
/** @param {Request} request @param {{env?:any,fetchImpl?:any,authenticate:any,store:any,now?:number}} options */
export async function completeManagementLogin(request,{env=process.env,fetchImpl=fetch,authenticate,store,now=Date.now()}){
  const config=managementConfiguration(env),url=new URL(request.url);
  const state=unseal(cookieValue(request,stateCookie),'oauth',env),supplied=url.searchParams.get('state')||'';
  if(url.origin!==config.origin||!state||state.expiresAt<=now||state.redirectUri!==config.redirectUri||supplied.length!==state.state.length||!timingSafeEqual(Buffer.from(supplied),Buffer.from(state.state))||url.searchParams.has('error'))throw new Error('oauth_state_invalid');
  const code=url.searchParams.get('code');if(!code||code.length>2048)throw new Error('oauth_code_invalid');
  const response=await fetchImpl(config.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:new URLSearchParams({grant_type:'authorization_code',client_id:config.clientId,redirect_uri:config.redirectUri,code,code_verifier:state.verifier,resource:config.resource}),redirect:'error',signal:AbortSignal.timeout(5000),cache:'no-store'});
  if(!response.ok||response.redirected)throw new Error('oauth_exchange_failed');
  const reader=response.body.getReader(),chunks=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){await reader.cancel();throw new Error('oauth_exchange_failed');}chunks.push(value);}
  const tokens=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(tokens.token_type?.toLowerCase()!=='bearer'||typeof tokens.access_token!=='string'||!Number.isFinite(tokens.expires_in)||tokens.expires_in<=0)throw new Error('oauth_exchange_failed');
  // Identity, revocation, resource, client and human permissions are independently rechecked before creating a session.
  await authenticate(new Request(config.origin+'/api/auth/session',{headers:{Authorization:'Bearer '+tokens.access_token}}),{env,store,permission:'dashboard:read',human:true,now});
  return {url:config.origin+'/manage',cookie:issueManagementSession(tokens.access_token,now+tokens.expires_in*1000,env,now),clearState:cookie(stateCookie,'',0,'Lax')};
}
export const clearOAuthState=()=>cookie(stateCookie,'',0,'Lax');
