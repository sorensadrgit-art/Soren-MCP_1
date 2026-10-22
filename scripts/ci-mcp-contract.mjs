#!/usr/bin/env node
/** Starts the built app on loopback with SOREN_V3_TOOLS on or off, then runs the MCP wire verifiers against it.
 * Usage: node scripts/ci-mcp-contract.mjs --flag off|on [--port 3917]
 * Requires a prior `npm run build`. Makes no requests outside loopback when no gateway store is configured.
 */
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {TOOL_NAMES,V3_TOOL_NAMES} from '../lib/client-contract.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=name=>{const i=process.argv.indexOf('--'+name);return i>0?process.argv[i+1]:undefined;};
const flag=arg('flag');
if(!['on','off'].includes(flag))throw new Error('Usage: node scripts/ci-mcp-contract.mjs --flag off|on [--port 3917]');
const port=Number(arg('port')??3917);
const endpoint=`http://127.0.0.1:${port}/api/mcp`;
const env={...process.env};
if(flag==='on')env.SOREN_V3_TOOLS='1';else delete env.SOREN_V3_TOOLS;
env.SOREN_CAPABILITY_MODE??='public_only';

const server=spawn(process.execPath,[path.join(ROOT,'node_modules','next','dist','bin','next'),'start','-p',String(port),'-H','127.0.0.1'],{cwd:ROOT,env,stdio:['ignore','pipe','pipe']});
let serverLog='';
server.stdout.on('data',d=>{serverLog+=d;});server.stderr.on('data',d=>{serverLog+=d;});
const stop=()=>{if(server.exitCode===null)server.kill();};
process.on('exit',stop);

async function ready(){
  const deadline=Date.now()+90000;
  while(Date.now()<deadline){
    if(server.exitCode!==null)throw new Error('server exited early:\n'+serverLog.slice(-2000));
    try{const r=await fetch(`http://127.0.0.1:${port}/`,{signal:AbortSignal.timeout(3000)});if(r.ok)return;}catch{}
    await new Promise(r=>setTimeout(r,500));
  }
  throw new Error('server not ready:\n'+serverLog.slice(-2000));
}
const run=(script)=>new Promise(resolve=>{
  const child=spawn(process.execPath,[path.join(ROOT,'scripts',script),endpoint],{cwd:ROOT,env,stdio:'inherit'});
  child.on('exit',code=>resolve(code??1));
});

let failures=0;
try{
  await ready();
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-06-18'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}})});
  let body=await response.text();const events=body.split(/\r?\n/).filter(l=>l.startsWith('data:'));if(events.length)body=events.at(-1).slice(5);
  const names=(JSON.parse(body).result?.tools??[]).map(t=>t.name);
  const expected=flag==='on'?[...TOOL_NAMES,...V3_TOOL_NAMES]:[...TOOL_NAMES];
  if(JSON.stringify(names)!==JSON.stringify(expected)){failures++;console.log(`FAIL flag ${flag}: expected ${expected.length} tools, got ${names.length}: ${names.join(',')}`);}
  else console.log(`PASS flag ${flag}: exactly ${names.length} tools in contract order`);
  for(const script of ['verify-mcp.mjs','verify-capability-plan.mjs']){
    const code=await run(script);
    if(code!==0){failures++;console.log(`FAIL ${script} exited ${code}`);}
  }
}catch(error){failures++;console.log('FAIL '+String(error?.message||error));}
finally{stop();}
console.log(JSON.stringify({flag,endpoint,failures}));
process.exitCode=failures?1:0;
