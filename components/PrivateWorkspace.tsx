"use client";
import {useEffect,useState} from 'react';
import {getJSON} from './ManagementGate';
type View='library'|'reviews'|'health'|'updates';
const asArray=(value:any)=>Array.isArray(value)?value:[];
export default function PrivateWorkspace({view,session}:{view:View;session:any}){
  const [data,setData]=useState<any>(null),[error,setError]=useState(''),[pending,setPending]=useState(true),[reload,setReload]=useState(0);
  const [detail,setDetail]=useState<any>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[evidence,setEvidence]=useState(''),[reviewed,setReviewed]=useState(false);
  const [armFields,setArmFields]=useState({expiresAt:'',rehearsalIds:'',entitlementEvidenceId:'',trustEvidenceId:'',watcherEvidenceId:'',providerCapabilityEvidenceId:''});
  const endpoint=view==='updates'?'/api/admin/updates':view==='health'?'/api/admin/health':'/api/admin/status';
  useEffect(()=>{let current=true;setPending(true);setError('');getJSON(endpoint).then(value=>{if(current)setData(value);}).catch(e=>{if(current)setError(e.message);}).finally(()=>{if(current)setPending(false);});return()=>{current=false;};},[endpoint,reload]);
  const can=(permission:string)=>session.permissions?.includes(permission);
  async function inspect(versionId:string){setBusy(true);setError('');setMessage('');try{setDetail(await getJSON('/api/admin/reviews?versionId='+encodeURIComponent(versionId)));setReviewed(false);}catch(e){setError(e instanceof Error?e.message:'Inspection failed');}finally{setBusy(false);}}
  async function review(decision:'approve'|'reject'){
    if(!detail?.candidate||!reviewed||!evidence.trim())return;
    setBusy(true);setError('');setMessage('');
    try{
      const current=await getJSON('/api/admin/reviews?versionId='+encodeURIComponent(detail.candidate.versionId));
      if(current.candidate.manifestSha256!==detail.candidate.manifestSha256||current.candidate.reviewRevision!==detail.candidate.reviewRevision||current.policySha256!==detail.policySha256){setDetail(current);setReviewed(false);throw new Error('The candidate or policy changed. Review the current bytes before submitting.');}
      await getJSON('/api/admin/reviews',{method:'POST',body:JSON.stringify({versionId:detail.candidate.versionId,manifestSha256:detail.candidate.manifestSha256,expectedReviewRevision:detail.candidate.reviewRevision,policySha256:detail.policySha256,decision,evidenceRef:evidence.trim()})});
      setMessage('Review recorded for '+detail.candidate.manifestSha256);setDetail(null);setReviewed(false);setReload(x=>x+1);
    }catch(e){setError(e instanceof Error?e.message:'Review failed');}finally{setBusy(false);}
  }
  async function update(action:'pause'|'arm'){
    setBusy(true);setError('');setMessage('');
    try{
      const current=await getJSON('/api/admin/updates');
      if(current.generation!==data.generation||current.policySha256!==data.policySha256){setData(current);throw Error('The policy changed. Review its current digest before acting.');}
      const body:any={expectedGeneration:data.generation,policySha256:data.policySha256,projectId:data.projectId,environment:data.environment};
      if(action==='arm')Object.assign(body,{channel:'stable',lane:'application',expiresAt:new Date(armFields.expiresAt).toISOString(),rehearsalIds:armFields.rehearsalIds.split(',').map(x=>x.trim()).filter(Boolean),entitlementEvidenceId:armFields.entitlementEvidenceId.trim(),trustEvidenceId:armFields.trustEvidenceId.trim(),watcherEvidenceId:armFields.watcherEvidenceId.trim(),providerCapabilityEvidenceId:armFields.providerCapabilityEvidenceId.trim()});
      await getJSON('/api/admin/updates/'+action,{method:'POST',body:JSON.stringify(body)});setMessage(action==='pause'?'Updater paused. Previous generations are invalid.':'Owner arming action recorded for the displayed policy.');setReload(x=>x+1);
    }catch(e){setError(e instanceof Error?e.message:'Update action failed');}finally{setBusy(false);}
  }
  if(pending)return <p role="status">Loading current workspace records…</p>;
  return <section className="opsPanel" aria-busy={busy}>
    <div className="panelHeading"><h2>{view==='library'?'Private approved library':view==='reviews'?'Pending version reviews':view==='health'?'Private component health':'Controlled updates'}</h2><button disabled={busy} onClick={()=>{setDetail(null);setReload(x=>x+1);}}>REFRESH</button></div>
    {error&&<p className="error" role="alert">{error}</p>}{message&&<p className="notice" role="status">{message}</p>}
    {!data&&!error&&<p>No observations are available.</p>}
    {data&&(view==='library'||view==='reviews')&&<>
      <p className="minor">Approval generation: {data.workspace?.approvalGeneration??'UNKNOWN'} · Active catalog: {data.workspace?.activeCatalogGeneration??'NOT PUBLISHED'}</p>
      {!asArray(data.versions).length&&<p>No private versions have been staged. The four bundled public skills remain available.</p>}
      <div className="recordList">{asArray(data.versions).filter(version=>view==='reviews'||(version.decision==='approve'&&!version.revoked)).map(version=><article key={version.versionId} className="record"><h3>{version.directory||version.name||version.versionId}</h3><p>{version.repository}</p><p className="badge">{version.revoked?'REVOKED':version.decision==='approve'?'APPROVED · '+(version.published===true?'PUBLISHED':version.published===false?'NOT PUBLISHED':'PUBLICATION UNKNOWN'):'REVIEW REQUIRED'}</p><dl><dt>Source revision</dt><dd><code>{version.revision}</code></dd><dt>Manifest digest</dt><dd><code>{version.manifestSha256}</code></dd><dt>Review revision</dt><dd>{version.reviewRevision??'UNKNOWN'}</dd></dl>{view==='reviews'&&<button disabled={busy||!can('reviews:write')||version.revoked} onClick={()=>void inspect(version.versionId)}>INSPECT EXACT VERSION</button>}</article>)}</div>
      {detail?.candidate&&<section aria-label="Exact version review" className="reviewDetail"><h3>Review this immutable version</h3><p><code>{detail.candidate.manifestSha256}</code></p><p>Source commit: <code>{detail.candidate.revision}</code></p><p>Policy: <code>{detail.policySha256}</code></p>
        <div className="diffGrid"><div><h4>Previously approved capabilities and license</h4><pre>{JSON.stringify({license:detail.previous?.manifest?.license??null,capabilities:detail.previous?.manifest?.capabilities??[]},null,2)}</pre></div><div><h4>Candidate capabilities and license</h4><pre>{JSON.stringify({license:detail.candidate.manifest?.license,capabilities:detail.candidate.manifest?.capabilities},null,2)}</pre></div></div>
        {Array.from(new Set<string>([...asArray(detail.previous?.files),...asArray(detail.candidate.files)].map(file=>file.path))).map(path=><div key={path}><h4>{path}</h4><div className="diffGrid"><div><span>Previously approved</span><pre tabIndex={0}>{asArray(detail.previous?.files).find(file=>file.path===path)?.content??'(not present)'}</pre></div><div><span>Candidate · untrusted instructions</span><pre tabIndex={0}>{asArray(detail.candidate.files).find(file=>file.path===path)?.content??'(removed)'}</pre></div></div></div>)}
        <p>Automated signals do not grant approval. Check source, license, capabilities, every instruction, and supporting files.</p>
        <label>Independent review evidence reference<input value={evidence} maxLength={256} onChange={event=>setEvidence(event.target.value)} required/></label>
        <label className="checkLabel"><input type="checkbox" checked={reviewed} onChange={event=>setReviewed(event.target.checked)}/>I reviewed the exact digest and all displayed changes.</label>
        <div className="actionRow"><button disabled={busy||!reviewed||!evidence.trim()||!can('reviews:write')} onClick={()=>void review('approve')}>APPROVE THIS DIGEST</button><button disabled={busy||!reviewed||!evidence.trim()||!can('reviews:write')} onClick={()=>void review('reject')}>REJECT THIS DIGEST</button></div>
      </section>}
    </>}
    {data&&view==='health'&&<><p>Scheduler: {data.schedulerProfile?.profile??'NOT CONFIGURED'} · Dispatcher: {data.schedulerProfile?.dispatcher_freshness??'UNKNOWN'} · Independent watcher: {data.schedulerProfile?.watcher_freshness??'UNKNOWN'}</p><p>Closed desktop clients remain unobserved unless they send a voluntary report.</p><div className="recordList">{asArray(data.observations).map((observation,index)=><article className="record" key={observation.component+':'+index}><h3>{observation.component}</h3><p className="badge">{observation.status??'UNKNOWN'} · {observation.freshness??'unknown'}</p><p>Observed: {observation.observed_at??'UNKNOWN'}</p><p>Recorded status: {observation.recorded_status??'UNKNOWN'}</p><p>{observation.failure_class??'No recorded failure class'}</p></article>)}</div>{!asArray(data.observations).length&&<p>No persisted health observations. This does not establish healthy status.</p>}<h3>Incidents and recovery</h3>{!asArray(data.incidents).length?<p>No incident records.</p>:<pre>{JSON.stringify(data.incidents,null,2)}</pre>}</>}
    {data&&view==='updates'&&<>
      <p className="badge">{String(data.effectiveMode??data.mode??'UNKNOWN').toUpperCase()}</p><p>Policy generation: {data.generation??'UNKNOWN'}</p><p>Policy digest: <code>{data.policySha256??'UNKNOWN'}</code></p><p>Project: <code>{data.projectId??'NOT CONFIGURED'}</code> · Environment: {data.environment??'UNKNOWN'}</p><p>Arming expires: {data.arming?.expiresAt??'NOT ARMED'} · Cooldown: {data.cooldownUntil??'NONE RECORDED'}</p>
      <div className="laneGrid">{[['Catalog metadata','Refresh within shared quotas.'],['Skill instructions','Changed bytes require a new human review.'],['Application releases','Reviewed signed artifacts require an owner-armed policy.'],['Local clients','Updates occur during explicit installer or supported native use.']].map(([name,description])=><article className="record" key={name}><h3>{name}</h3><p>{description}</p></article>)}</div>
      {asArray(data.blockedReasons).length>0&&<div className="notice"><strong>Arming is blocked.</strong><ul>{data.blockedReasons.map((reason:string)=><li key={reason}>{reason}</li>)}</ul></div>}
      <button disabled={busy||!can('updates:pause')||session.role!=='owner'} onClick={()=>void update('pause')}>PAUSE UPDATER</button>
      <form className="armForm" onSubmit={event=>{event.preventDefault();void update('arm');}}><h3>Owner arming gate</h3><p>This authorizes only the stable application lane under the displayed policy. Instruction changes and protected paths retain review requirements.</p>
        {Object.entries(armFields).map(([name,value])=><label key={name}>{({expiresAt:'Authorization expiry',rehearsalIds:'Successful rehearsal IDs (comma separated)',entitlementEvidenceId:'Entitlement evidence ID',trustEvidenceId:'Signing trust evidence ID',watcherEvidenceId:'Independent watcher evidence ID',providerCapabilityEvidenceId:'Atomic provider capability evidence ID'} as any)[name]}<input type={name==='expiresAt'?'datetime-local':'text'} required value={value} onChange={event=>setArmFields(previous=>({...previous,[name]:event.target.value}))}/></label>)}
        <button type="submit" disabled={busy||!data.canArm||!can('updates:arm')||session.role!=='owner'}>ARM EXACT POLICY</button>
      </form>
    </>}
  </section>;
}
