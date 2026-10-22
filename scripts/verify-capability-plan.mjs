#!/usr/bin/env node
/** Read-only wire checks for the candidate deployment. No provider or paid model calls. */
import assert from 'node:assert/strict';
import {verificationEndpoint,protectionBypassHeaders} from '../lib/contracts/endpoint.mjs';
import {TOOL_NAMES,V3_TOOL_NAMES} from '../lib/client-contract.mjs';
import {SKILLS} from '../lib/catalog.mjs';
import {CapabilityPlanSchema} from '../lib/capabilities/planner.mjs';
if(!process.argv[2])throw Error('Usage: node scripts/verify-capability-plan.mjs <explicit HTTPS or loopback MCP endpoint>');
const endpoint=verificationEndpoint(process.argv[2]),checks=[],bypass=protectionBypassHeaders(endpoint);
let sequence=0;
async function rpc(method,params={}){
  const id=++sequence;
  const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-06-18',...bypass},body:JSON.stringify({jsonrpc:'2.0',id,method,params}),signal:AbortSignal.timeout(12000)});
  const raw=await r.text();assert.equal(r.status,200,`HTTP ${r.status}`);
  let response;
  if(r.headers.get('content-type')?.includes('text/event-stream')){
    for(const frame of raw.split(/\r?\n\r?\n/)){
      const data=frame.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim()).join('\n');
      if(data){const value=JSON.parse(data);if(value.id===id){response=value;break;}}
    }
  }else response=JSON.parse(raw);
  assert.equal(response?.id,id,'No matching JSON-RPC response');return response;
}
async function tool(name,args){
  const response=await rpc('tools/call',{name,arguments:args});
  const body=response.result;
  const text=body?.content?.find(x=>x.type==='text')?.text;
  let value;try{value=JSON.parse(text);}catch{value=text;}
  return {isError:Boolean(response.error||body?.isError),value};
}
async function check(name,run){
  try{await run();checks.push({name,status:'PASS'});console.log('PASS '+name);}
  catch(error){checks.push({name,status:'FAIL',reason:String(error?.message||error).slice(0,240)});console.log('FAIL '+name+': '+String(error?.message||error).slice(0,240));}
}
await check('real MCP initialization',async()=>{
  const r=await rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'soren-capability-wire-verifier',version:'1'}});assert.ok(r.result?.serverInfo);
});
await check('legacy eight tools first (plus exactly six V3 tools when flagged), new fields advertised only on route_task',async()=>{
  const r=await rpc('tools/list');const tools=r.result.tools;
  assert.deepEqual(tools.slice(0,TOOL_NAMES.length).map(t=>t.name),TOOL_NAMES);
  const extra=tools.slice(TOOL_NAMES.length).map(t=>t.name);assert.ok(extra.length===0||JSON.stringify(extra)===JSON.stringify(V3_TOOL_NAMES),extra.join(','));
  for(const t of tools.filter(t=>t.name!=='route_task'))assert.ok(!t.inputSchema?.properties?.include_capability_plan,t.name);
  const schema=tools.find(t=>t.name==='route_task').inputSchema;
  assert.equal(schema.properties.include_capability_plan.type,'boolean');assert.ok(schema.properties.capability_context);assert.ok(schema.properties.decision_engine);
});
await check('all curated skill resources listed',async()=>{
  const r=await rpc('resources/list');assert.equal(r.result.resources.filter(x=>x.uri.startsWith('skill://')).length,SKILLS.length);
});
let original;
await check('default route response has no capability plan',async()=>{
  const r=await tool('route_task',{task:'Build GSAP WebGL',discovery:'local'});assert.equal(r.isError,false);assert.ok(!Object.hasOwn(r.value,'capabilityPlan'));original=r.value;
});
await check('explicit false preserves the exact legacy response',async()=>{
  const r=await tool('route_task',{task:'Build GSAP WebGL',discovery:'local',include_capability_plan:false});assert.deepEqual(r.value,original);
});
await check('opt-in returns a schema-valid data workflow with missing runtime identified',async()=>{
  const r=await tool('route_task',{task:'Analyze a confidential CSV',discovery:'local',include_capability_plan:true,capability_context:{domain:'data',source_scope:'private'}});
  assert.equal(r.isError,false);const p=CapabilityPlanSchema.parse(r.value.capabilityPlan);assert.equal(p.status,'NEEDS_RUNTIME');assert.equal(p.primaryCapabilityId,'library.duckdb');assert.ok(p.steps.length);assert.equal(p.executionAuthorized,false);
});
await check('private scope overrides requested federation and optional model',async()=>{
  const r=await tool('route_task',{task:'Analyze private data with GSAP examples',discovery:'federated',decision_engine:'jev',include_capability_plan:true,capability_context:{domain:'data',source_scope:'private'}});
  assert.equal(r.isError,false);assert.equal(r.value.discoveryMode,'local');assert.equal(r.value.decisionEngine.status,'privacy_scope_preserved');assert.deepEqual(r.value.providerStatus,{});
});
await check('caller cannot assert verified connection or execution authority',async()=>{
  const r=await tool('route_task',{task:'Find public evidence',include_capability_plan:true,capability_context:{available_capabilities:['service.exa'],executionAuthorized:true}});assert.equal(r.isError,true);
});
await check('unknown capability IDs are rejected',async()=>{
  const r=await tool('route_task',{task:'Find public evidence',include_capability_plan:true,capability_context:{preferred_capability_ids:['invented.shell']}});assert.equal(r.isError,true);
});
await check('context requires an explicit opt-in',async()=>{
  const r=await tool('route_task',{task:'Analyze CSV',capability_context:{domain:'data'}});assert.equal(r.isError,true);
});
await check('bundled skill reading still works',async()=>{
  const r=await tool('read_skill',{name:'motion-systems'});assert.equal(r.isError,false);assert.match(r.value,/name: motion-systems/);
});
await check('four concurrent plans preserve distinct clients and request identities',async()=>{
  const clients=['factory','codex','antigravity','opencode'];
  const results=await Promise.all(clients.map(runtime=>tool('route_task',{task:'Analyze CSV',runtime,discovery:'local',include_capability_plan:true,capability_context:{domain:'data'}})));
  assert.deepEqual(results.map(r=>r.value.runtime),clients);assert.equal(new Set(results.map(r=>r.value.capabilityPlan.taskId)).size,4);assert.ok(results.every(r=>!r.isError&&!r.value.capabilityPlan.executionAuthorized));
});
await check('local mode does not invoke an explicitly requested paid advisor',async()=>{
  const r=await tool('route_task',{task:'Build GSAP WebGL',discovery:'local',decision_engine:'jev'});assert.equal(r.isError,false);assert.equal(r.value.decisionEngine.status,'local_only');
});
await check('no-match plans do not fabricate a connected capability',async()=>{
  const r=await tool('route_task',{task:'Compose a sonnet about autumn',include_capability_plan:true});assert.equal(r.isError,false);assert.equal(r.value.capabilityPlan.status,'UNSUPPORTED');assert.equal(r.value.capabilityPlan.primaryCapabilityId,null);
});
const report={scope:'actual_http_candidate_runtime_not_native_client_verification',endpoint,checks,passed:checks.filter(x=>x.status==='PASS').length,total:checks.length,paidInferenceTested:false,productionModified:false};
console.log(JSON.stringify(report,null,2));if(report.passed!==report.total)process.exitCode=1;
