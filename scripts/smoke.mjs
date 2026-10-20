import {discoverSkills,routeTaskFederated,searchMcpServers,inspectCandidate} from "../lib/federation.mjs";
const query="Create a GSAP WebGL Three.js website";
const r=await discoverSkills(query,{providers:["skillsmp","anthropic"],limit:6});
console.log("PROVIDER_STATUS",JSON.stringify(r.providers));
console.log("RESULT_COUNT",r.count,"TOP_NAMES",r.results.slice(0,4).map(x=>x.name));
const route=await routeTaskFederated(query,"codex",{providers:["skillsmp"],timeoutMs:4200});
console.log("ROUTED_PRIMARY",route.primary?.name,"REMOTE_CANDIDATES",route.discoveredCandidates.length);
if(r.results.some(x=>x.provider==="skillsmp")){
 const c=r.results.find(x=>x.provider==="skillsmp");
 const p=await inspectCandidate("skillsmp",c.id);
 console.log("INSPECT",p.provider,p.reviewStatus,p.instructions===null);
}
const m=await searchMcpServers("mcp",{limit:2});
console.log("MCP_REGISTRY_COUNT",m.count,"STATUS",m.status||"ok");
