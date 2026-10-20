"use client";
import {useState} from 'react';
import {CLIENT_SNIPPETS,ENDPOINT} from '../lib/client-contract.mjs';
const clients=[
  {id:'factory',label:'Factory Droid',path:'~/.factory/mcp.json',version:'0.244.0'},
  {id:'codex',label:'Codex Desktop',path:'$CODEX_HOME/config.toml or ~/.codex/config.toml',version:'0.157.1'},
  {id:'antigravity',label:'Antigravity',path:'~/.gemini/config/mcp_config.json',version:'1.4.2'},
  {id:'opencode',label:'OpenCode',path:'~/.config/opencode/opencode.json',version:'2.0.32'},
  {id:'claude',label:'Claude Code',path:'~/.claude.json (user scope)',version:'2.1.283'},
  {id:'qwen',label:'Qwen Code',path:'~/.qwen/settings.json',version:'0.25.3'},
] as const;
export default function ConnectionGuide(){
  const [active,setActive]=useState(0),[message,setMessage]=useState(''),[checking,setChecking]=useState(false),[gateway,setGateway]=useState('Gateway: UNKNOWN · not checked in this browser.');
  const client=clients[active];
  async function copy(value:string,label:string){try{await navigator.clipboard.writeText(value);setMessage(label+' copied.');}catch{setMessage('Clipboard unavailable. Select and copy the text manually.');}}
  async function check(){setChecking(true);setGateway('Checking gateway…');try{const response=await fetch('/api/health/ready',{cache:'no-store'});const result=await response.json();if(!response.ok)throw Error();setGateway('Gateway: '+(result.status??'UNKNOWN')+' · '+(result.capabilityMode??result.capability??'unknown')+' · observed '+new Date().toISOString());}catch{setGateway('Gateway: UNKNOWN · check failed. Retry when the service is available.');}finally{setChecking(false);}}
  return <section className="clientConnect" id="connect" aria-labelledby="connect-title">
    <div className="sectionTitle"><div><span className="tiny">SIX DESKTOP AGENTS · ONE ENDPOINT</span><h2 id="connect-title">Connect without conflicts.</h2></div><span className="minor">SETUP</span></div>
    <p className="setupIntro">Merge only <strong>soren-skills</strong> into your existing configuration. Preserve your other servers and instructions. Formats below are version-specific references; the local installer inspects the effective scope before writing.</p>
    <div className="connectPanel"><div className="clientTabs" role="group" aria-label="Choose desktop agent">{clients.map((item,index)=><button key={item.id} type="button" aria-pressed={active===index} aria-controls="client-config" onClick={()=>{setActive(index);setMessage('');}}>{item.label}</button>)}</div>
      <div className="clientConfig" id="client-config"><div className="configHeader"><span>CONFIG FILE</span><code>{client.path}</code></div>
        <p className="minor">Format fixture: {client.version} · Native invocation: NOT VERIFIED</p>
        <pre role="region" tabIndex={0} aria-label={client.label+' MCP configuration snippet'}><code>{CLIENT_SNIPPETS[client.id]}</code></pre>
        <div className="configActions"><span role="status" aria-live="polite">{message}</span><button type="button" onClick={()=>void copy(CLIENT_SNIPPETS[client.id],client.label+' configuration')}>COPY CONFIGURATION</button></div>
      </div></div>
    <div className="steps"><div><span>01 / INSPECT</span><p>Run the one-shot installer from the reviewed checkout. Unknown versions and conflicting files require a new plan.</p><code>npm run agents:inspect</code></div><div><span>02 / VERIFY</span><p>Configuration, protocol exchange, and an actual agent invocation are separate checks. The cloud cannot observe a closed desktop client.</p></div><div><span>03 / USE</span><p>Call <code>route_task</code> once for substantial work. Read approved skills as reference and use your agent’s native tools.</p></div></div>
    <p className="setupCaution">External suggestions require review. The installer exits after use; no resident router or desktop scheduler is installed.</p>
    <p role="status">{gateway}</p><button type="button" disabled={checking} onClick={()=>void check()}>{checking?'CHECKING…':'CHECK GATEWAY'}</button>
    <div className="endpoint"><div><span className="tiny">SHARED AGENT ENDPOINT</span><div className="address">{ENDPOINT}</div></div><button type="button" onClick={()=>void copy(ENDPOINT,'Endpoint')}>COPY ENDPOINT</button></div>
  </section>;
}
