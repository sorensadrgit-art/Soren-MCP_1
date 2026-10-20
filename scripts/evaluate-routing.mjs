import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {routeTask,readSkill} from '../lib/catalog.mjs';
import {routeTaskFederated} from '../lib/federation.mjs';
export async function evaluateRouting(){
  const raw=fs.readFileSync(new URL('../tests/routing/evaluation.json',import.meta.url),'utf8'),fixture=JSON.parse(raw);
  const results=fixture.tasks.map(entry=>{const answer=routeTask(entry.task,'evaluation',entry.options),names=answer.recommendations.map(x=>x.name);
    return {id:entry.id,category:entry.category,selected:names,passed:entry.bypass?names.length===0:entry.options.preferredSkills?.length?entry.acceptableTopThree.includes(names[0]):entry.acceptableTopThree.some(name=>names.includes(name))};});
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
  return {observedAt:new Date().toISOString(),fixtureSha256:createHash('sha256').update(raw).digest('hex'),labelReview:fixture.labelReview,taskCount:results.length,passed:results.filter(x=>x.passed).length,topThreePercent:100*results.filter(x=>x.passed).length/results.length,explicitChoicesPreserved:results.filter(x=>x.category==='explicit_choice').every(x=>x.passed),bypassCorrect:results.filter(x=>x.category==='trivial').every(x=>x.passed),localRoute:{samples:100,p50Ms:percentile(durations,.5),p95Ms:percentile(durations,.95)},bundledRead:{samples:100,p50Ms:percentile(retrieval,.5),p95Ms:percentile(retrieval,.95)},concurrentLocal:{samples:20,isolated:concurrent.every((x,index)=>x.runtime==='case-'+index&&x.discoveredCandidates.length===0)},federation:{cases:30,upstreamFixtureCalls,liveUpstreamRequests:0},results};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const report=await evaluateRouting();fs.mkdirSync('docs/evidence',{recursive:true});fs.writeFileSync('docs/evidence/routing-evaluation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({tasks:report.taskCount,passed:report.passed,topThreePercent:report.topThreePercent,labelReview:report.labelReview,routeP95:report.localRoute.p95Ms,readP95:report.bundledRead.p95Ms}));if(report.topThreePercent<90||!report.explicitChoicesPreserved||!report.bypassCorrect||!report.concurrentLocal.isolated)process.exitCode=1;}
