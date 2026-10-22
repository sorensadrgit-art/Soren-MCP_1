import fs from 'node:fs';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';

/** Real MCP SDK client against local servers: discovery, invocation, resources and latency. Evidence only. */
async function session(url){
  const client=new Client({name:'soren-v3-sdk-probe',version:'1.0.0'});
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  return client;
}
const pct=(v,p)=>{const s=[...v].sort((a,b)=>a-b);return Math.round(s[Math.ceil(s.length*p)-1]*100)/100;};
async function timed(fn,n=25){const d=[];let last;for(let i=0;i<n;i++){const t=performance.now();last=await fn();d.push(performance.now()-t);}return {samples:n,p50Ms:pct(d,.5),p95Ms:pct(d,.95),maxMs:Math.round(Math.max(...d)*100)/100,last};}
const out={observedAt:new Date().toISOString(),client:'@modelcontextprotocol/client 2.3.1',note:'Local next start on loopback, same machine; latency includes HTTP + JSON-RPC, not network to Vercel.'};
for(const [tag,url] of [['flagOff','http://127.0.0.1:3917/api/mcp'],['flagOn','http://127.0.0.1:3918/api/mcp']]){
  const c=await session(url);
  const tools=(await c.listTools()).tools.map(t=>t.name);
  const resources=(await c.listResources()).resources.map(r=>r.uri);
  const r={server:c.getServerVersion(),tools,resourceCount:resources.length,
    knowledgeResources:resources.filter(u=>u.startsWith('soren://knowledge/')).length,recipeResources:resources.filter(u=>u.startsWith('soren://recipe/')).length};
  const text=res=>JSON.parse(res.content.find(x=>x.type==='text').text);
  r.legacy={route_task:await timed(async()=>text(await c.callTool({name:'route_task',arguments:{task:'GSAP Three.js WebGL website',runtime:'codex',discovery:'local'}})).primary.name),
    list_skills:await timed(async()=>text(await c.callTool({name:'list_skills',arguments:{}})).length)};
  if(tag==='flagOn'){
    r.v3={
      plan_toolchain:await timed(async()=>{const v=text(await c.callTool({name:'plan_toolchain',arguments:{task:'Create an ultra-realistic interactive 3D portfolio',runtime:'codex',project_packages:{react:'19.3.1','@react-three/fiber':'9.8.2'}}}));return {profile:v.profile.id,steps:v.executionPlan.length,verified:v.availableVerifiedConnections.length};}),
      search_knowledge:await timed(async()=>{const v=text(await c.callTool({name:'search_knowledge',arguments:{query:'react three fiber canvas performance',packages:{'@react-three/fiber':'9.8.2'}}}));return {primary:v.primary.id,results:v.results.length};}),
      list_integrations:await timed(async()=>text(await c.callTool({name:'list_integrations',arguments:{}})).integrations.length),
      list_capability_profiles:await timed(async()=>text(await c.callTool({name:'list_capability_profiles',arguments:{}})).profiles.length),
      read_recipe:await timed(async()=>text(await c.callTool({name:'read_recipe',arguments:{id:'cinematic-portfolio'}})).steps.length),
      get_client_setup_guide:await timed(async()=>text(await c.callTool({name:'get_client_setup_guide',arguments:{client:'codex',integration:'context7'}})).commands),
      resource_read:await timed(async()=>JSON.parse((await c.readResource({uri:'soren://knowledge/r3f-v9'})).contents[0].text).id),
    };
    const bad=await c.callTool({name:'read_recipe',arguments:{id:'../../.env'}}).then(x=>({isError:Boolean(x.isError)}),e=>({rejected:String(e.message).slice(0,120)}));
    r.traversalRejected=bad;
  }else{
    r.v3CallWithoutFlag=await c.callTool({name:'plan_toolchain',arguments:{task:'3d portfolio'}}).then(x=>({isError:Boolean(x.isError),text:x.content?.[0]?.text?.slice(0,120)}),e=>({rejected:String(e.message).slice(0,120)}));
  }
  out[tag]=r;
  await c.close();
}
fs.writeFileSync('docs/evidence/v3/sdk-protocol-probe.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({off:{tools:out.flagOff.tools.length,res:out.flagOff.resourceCount,v3:out.flagOff.v3CallWithoutFlag},on:{tools:out.flagOn.tools.length,res:out.flagOn.resourceCount,p95:Object.fromEntries(Object.entries(out.flagOn.v3).map(([k,v])=>[k,v.p95Ms])),legacyP95:out.flagOn.legacy.route_task.p95Ms,trav:out.flagOn.traversalRejected}}));
