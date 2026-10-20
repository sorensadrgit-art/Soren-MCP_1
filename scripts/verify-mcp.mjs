import assert from "node:assert/strict";
import {ENDPOINT,TOOL_NAMES,MCP_SERVER_NAME} from "../lib/client-contract.mjs";
import {verificationEndpoint} from '../lib/contracts/endpoint.mjs';

const endpoint=verificationEndpoint((process.argv[2]||ENDPOINT).trim());
const checks=[]; let requests=0;
function check(label,success,detail="",optional=false){
  checks.push({label,success,optional});
  console.log((success?"PASS":optional?"WARN":"FAIL")+" "+label+(detail?" | "+detail:""));
}
async function rpc(method,params={},modern=false){
  requests++;
  const headers={"Content-Type":"application/json","Accept":"application/json, text/event-stream",
    "MCP-Protocol-Version":modern?"2026-07-28":"2025-06-18"};
  if(modern){
    headers["Mcp-Method"]=method;
    if(method==="tools/call")headers["Mcp-Name"]=params.name;
    params={...params,_meta:{
      "io.modelcontextprotocol/protocolVersion":"2026-07-28",
      "io.modelcontextprotocol/clientInfo":{name:"universal-router-verifier",version:"1.0"},
      "io.modelcontextprotocol/clientCapabilities":{},
    }};
  }
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),23000);
  const start=performance.now();
  try{
    const response=await fetch(endpoint,{method:"POST",headers,
      body:JSON.stringify({jsonrpc:"2.0",id:requests,method,params}),signal:controller.signal});
    let body=await response.text();
    const messages=body.split(/\r?\n/).filter(x=>x.startsWith("data:"));
    if(messages.length)body=messages.at(-1).slice(5).trim();
    let data;
    try{data=JSON.parse(body)}catch{data={error:{message:"Invalid JSON"}}}
    return {status:response.status,data,ms:Math.round(performance.now()-start)};
  }finally{clearTimeout(timeout);}
}
function good(r){return r.status===200&&!r.data?.error;}
async function tool(name,args={}){
  const r=await rpc("tools/call",{name,arguments:args});
  const raw=r.data?.result?.content?.find(x=>x.type==="text")?.text;
  let value;
  try{value=JSON.parse(raw)}catch{value=raw}
  return {...r,value,isError:!!r.data?.result?.isError||!!r.data?.error};
}
async function guarded(label,run,optional=false){
  try{const value=await run();check(label,!!value,typeof value==="string"?value:"",optional);}
  catch(e){check(label,false,String(e?.message||e).slice(0,135),optional);}
}
await guarded("Responsive web dashboard and connection navigator",async()=>{
  const r=await fetch(new URL(endpoint).origin,{signal:AbortSignal.timeout(12000)});
  const html=await r.text();
  return r.status===200&&html.includes("Connect without conflicts.")&&['Factory Droid','Codex Desktop','Antigravity','OpenCode','Claude Code','Qwen Code'].every(name=>html.includes(name));
});
await guarded("Legacy 2025 handshake and branded server identity",async()=>{
  const r=await rpc("initialize",{protocolVersion:"2025-06-18",capabilities:{},clientInfo:{name:"legacy-audit",version:"1"}});
  return good(r)&&r.data.result?.serverInfo?.name===MCP_SERVER_NAME&&
    /advisory/i.test(r.data.result?.instructions||"");
});
await guarded("Native 2026-07 discovery",async()=>{
  const r=await rpc("server/discover",{},true);
  return good(r)&&r.data.result?.supportedVersions?.includes("2026-07-28");
});
await guarded("Eight distinct tool schemas and safety annotations",async()=>{
  const r=await rpc("tools/list",{},true), tools=r.data?.result?.tools||[];
  return good(r)&&JSON.stringify(tools.map(x=>x.name))===JSON.stringify(TOOL_NAMES)&&
    tools.every(x=>x.inputSchema?.type==="object"&&x.annotations?.readOnlyHint===true&&
      x.annotations?.destructiveHint===false&&typeof x.annotations?.openWorldHint==="boolean");
});
await guarded("All four SKILL.md resources listed and readable",async()=>{
  const r=await rpc("resources/list");
  if(!good(r)||r.data.result?.resources?.length!==4)return false;
  const read=await rpc("resources/read",{uri:"skill://motion-systems/SKILL.md"});
  return good(read)&&read.data?.result?.contents?.[0]?.text?.includes("name: motion-systems");
});
for(const [name,args,checkValue] of [
 ["list_skills",{},v=>Array.isArray(v)&&v.length===4],
 ["search_skills",{query:"keyboard WCAG",scope:"local"},v=>Array.isArray(v)&&v[0]?.name==="accessibility"],
 ["read_skill",{name:"motion-systems"},v=>typeof v==="string"&&v.includes("name: motion-systems")],
 ["list_providers",{},v=>v?.providers?.length===4],
 ["route_task",{task:"GSAP Three.js WebGL website",runtime:"codex",discovery:"local"},v=>v?.primary?.name==="motion-systems"&&v?.discoveryMode==="local"],
 ]){
  await guarded("Tool "+name,async()=>{
    const r=await tool(name,args);
    return good(r)&&!r.isError&&checkValue(r.value);
  });
}
await guarded("Federated routing returns review-only candidates",async()=>{
  const r=await tool("route_task",{task:"GSAP WebGL React Three.js",runtime:"codex"});
  return good(r)&&!r.isError&&r.value?.primary?.name==="motion-systems"&&
    (r.value?.discoveredCandidates||[]).every(x=>x.activationAllowed===false);
});
await guarded("SkillsMP external discovery",async()=>{
  const r=await tool("discover_skills",{query:"GSAP animation",providers:["skillsmp"],limit:3});
  return good(r)&&!r.isError&&r.value?.providers?.skillsmp?.status==="ok";
},true);
await guarded("Skills.sh authenticated discovery and inspection",async()=>{
  const r=await tool("discover_skills",{query:"GSAP animation",providers:["skills_sh"],limit:3});
  if(!good(r)||r.value?.providers?.skills_sh?.status!=="ok")return false;
  const id=r.value?.results?.[0]?.id;
  if(!id)return false;
  const inspect=await tool("inspect_candidate",{provider:"skills_sh",id});
  return good(inspect)&&!inspect.isError&&inspect.value?.reviewStatus==="requires_review"&&inspect.value.instructions===null;
},true);
await guarded("Official MCP registry discovery",async()=>{
  const r=await tool("search_mcp_servers",{query:"mcp",limit:2});
  return good(r)&&!r.isError&&r.value?.count>=1;
},true);
await guarded("Reject non-curated SKILL.md path traversal",async()=>{
  const r=await tool("read_skill",{name:"../../.env"});return r.isError;
});
await guarded("Reject invalid external candidate path",async()=>{
  const r=await tool("inspect_candidate",{provider:"skills_sh",id:"../.env"});return r.isError;
});
await guarded("Reject malformed route arguments",async()=>{
  const r=await rpc("tools/call",{name:"route_task",arguments:{task:""}});
  return !!(r.data.result?.isError||r.data.error);
});
await guarded("Four simultaneous agent requests do not cross-contaminate",async()=>{
  const agents=["droid","codex","antigravity","opencode"];
  const data=await Promise.all(agents.map(runtime=>tool("route_task",{task:"GSAP WebGL website",runtime,discovery:"local"})));
  return data.every((r,i)=>good(r)&&r.value?.runtime===agents[i]&&
    r.value?.primary?.name==="motion-systems"&&
    (r.value?.discoveredCandidates||[]).length===0);
});
await guarded("Cross-origin browser request rejected",async()=>{
  const r=await fetch(endpoint,{method:"POST",headers:{"Origin":"https://untrusted.invalid",
    "Content-Type":"application/json"},body:"{}",signal:AbortSignal.timeout(8000)});
  return r.status===403;
});
await guarded('Reject supplied malformed identity even for a bundled public read',async()=>{
  const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Basic invalid',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:900,method:'tools/call',params:{name:'list_skills',arguments:{}}}),signal:AbortSignal.timeout(8000)});
  return r.status===401;
});
await guarded('Reject oversized streaming request body',async()=>{
  const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:901,method:'tools/call',params:{name:'route_task',arguments:{task:'x'.repeat(17000)}}}),signal:AbortSignal.timeout(8000)});
  return r.status===413;
});
const failing=checks.filter(x=>!x.success&&!x.optional);
const warnings=checks.filter(x=>!x.success&&x.optional);
console.log(JSON.stringify({endpoint,requests,checks:checks.length,passed:checks.filter(x=>x.success).length,
  failed:failing.map(x=>x.label),warnings:warnings.map(x=>x.label)},null,2));
if(failing.length)process.exitCode=1;
