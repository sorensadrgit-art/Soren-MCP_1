/** Shared, testable route_task boundary; default response contract stays unchanged. */
import {z} from 'zod';
import {SKILLS} from '../catalog.mjs';
import {routeTaskFederated,publicQuery} from '../federation.mjs';
import {buildCapabilityPlan,CapabilityContextSchema,sourceScope} from '../capabilities/planner.mjs';
import {classifyPublicTask,applyJevRouting} from './typesafe.mjs';
// Derived from the curated catalog so every approved V3 skill stays selectable; the four legacy names remain a subset.
const skill=z.enum(SKILLS.map(s=>s.name));
export const RouteTaskInputSchema=z.object({
  task:z.string().min(1).max(500),runtime:z.string().max(60).optional(),
  discovery:z.enum(['local','federated','auto']).optional(),
  providers:z.array(z.enum(['skillsmp','skills_sh','anthropic'])).max(3).optional(),
  preferred_skills:z.array(skill).max(3).optional(),unavailable_skills:z.array(skill).max(8).optional(),
  include_capability_plan:z.boolean().optional(),capability_context:CapabilityContextSchema.optional(),
  decision_engine:z.enum(['deterministic','jev']).optional(),
});

export async function routeTaskRequest(raw,{
  getOidc=async()=>'',discoverer=null,guardedAdvice=null,env=process.env,fetcher=globalThis.fetch,
}={}){
  const input=RouteTaskInputSchema.parse(raw);
  if(input.capability_context&&!input.include_capability_plan)throw Error('include_capability_plan_required');
  const plan=input.include_capability_plan?buildCapabilityPlan(input.task,input.capability_context):null;
  const restricted=!!plan&&plan.sourceScope!=='public';
  const bypass=!!plan&&(plan.status==='NO_ROUTING_NEEDED'||plan.status==='UNSUPPORTED'||!!plan.stopReason);
  const discovery=restricted||bypass?'local':input.discovery??'federated';
  let result=await routeTaskFederated(input.task,input.runtime??'generic',{
    discovery,providers:input.providers,oidcToken:discovery==='local'?'':await getOidc(),
    preferredSkills:input.preferred_skills,unavailableSkills:input.unavailable_skills,
    ...(discoverer?{discoverer}:{}),
  });
  if(input.decision_engine==='jev'){
    let decision;
    // Local means local: even an explicit model hint cannot override source restrictions.
    if(restricted||sourceScope(input.task,{source_scope:'public'})!=='public')decision={status:'privacy_scope_preserved'};
    else if(discovery==='local'||bypass)decision={status:'local_only'};
    else if(input.preferred_skills?.length)decision={status:'explicit_preference_preserved'};
    else if(env.TYPESAFE_JEV_ENABLED!=='true')decision={status:'disabled'};
    else if(!env.TYPESAFE_API_KEY)decision={status:'not_configured'};
    else if(!result.recommendations?.length)decision={status:'no_eligible_skills'};
    else{
      const keywords=publicQuery(input.task);
      if(!keywords)decision={status:'no_public_terms'};
      else if(!guardedAdvice)decision={status:'unavailable_or_budget_limited'};
      else try{
        // Shared budget/cache is mandatory; never call a billable service around a denied gate.
        decision=await guardedAdvice('typesafe_jev',{keywords,model:'jev-latest'},async()=>{
          const value=await classifyPublicTask(keywords,{env,fetcher});
          if(value.status!=='ok')throw Error('jev_unavailable');
          return value;
        });
      }catch{decision={status:'unavailable_or_budget_limited'};}
    }
    result=applyJevRouting(result,decision,{preferredSkills:input.preferred_skills});
  }
  // No external decision can change the plan's authorization or runtime prerequisites.
  return plan?{...result,capabilityPlan:plan}:result;
}
