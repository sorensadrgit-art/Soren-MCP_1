"use client";
import {useState} from "react";
import ConnectionGuide from "../components/ConnectionGuide";

type Candidate={name:string;provider:string;providers?:string[];description?:string;score?:number};
type RouteResult={primary?:{name:string;description?:string}|null;publicSearchQuery?:string;
  discoveredCandidates?:Candidate[];providerStatus?:Record<string,{status:string;count:number}>;
  nextAction?:string;safetyPolicy?:string};
const SAMPLES=["Cinematic GSAP WebGL and Three.js","React accessibility and Playwright testing","Python agent MCP integration"];


function decodeMcp(text:string):RouteResult{
  let outer:any;
  try {outer=JSON.parse(text)}
  catch {
    const line=text.split(/\r?\n/).find(s=>s.startsWith("data:"));
    if(!line)throw new Error("Unexpected MCP response format");
    outer=JSON.parse(line.slice(5).trim());
  }
  if(outer?.error)throw new Error(outer.error.message||"MCP error");
  const raw=outer?.result?.content?.find((c:any)=>c.type==="text")?.text;
  if(!raw)throw new Error("No skill routing results returned");
  return JSON.parse(raw);
}

export default function Home(){
  const [query,setQuery]=useState(SAMPLES[0]),[pending,setPending]=useState(false);
  const [result,setResult]=useState<RouteResult|null>(null),[error,setError]=useState("");
  async function routeTask(value=query){
    const task=value.trim();if(task.length<2)return;
    setQuery(task);setPending(true);setResult(null);setError("");
    try{
      const response=await fetch("/api/mcp",{
        method:"POST",cache:"no-store",
        headers:{"Content-Type":"application/json","Accept":"application/json, text/event-stream","MCP-Protocol-Version":"2025-06-18"},
        body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",
          params:{name:"route_task",arguments:{task,discovery:"federated"}}}),
      });
      if(!response.ok)throw new Error("Router endpoint returned HTTP "+response.status);
      setResult(decodeMcp(await response.text()));
    }catch(e){setError(e instanceof Error?e.message:"Routing request failed")}
    finally{setPending(false)}
  }
  return <div className="shell">
    <div className="ambient ambientA" aria-hidden="true"/>
    <div className="ambient ambientB" aria-hidden="true"/>
    <header className="nav">
      <a href="/" className="identity"><span className="mark">S/</span><span>SOREN <b>UNIVERSAL</b></span></a>
      <div className="navRight"><span className="minor">READ-ONLY MCP</span><a className="navLink" href="/connect">CONNECT</a><a className="navLink" href="/health">HEALTH</a><a className="navLink" href="/updates">UPDATES</a><a className="navLink" href="https://skills.sh/docs/api" target="_blank" rel="noreferrer">DOCUMENTATION ↗</a></div>
    </header>
    <main>
      <div className="eyebrow"><span className="line"/> AGENT CAPABILITY INFRASTRUCTURE / V2</div>
      <h1>One endpoint.<br/><em>Every capability.</em></h1>
      <p className="subtitle">An intelligent gateway between your AI agents and external skill libraries. Discover, rank, inspect and route capabilities—without maintaining a permanent desktop process.</p>
      <div className="features">
        <div><span className="metric">04</span><small>APPROVED LOCAL SKILLS</small></div>
        <div><span className="metric">03</span><small>EXTERNAL SKILL SOURCES</small></div>
        <div><span className="metric">08</span><small>MCP TOOLS</small></div>
        <div><span className="metric accent">0</span><small>AUTO-INSTALLED SKILLS</small></div>
      </div>
      <section className="terminal" aria-label="Test Universal Skill Router">
        <div className="terminalHead"><span><i className="indicator"/> UNIVERSAL ROUTER / LIVE QUERY</span><span className="terminalMeta">PROGRESSIVE DISCLOSURE • READ-ONLY</span></div>
        <form onSubmit={e=>{e.preventDefault();void routeTask()}} className="queryForm">
          <label htmlFor="task">DESCRIBE A TASK</label>
          <div className="queryRow">
            <input id="task" value={query} maxLength={500} onChange={e=>setQuery(e.target.value)} placeholder="What do you want your agents to build?"/>
            <button type="submit" disabled={pending||query.trim().length<2}>{pending?"SEARCHING…":"ROUTE TASK ↗"}</button>
          </div>
          <div className="examples">{SAMPLES.map(t=><button type="button" key={t} onClick={()=>void routeTask(t)}>{t}</button>)}</div>
        </form>
        {pending&&<div className="statusPanel" role="status"><span className="pulse"/> Checking external skill providers and ranking matches…</div>}
        {error&&<div className="error" role="alert">{error}</div>}
        {result&&<div className="results" aria-live="polite">
          <div className="searchMeta"><span>PUBLIC TOPICS: {result.publicSearchQuery||"LOCAL ONLY"}</span><span>{result.discoveredCandidates?.length??0} CANDIDATES</span></div>
          {result.primary&&<div className="primary"><span className="smallLabel">APPROVED PRIMARY SKILL</span><h2>{result.primary.name}</h2><p>{result.primary.description}</p></div>}
          <div className="suggestions"><div className="smallLabel">EXTERNAL CANDIDATES · REVIEW REQUIRED</div>
            {!result.discoveredCandidates?.length?<p className="noMatches">No external candidates found. Your curated skills remain available.</p>:
              result.discoveredCandidates.slice(0,5).map(item=><div className="suggestion" key={item.provider+item.name}>
                <div className="suggestionHeader"><strong>{item.name}</strong><span>{item.providers?.join(" + ")||item.provider}</span></div>
                <p>{item.description||"Source metadata only. Inspect before loading."}</p>
                <span className="review">UNREVIEWED · NOT INSTALLED</span>
              </div>)}
          </div>
          <div className="providerBar">{Object.entries(result.providerStatus||{}).map(([name,status])=><span key={name} className={status.status==="ok"?"providerOk":"providerWarn"}>{name} · {status.status}</span>)}</div>
          <p className="notice">{result.safetyPolicy}</p>
        </div>}
      </section>
      <section className="providers">
        <div className="sectionTitle"><div><span className="tiny">DISCOVERY ADAPTERS</span><h2>Federated intelligence.</h2></div><span className="minor">01 / PROVIDER NETWORK</span></div>
        <div className="providerCards">
          <article><div className="providerIcon">S/</div><h3>Skills.sh</h3><p>Official catalog search, trends, skill files and independent security audits.</p><span>VERCEL OIDC API</span></article>
          <article><div className="providerIcon">M.</div><h3>SkillsMP</h3><p>Community discovery through a public, read-only remote MCP server.</p><span>STREAMABLE HTTP MCP</span></article>
          <article><div className="providerIcon">A*</div><h3>Anthropic Skills</h3><p>First-party skills discovered through GitHub's contents API.</p><span>PUBLIC GITHUB API</span></article>
        </div>
      </section>
      <ConnectionGuide/>
      <footer><span>SOREN SYSTEMS © 2026</span><span>Factory Droid · Codex · Antigravity · OpenCode · Claude Code · Qwen Code</span></footer>
    </main>
  </div>;
}
