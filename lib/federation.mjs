/**
 * Soren Universal Skill Router, v2.
 * No upstream skill is automatically installed, executed or treated as trusted instructions.
 * Fixed HTTPS provider endpoints, bounded searches, inspected previews, explainable ranking.
 */
import { routeTask as localRoute } from "./catalog.mjs";

export const PROVIDER_INFO = Object.freeze({
  skillsmp: {name:"SkillsMP",kind:"mcp",auth:"none",endpoint:"https://skillsmp.com/mcp"},
  skills_sh:{name:"Skills.sh",kind:"rest",auth:"vercel_oidc",endpoint:"https://skills.sh/api/v1/skills/search"},
  anthropic:{name:"Anthropic Skills",kind:"github",auth:"none",endpoint:"https://api.github.com/repos/anthropics/skills/contents/skills"},
  mcp_registry:{name:"Official MCP Registry",kind:"registry",auth:"none",endpoint:"https://registry.modelcontextprotocol.io/v0.1/servers"},
});
const SOURCES=["skillsmp","skills_sh","anthropic"];
const VENDORS=new Set(["anthropics","vercel-labs","openai","microsoft","supabase","google","cloudflare","getsentry","expo"]);
const TOPICS=["gsap","webgl","three.js","threejs","react three fiber","r3f","framer motion","scrolltrigger","animation","motion","shader","blender","webgpu","next.js","nextjs","react","typescript","javascript","python","node.js","tailwind","accessibility","wcag","aria","figma","ui","ux","design","testing","playwright","vitest","cypress","debugging","performance","web","frontend","backend","api","oauth","mcp","skill","security","database","postgres","supabase","sql","docker","kubernetes","aws","vercel","github","deployment","devops","ci","video","image","agentic","machine learning","deep learning","llm","rag","voice","prompt","research","clinical","biomechanics","rtmpose","physiotherapy"];
const STOP=new Set(["the","and","you","your","that","this","with","from","for","are","was","will","want","need","into","have","please","create","make","build","get","fix","use","using","our","agent","agents","their","task","these","those","there","when","where","which","would","could","should","can","how","what","then","also","some","very","project","work","help"]);
const memo=new Map();
const clamp=(v,low,high,defaultValue)=>Number.isFinite(v)?Math.max(low,Math.min(high,Math.trunc(v))):defaultValue;
const clean=(v,n=500)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,n);
const slug=v=>clean(v,140).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const terms=value=>[...new Set(clean(value,1500).toLowerCase().split(/[^a-z0-9]+/g).filter(w=>w.length>2&&!STOP.has(w)).map(w=>w.length>4&&w.endsWith("s")?w.slice(0,-1):w))];
export function publicQuery(raw) {
  const text=clean(raw,1200).replace(/https?:\/\/\S+/gi," ").replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi," ").replace(/\b[A-Za-z]:[\\/][^\s]+/g," ").replace(/\/(?:home|Users|private|etc|mnt|root|var)\/[^\s]+/gi," ").replace(/\b(?:api[_-]?key|password|secret|token|bearer|authorization)\s*[:=]\s*[^\s]+/gi," ").replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g," ").toLowerCase();
  const matches=TOPICS.filter(topic=>{
    const quoted=topic.replaceAll(".","\\.").replaceAll("+","\\+");
    return new RegExp("(^|[^a-z0-9])"+quoted+"s?($|[^a-z0-9])").test(text);
  });
  const good=matches.filter(x=>!["web","ui","ci"].includes(x));
  return [...new Set(good.length?good:matches)].slice(0,5).join(" ").slice(0,100);
}
function safeId(s){return typeof s==="string"&&s.length>0&&s.length<=230&&/^[\w./-]+$/.test(s)&&!s.split("/").some(x=>!x||x==="."||x==="..");}
function safeUrl(s){
  try{
    const u=new URL(s);
    return u.protocol==="https:"&&["github.com","skillsmp.com","skills.sh"].includes(u.hostname)&&!u.port&&!u.username&&!u.password?u.toString():null;
  } catch{return null;}
}
function githubSource(s){
  const url=safeUrl(s);
  if(!url||new URL(url).hostname!=="github.com")return "";
  const paths=new URL(url).pathname.split("/").filter(Boolean);
  return paths.length>=2?(paths[0]+"/"+paths[1]).toLowerCase():"";
}
function candidate(provider,record) {
  const name=clean(record.name||record.slug||"unknown",100);
  const id=clean(record.id||record.slug||name,230);
  if(!name||!safeId(id))return null;
  const source=clean(record.source||githubSource(record.githubUrl)||record.author||"",125).toLowerCase();
  const publisher=source.split("/")[0]||clean(record.author||"unknown",80);
  return {id,key:provider+":"+id,provider,providers:[provider],name,source,publisher,
    description:clean(record.description||"",560),
    url:safeUrl(record.url)||safeUrl(record.skillUrl)||safeUrl(record.githubUrl)||null,
    popularity:clamp(Number(record.installs??record.stars??0),0,1e9,0),
    trust:provider==="anthropic"?"first_party_source":VENDORS.has(publisher)?"known_owner_name":"community",
    reviewStatus:"requires_review",activationAllowed:false};
}
export function rankCandidates(rows,query,limit=15){
  const dedup=new Map();
  for(const r of rows){
    if(!r||!r.name||!r.id)continue;
    const key=r.source?clean(r.source).toLowerCase()+":"+slug(r.name):r.key||r.provider+":"+r.id;
    if(!dedup.has(key))dedup.set(key,{...r,providers:[...(r.providers||[r.provider])],aliases:[{provider:r.provider,id:r.id}]});
    else{
      const old=dedup.get(key);old.providers=[...new Set([...old.providers,r.provider])];old.aliases.push({provider:r.provider,id:r.id});
      if((r.description||"").length>(old.description||"").length)old.description=r.description;
      old.popularity=Math.max(old.popularity||0,r.popularity||0);
      if(r.trust==="first_party_source")old.trust=r.trust;
    }
  }
  const corpus=[...dedup.values()];
  const queryTerms=new Set(terms(query));
  const df=new Map();
  for(const r of corpus)for(const word of new Set(terms(r.name+" "+r.description)))df.set(word,(df.get(word)||0)+1);
  const weight=t=>Math.max(1,1+Math.log((corpus.length+1)/(1+(df.get(t)||0))));
  const taskWeight=[...queryTerms].reduce((sum,t)=>sum+3*weight(t),0)||1;
  for(const r of corpus){
    const title=new Set(terms(r.name)),body=new Set(terms(r.description));
    const names=[...queryTerms].filter(t=>title.has(t));
    const details=[...queryTerms].filter(t=>body.has(t));
    const lexical=(names.reduce((n,t)=>n+3*weight(t),0)+details.reduce((n,t)=>n+weight(t),0))/taskWeight;
    const exact=clean(query).toLowerCase().includes(r.name.toLowerCase())?.2:0;
    const trust=r.trust==="first_party_source"?.15:r.trust==="known_owner_name"?.03:0;
    const popularity=Math.min(.1,Math.log10(1+(r.popularity||0))/50);
    r.score=Math.round(1000*(Math.min(1,lexical)*.7+exact+trust+popularity))/1000;
    r.reasons=[...names.slice(0,3).map(x=>"Name: "+x),...details.filter(x=>!names.includes(x)).slice(0,3).map(x=>"Description: "+x),...(trust?["Publisher signal, not approval"]:[])];
    r._relevant=names.length>0||details.length>0||!!exact;
  }
  return corpus.filter(r=>r._relevant).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name))
    .slice(0,clamp(limit,1,25,15)).map(({_relevant,...rest})=>rest);
}
async function safeJson(url,{fetcher=globalThis.fetch,headers={},method="GET",body,timeoutMs=4200,maxBytes=650000}={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.min(8000,Math.max(900,timeoutMs)));
  try{
    const r=await fetcher(url,{method,headers,body,signal:controller.signal,cache:"no-store",redirect:"error"});
    if(!r.ok)throw Error(r.status===429?"RATE_LIMITED":r.status===401?"AUTH_REQUIRED":r.status===404?"NOT_FOUND":"UPSTREAM_HTTP_"+r.status);
    if(Number(r.headers.get("content-length")||0)>maxBytes)throw Error("RESPONSE_TOO_LARGE");
    if(!r.body?.getReader){const value=await r.text();if(Buffer.byteLength(value)>maxBytes)throw Error("RESPONSE_TOO_LARGE");return JSON.parse(value);}
    const reader=r.body.getReader(),chunks=[];let length=0;
    while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>maxBytes){await reader.cancel();throw Error("RESPONSE_TOO_LARGE");}chunks.push(value);}
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally{clearTimeout(timer);}
}
async function safeText(url,{fetcher=globalThis.fetch,timeoutMs=4200}={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.min(8000,Math.max(900,timeoutMs)));
  try{
    const r=await fetcher(url,{headers:{Accept:"text/plain"},signal:controller.signal,redirect:"error",cache:"no-store"});
    if(!r.ok)throw Error("UPSTREAM_HTTP_"+r.status);
    if(Number(r.headers.get("content-length")||0)>60000)throw Error("RESPONSE_TOO_LARGE");
    const text=await r.text();if(Buffer.byteLength(text)>60000)throw Error("RESPONSE_TOO_LARGE");
    return text;
  }finally{clearTimeout(timer);}
}
async function mcpCall(name,args,options){
  const answer=await safeJson(PROVIDER_INFO.skillsmp.endpoint,{
    ...options,method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json, text/event-stream","MCP-Protocol-Version":"2025-06-18"},
    body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name,arguments:args}})});
  if(answer.error||answer.result?.isError)throw Error("MCP_UPSTREAM_ERROR");
  const text=answer.result?.content?.find(x=>x.type==="text")?.text;
  if(!text)throw Error("MCP_EMPTY_RESULT");
  return JSON.parse(text);
}
async function skillsmp(query,options,n){
  const out=await mcpCall("search_skills",{query,limit:clamp(n,1,12,8)},options);
  return (Array.isArray(out.skills)?out.skills:[]).map(x=>candidate("skillsmp",x)).filter(Boolean);
}
async function skillssh(query,options,n){
  if(!options.oidcToken)throw Error("NOT_CONFIGURED");
  const url=new URL(PROVIDER_INFO.skills_sh.endpoint);url.searchParams.set("q",query);url.searchParams.set("limit",String(clamp(n,1,12,8)));
  const out=await safeJson(url.toString(),{...options,headers:{Authorization:"Bearer "+options.oidcToken,Accept:"application/json"}});
  return (Array.isArray(out.data)?out.data:[]).map(x=>candidate("skills_sh",x)).filter(Boolean);
}
async function anthropic(query,options,n){
  const out=await safeJson(PROVIDER_INFO.anthropic.endpoint,{...options,maxBytes:220000,headers:{Accept:"application/vnd.github+json","User-Agent":"soren-router"}});
  return (Array.isArray(out)?out:[]).filter(x=>x.type==="dir"&&/^[a-z0-9][a-z0-9._-]{0,90}$/i.test(x.name))
    .map(x=>candidate("anthropic",{id:x.name,name:x.name.replace(/-/g," "),description:"Anthropic skill "+x.name.replace(/-/g," "),source:"anthropics/skills",url:"https://github.com/anthropics/skills/tree/main/skills/"+x.name}))
    .filter(Boolean).filter(x=>terms(x.name).some(t=>terms(query).includes(t))).slice(0,clamp(n,1,12,8));
}
const adapters={skillsmp,skills_sh:skillssh,anthropic};

export async function discoverSkills(query,{providers=SOURCES,limit=12,fetcher=globalThis.fetch,
  oidcToken=process.env.VERCEL_OIDC_TOKEN||"",timeoutMs=4200}={}){
  const q=publicQuery(query),selected=[...new Set((Array.isArray(providers)?providers:SOURCES).filter(x=>SOURCES.includes(x)))];
  const statuses={};
  if(!q)return {query:"",results:[],count:0,providers:statuses,warning:"No safe public technology keywords found; no private task text was transmitted."};
  const key=JSON.stringify([q,selected,clamp(limit,1,25,12),!!oidcToken]);
  if(fetcher===globalThis.fetch){
    const cached=memo.get(key);
    if(cached&&Date.now()-cached.time<600000)return {...cached.value,cacheHit:true};
  }
  const results=await Promise.all(selected.map(async provider=>{
    if(provider==="skills_sh"&&!oidcToken){statuses[provider]={status:"not_configured",count:0,reason:"Vercel OIDC unavailable"};return [];}
    try{const res=await adapters[provider](q,{fetcher,oidcToken,timeoutMs},8);statuses[provider]={status:"ok",count:res.length};return res;}
    catch(error){const reason=clean(error?.message||error,100);statuses[provider]={status:reason.startsWith("RATE_LIMITED")?"rate_limited":reason==="NOT_CONFIGURED"?"not_configured":"unavailable",count:0,reason};return [];}
  }));
  const merged=rankCandidates(results.flat(),q,clamp(limit,1,25,12));
  const value={query:q,results:merged,count:merged.length,providers:statuses,policy:"Read-only discovery; external instructions require manual review and explicit curation."};
  if(fetcher===globalThis.fetch){
    if(memo.size>80)memo.delete(memo.keys().next().value);
    memo.set(key,{time:Date.now(),value});
  }
  return value;
}
export async function routeTaskFederated(task,runtime="generic",{discovery="federated",providers=SOURCES,
  fetcher=globalThis.fetch,oidcToken=process.env.VERCEL_OIDC_TOKEN||"",timeoutMs=4200}={}){
  const base=localRoute(clean(task,500),clean(runtime,60));
  if(discovery==="local")return {...base,discoveryMode:"local",discoveredCandidates:[],providerStatus:{},nextAction:null};
  const found=await discoverSkills(task,{providers,limit:10,fetcher,oidcToken,timeoutMs});
  return {...base,discoveryMode:"federated",publicSearchQuery:found.query,providerStatus:found.providers,
    discoveredCandidates:found.results.slice(0,8),
    nextAction:found.count?"Inspect external candidates before review and adoption.":found.warning||"No relevant external candidates.",
    safetyPolicy:"Only curated local skills are directly activatable. External findings are never automatically installed or executed."};
}
export function scanSkillText(text){
  const sample=String(text??"").slice(0,80000);
  const tests=[
    ["instruction_override","critical",/ignore (?:all |your |the )?(?:previous|prior|system|developer) instructions|disregard (?:the |all )?instructions|you are now (?:an?|the)/i],
    ["secret_access","high",/(?:read|open|steal|copy|upload|exfiltrat|print|retrieve).{0,70}(?:\.env|ssh\/|id_rsa|private key|api[_-]?key|credentials|browser cookies)/i],
    ["remote_shell","high",/curl\b.{0,120}\|\s*(?:sh|bash)|wget\b.{0,120}\|\s*(?:sh|bash)|invoke-expression\s*\(/i],
    ["encoded_payload","medium",/frombase64string|base64\s+-d|eval\s*\(\s*atob/i],
    ["permissions","medium",/chmod\s+777|Set-MpPreference\s+-Disable|DisableRealtimeMonitoring/i],
  ];
  const findings=tests.filter(([, ,pattern])=>pattern.test(sample)).map(([code,severity])=>({code,severity}));
  return {safeForAutomaticActivation:false,requiresReview:true,findings,
    needsExtraReview:findings.some(x=>x.severity==="critical"||x.severity==="high"),
    contentBytes:Buffer.byteLength(sample,"utf8")};
}
function auditSummary(input){
  const rows=(Array.isArray(input)?input:[]).map(x=>({provider:clean(x.provider,90),status:clean(x.status,20),
    riskLevel:clean(x.riskLevel||"UNKNOWN",20),summary:clean(x.summary,160)}));
  return {verdict:rows.length && rows.every(x=>x.status==="pass"&&!["HIGH","CRITICAL"].includes(x.riskLevel))?"pass":
    rows.some(x=>x.status==="fail"||["HIGH","CRITICAL"].includes(x.riskLevel))?"fail":rows.length?"warn":"unknown",audits:rows};
}
export async function inspectCandidate(provider,id,{fetcher=globalThis.fetch,
  oidcToken=process.env.VERCEL_OIDC_TOKEN||"",timeoutMs=4200}={}){
  if(!SOURCES.includes(provider))throw Error("Invalid provider");
  if(!safeId(id))throw Error("Invalid external skill ID");
  const options={fetcher,oidcToken,timeoutMs};
  if(provider==="skillsmp"){
    const data=await mcpCall("get_skill",{id},options);
    const skill=candidate("skillsmp",data.skill||data);
    return {provider,id,skill,reviewStatus:"requires_review",audit:{verdict:"unknown",audits:[]},
      scan:null,preview:null,instructions:null,note:"SkillsMP returned metadata only; review its upstream source before adoption."};
  }
  let text="",skill,audit={verdict:"unknown",audits:[]},files=[];
  if(provider==="skills_sh"){
    if(!oidcToken)throw Error("Skills.sh OIDC is not configured");
    const base="https://skills.sh/api/v1/skills/",part=id.split("/").map(encodeURIComponent).join("/");
    const headers={Authorization:"Bearer "+oidcToken,Accept:"application/json"};
    const detail=await safeJson(base+part,{...options,headers});
    skill=candidate("skills_sh",{id,name:detail.slug||id.split("/").at(-1),
      source:detail.source||id.split("/").slice(0,-1).join("/"),installs:detail.installs,
      url:"https://skills.sh/"+id});
    const body=Array.isArray(detail.files)?detail.files:[];
    files=body.filter(x=>typeof x.path==="string").slice(0,35).map(x=>({path:clean(x.path,170),bytes:typeof x.contents==="string"?x.contents.length:0}));
    text=body.find(x=>x.path==="SKILL.md"||x.path?.endsWith("/SKILL.md"))?.contents||"";
    try{const a=await safeJson(base+"audit/"+part,{...options,headers});audit=auditSummary(a.audits);}
    catch(error){audit={verdict:error?.message==="NOT_FOUND"?"unknown":"unavailable",audits:[]};}
  } else{
    if(!/^[a-z0-9][a-z0-9._-]{0,90}$/i.test(id))throw Error("Invalid Anthropic skill ID");
    text=await safeText("https://raw.githubusercontent.com/anthropics/skills/main/skills/"+encodeURIComponent(id)+"/SKILL.md",options);
    skill=candidate("anthropic",{id,name:id,description:"Anthropic maintained skill",source:"anthropics/skills",
      url:"https://github.com/anthropics/skills/tree/main/skills/"+id});
    files=[{path:"SKILL.md",bytes:text.length}];
  }
  if(!skill)throw Error("Could not normalize upstream skill");
  const scan=text?scanSkillText(text):null;
  const preview=text&&!scan?.needsExtraReview&&audit.verdict!=="fail"?text.slice(0,1200):null;
  return {provider,id,skill,reviewStatus:"requires_review",audit,scan,files,preview,instructions:null,
    note:"Untrusted preview, not approval. Review provenance, license, content and audit before curating."};
}
export async function searchMcpServers(query,{fetcher=globalThis.fetch,limit=8,timeoutMs=4200}={}){
  const q=publicQuery(query);
  if(!q)return {query:"",results:[],count:0,note:"No safe public technology keywords"};
  const u=new URL(PROVIDER_INFO.mcp_registry.endpoint);
  u.searchParams.set("search",q.split(" ").slice(0,3).join(" "));
  u.searchParams.set("version","latest");u.searchParams.set("limit",String(clamp(limit,1,20,8)));
  try{
    const data=await safeJson(u.toString(),{fetcher,timeoutMs,maxBytes:300000,headers:{Accept:"application/json"}});
    const results=(Array.isArray(data.servers)?data.servers:[]).slice(0,clamp(limit,1,20,8))
      .map(row=>row.server||row).filter(x=>x&&typeof x.name==="string")
      .map(x=>({type:"mcp_server",name:clean(x.name,160),description:clean(x.description,340),
        version:clean(x.version,50),registry:"https://registry.modelcontextprotocol.io",autoConnected:false}));
    return {query:q,results,count:results.length,note:"MCP server metadata only. Nothing installed or connected."};
  } catch(error){return {query:q,results:[],count:0,status:"unavailable",reason:clean(error?.message,90)};}
}
