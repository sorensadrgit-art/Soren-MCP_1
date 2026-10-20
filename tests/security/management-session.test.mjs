import test from 'node:test';
import assert from 'node:assert/strict';
import {startManagementLogin,completeManagementLogin,issueManagementSession,readManagementSession,managementConfiguration} from '../../lib/management-session.mjs';
const env={SOREN_ADMIN_ORIGIN:'https://router.example',SOREN_MANAGEMENT_CLIENT_ID:'public-client',SOREN_SESSION_SECRET:'synthetic-test-value-'.repeat(4),SOREN_AUTH_RESOURCE:'https://router.example/api/admin',SOREN_OAUTH_AUTHORIZATION_URL:'https://identity.example/authorize',SOREN_OAUTH_TOKEN_URL:'https://identity.example/token'};
const now=Date.parse('2026-10-20T12:00:00Z');
const request=(cookie,url='https://router.example')=>new Request(url,{headers:{cookie}});
test('management session is authenticated encrypted bounded and expires',()=>{
  const cookie=issueManagementSession('synthetic.access.token',now+900000,env,now);
  assert.doesNotMatch(cookie,/synthetic\.access/);assert.match(cookie,/HttpOnly; Secure; SameSite=Strict/);
  assert.equal(readManagementSession(request(cookie),env,now),'synthetic.access.token');
  assert.equal(readManagementSession(request(cookie),env,now+900001),null);
  assert.equal(readManagementSession(request(cookie.replace('management=','management=x')),env,now),null);
  assert.equal(readManagementSession(request(cookie),{...env,SOREN_ADMIN_ORIGIN:'https://other.example'},now),null);
});
test('OAuth requires HTTPS configured origin and PKCE state before exchanging code',async()=>{
  assert.throws(()=>managementConfiguration({...env,SOREN_OAUTH_TOKEN_URL:'http://identity.example/token'}));
  assert.throws(()=>startManagementLogin(request('','https://evil.example'),env,now));
  const login=startManagementLogin(request(''),env,now),url=new URL(login.url);
  assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.match(login.cookie,/SameSite=Lax/);
  let calls=0;await assert.rejects(()=>completeManagementLogin(request(login.cookie,'https://router.example/api/auth/callback?state=wrong&code=x'),{env,now,fetchImpl:()=>{calls++;},store:{},authenticate:()=>{}}),/state_invalid/);assert.equal(calls,0);
  let verified=false;
  const callback=await completeManagementLogin(request(login.cookie,'https://router.example/api/auth/callback?state='+url.searchParams.get('state')+'&code=one-time-code'),{env,now,store:{},fetchImpl:async(endpoint,options)=>{assert.equal(endpoint,env.SOREN_OAUTH_TOKEN_URL);assert.equal(options.body.get('code_challenge'),null);assert.ok(options.body.get('code_verifier'));return Response.json({token_type:'Bearer',access_token:'synthetic.access.token',expires_in:3600});},authenticate:async(_request,options)=>{assert.equal(options.human,true);assert.equal(options.permission,'dashboard:read');verified=true;}});
  assert.ok(verified);assert.equal(callback.url,'https://router.example/manage');assert.match(callback.cookie,/Max-Age=900/);
});
