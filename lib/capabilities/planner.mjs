/** Typed, inert capability planning. Never connects, executes, installs or authorizes. */
import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import catalog from '../../docs/research/capability-catalog-20261020/catalog.json' with {type:'json'};
import recipes from '../../docs/research/capability-catalog-20261020/workflows.json' with {type:'json'};
import sources from '../../docs/research/capability-catalog-20261020/sources.json' with {type:'json'};
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
export const CAPABILITIES=freeze(structuredClone(catalog.records));
export const WORKFLOWS=freeze(structuredClone(recipes.workflows));
const BY_ID=new Map(CAPABILITIES.map(r=>[r.id,r]));
const SOURCE_BY_ID=new Map(sources.sources.map(r=>[r.id,r]));
const REVISION=createHash('sha256').update(JSON.stringify([catalog,recipes,sources])).digest('hex');
const DOMAINS=['assistance','research','data','development','automation'];
const STATUSES=['NO_ROUTING_NEEDED','READY_WITH_EXISTING_TOOLS','NEEDS_CONNECTION','NEEDS_REVIEW','NEEDS_APPROVAL','NEEDS_RUNTIME','UNSUPPORTED'];
const REQUIREMENTS=['CONNECTION_NOT_VERIFIED','RUNTIME_NOT_VERIFIED','EXACT_CONTENT_REVIEW_REQUIRED','OPERATION_APPROVAL_REQUIRED'];
const CapabilityId=z.enum(CAPABILITIES.map(r=>r.id));
export const CapabilityContextSchema=z.object({domain:z.enum(DOMAINS).optional(),source_scope:z.enum(['public','provided_only','private']).optional(),operation:z.enum(['read','analyze','edit','execute','schedule']).optional(),preferred_capability_ids:z.array(CapabilityId).max(3).optional(),unavailable_capability_ids:z.array(CapabilityId).max(30).optional()}).strict();
const RecommendationSchema=z.object({id:CapabilityId,name:z.string(),kind:z.enum([...new Set(CAPABILITIES.map(r=>r.kind))]),delivery:z.enum([...new Set(CAPABILITIES.map(r=>r.delivery))]),status:z.enum(STATUSES),effects:z.array(z.string()),requirements:z.array(z.enum(REQUIREMENTS)),sourceIds:z.array(z.string()),reasons:z.array(z.string()).max(3),targetAvailability:z.literal('NOT_PROBED'),executionAuthorized:z.literal(false)}).strict();
export const CapabilityPlanSchema=z.object({
  schemaVersion:z.literal(1),taskId:z.string().uuid(),catalogRevision:z.string().regex(/^[a-f0-9]{64}$/),domain:z.enum(DOMAINS).nullable(),status:z.enum(STATUSES),planOnly:z.literal(true),executionAuthorized:z.literal(false),sourceScope:z.enum(['public','provided_only','private']),operation:z.enum(['read','analyze','edit','execute','schedule']),primaryCapabilityId:CapabilityId.nullable(),complementaryCapabilityIds:z.array(CapabilityId).max(2),recommendations:z.array(RecommendationSchema).max(3),workflowId:z.string().nullable(),
  steps:z.array(z.object({id:z.string(),role:z.string(),dependsOn:z.array(z.string()),candidateIds:z.array(CapabilityId).max(3),action:z.string(),expectedOutput:z.string(),authorizationGate:z.string(),onFailure:z.string(),status:z.enum(['PLANNED','CONDITIONAL','SKIPPED']),executionAuthorized:z.literal(false)}).strict()).max(8),
  approvalRequirements:z.array(z.enum(REQUIREMENTS)),verificationPlan:z.array(z.string()).max(6),sourceIds:z.array(z.string()),sources:z.array(z.object({id:z.string(),title:z.string(),url:z.string().url()}).strict()),stopReason:z.string().nullable(),nextAction:z.string(),evidenceScope:z.literal('catalog_metadata_not_host_verification'),
}).strict().superRefine((plan,context)=>{
  if((plan.recommendations[0]?.id??null)!==plan.primaryCapabilityId)
    context.addIssue({code:'custom',message:'primary_recommendation_mismatch',path:['primaryCapabilityId']});
  if(JSON.stringify(plan.recommendations.slice(1).map(r=>r.id))!==JSON.stringify(plan.complementaryCapabilityIds))
    context.addIssue({code:'custom',message:'complementary_recommendation_mismatch',path:['complementaryCapabilityIds']});
});
if(BY_ID.size!==CAPABILITIES.length||CAPABILITIES.some(r=>r.executionAuthorized!==false))throw Error('invalid_capability_catalog');
for(const r of CAPABILITIES)if(!r.sourceIds.every(id=>SOURCE_BY_ID.has(id)))throw Error('missing_capability_source');
for(const w of WORKFLOWS){const seen=new Set();for(const s of w.steps){if(seen.has(s.id)||!s.dependsOn.every(id=>seen.has(id))||!s.candidateIds.every(id=>BY_ID.has(id)))throw Error('invalid_workflow_dag');seen.add(s.id);}}

export function sourceScope(task,context={}){
  if(context.source_scope==='private')return 'private';
  if(/\b(confidential|private dataset|private data|without uploading|do not upload|don't upload|no uploads)\b/i.test(task))return 'private';
  if(/\b(only (?:the )?(?:provided|attached)|provided (?:files|sources) only|no (?:web|network)|do not browse|don't browse)\b/i.test(task))return 'provided_only';
  return context.source_scope??'provided_only';
}
const OPERATION_RANK=['read','analyze','edit','execute','schedule'];
function operationFor(t,c){
  // A hint may raise the operation but never lower what the task text asks for, so it cannot hide an approval gate.
  const fromText=operationFromText(t);
  return c.operation&&OPERATION_RANK.indexOf(c.operation)>OPERATION_RANK.indexOf(fromText)?c.operation:fromText;
}
function operationFromText(t){
  if(/\b(activate|create|enable|set up)\b.{0,45}\b(schedule|recurring|daily|hourly)\b|\bschedule (?:a |the )?workflow/.test(t))return 'schedule';
  if(/\b(run|execute|trigger|start)\b.{0,55}\b(workflow|privileged|deployment|payment)/.test(t))return 'execute';
  if(/\b(inspect|check|monitor|summary|summari[sz]e|status|before any retry|read.only|without modif)/.test(t))return 'read';
  if(/\b(edit|implement|modify|refactor|fix|commit|push|deploy|build)\b/.test(t))return 'edit';
  if(/\b(analy[sz]e|transform|aggregate|calculate|compute|validate)\b/.test(t))return 'analyze';
  return 'read';
}
function domainFor(t,c){
  if(c.domain)return c.domain;
  if(/\b(research|recent public|public evidence|scrap(?:e|ing)|crawl|permitted urls|known urls)\b|\b(extract|search|find)\b.{0,50}\b(sources|urls|web|pages|evidence)\b/.test(t))return 'research';
  if(/\b(csv|parquet|dataframe|pandas|polars|duckdb|dataset|tabular|pyarrow|pandera|convert.*document)\b/.test(t))return 'data';
  if(/\b(n8n|temporal|prefect|github actions|durable|workflow status|workflow execution|schedule)\b/.test(t))return 'automation';
  if(/\b(react|next\.?js|typescript|repository|repo|lockfile|supabase|rls|sql|gsap|animation|motion|webgl|azure|sdk|accessibility|wcag|implement|debug|refactor)\b/.test(t))return 'development';
  if(/\b(notes|remember|memory|authorized workspace|skill|skills|mcp|agent|context)\b|continue.{0,25}project/.test(t))return 'assistance';
  return null;
}
function blockedIds(t){
  const denied=new Set();
  for(const r of CAPABILITIES){
    const words=[r.id.split('.').at(-1),r.name.split(' ')[0].toLowerCase()].filter(w=>w.length>2);
    if(words.some(w=>new RegExp('(?:\\bnot|\\bno|\\bavoid|instead of|rather than)\\s+'+w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b').test(t)))denied.add(r.id);
  }
  if(/\bpandas\b/.test(t)&&/\b(keep|existing|preserve|continue|use)\b/.test(t)){denied.add('library.duckdb');denied.add('library.polars');}
  return denied;
}
// Bounded intent rules, not a learned model or a general natural-language permission interpreter.
const MATCHERS={
  'core.accessibility':[/\b(accessib|wcag|aria|keyboard|screen.reader|inclusive)/,15],
  'core.motion-systems':[/\b(animation|motion|webgl|gsap|three\.?js|cinematic)\b/,12],
  'core.mcp-integration':[/\b(mcp|connector|connect|integration)\b/,10],
  'core.skill-orchestration':[/\b(skill|skills|orchestration|router|routing|catalog)\b/,6],
  'catalog.skills-sh':[/\b(find|discover|search)\b.{0,25}\bskills\b/,5],
  'catalog.skillsmp':[/\b(skillsmp|community skills)\b/,10],
  'catalog.mcp-registry':[/\b(hapi|registry|discover.{0,15}mcp|find.{0,15}server)\b/,15],
  'collection.anthropic':[/\banthropic\b/,12],
  'collection.vercel':[/\b(react|next\.?js|vercel|components|frontend)\b/,11],
  'collection.supabase':[/\b(supabase|rls|postgres|indexes)\b/,18],
  'collection.microsoft':[/\b(azure|foundry|microsoft sdk)\b/,18],
  'collection.firecrawl':[/\b(firecrawl api|firecrawl skill|distribution repository|mirrored)\b/,16],
  'collection.gsap':[/\bgsap\b/,10],
  'reference.agentic-atlas':[/\b(agent design|delegation|context budget|handoff contract|atlas)\b/,16],
  'service.basic-memory':[/\b(notes|memory|remember|saved context|authorized workspace)\b/,18],
  'service.exa':[/\b(research|discover|evidence|search|public sources|find)\b/,12],
  'service.firecrawl':[/\b(extract|scrape|scraping|crawl|permitted urls|known urls)\b/,18],
  'service.context7':[/\b(lockfile|documentation|apis|library version|context7)\b/,18],
  'service.github':[/\b(repository|repo|github|pull request|commit|code review)\b/,16],
  'service.playwright':[/\b(playwright|browser|rendered|login.protected|ui test|visual test)\b/,20],
  'service.prefect':[/\bprefect\b/,24],
  'library.duckdb':[/\b(duckdb|csv|aggregate|analytical sql)\b/,15],
  'library.polars':[/\bpolars\b/,24],
  'library.pandera':[/\b(pandera|validate|validation|schema|invariants)\b/,17],
  'library.pyarrow':[/\b(pyarrow|arrow|interchange)\b/,14],
  'library.markitdown':[/\b(markitdown|document|pdf|docx|extract.*file)\b/,20],
  'library.crawl4ai':[/\bcrawl4ai\b/,22],
  'platform.n8n':[/\bn8n\b/,24],
  'platform.temporal':[/\b(temporal|durable|across days|multi.day)\b/,24],
  'platform.github-actions':[/\b(github actions|continuous integration|ci pipeline)\b/,24],
};
function score(r,t,d,p){
  if(p.includes(r.id))return 100+p.length-p.indexOf(r.id);
  const m=MATCHERS[r.id];let n=m&&m[0].test(t)?m[1]:0;
  if(d==='data'&&r.id==='library.pandera')n=Math.max(n,3);
  if(d==='data'&&r.id==='library.duckdb'&&/\bdata(set)?\b/.test(t))n=Math.max(n,5);
  return n;
}
const GATED_EFFECTS=['write_remote','possible_remote_write','execute_workflow','schedule'];
// Public network reads that do not act on the caller's own authorized data; ineligible outside public scope.
const publicNetworkOnly=r=>r.effects.some(e=>e==='network_read'||e==='possible_network_read')&&!r.effects.includes('read_private');
function recommendation(r,p,operation){
  const requirements=[];
  if(r.kind==='skill_collection')requirements.push('EXACT_CONTENT_REVIEW_REQUIRED');
  if(r.kind==='software_library'||r.id==='platform.temporal')requirements.push('RUNTIME_NOT_VERIFIED');
  if(r.kind==='mcp_server'||r.kind==='workflow_runtime'&&r.id!=='platform.temporal'||r.kind==='reference_corpus'||r.kind==='discovery_catalog')requirements.push('CONNECTION_NOT_VERIFIED');
  if(['edit','execute','schedule'].includes(operation)&&r.effects.some(e=>GATED_EFFECTS.includes(e)))requirements.unshift('OPERATION_APPROVAL_REQUIRED');
  const status=requirements.includes('OPERATION_APPROVAL_REQUIRED')?'NEEDS_APPROVAL':requirements.includes('EXACT_CONTENT_REVIEW_REQUIRED')?'NEEDS_REVIEW':requirements.includes('RUNTIME_NOT_VERIFIED')?'NEEDS_RUNTIME':requirements.length?'NEEDS_CONNECTION':'READY_WITH_EXISTING_TOOLS';
  return {id:r.id,name:r.name,kind:r.kind,delivery:r.delivery,status,effects:[...r.effects],requirements,sourceIds:[...r.sourceIds],reasons:[p.includes(r.id)?'EXPLICIT_SELECTION':'TASK_INTENT_MATCH',r.kind==='bundled_skill'?'BUNDLED_REFERENCE_ONLY':'TARGET_CAPABILITY_NOT_VERIFIED'],targetAvailability:'NOT_PROBED',executionAuthorized:false};
}
export function buildCapabilityPlan(task,rawContext={}){
  const c=CapabilityContextSchema.parse(rawContext);
  if(typeof task!=='string'||!task.trim()||task.length>500)throw Error('invalid_capability_task');
  const t=task.toLowerCase(),domain=domainFor(t,c),operation=operationFor(t,c),scope=sourceScope(t,c),preferred=c.preferred_capability_ids??[];
  const excluded=new Set([...(c.unavailable_capability_ids??[]),...blockedIds(t)]);
  const plan={schemaVersion:1,taskId:randomUUID(),catalogRevision:REVISION,domain,status:'UNSUPPORTED',planOnly:true,executionAuthorized:false,sourceScope:scope,operation,primaryCapabilityId:null,complementaryCapabilityIds:[],recommendations:[],workflowId:null,steps:[],approvalRequirements:[],verificationPlan:[],sourceIds:[],sources:[],stopReason:null,nextAction:'Use the host workflow; no matching capability is established.',evidenceScope:'catalog_metadata_not_host_verification'};
  if(/\b(bypass|circumvent)\b.{0,50}\b(access controls|authentication|authorization|permission|denied)\b/.test(t)){plan.stopReason='ACCESS_BOUNDARY';return CapabilityPlanSchema.parse(plan);}
  if(/ignore.{0,30}(system|previous).{0,25}(rules|instructions)|export.{0,15}(tokens|credentials)|same name.{0,50}(repository|paths)|mirrored.{0,30}repository/.test(t)){plan.status='NEEDS_REVIEW';plan.stopReason='SOURCE_OR_INSTRUCTION_REVIEW_REQUIRED';return CapabilityPlanSchema.parse(plan);}
  if(!preferred.length&&/^(please )?(explain|what is|what does|define|tell me what)\b/.test(t)&&!c.domain&&!/\b(repository|file|project|sources|recent|current|latest)\b/.test(t)){plan.status='NO_ROUTING_NEEDED';plan.stopReason='SELF_CONTAINED_REQUEST';plan.nextAction='Answer directly with the existing host context.';return CapabilityPlanSchema.parse(plan);}
  if(!domain)return CapabilityPlanSchema.parse(plan);
  const eligible=CAPABILITIES.filter(r=>r.domains.includes(domain)&&!excluded.has(r.id)&&!(scope!=='public'&&publicNetworkOnly(r)));
  const selected=eligible.map(r=>({r,value:score(r,t,domain,preferred)})).filter(x=>x.value>0).sort((a,b)=>b.value-a.value||a.r.id.localeCompare(b.r.id)).slice(0,3);
  if(!selected.length){plan.stopReason=excluded.size?'NO_ELIGIBLE_MATCH':'NO_MATCH';return CapabilityPlanSchema.parse(plan);}
  plan.recommendations=selected.map(({r})=>recommendation(r,preferred,operation));
  plan.primaryCapabilityId=plan.recommendations[0].id;plan.complementaryCapabilityIds=plan.recommendations.slice(1).map(r=>r.id);
  plan.status=plan.recommendations[0].status;plan.approvalRequirements=[...new Set(plan.recommendations.flatMap(r=>r.requirements))];
  if(plan.status==='READY_WITH_EXISTING_TOOLS'&&plan.approvalRequirements.length)plan.status=plan.recommendations.find(r=>r.requirements.length).status;
  // An approval needed by any recommended capability gates the whole plan, not just the primary.
  if(plan.recommendations.some(r=>r.status==='NEEDS_APPROVAL'))plan.status='NEEDS_APPROVAL';
  const workflow=WORKFLOWS.find(w=>w.domain===domain);plan.workflowId=workflow.id;const chosen=new Set(plan.recommendations.map(r=>r.id));
  plan.steps=workflow.steps.map(s=>{
    let status=/conditional|only when/i.test(s.action)?'CONDITIONAL':'PLANNED';
    if((domain==='automation'&&s.id==='activate'&&!['execute','schedule'].includes(operation))||s.id==='handoff'||s.id==='publish')status='SKIPPED';
    if(domain==='research'&&scope!=='public'&&['discover','extract'].includes(s.id))status='SKIPPED';
    return {id:s.id,role:s.role,dependsOn:[...s.dependsOn],candidateIds:s.candidateIds.filter(id=>chosen.has(id)).slice(0,3),action:s.action,expectedOutput:s.expectedOutput,authorizationGate:s.authorizationGate,onFailure:s.onFailure,status,executionAuthorized:false};
  });
  plan.verificationPlan=[...workflow.successEvidence];plan.sourceIds=[...new Set(plan.recommendations.flatMap(r=>r.sourceIds))];
  plan.sources=plan.sourceIds.map(id=>{const s=SOURCE_BY_ID.get(id);return {id,title:s.title,url:s.url};});
  plan.nextAction=plan.status==='READY_WITH_EXISTING_TOOLS'?'Read the selected bundled reference; keep host permissions and workflow unchanged.':'Resolve the stated prerequisites in the current host before acting. Do not install or connect automatically.';
  const checked=CapabilityPlanSchema.parse(plan);if(Buffer.byteLength(JSON.stringify(checked))>16384)throw Error('capability_plan_too_large');return checked;
}
