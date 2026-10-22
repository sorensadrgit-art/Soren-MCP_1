#!/usr/bin/env node
/** Real MCP SDK client against one deployed endpoint (for example a protected Vercel preview). Read-only; evidence only.
 * Usage: node scripts/probe-preview-sdk.mjs <https MCP endpoint> [report.json]
 * Optional: VERCEL_PROTECTION_BYPASS (sent only to *.vercel.app over HTTPS, never printed).
 */
import fs from 'node:fs';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {verificationEndpoint,protectionBypassHeaders} from '../lib/contracts/endpoint.mjs';
import {TOOL_NAMES,V3_TOOL_NAMES} from '../lib/client-contract.mjs';

const [raw,out]=process.argv.slice(2);
if(!raw)throw new Error('Usage: node scripts/probe-preview-sdk.mjs <https MCP endpoint> [report.json]');
const endpoint=verificationEndpoint(raw);
const headers=protectionBypassHeaders(endpoint);
const client=new Client({name:'soren-v3-preview-sdk-probe',version:'1.0.0'});
await client.connect(new StreamableHTTPClientTransport(new URL(endpoint),{requestInit:{headers}}));
const pct=(v,p)=>{const s=[...v].sort((a,b)=>a-b);return Math.round(s[Math.ceil(s.length*p)-1]*10)/10;};
async function timed(fn,n=10){const d=[];let last;for(let i=0;i<n;i++){const t=performance.now();last=await fn();d.push(performance.now()-t);}return {samples:n,p50Ms:pct(d,.5),p95Ms:pct(d,.95),last};}
const text=res=>JSON.parse(res.content.find(x=>x.type==='text').text);
const checks=[];const check=(label,ok,detail)=>{checks.push({label,ok:Boolean(ok),...(detail===undefined?{}:{detail})});};

const server=client.getServerVersion();
check('server identity',server?.name==='soren-universal-skill-router',server);
const toolNames=(await client.listTools()).tools.map(t=>t.name);
check('14 tools: 8 legacy in order then 6 V3',JSON.stringify(toolNames)===JSON.stringify([...TOOL_NAMES,...V3_TOOL_NAMES]),toolNames);
const resources=(await client.listResources()).resources.map(r=>r.uri);
const counts={total:resources.length,skill:resources.filter(u=>u.startsWith('skill://')).length,knowledge:resources.filter(u=>u.startsWith('soren://knowledge/')).length,recipe:resources.filter(u=>u.startsWith('soren://recipe/')).length};
check('resources: 22 skills, 44 knowledge, 8 recipes',counts.skill===22&&counts.knowledge===44&&counts.recipe===8,counts);

const latency={
  route_task:await timed(async()=>text(await client.callTool({name:'route_task',arguments:{task:'GSAP Three.js WebGL website',runtime:'codex',discovery:'local'}})).primary.name),
  plan_toolchain:await timed(async()=>{const v=text(await client.callTool({name:'plan_toolchain',arguments:{task:'Create an ultra-realistic interactive 3D portfolio',runtime:'codex',project_packages:{react:'19.3.1','@react-three/fiber':'9.8.2'}}}));return {profile:v.profile.id,steps:v.executionPlan.length,verified:v.availableVerifiedConnections.length};}),
  search_knowledge:await timed(async()=>{const v=text(await client.callTool({name:'search_knowledge',arguments:{query:'react three fiber canvas performance',packages:{'@react-three/fiber':'9.8.2'}}}));return {primary:v.primary.id,results:v.results.length};}),
  read_recipe:await timed(async()=>text(await client.callTool({name:'read_recipe',arguments:{id:'cinematic-portfolio'}})).steps.length),
  resource_read:await timed(async()=>JSON.parse((await client.readResource({uri:'soren://knowledge/r3f-v9'})).contents[0].text).id),
};
check('route_task primary motion-systems',latency.route_task.last==='motion-systems');
check('plan_toolchain immersive-web, 9 steps, nothing verified',latency.plan_toolchain.last.profile==='immersive-web'&&latency.plan_toolchain.last.steps===9&&latency.plan_toolchain.last.verified===0,latency.plan_toolchain.last);
check('search_knowledge returns a primary',Boolean(latency.search_knowledge.last.primary),latency.search_knowledge.last);
check('read_recipe cinematic-portfolio has 9 steps',latency.read_recipe.last===9);
check('knowledge resource readable',latency.resource_read.last==='r3f-v9');

const unknownRuntime=text(await client.callTool({name:'plan_toolchain',arguments:{task:'Export a photoreal hero model from Blender to GLB for React Three Fiber',runtime:'cursor'}}));
check('unknown runtime gets a guide template, CLI listed as tool',unknownRuntime.missingConnectionSteps.every(s=>s.guideArgs===null&&s.guideArgsTemplate)&&unknownRuntime.suggestedTools.some(t=>t.id==='gltf-transform-cli')&&!unknownRuntime.suggestedMcpServers.some(t=>t.id==='gltf-transform-cli'));
const guide=text(await client.callTool({name:'get_client_setup_guide',arguments:{client:'codex',integration:'context7'}}));
check('setup guide is dry-run only',guide.dryRunOnly===true&&guide.executedBySoren===false);
const plan=text(await client.callTool({name:'route_task',arguments:{task:'Inspect the repository, fix the failing test and push to GitHub',runtime:'codex',discovery:'local',include_capability_plan:true,capability_context:{domain:'development',source_scope:'public'}}}));
check('capability plan gates mixed read/write request',plan.capabilityPlan?.operation==='edit'&&plan.capabilityPlan?.status==='NEEDS_APPROVAL'&&plan.capabilityPlan?.executionAuthorized===false,{operation:plan.capabilityPlan?.operation,status:plan.capabilityPlan?.status});
const trav=await client.callTool({name:'read_recipe',arguments:{id:'../../.env'}}).then(x=>Boolean(x.isError),()=>true);
check('recipe traversal rejected',trav);
const travSkill=await client.callTool({name:'read_skill',arguments:{name:'../../.env'}}).then(x=>Boolean(x.isError),()=>true);
check('skill traversal rejected',travSkill);
await client.close();

const report={observedAt:new Date().toISOString(),endpoint,protectedTarget:Object.keys(headers).length>0,client:'@modelcontextprotocol/client',server,toolNames,resourceCounts:counts,
  latency:Object.fromEntries(Object.entries(latency).map(([k,v])=>[k,{samples:v.samples,p50Ms:v.p50Ms,p95Ms:v.p95Ms}])),checks,
  note:'Latency is measured from the operator workstation to Vercel iad1 and includes network round trips.'};
if(out)fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:checks.filter(c=>c.ok).length,failed:checks.filter(c=>!c.ok).map(c=>c.label)}));
if(checks.some(c=>!c.ok))process.exitCode=1;
