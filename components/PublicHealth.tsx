"use client";
import {useEffect,useState} from 'react';
import {getJSON} from './ManagementGate';
export default function PublicHealth(){
  const [snapshot,setSnapshot]=useState<any>(null),[error,setError]=useState(''),[pending,setPending]=useState(true),[refresh,setRefresh]=useState(0);
  useEffect(()=>{let current=true;setPending(true);Promise.all([getJSON('/api/health/live'),getJSON('/api/health/ready')]).then(([live,ready])=>{if(current){setSnapshot({live,ready,checkedAt:new Date().toISOString()});setError('');}}).catch(e=>{if(current)setError(e.message);}).finally(()=>{if(current)setPending(false);});return()=>{current=false;};},[refresh]);
  return <section className="opsPanel"><div className="panelHeading"><h2>Public gateway</h2><button disabled={pending} onClick={()=>setRefresh(x=>x+1)}>REFRESH HEALTH</button></div>{pending&&<p role="status">Reading current health…</p>}{error&&<p className="error" role="alert">Health is UNKNOWN. {error}</p>}{snapshot&&<><p>Liveness: {snapshot.live.status??'UNKNOWN'} · Readiness: {snapshot.ready.status??'UNKNOWN'} · Capability mode: {snapshot.ready.capabilityMode??'UNKNOWN'}</p><p>Observed in this browser: {snapshot.checkedAt}</p><pre>{JSON.stringify(snapshot.ready,null,2)}</pre></>}<p>The public view contains no workspace diagnostics. Missing observations, schedulers, and desktop reports remain UNKNOWN.</p></section>;
}
