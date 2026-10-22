import {PROFILES,getRecipe,recipeResourceUri} from '../recipes/catalog.mjs';
import {INTEGRATIONS,getIntegration} from './catalog.mjs';
import {KNOWLEDGE_ITEMS,getKnowledgeItem,freshness,knowledgeResourceUri} from '../knowledge/catalog.mjs';
import {normalizePackages,assessCompatibility} from '../knowledge/search.mjs';
import {coerceVersion,isPrerelease} from '../v3/semver.mjs';
import {tagMatches} from '../v3/data.mjs';
import {routeTask,SKILLS} from '../catalog.mjs';

const ID=/^[a-z0-9][a-z0-9-]{1,62}$/;
const MAX_IDS=20;
const POLICY='Advisory plan only. SOREN never executes, installs, connects or authenticates tools; the agent client runs every step under its own approvals.';
const COST_NOTES={context7:'Free tier; optional API key raises rate limits.',firecrawl:'Paid credits per scrape or crawl.',vercel:'Uses the signed-in Vercel account.',
  spline:'Requires a Spline account; some features need a paid plan.',github:'Uses the signed-in GitHub account.','21st':'Retrieval may consume 21st.dev quota.',motionsites:'Some prompts are paid.'};

function idList(value,label){
  if(value==null)return [];
  if(!Array.isArray(value)||value.length>MAX_IDS)throw new Error(`Invalid ${label}`);
  return [...new Set(value.map(v=>String(v).toLowerCase()).filter(v=>ID.test(v)))];
}

/** Scores profiles by trigger phrases (all words of a trigger must appear); ties go to the more specific (higher priority) profile. */
export function selectProfile(task){
  const ranked=PROFILES.map(profile=>({profile,...tagMatches(profile.triggers,task)}))
    .filter(r=>r.score>0)
    .sort((a,b)=>b.score-a.score||b.profile.priority-a.profile.priority||a.profile.id.localeCompare(b.profile.id));
  return ranked[0]??null;
}

function pickSkills(task,profile){
  const routed=routeTask(task,'planner').recommendations;
  const names=new Set(SKILLS.map(s=>s.name));
  const ordered=profile?[profile.primarySkill,...routed.map(r=>r.name),...profile.complementarySkills]:routed.map(r=>r.name);
  const out=[];
  for(const name of ordered){
    if(out.length>=3)break;
    if(!names.has(name)||out.some(s=>s.name===name))continue;
    const hit=routed.find(r=>r.name===name);
    out.push({name,uri:`skill://${name}/SKILL.md`,role:out.length?'complementary':'primary',
      reason:profile&&name===profile.primarySkill?`Primary skill for the ${profile.id} profile`:hit?hit.reasons.join('; ')||'Router match':`Complementary skill for the ${profile.id} profile`});
  }
  return out;
}

function docsFor(profile,packages,now){
  const ids=[...(profile?.knowledgeIds??[])];
  const declaresPrerelease=Object.entries(packages).filter(([,v])=>isPrerelease(coerceVersion(v)??''));
  for(const item of KNOWLEDGE_ITEMS){
    if(item.channel==='stable'||ids.includes(item.id))continue;
    if(declaresPrerelease.some(([name])=>name in item.packageRange)&&assessCompatibility(item,packages).status==='compatible')ids.push(item.id);
  }
  return ids.map(getKnowledgeItem).filter(Boolean).map(item=>({id:item.id,title:item.title,url:item.canonicalSource.url,channel:item.channel,
    context7LibraryId:item.context7LibraryId,packageRange:item.packageRange,frameworkVersions:item.frameworkVersions,lastVerifiedAt:item.lastVerifiedAt,
    contentSha256:item.contentSha256,freshness:freshness(item,now),compatibility:assessCompatibility(item,packages),warnings:item.warnings,resourceUri:knowledgeResourceUri(item.id)}));
}

function versionWarnings(packages,docs){
  const warnings=[];
  for(const [name,declared] of Object.entries(packages)){
    const version=coerceVersion(declared);
    if(version&&isPrerelease(version))warnings.push(`Project declares prerelease ${name}@${declared}; alpha/beta APIs may change. Prefer the stable line unless adoption is intentional and regression-tested.`);
    if(!version)warnings.push(`Could not resolve a concrete version for ${name} ("${declared}"); read the lockfile before relying on version-specific guidance.`);
  }
  for(const doc of docs){
    if(doc.compatibility.status==='incompatible'){
      const failing=doc.compatibility.checks.filter(c=>c.ok===false).map(c=>`${c.package} ${c.declared} not in ${c.range}`).join(', ');
      warnings.push(`Installed versions are incompatible with "${doc.title}" (${failing}); use version-matched docs or plan an upgrade.`);
    }
    if(doc.freshness.status==='stale')warnings.push(`"${doc.title}" was last verified ${doc.lastVerifiedAt} and is stale; re-verify before relying on it.`);
    for(const w of doc.warnings)if(doc.channel!=='stable')warnings.push(w);
  }
  return [...new Set(warnings)];
}

/**
 * Builds an advisory, deterministic toolchain plan. Connections named by the caller are recorded as
 * client_reported: SOREN cannot observe another client's MCP sessions, so it never marks them verified.
 * @param {string} task
 * @param {{runtime?:string|null,projectPackages?:Record<string,string>,availableConnections?:string[],excludeIntegrations?:string[],now?:Date}} [options]
 */
export function planToolchain(task,{runtime=null,projectPackages,availableConnections,excludeIntegrations,now=new Date()}={}){
  const text=String(task??'').slice(0,500);
  const packages=normalizePackages(projectPackages);
  const reported=idList(availableConnections,'available connections');
  const excluded=new Set(idList(excludeIntegrations,'excluded integrations'));
  const client=typeof runtime==='string'?runtime.slice(0,60):null;
  const match=text.trim()?selectProfile(text):null;
  const profile=match?.profile??null;
  const recipe=profile?getRecipe(profile.recipeId):null;
  const selectedSkills=pickSkills(text,profile);

  const suggested=profile?[...profile.requiredIntegrations.map(id=>[id,true]),...profile.optionalIntegrations.map(id=>[id,false])]
    .filter(([id])=>!excluded.has(id)).map(([id,required])=>{
      const i=getIntegration(id);
      return {id,name:i.name,kind:i.kind,category:i.category,required,catalogStatus:i.status,executionRisk:i.executionRisk,
        reason:required?`Required by the ${profile.id} profile`:`Optional for the ${profile.id} profile`,cautions:i.cautions};
    }):[];
  const clientReportedConnections=reported.map(id=>{
    const i=getIntegration(id);
    return {id,state:'client_reported',known:Boolean(i),note:i?'Reported by the caller; SOREN has not observed this connection.':'Not in the SOREN integration catalog.'};
  });
  const missingConnectionSteps=suggested.filter(s=>!reported.includes(s.id)).map(s=>({integration:s.id,name:s.name,required:s.required,
    guideTool:'get_client_setup_guide',guideArgs:{client,integration:s.id},note:s.required?'Connect before the steps that use it, or follow the fallback.':'Optional; skip if unavailable.'}));

  const docs=docsFor(profile,packages,now);
  const warnings=versionWarnings(packages,docs);
  if(!profile&&text.trim())warnings.push('No capability profile matched; proceed with native tools or call route_task for skills.');
  for(const id of excluded)if(profile&&[...profile.requiredIntegrations].includes(id))warnings.push(`Required integration ${id} was excluded; use the recipe fallbacks.`);

  const executionPlan=recipe?recipe.steps.map((s,index)=>({step:index+1,id:s.id,title:s.title,capability:s.capability,skills:s.skills,
    integrations:s.integrations.filter(id=>!excluded.has(id)),excludedIntegrations:s.integrations.filter(id=>excluded.has(id)),knowledgeIds:s.knowledgeIds,
    actor:s.actor,permission:s.permission,requiresHumanApproval:s.requiresHumanApproval,verification:s.verification,outputs:s.outputs})):[];
  const fallbacks=[...(recipe?.fallbacks??[]),...[...excluded].map(id=>`${id} excluded by the caller: use the recipe fallbacks for steps that listed it.`)];
  const sourceIds=[...new Set([...docs.map(d=>d.id),...executionPlan.flatMap(s=>s.knowledgeIds)])];
  const sources=sourceIds.map(getKnowledgeItem).filter(Boolean).map(k=>({id:k.id,title:k.title,url:k.canonicalSource.url,publisher:k.canonicalSource.publisher,lastVerifiedAt:k.lastVerifiedAt,contentSha256:k.contentSha256}));

  const incompatible=docs.filter(d=>d.compatibility.status==='incompatible').length;
  const raw=profile?Math.min(0.95,0.45+0.06*match.score+(Object.keys(packages).length?0.05:0)-0.1*incompatible):(selectedSkills.length?0.25:0.1);
  const score=Math.round(Math.max(0.05,raw)*100)/100;
  const external=suggested.filter(s=>COST_NOTES[s.id]).map(s=>({integration:s.id,note:COST_NOTES[s.id]}));

  return {task:text,runtime:client,authority:'advisory_only',policy:POLICY,
    profile:profile?{id:profile.id,title:profile.title,description:profile.description,matchedTriggers:match.matched.slice(0,6),recipeId:profile.recipeId,recipeUri:recipeResourceUri(profile.recipeId)}:null,
    requiredCapabilities:profile?.capabilities??[],selectedSkills,suggestedMcpServers:suggested,
    availableVerifiedConnections:[],clientReportedConnections,missingConnectionSteps,docsVersions:docs,
    permissionBoundaries:profile?.permissionBoundaries??['SOREN only plans; every step runs in the agent client under its own approvals and permissions.'],
    estimatedCost:{soren:'No cost; read-only planning.',agentEffort:executionPlan.length>=8?'high':executionPlan.length>=4?'medium':'low',humanApprovals:executionPlan.filter(s=>s.requiresHumanApproval).length,externalServices:external},
    executionPlan,verificationPlan:recipe?.verificationPlan??[],fallbacks,sources,
    confidence:{score,level:score>=0.75?'high':score>=0.5?'medium':'low',basis:profile?`Matched ${match.matched.length} trigger(s) for ${profile.id}`:'No profile matched'},
    warnings};
}

export {INTEGRATIONS};
