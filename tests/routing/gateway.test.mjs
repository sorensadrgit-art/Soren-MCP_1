import test from 'node:test';
import assert from 'node:assert/strict';
import {guardedProviderCall,limitRequestBody,validateSuppliedIdentity,allowedBrowserOrigin} from '../../lib/gateway.mjs';
const env={SOREN_RATE_KEY:'test-only-'.repeat(8)};
const request=new Request('http://localhost/api/mcp');
test('same-origin browser calls use the preserved Host through Next URL normalization',()=>{
  assert.equal(allowedBrowserOrigin(new Request('http://localhost:3187/api/mcp',{headers:{host:'127.0.0.1:3187',origin:'http://127.0.0.1:3187'}})),true);
  for(const origin of ['http://evil.example','https://127.0.0.1:3187','null'])assert.equal(allowedBrowserOrigin(new Request('http://localhost:3187/api/mcp',{headers:{host:'127.0.0.1:3187',origin}})),false);
});
test('request size enforcement handles declared and streaming bodies',async()=>{
  await assert.rejects(()=>limitRequestBody(new Request(request.url,{method:'POST',body:'x'.repeat(16385)})),/too_large/);
  const bounded=await limitRequestBody(new Request(request.url,{method:'POST',body:'{}'}));
  assert.equal(await bounded.text(),'{}');
});
test('a missing durable budget cannot trigger provider traffic',async()=>{
  let calls=0;await assert.rejects(()=>guardedProviderCall('discover',{query:'gsap'},()=>{calls++;},{request,env:{}}),/budget_unavailable/);assert.equal(calls,0);
});
test('shared quota rejects after cache lookup and coalesces identical concurrent public queries',async()=>{
  let claims=0,calls=0;const writes=[];
  const store={rpc:async(name,args)=>{if(name==='get_federation_cache')return null;if(name==='claim_federation_budget'){claims++;return {allowed:true};}writes.push(args);}};
  const run=async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,5));return {query:'gsap',count:0,providers:{skillsmp:{status:'unavailable'}},results:[]};};
  const results=await Promise.all(Array.from({length:4},()=>guardedProviderCall('discover',{query:'gsap'},run,{request,env,store})));
  assert.equal(claims,1);assert.equal(calls,1);assert.equal(results.length,4);assert.equal(writes[0].p_ttl_seconds,30);
  await assert.rejects(()=>guardedProviderCall('discover',{query:'react'},run,{request,env,store:{rpc:async name=>name==='get_federation_cache'?null:{allowed:false}}}),/quota_exceeded/);
});
test('invalid supplied authorization cannot fall back to anonymous or cached results',async()=>{
  let reads=0;await assert.rejects(()=>guardedProviderCall('discover',{query:'gsap'},()=>assert.fail(),{request:new Request(request.url,{headers:{Authorization:'Bearer invalid'}}),env,authenticate:async()=>{throw Error('denied');},store:{rpc:async()=>{reads++;}}}),/denied/);assert.equal(reads,0);
});
test('401 provider outcomes are never cached',async()=>{
  let writes=0;const store={rpc:async name=>{if(name==='claim_federation_budget')return {allowed:true};if(name==='put_federation_cache')writes++;return null;}};
  await guardedProviderCall('discover',{query:'mcp'},async()=>({count:0,providers:{skills_sh:{status:'unavailable',reason:'AUTH_REQUIRED'}}}),{request,env,store});assert.equal(writes,0);
});
test('a durable unexpired cache value uses its actual SQL RPC shape without claiming quota',async()=>{
  let calls=0;const value={query:'gsap',count:1,results:[{id:'x'}],providers:{skillsmp:{status:'ok'}}};
  const store={rpc:async name=>{assert.equal(name,'get_federation_cache');calls++;return value;}};
  const result=await guardedProviderCall('discover',{query:'gsap'},()=>assert.fail('provider must not run'),{request,env,store});
  assert.equal(result.cacheHit,true);assert.equal(result.results[0].id,'x');assert.equal(calls,1);
});
test('MCP boundary validates supplied identity even for bundled or keyword-free calls',async()=>{
  assert.equal(await validateSuppliedIdentity(request),null);
  await assert.rejects(()=>validateSuppliedIdentity(new Request(request.url,{headers:{Authorization:'Basic invalid'}})),/invalid_authorization/);
  await assert.rejects(()=>validateSuppliedIdentity(new Request(request.url,{headers:{Authorization:'Bearer invalid'}}),{store:{},authenticate:async()=>{throw Error('identity_denied');}}),/identity_denied/);
});
test('anonymous quota identity never trusts a caller supplied generic forwarding header',async()=>{
  const subjects=[];const store={rpc:async(name,args)=>{if(name==='claim_federation_budget'){subjects.push(args.p_subject);return {allowed:true};}return null;}};
  for(const [index,address] of ['192.0.2.1','192.0.2.2'].entries())await guardedProviderCall('discover',{query:'quota-'+index},async()=>({count:0,providers:{}}),{request:new Request(request.url,{headers:{'x-forwarded-for':address}}),env:{...env,VERCEL:'1'},store});
  assert.equal(subjects[0],subjects[1]);
});
