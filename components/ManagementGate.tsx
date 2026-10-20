"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
export async function getJSON(path:string,options:RequestInit={}){
  const response=await fetch(path,{...options,credentials:'same-origin',cache:'no-store',headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});
  const value=await response.json().catch(()=>({error:'Invalid service response'}));
  if(!response.ok)throw new Error(response.status===409?'The record changed. Refresh and review the current digest.':response.status===401?'Sign in again. The management session expired.':response.status===403?'Permission denied for this action.':value.error||'Service unavailable');
  return value;
}
export default function ManagementGate({children}:{children:(session:any)=>React.ReactNode}){
  const [session,setSession]=useState<any>(null),[error,setError]=useState(''),[pending,setPending]=useState(true),[attempt,setAttempt]=useState(0);
  const [loginFailed,setLoginFailed]=useState(false);
  useEffect(()=>{setLoginFailed(new URLSearchParams(window.location.search).get('auth_error')==='login_failed');},[]);
  useEffect(()=>{let current=true;setPending(true);getJSON('/api/auth/session').then(value=>{if(current){setSession(value);setError('');}}).catch(e=>{if(current)setError(e.message);}).finally(()=>{if(current)setPending(false);});return()=>{current=false;};},[attempt]);
  if(pending)return <p role="status">Checking management session…</p>;
  if(error)return <div className="error" role="alert">{error} <button onClick={()=>setAttempt(x=>x+1)}>Retry</button> <a href="/api/auth/login">Sign in again</a></div>;
  if(!session?.authenticated)return <section className="opsPanel"><h2>{session?.configured?'Sign in to manage your workspace.':'Private management is not configured.'}</h2>{loginFailed&&<p className="error" role="alert">Sign-in could not verify a current management identity and workspace grant. Check the configured client, resource, and owner access before retrying.</p>}<p>{session?.reason||'Use the configured owner or reviewer OAuth identity. Agent read credentials cannot approve skills or arm updates.'}</p>{session?.configured&&<a className="actionLink" href="/api/auth/login">SIGN IN WITH OAUTH</a>}<p><Link href="/connect">Public bundled skills and connection guidance remain available.</Link></p><p className="minor">No private records are loaded before authentication.</p></section>;
  return <><div className="accountBar"><span>Signed in · {session.role}</span><form action="/api/auth/logout" method="post"><button type="submit">SIGN OUT</button></form></div>{children(session)}</>;
}
