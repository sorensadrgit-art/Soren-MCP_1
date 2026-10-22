/** Read-only MCP inventory capture: initialize, tools/list, resources/list, prompts/list.
 * Never calls tools with side effects and never sends credentials.
 * Usage: node scripts/capture-mcp-inventory.mjs <endpoint> [output.json]
 */
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const sha=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');

export function assertInventoryEndpoint(raw){
  const url=new URL(raw);
  const loopback=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&loopback))throw new Error('Inventory endpoint must be HTTPS or explicit loopback HTTP');
  if(url.username||url.password)throw new Error('Inventory endpoint must not embed credentials');
  return url.href;
}

async function rpc(endpoint,method,params,id){
  const response=await fetch(endpoint,{method:'POST',signal:AbortSignal.timeout(20000),headers:{
    'Content-Type':'application/json','Accept':'application/json, text/event-stream','MCP-Protocol-Version':'2025-06-18'},
    body:JSON.stringify({jsonrpc:'2.0',id,method,params})});
  let body=await response.text();
  const events=body.split(/\r?\n/).filter(line=>line.startsWith('data:'));
  if(events.length)body=events.at(-1).slice(5).trim();
  try{return {status:response.status,data:JSON.parse(body)};}catch{return {status:response.status,data:{error:{message:'invalid_json'}}};}
}

export async function captureInventory(rawEndpoint){
  const endpoint=assertInventoryEndpoint(rawEndpoint);
  const init=await rpc(endpoint,'initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'soren-inventory-capture',version:'1'}},1);
  const tools=await rpc(endpoint,'tools/list',{},2);
  const resources=await rpc(endpoint,'resources/list',{},3);
  const prompts=await rpc(endpoint,'prompts/list',{},4);
  const toolRows=(tools.data?.result?.tools||[]).map(t=>({name:t.name,title:t.title??null,annotations:t.annotations??null,
    inputSchemaSha256:sha(t.inputSchema??null),inputSchema:t.inputSchema??null}));
  const resourceRows=(resources.data?.result?.resources||[]).map(r=>({uri:r.uri,name:r.name,mimeType:r.mimeType??null}));
  return {
    capturedAt:new Date().toISOString(),endpoint,
    serverInfo:init.data?.result?.serverInfo??null,
    protocolVersion:init.data?.result?.protocolVersion??null,
    instructionsSha256:init.data?.result?.instructions?sha(init.data.result.instructions):null,
    status:{initialize:init.status,tools:tools.status,resources:resources.status,prompts:prompts.status},
    tools:toolRows,toolNames:toolRows.map(t=>t.name),toolsSha256:sha(toolRows),
    resources:resourceRows,resourceUris:resourceRows.map(r=>r.uri),resourcesSha256:sha(resourceRows),
    prompts:(prompts.data?.result?.prompts||[]).map(p=>p.name),
    promptsError:prompts.data?.error?.message??null,
  };
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const report=await captureInventory(process.argv[2]||'https://soren-shared-mcp-skills.vercel.app/api/mcp');
  const out=JSON.stringify(report,null,2)+'\n';
  if(process.argv[3])fs.writeFileSync(process.argv[3],out);
  console.log(JSON.stringify({endpoint:report.endpoint,server:report.serverInfo,tools:report.toolNames.length,resources:report.resourceUris.length,prompts:report.prompts.length,toolsSha256:report.toolsSha256}));
}
