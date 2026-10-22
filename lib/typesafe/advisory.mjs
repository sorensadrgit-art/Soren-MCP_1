/**
 * TypeSafe advisory primitives for SOREN Universal MCP.
 *
 * Never authorize tools, write memories, or claim verified truth. Every call
 * requires an explicit declaration that the submitted summary/evidence is
 * public; a local pattern screen is defense in depth, not a PII guarantee.
 * Cost control is enforced by the MCP gateway's shared provider budget.
 */
const ENDPOINT='https://api.typesafe.ai/v1/systemone';
const MAX_RESPONSE_BYTES=16_384;
const MAX_STATE_BYTES=8_000;
const SENSITIVE=/(?:https?:\/\/|[\w.+-]+@[\w.-]+\.[a-z]{2,}|[a-z]:[\\/]|\/(?:home|users|root|private|etc|mnt)\/|-----BEGIN [\w ]*PRIVATE KEY|\b(?:api[_-]?key|access[_-]?token|password|passwd|secret|authorization|cookie)\s*[:=]|\b(?:sk-[\w-]{12,}|gh[pousr]_[\w-]{12,}|AKIA[A-Z0-9]{16}|\d{3}-\d{2}-\d{4})\b)/i;
const IDENTIFIER=/^[a-z][a-z0-9-]{1,62}$/;
const minmax=(v,min,max)=>typeof v==='string'&&v.trim().length>=min&&v.length<=max;

export const typesafeToolsEnabled=(env=process.env)=>
  env.SOREN_V3_TOOLS==='1'&&env.SOREN_TYPESAFE_TOOLS==='1';

function publicText(v,min,max){
  return minmax(v,min,max)&&!SENSITIVE.test(v)&&!/[\u0000-\u001f\u007f]/.test(v);
}

function checkReady({publicConfirmed,env,values=[]}){
  if(publicConfirmed!==true)return {status:'public_confirmation_required'};
  if(env.TYPESAFE_JEV_ENABLED!=='true')return {status:'disabled'};
  if(typeof env.TYPESAFE_API_KEY!=='string'||!env.TYPESAFE_API_KEY.trim())return {status:'not_configured'};
  if(values.some(({value,min,max})=>!publicText(value,min,max)))return {status:'unsafe_input'};
  return null;
}

async function readBounded(response,signal){
  if(Number(response.headers?.get('content-length')||0)>MAX_RESPONSE_BYTES)throw Error('large');
  if(!response.body?.getReader){
    const value=await response.text();
    if(Buffer.byteLength(value)>MAX_RESPONSE_BYTES)throw Error('large');
    return value;
  }
  const reader=response.body.getReader();let size=0;const chunks=[];
  const cancel=()=>{void reader.cancel().catch(()=>{});};
  signal.addEventListener('abort',cancel,{once:true});
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>MAX_RESPONSE_BYTES){await reader.cancel();throw Error('large');}
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  }finally{
    signal.removeEventListener('abort',cancel);
    reader.releaseLock();
  }
}

async function invoke(state,questions,{env,fetcher,timeoutMs=1800}){
  const request={model:'jev-latest',state,questions};
  const body=JSON.stringify(request);
  if(Buffer.byteLength(body)>MAX_STATE_BYTES)return null;
  const controller=new AbortController();let timer;
  try{
    const operation=(async()=>{
      const response=await fetcher(ENDPOINT,{
        method:'POST',cache:'no-store',redirect:'error',signal:controller.signal,
        headers:{Authorization:'Bearer '+env.TYPESAFE_API_KEY,'Content-Type':'application/json',Accept:'application/json'},
        body,
      });
      if(!response?.ok||response.redirected)return null;
      const parsed=JSON.parse(await readBounded(response,controller.signal));
      return parsed&&typeof parsed==='object'?parsed.answers:null;
    })();
    const deadline=Number.isFinite(timeoutMs)?Math.max(100,Math.min(3000,timeoutMs)):1800;
    return await Promise.race([operation,new Promise((_,reject)=>{
      timer=setTimeout(()=>{controller.abort();reject(Error('timeout'));},deadline);
    })]);
  }catch{return null;}
  finally{clearTimeout(timer);controller.abort();}
}

function answer(answers,name,choices){
  const a=answers?.[name];
  if(a?.type!=='choice'||!Object.hasOwn(choices,a.choice)||
     typeof a.confidence!=='number'||!Number.isFinite(a.confidence)||
     a.confidence<0||a.confidence>1)return null;
  return {value:a.choice,confidence:a.confidence};
}

/**
 * Suggest one agent from an EXPLICIT caller-supplied allowlist.
 * Agent names here are metadata only; availability, auth and execution are
 * verified independently by the invoking agent/client.
 */
export async function adviseSpecialist(publicSummary,candidates,{
  env=process.env,fetcher=globalThis.fetch,publicConfirmed=false,timeoutMs=1800,
}={}){
  const ready=checkReady({publicConfirmed,env,values:[{value:publicSummary,min:3,max:500}]});
  if(ready)return ready;
  if(!Array.isArray(candidates)||candidates.length<1||candidates.length>24)return {status:'invalid_candidates'};
  const seen=new Set();
  for(const candidate of candidates){
    if(!candidate||!IDENTIFIER.test(candidate.id)||candidate.id==='none'||
      !publicText(candidate.description,5,220)||seen.has(candidate.id))return {status:'invalid_candidates'};
    seen.add(candidate.id);
  }
  const criteria=Object.fromEntries(candidates.map(c=>[c.id,c.description]));
  criteria.none='None of the listed specialist agents clearly handles the requested task.';
  const answers=await invoke({public_summary:publicSummary},{
    specialist:{type:'choice',instructions:'Which listed specialist agent best fits this public task summary? Select none if none is a clear match. This is advisory, not execution authority.',criteria}
  },{env,fetcher,timeoutMs});
  const selected=answer(answers,'specialist',criteria);
  if(!selected)return {status:'unavailable'};
  if(selected.value==='none')return {status:'no_match',suggestion:null,advisoryOnly:true,canExecute:false};
  if(selected.confidence<.85)return {status:'review_required',suggestion:null,confidence:selected.confidence,advisoryOnly:true,canExecute:false};
  return {status:'suggested',suggestion:selected.value,confidence:selected.confidence,advisoryOnly:true,canExecute:false};
}

/** Never persists or promotes a memory; source/provenance is required. */
export async function triageLearning(publicSummary,sources,{
  env=process.env,fetcher=globalThis.fetch,publicConfirmed=false,timeoutMs=1800,
}={}){
  const ready=checkReady({publicConfirmed,env,values:[{value:publicSummary,min:3,max:500}]});
  if(ready)return ready;
  if(!Array.isArray(sources)||!sources.length||sources.length>5)return {status:'provenance_required'};
  if(sources.some(s=>!publicText(s,2,120)))return {status:'unsafe_input'};
  const criteria={
    retain:'Stable project fact or reusable verified procedure with lasting value and clear provenance; recommend human-curated retention.',
    review:'Potentially useful but uncertain, context-dependent, incomplete or not yet verified; needs human evaluation.',
    discard:'Temporary request, one-off result, duplicate, personal information, unsupported speculation, or no lasting value.',
  };
  const answers=await invoke({public_summary:publicSummary,sources},{
    memory:{type:'choice',instructions:'How should this public, human-curated learning candidate be triaged? Nothing will be stored automatically.',criteria},
    durable:{type:'noul',instructions:'Is this a stable, reusable, evidence-backed technical fact or procedure likely to remain useful beyond the current task?'},
  },{env,fetcher,timeoutMs});
  const decision=answer(answers,'memory',criteria);
  const durable=answers?.durable;
  if(!decision||durable?.type!=='noul'||typeof durable.noul!=='number'||
    !Number.isFinite(durable.noul)||durable.noul<0||durable.noul>1)return {status:'unavailable'};
  const recommendation=decision.value==='retain'&&
    (decision.confidence<.8||durable.noul<.8)?'review':decision.confidence<.8?'review':decision.value;
  return {status:'assessed',recommendation,confidence:decision.confidence,
    durableProbability:durable.noul,needsHumanReview:true,persisted:false,
    policy:'Human authorization, evidence receipts and existing Learning Loop checks still govern storage and promotion.'};
}

/**
 * Exact quote check comes before any model judgment. Jev only assesses the
 * relationship between claim and existing, explicitly supplied evidence.
 */
export async function verifyAgentClaim(claim,sourceExcerpt,quote,{
  env=process.env,fetcher=globalThis.fetch,publicConfirmed=false,timeoutMs=1800,
}={}){
  const ready=checkReady({publicConfirmed,env,values:[
    {value:claim,min:3,max:500},
    {value:sourceExcerpt,min:3,max:3000},
    {value:quote,min:3,max:500},
  ]});
  if(ready)return ready;
  const normalize=s=>s.replace(/\s+/g,' ').trim();
  if(!normalize(sourceExcerpt).includes(normalize(quote))){
    return {status:'local_check',verdict:'fabricated',confidence:1,
      needsHumanReview:true,authoritative:false};
  }
  const criteria={
    supported:'The context of the quoted passage supports the claim.',
    contradicted:'The quoted passage or its surrounding context contradicts the claim.',
    unsupported:'The quote exists, but the context does not establish the claim.',
    insufficient:'The excerpt is ambiguous or lacks sufficient surrounding context to assess the claim.',
  };
  const answers=await invoke({claim,source_excerpt:sourceExcerpt,quote},{
    evidence:{type:'choice',instructions:'Evaluate whether the context of this exact public-source quote really supports the agent claim. Decide only from the supplied excerpt.',criteria}
  },{env,fetcher,timeoutMs});
  const decision=answer(answers,'evidence',criteria);
  if(!decision)return {status:'unavailable'};
  const verdict=decision.confidence<.9?'review':decision.value;
  return {status:'assessed',verdict,confidence:decision.confidence,
    needsHumanReview:verdict!=='supported',authoritative:false,
    policy:'Advisory evidence check, not security approval, factual proof or permission to act.'};
}
