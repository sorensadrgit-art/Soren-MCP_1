import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {routeTask,readSkill} from '../lib/catalog.mjs';
import {routeTaskFederated} from '../lib/federation.mjs';
import {MCP_VERSION} from '../lib/client-contract.mjs';
import {compareVersions} from '../lib/v3/semver.mjs';

/** Applies versioned label revisions on top of the frozen fixture; a fixture edit invalidates them. */
export function effectiveExpectations(raw,fixture,expectations,contract=MCP_VERSION){
  // Line endings are normalized so the binding holds for CRLF (Windows) and LF (CI) checkouts.
  const sha=createHash('sha256').update(raw.replace(/\r\n/g,'\n')).digest('hex');
  if(expectations.fixtureSha256!==sha)throw new Error('routing_fixture_changed_review_expectations');
  const byId=new Map(fixture.tasks.map(t=>[t.id,t]));
  const applied=[];
  const tasks=fixture.tasks.map(t=>({...t}));
  for(const revision of expectations.revisions){
    const frozen=byId.get(revision.id);
    if(!frozen)throw new Error('unknown_revision_task:'+revision.id);
    if(frozen.bypass!==revision.frozen.bypass||JSON.stringify(frozen.acceptableTopThree)!==JSON.stringify(revision.frozen.acceptableTopThree))throw new Error('revision_frozen_mismatch:'+revision.id);
    if(compareVersions(contract,revision.sinceContract)<0)continue;
    const index=tasks.findIndex(t=>t.id===revision.id);
    tasks[index]={...tasks[index],...revision.expected};
    applied.push(revision.id);
  }
  return {tasks,applied};
}
const passes=(entry,names)=>{
  const banned=[...(entry.options.unavailableSkills??[]),...(entry.forbidden??[])];
  if(names.some(name=>banned.includes(name)))return false;
  return entry.bypass?names.length===0:entry.options.preferredSkills?.length?entry.acceptableTopThree.includes(names[0]):entry.acceptableTopThree.some(name=>names.includes(name));
};
export async function evaluateRouting({contract=MCP_VERSION}={}){
  const raw=fs.readFileSync(new URL('../tests/routing/evaluation.json',import.meta.url),'utf8'),fixture=JSON.parse(raw);
  const expectations=JSON.parse(fs.readFileSync(new URL('../tests/routing/evaluation-expectations.json',import.meta.url),'utf8'));
  const {tasks,applied}=effectiveExpectations(raw,fixture,expectations,contract);
  const frozenById=new Map(fixture.tasks.map(t=>[t.id,t]));
  const results=tasks.map(entry=>{const answer=routeTask(entry.task,'evaluation',entry.options),names=answer.recommendations.map(x=>x.name);
    return {id:entry.id,category:entry.category,selected:names,passed:passes(entry,names),frozenLabelPassed:passes(frozenById.get(entry.id),names),revised:applied.includes(entry.id)};});
  const durations=[],retrieval=[];for(let index=0;index<100;index++){let start=performance.now();routeTask('GSAP camera animation','evaluation');durations.push(performance.now()-start);start=performance.now();readSkill('accessibility');retrieval.push(performance.now()-start);}
  const percentile=(values,amount)=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*amount)-1];
  const concurrent=await Promise.all(Array.from({length:20},(_,index)=>routeTaskFederated('MCP client authentication','case-'+index,{discovery:'local'})));
  let upstreamFixtureCalls=0;
  for(let index=0;index<30;index++)await routeTaskFederated('GSAP animation','fixture',{
    providers:['skillsmp'],
    fetcher:async()=>{
      upstreamFixtureCalls++;
      const skills=[{id:'gsap-example',name:'gsap-example',description:'GSAP animation',source:'example/repo'}];
      return Response.json({result:{content:[{type:'text',text:JSON.stringify({skills})}]}});
    },
  });
  return {observedAt:new Date().toISOString(),fixtureSha256:createHash('sha256').update(raw).digest('hex'),labelReview:fixture.labelReview,contract,revisionsApplied:applied,frozenLabelPassed:results.filter(x=>x.frozenLabelPassed).length,taskCount:results.length,passed:results.filter(x=>x.passed).length,topThreePercent:100*results.filter(x=>x.passed).length/results.length,explicitChoicesPreserved:results.filter(x=>x.category==='explicit_choice').every(x=>x.passed),bypassCorrect:results.filter(x=>x.category==='trivial').every(x=>x.passed),localRoute:{samples:100,p50Ms:percentile(durations,.5),p95Ms:percentile(durations,.95)},bundledRead:{samples:100,p50Ms:percentile(retrieval,.5),p95Ms:percentile(retrieval,.95)},concurrentLocal:{samples:20,isolated:concurrent.every((x,index)=>x.runtime==='case-'+index&&x.discoveredCandidates.length===0)},federation:{cases:30,upstreamFixtureCalls,liveUpstreamRequests:0},results};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const report=await evaluateRouting();fs.mkdirSync('docs/evidence',{recursive:true});fs.writeFileSync('docs/evidence/routing-evaluation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({contract:report.contract,tasks:report.taskCount,passed:report.passed,frozenLabelPassed:report.frozenLabelPassed,revisionsApplied:report.revisionsApplied,topThreePercent:report.topThreePercent,labelReview:report.labelReview,routeP95:report.localRoute.p95Ms,readP95:report.bundledRead.p95Ms}));if(report.passed!==report.taskCount||!report.explicitChoicesPreserved||!report.bypassCorrect||!report.concurrentLocal.isolated)process.exitCode=1;}
