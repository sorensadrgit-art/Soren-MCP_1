import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {routeTask} from '../lib/catalog.mjs';

/** Measures route_task (skills) and plan_toolchain (profiles) against the frozen V3 gold set. */
export async function evaluateV3Routing({now=new Date('2026-10-23T00:00:00Z')}={}){
  const raw=fs.readFileSync(new URL('../tests/routing/evaluation-v3.json',import.meta.url),'utf8'),fixture=JSON.parse(raw);
  let planToolchain=null;
  try{({planToolchain}=await import('../lib/integrations/plan.mjs'));}catch{planToolchain=null;}
  const results=fixture.tasks.map(entry=>{
    const names=routeTask(entry.task,'evaluation').recommendations.map(x=>x.name);
    const profile=planToolchain?(planToolchain(entry.task,{now}).profile?.id??null):undefined;
    const top1=entry.bypass?names.length===0:entry.acceptablePrimary.includes(names[0]);
    const top3=entry.bypass?names.length===0:entry.acceptableTopThree.some(name=>names.includes(name));
    const profileOk=profile===undefined?null:entry.acceptableProfiles.includes(profile);
    return {id:entry.id,category:entry.category,selected:names,profile:profile??null,top1,top3,profileOk};
  });
  const pct=key=>Math.round(1000*results.filter(r=>r[key]).length/results.length)/10;
  const categories={};
  for(const r of results){const c=categories[r.category]??={tasks:0,top1:0,top3:0,profile:0};c.tasks++;c.top1+=r.top1?1:0;c.top3+=r.top3?1:0;c.profile+=r.profileOk?1:0;}
  return {observedAt:new Date().toISOString(),fixtureSha256:createHash('sha256').update(raw).digest('hex'),labelReview:fixture.labelReview,
    taskCount:results.length,plannerAvailable:Boolean(planToolchain),
    skillTop1Percent:pct('top1'),skillTop3Percent:pct('top3'),profileTop1Percent:planToolchain?pct('profileOk'):null,
    bypassCorrect:results.filter(r=>r.category==='trivial').every(r=>r.top1),categories,
    failures:results.filter(r=>!r.top1||!r.top3||r.profileOk===false),results};
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const report=await evaluateV3Routing();
  const out=process.argv[2]||'docs/evidence/v3/routing-evaluation-v3.json';
  fs.mkdirSync('docs/evidence/v3',{recursive:true});
  fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({tasks:report.taskCount,planner:report.plannerAvailable,skillTop1:report.skillTop1Percent,skillTop3:report.skillTop3Percent,profileTop1:report.profileTop1Percent,bypass:report.bypassCorrect,failures:report.failures.map(f=>f.id)}));
  if(report.skillTop1Percent<90||report.skillTop3Percent<95||(report.profileTop1Percent??0)<90||!report.bypassCorrect)process.exitCode=1;
}
