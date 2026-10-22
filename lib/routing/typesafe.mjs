/**
 * Optional TypeSafe Jev advisory for the curated Soren skill router.
 *
 * Privacy: callers must supply publicQuery(task), NEVER raw user tasks.
 * Safety: server-only key; disabled unless explicitly enabled; bounded call;
 * advice cannot add new skills, install code or override explicit preferences.
 * API: https://docs.typesafe.ai/api/system-one
 */
import {publicQuery} from '../federation.mjs';
import {SKILLS} from '../catalog.mjs';

const ENDPOINT='https://api.typesafe.ai/v1/systemone';
const ALLOWED_CHOICES=Object.freeze({
  'accessibility':'WCAG accessibility, ARIA, inclusive and keyboard-safe interfaces',
  'motion-systems':'WebGL, Three.js, R3F, cinematic motion, GSAP and animation',
  'mcp-integration':'Model Context Protocol, MCP server/client setup, remote connectors',
  'skill-orchestration':'Selecting and organizing approved agent skills, routing and skill registries',
  'none':'No sufficiently relevant approved skill for the keywords',
});
const CURATED_SKILLS=new Map(SKILLS.filter(skill=>skill.status==='curated').map(skill=>[skill.name,skill.description]));
function choicesForCandidates(candidates){
  if(!Array.isArray(candidates))return ALLOWED_CHOICES; // preserve standalone legacy callers
  return Object.fromEntries([
    ...[...new Set(candidates.map(candidate=>candidate?.name))].filter(name=>CURATED_SKILLS.has(name))
      .map(name=>[name,CURATED_SKILLS.get(name)]),
    ['none','None of the approved candidate skills clearly fits the provided public technology keywords.'],
  ]);
}
const PUBLIC_KEYWORDS=/^[a-z0-9 .+-]{1,100}$/;
const MAX_BYTES=16000;

async function readLimited(response,signal){
  if(Number(response.headers?.get('content-length')||0)>MAX_BYTES)throw Error('oversized');
  if(!response.body?.getReader){
    const raw=await response.text();
    if(Buffer.byteLength(raw)>MAX_BYTES)throw Error('oversized');
    return raw;
  }
  const reader=response.body.getReader();
  const cancel=()=>{void reader.cancel().catch(()=>{});};
  signal.addEventListener('abort',cancel,{once:true});
  if(signal.aborted)cancel();
  let count=0;
  const parts=[];
  try { for(;;){
    const {done,value}=await reader.read();
    if(done)break;
    count+=value.byteLength;
    if(count>MAX_BYTES){await reader.cancel();throw Error('oversized');}
    parts.push(value);
  }
  return Buffer.concat(parts).toString('utf8');
  } finally {signal.removeEventListener('abort',cancel);reader.releaseLock();}
}

/**
 * One classification request. The only user-derived field transmitted is a
 * known-safe, allowlisted public technology keyword string (not the raw task).
 */
export async function classifyPublicTask(publicKeywords,{env=process.env,fetcher=globalThis.fetch,timeoutMs=1800,candidates}={}){
  if(env.TYPESAFE_JEV_ENABLED!=='true')return {status:'disabled'};
  const key=env.TYPESAFE_API_KEY;
  if(!key||typeof key!=='string')return {status:'not_configured'};
  const keywords=typeof publicKeywords==='string'?publicKeywords.trim():'';
  if(!keywords)return {status:'no_public_terms'};
  if(!PUBLIC_KEYWORDS.test(keywords)||publicQuery(keywords)!==keywords)return {status:'unsafe_input'};
  const choices=choicesForCandidates(candidates);
  if(Object.keys(choices).length===1)return {status:'no_eligible_skills'};

  const controller=new AbortController();
  let timer;
  try{
    const body=JSON.stringify({
      model:'jev-latest',
      state:{public_technology_keywords:keywords},
      questions:{skill:{
        type:'choice',
        instructions:'Which single curated agent skill is most relevant to these public technology keywords, or none if no option clearly fits?',
        criteria:choices,
      }},
    });
    const operation=(async()=>{
      const response=await fetcher(ENDPOINT,{
        method:'POST',cache:'no-store',redirect:'error',signal:controller.signal,
        headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',Accept:'application/json'},body,
      });
      if(!response?.ok||response.redirected)return {status:'unavailable'};
      const raw=JSON.parse(await readLimited(response,controller.signal));
      const answer=raw?.answers?.skill;
      if(answer?.type!=='choice'||!Object.hasOwn(choices,answer.choice)||
        typeof answer.confidence!=='number'||!Number.isFinite(answer.confidence)||
        answer.confidence<0||answer.confidence>1)return {status:'invalid_response'};
      return {status:'ok',choice:answer.choice,confidence:answer.confidence};
    })();
    // The deadline includes response streaming/parsing, not just receipt of headers.
    const deadline=Number.isFinite(timeoutMs)?Math.min(3000,Math.max(100,timeoutMs)):1800;
    return await Promise.race([operation,new Promise((_,reject)=>{
      timer=setTimeout(()=>{controller.abort();reject(Error('timeout'));},deadline);
    })]);
  }catch{
    // Never return upstream response text, request headers or key.
    return {status:'unavailable'};
  }finally{
    clearTimeout(timer);
    controller.abort();
  }
}

/** Reorder approved recommendations only if confident; never create a skill. */
export function applyJevRouting(base,decision,{preferredSkills=[]}={}){
  const unchanged=detail=>({...base,decisionEngine:{name:'typesafe-jev',status:detail}});
  if(decision?.status!=='ok')return unchanged(decision?.status||'unavailable');
  if(preferredSkills?.length)return unchanged('explicit_preference_preserved');
  if(decision.choice==='none')return unchanged('no_match');
  if(!Number.isFinite(decision.confidence)||decision.confidence<.85)return unchanged('low_confidence');
  const selected=base.recommendations?.find(r=>r.name===decision.choice);
  if(!selected)return unchanged('ineligible');
  return {
    ...base,
    primary:selected,
    recommendations:[selected,...base.recommendations.filter(r=>r.name!==selected.name)],
    decisionEngine:{name:'typesafe-jev',status:'applied',choice:selected.name,confidence:decision.confidence},
  };
}
