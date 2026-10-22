import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
const ROUTE=pathToFileURL(path.join(ROOT,'app','api','mcp','route.ts')).href;

const CHILD=`
const calls=JSON.parse(await new Promise(resolve=>{let data='';process.stdin.on('data',c=>data+=c);process.stdin.on('end',()=>resolve(data));}));
const mod=await import(${JSON.stringify(ROUTE)});
const out=[];let id=0;
for(const [method,params] of calls){
  const response=await mod.POST(new Request('http://127.0.0.1/api/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params:params??{}})}));
  let body=await response.text();const events=body.split(/\\r?\\n/).filter(line=>line.startsWith('data:'));if(events.length)body=events.at(-1).slice(5);
  let parsed;try{parsed=JSON.parse(body);}catch{parsed={raw:body};}
  out.push({status:response.status,body:parsed});
}
process.stdout.write('\\n@@RESULT@@'+JSON.stringify(out));
`;

/** Drive the real Next.js MCP route handler in an isolated child process. */
export function runRouteSession(calls,{v3=false,env={}}={}){
  const childEnv={...process.env,...env};
  if(v3)childEnv.SOREN_V3_TOOLS='1';else delete childEnv.SOREN_V3_TOOLS;
  // Node 22.9-22.17 only strips types behind a flag; the child imports route.ts directly.
  const strip=process.features?.typescript?[]:['--experimental-strip-types'];
  const result=spawnSync(process.execPath,[...strip,'--input-type=module','-e',CHILD],{cwd:ROOT,env:childEnv,input:JSON.stringify(calls),encoding:'utf8',timeout:90000,maxBuffer:32*1024*1024});
  const marker=(result.stdout||'').lastIndexOf('@@RESULT@@');
  if(marker<0)throw new Error('route session failed: '+String(result.stderr||result.error||'').slice(0,800));
  return JSON.parse(result.stdout.slice(marker+'@@RESULT@@'.length));
}

export const INIT=['initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'soren-contract-test',version:'1'}}];
export const toolCall=(name,args={})=>['tools/call',{name,arguments:args}];
export function toolValue(entry){
  const text=entry.body?.result?.content?.find(item=>item.type==='text')?.text;
  try{return JSON.parse(text);}catch{return text;}
}
