#!/usr/bin/env node
/** Read-only side-by-side comparison of the eight legacy MCP tools on two endpoints (for example live production vs a candidate).
 * Usage: node scripts/compare-mcp-endpoints.mjs <baseline-endpoint> <candidate-endpoint> [report.json]
 * Optional: VERCEL_PROTECTION_BYPASS (sent only to the candidate host, never printed) for a protected preview.
 * Sends no credentials to the baseline. Calls each external-discovery tool at most once per endpoint.
 */
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {verificationEndpoint} from '../lib/contracts/endpoint.mjs';
import {TOOL_NAMES} from '../lib/client-contract.mjs';

const [baseRaw,candRaw,out]=process.argv.slice(2);
if(!baseRaw||!candRaw)throw new Error('Usage: node scripts/compare-mcp-endpoints.mjs <baseline-endpoint> <candidate-endpoint> [report.json]');
const endpoints={baseline:verificationEndpoint(baseRaw),candidate:verificationEndpoint(candRaw)};
const bypass=process.env.VERCEL_PROTECTION_BYPASS||'';
const sha=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex').slice(0,16);
let seq=0;
function headers(which,extra={}){
  const h={'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-06-18',...extra};
  if(which==='candidate'&&bypass)h['x-vercel-protection-bypass']=bypass;
  return h;
}
async function raw(which,body,extra={}){
  const started=performance.now();
  const r=await fetch(endpoints[which],{method:'POST',headers:headers(which,extra),body,signal:AbortSignal.timeout(25000)});
  let text=await r.text();const ev=text.split(/\r?\n/).filter(l=>l.startsWith('data:'));if(ev.length)text=ev.at(-1).slice(5).trim();
  let data;try{data=JSON.parse(text);}catch{data={raw:text.slice(0,200)};}
  return {status:r.status,data,ms:Math.round(performance.now()-started)};
}
const rpc=(which,method,params={})=>raw(which,JSON.stringify({jsonrpc:'2.0',id:++seq,method,params}));
async function tool(which,name,args){
  const r=await rpc(which,'tools/call',{name,arguments:args});
  const t=r.data?.result?.content?.find(x=>x.type==='text')?.text;let value;try{value=JSON.parse(t);}catch{value=t;}
  return {status:r.status,ms:r.ms,isError:Boolean(r.data?.error||r.data?.result?.isError),value};
}
const both=async fn=>{const [baseline,candidate]=await Promise.all([fn('baseline'),fn('candidate')]);return {baseline,candidate};};
const report={generatedAt:new Date().toISOString(),endpoints,protectedCandidate:Boolean(bypass),sections:{}};
const S=report.sections;

const init=await both(w=>rpc(w,'initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'soren-endpoint-compare',version:'1'}}));
S.initialize={baseline:{status:init.baseline.status,server:init.baseline.data?.result?.serverInfo},candidate:{status:init.candidate.status,server:init.candidate.data?.result?.serverInfo},
  instructionsSame:init.baseline.data?.result?.instructions===init.candidate.data?.result?.instructions};

const tl=await both(w=>rpc(w,'tools/list'));
const tb=tl.baseline.data?.result?.tools??[],tc=tl.candidate.data?.result?.tools??[];
S.tools={baselineNames:tb.map(t=>t.name),candidateNames:tc.map(t=>t.name),legacyOrderPreserved:JSON.stringify(tc.slice(0,8).map(t=>t.name))===JSON.stringify(TOOL_NAMES)&&JSON.stringify(tb.map(t=>t.name).filter(n=>TOOL_NAMES.includes(n)))===JSON.stringify(TOOL_NAMES),
  perTool:TOOL_NAMES.map(name=>{const a=tb.find(t=>t.name===name),b=tc.find(t=>t.name===name);
    const ap=Object.keys(a?.inputSchema?.properties??{}),bp=Object.keys(b?.inputSchema?.properties??{});
    return {name,annotationsSame:JSON.stringify(a?.annotations)===JSON.stringify(b?.annotations),schemaSame:JSON.stringify(a?.inputSchema)===JSON.stringify(b?.inputSchema),
      requiredSame:JSON.stringify(a?.inputSchema?.required??[])===JSON.stringify(b?.inputSchema?.required??[]),
      removedProperties:ap.filter(p=>!bp.includes(p)),addedProperties:bp.filter(p=>!ap.includes(p)),descriptionSame:a?.description===b?.description};})};

const rl=await both(w=>rpc(w,'resources/list'));
const ru=w=>(rl[w].data?.result?.resources??[]).map(r=>r.uri);
const rb=ru('baseline'),rc=ru('candidate');
S.resources={baselineCount:rb.length,candidateCount:rc.length,skillBaseline:rb.filter(u=>u.startsWith('skill://')).length,skillCandidate:rc.filter(u=>u.startsWith('skill://')).length,
  missingInCandidate:rb.filter(u=>!rc.includes(u)),addedInCandidate:rc.filter(u=>!rb.includes(u)&&u.startsWith('skill://')),v3ResourcesInCandidate:rc.filter(u=>!u.startsWith('skill://')).length};

const ls=await both(w=>tool(w,'list_skills',{}));
const names=w=>Array.isArray(ls[w].value)?ls[w].value.map(s=>s.name):[];
const common=names('baseline').filter(n=>names('candidate').includes(n));
const reads=[];
for(const name of common){const r=await both(w=>tool(w,'read_skill',{name}));reads.push({name,same:r.baseline.value===r.candidate.value,baselineSha:sha(r.baseline.value),candidateSha:sha(r.candidate.value)});}
S.list_skills={baseline:names('baseline').length,candidate:names('candidate').length,onlyBaseline:names('baseline').filter(n=>!common.includes(n)),onlyCandidate:names('candidate').filter(n=>!common.includes(n))};
S.read_skill={compared:reads.length,identical:reads.filter(r=>r.same).map(r=>r.name),changed:reads.filter(r=>!r.same)};

const ss=await both(w=>tool(w,'search_skills',{query:'keyboard WCAG',scope:'local'}));
S.search_skills_local={baseline:(ss.baseline.value??[]).map?.(s=>s.name),candidate:(ss.candidate.value??[]).map?.(s=>s.name)};

const tasks=['GSAP Three.js WebGL website','Audit WCAG keyboard focus','Connect an MCP server to Codex','React Three Fiber scene with drei and GLB','Deploy a Next.js app to Vercel','Optimize a glTF model with Draco','Playwright browser QA for a landing page','Build a shader material with TSL','Organize agent skills and routing','Explain what a for loop is'];
S.route_task_local=[];
for(const task of tasks){const r=await both(w=>tool(w,'route_task',{task,runtime:'compare',discovery:'local'}));
  const pick=v=>({primary:v?.primary?.name??null,top3:(v?.recommendations??[]).map(x=>x.name),keys:Object.keys(v??{}).sort()});
  const a=pick(r.baseline.value),b=pick(r.candidate.value);
  S.route_task_local.push({task,baseline:a,candidate:b,samePrimary:a.primary===b.primary,sameKeys:JSON.stringify(a.keys)===JSON.stringify(b.keys)});}

const fed=await both(w=>tool(w,'route_task',{task:'GSAP animation',runtime:'compare'}));
const fedView=v=>({isError:v.isError,discoveryMode:v.value?.discoveryMode,providerStatus:Object.fromEntries(Object.entries(v.value?.providerStatus??{}).map(([k,s])=>[k,{status:s?.status,reason:s?.reason??null,count:s?.count??null}])),candidates:(v.value?.discoveredCandidates??[]).length,ms:v.ms});
S.route_task_federated={baseline:fedView(fed.baseline),candidate:fedView(fed.candidate)};

const lp=await both(w=>tool(w,'list_providers',{}));
const lpv=v=>({providers:(v.value?.providers??[]).map(p=>`${p.id}:${p.configured}`),agentMcpIntegrations:(v.value?.agentMcpIntegrations??[]).map(i=>i.id??i.name)});
S.list_providers={baseline:lpv(lp.baseline),candidate:lpv(lp.candidate)};

const disc=await both(w=>tool(w,'discover_skills',{query:'GSAP animation',providers:['skillsmp'],limit:3}));
const dv=v=>({isError:v.isError,status:v.value?.providers?.skillsmp?.status??null,reason:v.value?.providers?.skillsmp?.reason??v.value?.warning??(typeof v.value==='string'?v.value:null),count:v.value?.count??null});
S.discover_skills={baseline:dv(disc.baseline),candidate:dv(disc.candidate)};
const reg=await both(w=>tool(w,'search_mcp_servers',{query:'mcp',limit:2}));
S.search_mcp_servers={baseline:{isError:reg.baseline.isError,count:reg.baseline.value?.count??null,detail:typeof reg.baseline.value==='string'?reg.baseline.value:null},candidate:{isError:reg.candidate.isError,count:reg.candidate.value?.count??null,detail:typeof reg.candidate.value==='string'?reg.candidate.value:null}};
const ins=await both(w=>tool(w,'inspect_candidate',{provider:'skills_sh',id:'../.env'}));
S.inspect_candidate_traversal={baseline:ins.baseline.isError,candidate:ins.candidate.isError};
const trav=await both(w=>tool(w,'read_skill',{name:'../../.env'}));
S.read_skill_traversal={baseline:trav.baseline.isError,candidate:trav.candidate.isError};

const body=JSON.stringify({jsonrpc:'2.0',id:9001,method:'tools/call',params:{name:'list_skills',arguments:{}}});
const statusOf=async(w,extra,b=body)=>(await raw(w,b,extra)).status;
S.boundaries={
  malformedAuthorization:await both(w=>statusOf(w,{Authorization:'Basic invalid'})),
  wellFormedBearerWithoutStore:await both(w=>statusOf(w,{Authorization:'Bearer compare.fixture.token'})),
  crossOrigin:await both(w=>statusOf(w,{Origin:'https://untrusted.invalid'})),
  oversizedBody:await both(w=>statusOf(w,{},JSON.stringify({jsonrpc:'2.0',id:9002,method:'tools/call',params:{name:'route_task',arguments:{task:'x'.repeat(17000)}}}))),
};

const json=JSON.stringify(report,null,2)+'\n';
if(out)fs.writeFileSync(out,json);
console.log(json);
