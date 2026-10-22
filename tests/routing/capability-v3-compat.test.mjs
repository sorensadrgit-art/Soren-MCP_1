import test from 'node:test';
import assert from 'node:assert/strict';
import {runRouteSession,INIT,toolCall,toolValue} from '../helpers/mcp-route.mjs';
import {routeTaskRequest} from '../../lib/routing/route-request.mjs';
import {routeTaskFederated} from '../../lib/federation.mjs';
import {guardedProviderCall,requestContext} from '../../lib/gateway.mjs';
import {CapabilityPlanSchema} from '../../lib/capabilities/planner.mjs';

// No gateway store or rate key: every shared-budget call must fail closed.
const NO_STORE={SUPABASE_URL:'',SUPABASE_ANON_KEY:'',SOREN_GATEWAY_DB_KEY:'',SOREN_WORKSPACE_ID:'',SOREN_RATE_KEY:'',
  TYPESAFE_JEV_ENABLED:'true',TYPESAFE_API_KEY:'fixture-not-a-real-key'};
const SECRET_TASK='Analyze confidential CSV for jane@example.test with API_KEY=super-private-value';
const legacyRoute={task:'GSAP Three.js WebGL website',runtime:'codex',discovery:'local'};
const calls=[INIT,['tools/list'],
  toolCall('route_task',legacyRoute),
  toolCall('route_task',{...legacyRoute,include_capability_plan:false}),
  toolCall('route_task',{task:'React Three Fiber scene with drei',discovery:'local',preferred_skills:['react-three-fiber']}),
  toolCall('route_task',{task:SECRET_TASK,discovery:'federated',decision_engine:'jev',include_capability_plan:true,capability_context:{domain:'data',source_scope:'private'}}),
  toolCall('route_task',{task:'GSAP WebGL MCP integration',decision_engine:'jev',include_capability_plan:true,capability_context:{source_scope:'public'}}),
  toolCall('route_task',{task:'Analyze CSV',capability_context:{domain:'data'}}),
  toolCall('route_task',{task:'Analyze CSV',discovery:'local',include_capability_plan:true,capability_context:{domain:'data'}}),
];
const off=runRouteSession(calls,{env:NO_STORE});
const on=runRouteSession(calls,{v3:true,env:NO_STORE});

test('route_task advertises the opt-in fields with the flag off and on; no other tool gains them',()=>{
  for(const session of [off,on]){
    const tools=session[1].body.result.tools;
    const schema=tools.find(t=>t.name==='route_task').inputSchema;
    assert.equal(schema.properties.include_capability_plan.type,'boolean');
    assert.ok(schema.properties.capability_context);assert.ok(schema.properties.decision_engine);
    for(const key of ['task','runtime','discovery','providers','preferred_skills','unavailable_skills'])assert.ok(schema.properties[key],key);
    assert.deepEqual(schema.required,['task']);
    for(const t of tools.filter(t=>t.name!=='route_task'))assert.ok(!t.inputSchema?.properties?.include_capability_plan,t.name);
  }
  assert.equal(off[1].body.result.tools.length,8);assert.equal(on[1].body.result.tools.length,14);
});

test('default and explicit-false responses are identical to the legacy router and across flag states',async()=>{
  const expected=await routeTaskFederated(legacyRoute.task,legacyRoute.runtime,{discovery:'local'});
  for(const session of [off,on])for(const index of [2,3]){
    const value=toolValue(session[index]);
    assert.deepEqual(value,expected);assert.ok(!Object.hasOwn(value,'capabilityPlan'));
  }
});

test('every curated V3 skill name is accepted as a preference, not only the legacy four',()=>{
  for(const session of [off,on]){
    const value=toolValue(session[4]);
    assert.equal(session[4].body.result.isError,undefined);
    assert.equal(value.primary.name,'react-three-fiber');
  }
});

test('private scope forces local discovery, skips TypeSafe and never echoes private text in the plan',()=>{
  for(const session of [off,on]){
    const value=toolValue(session[5]);
    assert.equal(value.discoveryMode,'local');assert.deepEqual(value.providerStatus,{});
    assert.equal(value.decisionEngine.status,'privacy_scope_preserved');
    const plan=CapabilityPlanSchema.parse(value.capabilityPlan);
    assert.equal(plan.sourceScope,'private');assert.equal(plan.executionAuthorized,false);
    const serialized=JSON.stringify(plan);
    for(const fragment of ['jane@','super-private','API_KEY'])assert.ok(!serialized.includes(fragment),fragment);
  }
});

test('without a gateway store, public federation and TypeSafe fail closed and keep deterministic routing',()=>{
  for(const session of [off,on]){
    const value=toolValue(session[6]);
    assert.equal(value.decisionEngine.status,'unavailable_or_budget_limited');
    assert.ok(Object.values(value.providerStatus).every(s=>s.status==='unavailable'&&s.reason==='shared_provider_budget_unavailable'));
    assert.deepEqual(value.discoveredCandidates,[]);
    assert.equal(value.capabilityPlan.executionAuthorized,false);
  }
});

test('context without opt-in is rejected through the real route; opt-in plans match across flag states',()=>{
  for(const session of [off,on])assert.equal(session[7].body.result.isError,true);
  const strip=v=>({...v,capabilityPlan:{...v.capabilityPlan,taskId:'x'}});
  assert.deepEqual(strip(toolValue(off[8])),strip(toolValue(on[8])));
});

test('the real shared-budget guard denies TypeSafe before any network call when no store exists',async()=>{
  let network=0;
  const request=new Request('http://127.0.0.1/api/mcp',{method:'POST'});
  const result=await requestContext.run(request,()=>routeTaskRequest(
    {task:'GSAP WebGL MCP integration',discovery:'federated',decision_engine:'jev',include_capability_plan:true,capability_context:{source_scope:'public'}},
    {env:NO_STORE,discoverer:async()=>({query:'gsap webgl mcp',results:[],count:0,providers:{}}),
      guardedAdvice:(kind,args,run)=>guardedProviderCall(kind,args,run,{env:NO_STORE}),
      fetcher:async()=>{network++;throw Error('must not run');}}));
  assert.equal(network,0);
  assert.equal(result.decisionEngine.status,'unavailable_or_budget_limited');
});
