import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCapabilityPlan,sourceScope} from '../../lib/capabilities/planner.mjs';
import {routeTaskRequest} from '../../lib/routing/route-request.mjs';
import {classifyPublicTask} from '../../lib/routing/typesafe.mjs';
const env={TYPESAFE_JEV_ENABLED:'true',TYPESAFE_API_KEY:'test-only-not-real'};
const discoverer=async()=>({query:'gsap webgl mcp',results:[],count:0,providers:{}});
const request={task:'GSAP WebGL MCP integration',discovery:'federated',decision_engine:'jev',include_capability_plan:true,capability_context:{source_scope:'public'}};
const response=()=>JSON.stringify({answers:{skill:{type:'choice',choice:'motion-systems',confidence:.95}}});

test('TypeSafe deadline also bounds a stalled response body, not just headers',async()=>{
  const start=performance.now();
  const decision=await classifyPublicTask('gsap webgl mcp',{env,timeoutMs:100,fetcher:async()=>new Response(new ReadableStream({start(controller){
    setTimeout(()=>{try{controller.enqueue(new TextEncoder().encode(response()));controller.close();}catch{}},350);
  }}))});
  assert.equal(decision.status,'unavailable');assert.ok(performance.now()-start<280,'Body exceeded total request deadline');
});
test('declared private scope cannot be loosened by weaker wording',()=>{
  assert.equal(sourceScope('No web please',{source_scope:'private'}),'private');
});
test('execute-then-inspect is not misclassified as read-only monitoring',()=>{
  const plan=buildCapabilityPlan('Run the n8n workflow then inspect its status.',{domain:'automation',source_scope:'public'});
  assert.equal(plan.operation,'execute');assert.equal(plan.status,'NEEDS_APPROVAL');
});
test('a narrowing operation hint cannot hide an explicit requested external effect',()=>{
  const plan=buildCapabilityPlan('Run the privileged n8n workflow.',{domain:'automation',operation:'read',source_scope:'public'});
  assert.equal(plan.status,'NEEDS_APPROVAL');
});
test('TypeSafe advice is gated, public-term-only and cannot change capability authority',async()=>{
  let calls=0,guards=0;
  const result=await routeTaskRequest(request,{env,discoverer,getOidc:async()=>'',guardedAdvice:async(kind,args,call)=>{
    guards++;assert.equal(kind,'typesafe_jev');assert.equal(args.keywords,'gsap webgl mcp');return call();
  },fetcher:async(url,options)=>{
    calls++;const data=JSON.parse(options.body);assert.deepEqual(data.state,{public_technology_keywords:'gsap webgl mcp'});
    return new Response(response(),{headers:{'Content-Type':'application/json'}});
  }});
  assert.equal(calls,1);assert.equal(guards,1);assert.equal(result.decisionEngine.status,'applied');
  assert.equal(result.capabilityPlan.executionAuthorized,false);assert.ok(result.capabilityPlan.recommendations.every(r=>r.executionAuthorized===false));
});
test('a denied shared model budget never triggers a direct API fallback',async()=>{
  let calls=0;
  const r=await routeTaskRequest(request,{env,discoverer,guardedAdvice:async()=>{throw Error('quota');},fetcher:async()=>{calls++;throw Error('No call');}});
  assert.equal(calls,0);assert.equal(r.decisionEngine.status,'unavailable_or_budget_limited');
});
test('local mode and explicit user skill preference skip inference even when enabled',async()=>{
  let calls=0;const guardedAdvice=async()=>{calls++;throw Error('No inference');};
  const local=await routeTaskRequest({...request,discovery:'local'},{env,guardedAdvice});
  assert.equal(local.decisionEngine.status,'local_only');
  const preferred=await routeTaskRequest({...request,preferred_skills:['mcp-integration']},{env,discoverer,guardedAdvice});
  assert.equal(preferred.primary.name,'mcp-integration');assert.equal(preferred.decisionEngine.status,'explicit_preference_preserved');assert.equal(calls,0);
});
test('private tasks and runtime strings do not appear in the capability projection or affect another request',()=>{
  const p=buildCapabilityPlan('Analyze confidential CSV for jane@example.test with API_KEY=super-private.',{source_scope:'private'});
  const serialized=JSON.stringify(p);assert.ok(!serialized.includes('jane@'));assert.ok(!serialized.includes('super-private'));
});
