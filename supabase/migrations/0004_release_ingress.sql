-- Owner registration and fixed-identity evidence receipt. No owner, grant, trust or release is seeded.
create table public.update_environment_bounds (
  workspace_id uuid not null references public.workspaces(id), project_id text not null, environment text not null check(environment='production'),
  schema_version bigint not null check(schema_version>=0), minimum_secure_sequence bigint not null check(minimum_secure_sequence>=0), active_deployment_id text not null,
  actor_id uuid not null references public.principals(id), updated_at timestamptz not null default now(), primary key(workspace_id,project_id,environment)
);
alter table public.update_environment_bounds enable row level security;
revoke all on public.update_environment_bounds from public,anon,authenticated,soren_gateway;
grant all on public.update_environment_bounds to service_role;
create table public.update_release_evidence (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, release_id text not null,
  principal_id uuid not null references public.principals(id), kind text not null, payload_sha256 text not null check(payload_sha256 ~ '^[a-f0-9]{64}$'),
  body jsonb not null, observed_at timestamptz not null, created_at timestamptz not null default now(),
  foreign key(workspace_id,release_id) references public.update_release_records(workspace_id,release_id), unique(workspace_id,release_id,payload_sha256)
);
alter table public.update_release_evidence enable row level security;
revoke all on public.update_release_evidence from anon,authenticated;
grant all on public.update_release_evidence to service_role;
create trigger immutable_record before update or delete on public.update_release_evidence for each row execute function public.immutable_record();
create unique index one_release_probe_observation on public.update_release_evidence(workspace_id,release_id,kind,observed_at) where kind in ('candidate_probe','control_probe','independent_probe');

create function public.update_register_release(p_workspace_id uuid,p_actor uuid,p_record jsonb,p_policy jsonb,p_expected_generation bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare release_manifest jsonb:=p_record->'manifest'; current_policy jsonb; previous public.update_release_records; existing public.update_release_records; generation bigint; secure_floor bigint;
begin
  perform public.assert_human(p_workspace_id,p_actor,true);
  if release_manifest->>'projectId' is distinct from p_policy->>'projectId' or release_manifest->>'environment' is distinct from 'production' or release_manifest->>'policySha256' is distinct from p_policy->>'policySha256' or p_record->>'manifestSha256' !~ '^[a-f0-9]{64}$' then raise exception 'release_registration_scope'; end if;
  insert into public.update_policies(workspace_id,project_id,environment,generation,policy) values(p_workspace_id,release_manifest->>'projectId','production',0,p_policy||jsonb_build_object('generation',0,'mode','observe','arming',null)) on conflict do nothing;
  select p.policy into current_policy from public.update_policies p where p.workspace_id=p_workspace_id and p.project_id=release_manifest->>'projectId' and p.environment='production' for update;
  if (current_policy->>'generation')::bigint is distinct from p_expected_generation or current_policy->>'policySha256' is distinct from release_manifest->>'policySha256' then raise exception 'policy_conflict' using errcode='40001'; end if;
  select * into existing from public.update_release_records where workspace_id=p_workspace_id and release_id=release_manifest->>'releaseId';
  if found then
    if existing.manifest_sha256<>p_record->>'manifestSha256' then raise exception 'immutable_release_conflict'; end if;
    return jsonb_build_object('releaseId',existing.release_id,'manifestSha256',existing.manifest_sha256,'idempotent',true);
  end if;
  select coalesce(c.generation,0) into generation from public.workspaces w left join public.catalog_generations c on c.workspace_id=w.id and c.id=w.active_catalog_generation where w.id=p_workspace_id;
  if generation is distinct from (release_manifest->>'catalogGeneration')::bigint then raise exception 'catalog_generation_changed'; end if;
  select coalesce(max((snapshot->>'minimumSecureSequence')::bigint),0) into secure_floor from public.update_release_records where workspace_id=p_workspace_id and project_id=release_manifest->>'projectId' and environment='production';
  if (p_record#>>'{snapshot,minimumSecureSequence}')::bigint<secure_floor or (p_record#>>'{snapshot,releaseSequence}')::bigint<(p_record#>>'{snapshot,minimumSecureSequence}')::bigint then raise exception 'security_floor_downgrade'; end if;
  insert into public.update_environment_bounds(workspace_id,project_id,environment,schema_version,minimum_secure_sequence,active_deployment_id,actor_id)
    values(p_workspace_id,release_manifest->>'projectId','production',(p_record#>>'{snapshot,schemaVersion}')::bigint,(p_record#>>'{snapshot,minimumSecureSequence}')::bigint,release_manifest->>'expectedParentDeploymentId',p_actor)
    on conflict(workspace_id,project_id,environment) do update set schema_version=excluded.schema_version,minimum_secure_sequence=greatest(update_environment_bounds.minimum_secure_sequence,excluded.minimum_secure_sequence),active_deployment_id=excluded.active_deployment_id,actor_id=excluded.actor_id,updated_at=now();
  select * into previous from public.update_release_records where workspace_id=p_workspace_id and project_id=release_manifest->>'projectId' and environment='production' and snapshot->>'activeDeploymentId'=release_manifest->>'expectedParentDeploymentId' and state='STABLE' order by promoted_at desc limit 1;
  if found then p_record:=jsonb_set(p_record,'{snapshot,previous}',jsonb_build_object('wasStable',true,'deploymentId',previous.snapshot->>'activeDeploymentId','artifactSha256',previous.manifest->>'artifactSha256','manifestSha256',previous.manifest_sha256,'sourceCommit',previous.manifest->>'sourceCommit','schemaCompatibility',previous.manifest->'schemaCompatibility','projectId',previous.project_id,'environment',previous.environment,'sequence',(previous.snapshot->>'releaseSequence')::bigint,'authentic',true,'authorized',true,'identityVerifiedAt',previous.snapshot#>>'{identity,verifiedAt}')); end if;
  insert into public.update_release_records(workspace_id,release_id,project_id,environment,manifest_sha256,manifest,snapshot,state)
    values(p_workspace_id,release_manifest->>'releaseId',release_manifest->>'projectId','production',p_record->>'manifestSha256',release_manifest,p_record->'snapshot',p_record->>'state');
  insert into public.update_release_audit(workspace_id,event,body) values(p_workspace_id,'owner_release_registered',jsonb_build_object('actor',p_actor,'releaseId',release_manifest->>'releaseId','manifestSha256',p_record->>'manifestSha256'));
  return jsonb_build_object('releaseId',release_manifest->>'releaseId','manifestSha256',p_record->>'manifestSha256','state',p_record->>'state');
end $$;

create or replace function public.update_release_snapshot(p_workspace_id uuid,p_project_id text,p_environment text,p_release_id text) returns jsonb
language sql stable security definer set search_path='' as $$
  select r.snapshot || jsonb_build_object('policy',p.policy,'manifestSha256',r.manifest_sha256,'artifactSha256',r.manifest->>'artifactSha256','sourceCommit',r.manifest->>'sourceCommit','schemaVersion',b.schema_version,'minimumSecureSequence',b.minimum_secure_sequence,'activeDeploymentId',b.active_deployment_id,
    'catalogGeneration',coalesce(c.generation,0),'release',jsonb_build_object('releaseId',r.release_id,'state',r.state,'promotedAt',r.promoted_at,'rollbackCount',r.rollback_count,'projectId',r.project_id,'environment',r.environment,'deploymentId',b.active_deployment_id),
    'promotionCount24h',(select count(*) from public.update_release_operations o where o.workspace_id=p_workspace_id and o.project_id=p_project_id and o.environment=p_environment and o.body->>'kind'='promote' and o.status='APPLIED' and o.updated_at>now()-interval '24 hours'),
    'revokedDigests',coalesce((select jsonb_agg(digest) from public.update_release_revocations where workspace_id=p_workspace_id),'[]'::jsonb))
  from public.update_release_records r join public.update_policies p using(workspace_id,project_id,environment)
  join public.update_environment_bounds b using(workspace_id,project_id,environment)
  join public.workspaces w on w.id=r.workspace_id left join public.catalog_generations c on c.workspace_id=w.id and c.id=w.active_catalog_generation
  where r.workspace_id=p_workspace_id and r.project_id=p_project_id and r.environment=p_environment and r.release_id=p_release_id
$$;

create function public.update_assert_stage_or_rollback(p_workspace_id uuid,p_intent jsonb,p_reserved boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare release public.update_release_records; snapshot jsonb; prior public.update_release_records; stage_auth jsonb;
begin
  select * into release from public.update_release_records where workspace_id=p_workspace_id and release_id=p_intent->>'releaseId' for update;
  if not found or release.project_id is distinct from p_intent->>'projectId' or release.environment is distinct from p_intent->>'environment' then raise exception 'release_target_binding_changed'; end if;
  snapshot:=public.update_release_snapshot(p_workspace_id,release.project_id,release.environment,release.release_id);
  if snapshot is null or snapshot#>>'{policy,mode}'='paused' or (snapshot#>>'{policy,generation}')::bigint is distinct from (p_intent->>'policyGeneration')::bigint then raise exception 'release_policy_invalidated'; end if;
  if exists(select 1 from public.update_release_revocations where workspace_id=p_workspace_id and digest in (p_intent->>'manifestSha256',p_intent->>'artifactSha256')) then raise exception 'release_revoked'; end if;
  if p_intent->>'kind'='stage' then
    stage_auth:=snapshot->'stageAuthorization';
    if release.manifest_sha256 is distinct from p_intent->>'manifestSha256' or release.manifest->>'artifactSha256' is distinct from p_intent->>'artifactSha256' or stage_auth->>'manifestSha256' is distinct from release.manifest_sha256 or (stage_auth->>'expiresAt')::timestamptz<=now() or stage_auth->>'expiresAt' is null then raise exception 'stage_authorization_expired_or_changed'; end if;
    perform public.assert_human(p_workspace_id,(stage_auth->>'ownerId')::uuid,true);
  else
    if release.state<>'PROBATION' or release.promoted_at<now()-interval '30 minutes' or release.rollback_count<>(case when p_reserved then 1 else 0 end) then raise exception 'rollback_limit'; end if;
    select * into prior from public.update_release_records where workspace_id=p_workspace_id and manifest_sha256=release.snapshot#>>'{previous,manifestSha256}';
    if p_intent->>'authorizationMode'='manual' then
      stage_auth:=snapshot->'rollbackAuthorization';
      if stage_auth->>'manifestSha256' is distinct from prior.manifest_sha256 or stage_auth->>'targetDeploymentId' is distinct from p_intent->>'targetDeploymentId' or stage_auth->>'expectedParentDeploymentId' is distinct from p_intent->>'expectedParentDeploymentId' or (stage_auth->>'policyGeneration')::bigint is distinct from (snapshot#>>'{policy,generation}')::bigint or (stage_auth->>'expiresAt')::timestamptz<=now() or stage_auth->>'expiresAt' is null then raise exception 'manual_rollback_authorization_invalid'; end if;
      perform public.assert_human(p_workspace_id,(stage_auth->>'ownerId')::uuid,true);
    elsif snapshot#>>'{policy,mode}' is distinct from 'armed' or (snapshot#>>'{policy,arming,expiresAt}')::timestamptz<=now() then raise exception 'updates_not_armed'; end if;
    if not found or prior.manifest->>'artifactSha256' is distinct from p_intent->>'artifactSha256' or prior.manifest_sha256 is distinct from p_intent->>'manifestSha256' or prior.manifest->'schemaCompatibility' is distinct from snapshot#>'{previous,schemaCompatibility}' or (prior.snapshot->>'releaseSequence')::bigint<(snapshot->>'minimumSecureSequence')::bigint or (snapshot->>'schemaVersion')::bigint not between (prior.manifest#>>'{schemaCompatibility,minimum}')::bigint and (prior.manifest#>>'{schemaCompatibility,maximum}')::bigint then raise exception 'rollback_previous_changed'; end if;
    if snapshot#>>'{rollbackProbes,control,status}' is distinct from 'PASS' or (snapshot#>>'{rollbackProbes,control,observedAt}')::timestamptz<now()-interval '60 seconds' or snapshot#>>'{rollbackProbes,independent,status}' is distinct from 'FAIL' or snapshot#>>'{rollbackProbes,independent,independent}' is distinct from 'true' or (snapshot#>>'{rollbackProbes,independent,observedAt}')::timestamptz<now()-interval '60 seconds' then raise exception 'rollback_fresh_control_or_independent_missing'; end if;
    if not exists(select 1 from jsonb_array_elements(snapshot#>'{rollbackProbes,candidate}') probe where probe->>'status'='FAIL' and probe->>'failureClass' in ('core_contract','integrity') and (probe->>'observedAt')::timestamptz>=now()-interval '60 seconds')
      and (select count(distinct probe->>'observedAt') from jsonb_array_elements(snapshot#>'{rollbackProbes,candidate}') probe where probe->>'status'='FAIL' and probe->>'failureClass'='local_functionality' and (probe->>'observedAt')::timestamptz>=now()-interval '60 seconds')<3 then raise exception 'rollback_candidate_fault_unproven'; end if;
  end if;
end $$;

create function public.update_authorize_release(p_workspace_id uuid,p_actor uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare release public.update_release_records; policy jsonb; authorization_body jsonb;
begin
  perform public.assert_human(p_workspace_id,p_actor,true);
  select p.policy into policy from public.update_policies p where p.workspace_id=p_workspace_id and p.project_id=p_request->>'projectId' and p.environment=p_request->>'environment' for update;
  if policy is null or policy->>'mode'='paused' or (policy->>'generation')::bigint is distinct from (p_request->>'expectedGeneration')::bigint or (p_request->>'expiresAt')::timestamptz not between now() and now()+interval '15 minutes' then raise exception 'owner_authorization_invalid'; end if;
  select * into release from public.update_release_records where workspace_id=p_workspace_id and release_id=p_request->>'releaseId' for update;
  if not found or release.manifest_sha256 is distinct from p_request->>'manifestSha256' or release.project_id is distinct from p_request->>'projectId' or release.environment is distinct from p_request->>'environment' then raise exception 'release_target_binding_changed'; end if;
  authorization_body:=jsonb_build_object('isHuman',true,'role','owner','ownerId',p_actor,'manifestSha256',release.manifest_sha256,'projectId',release.project_id,'environment',release.environment,'policyGeneration',(policy->>'generation')::bigint,'expectedParentDeploymentId',release.manifest->>'expectedParentDeploymentId','expiresAt',p_request->>'expiresAt','capabilityEvidenceRef',p_request->>'capabilityEvidenceRef');
  if p_request->>'phase'='stage' then
    update public.update_release_records set snapshot=snapshot||jsonb_build_object('stageAuthorization',authorization_body) where workspace_id=p_workspace_id and release_id=release.release_id;
  elsif p_request->>'phase'='manual_promotion' then
    if release.state<>'STAGED' or release.snapshot#>>'{verification,status}' is distinct from 'PASS' or (release.snapshot#>>'{verification,finalSmokeAt}')::timestamptz<now()-interval '5 minutes' then raise exception 'staged_verification_required'; end if;
    update public.update_release_records set snapshot=snapshot||jsonb_build_object('manualAuthorization',authorization_body) where workspace_id=p_workspace_id and release_id=release.release_id;
  elsif p_request->>'phase'='manual_rollback' then
    if release.state<>'PROBATION' or release.snapshot->'previous' is null then raise exception 'probation_previous_release_required'; end if;
    authorization_body:=authorization_body||jsonb_build_object('manifestSha256',release.snapshot#>>'{previous,manifestSha256}','targetDeploymentId',release.snapshot#>>'{previous,deploymentId}','expectedParentDeploymentId',release.snapshot->>'activeDeploymentId');
    update public.update_release_records set snapshot=snapshot||jsonb_build_object('rollbackAuthorization',authorization_body) where workspace_id=p_workspace_id and release_id=release.release_id;
  else raise exception 'authorization_phase_invalid'; end if;
  insert into public.update_release_audit(workspace_id,event,body) values(p_workspace_id,'owner_release_authorized',authorization_body||jsonb_build_object('phase',p_request->>'phase','releaseId',release.release_id));
  return authorization_body;
end $$;

create function public.update_ingest_evidence(p_workspace_id uuid,p_actor uuid,p_expected_client text,p_expected_kind text,p_receipt jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare release public.update_release_records; observation jsonb:=p_receipt->'observation'; receipt_id uuid; receipt_hash text; policy jsonb; evidence_body jsonb; candidate_probes jsonb; profile public.scheduler_profiles; prior_hash text;
begin
  if p_expected_kind not in ('release_controller','observer') or not exists(select 1 from public.principals p join public.workspace_memberships m on m.principal_id=p.id join public.grants g on g.principal_id=p.id and g.workspace_id=m.workspace_id
    where m.workspace_id=p_workspace_id and p.id=p_actor and p.kind=p_expected_kind and p.client_id=p_expected_client and p.revoked_at is null and m.revoked_at is null and g.revoked_at is null and g.expires_at>now() and 'updates:evidence'=any(g.operations)) then raise exception 'fixed_runner_grant_required' using errcode='42501'; end if;
  select * into release from public.update_release_records where workspace_id=p_workspace_id and release_id=p_receipt->>'releaseId' for update;
  if not found or release.manifest_sha256 is distinct from p_receipt->>'manifestSha256' or release.manifest->>'artifactSha256' is distinct from p_receipt->>'artifactSha256' or release.project_id is distinct from p_receipt->>'projectId' or release.environment is distinct from p_receipt->>'environment' then raise exception 'receipt_release_binding_invalid'; end if;
  if (observation->>'observedAt')::timestamptz not between now()-interval '60 seconds' and now() or observation->>'evidenceRef' is null then raise exception 'receipt_stale'; end if;
  if (p_expected_kind='observer') is distinct from (p_receipt->>'kind'='independent_probe' or (p_receipt->>'kind'='activation' and observation->>'kind'='watcher')) then raise exception 'receipt_authority_wrong_lane'; end if;
  if p_expected_kind='observer' then
    select * into profile from public.scheduler_profiles where workspace_id=p_workspace_id;
    if profile.workspace_id is null or profile.watcher_principal_id is distinct from p_actor or profile.watcher_client_id is distinct from p_expected_client or profile.watcher_verified_at is null or profile.watcher_evidence_ref is null or profile.consent_at is null or profile.watcher_failure_domain is null or profile.watcher_failure_domain=profile.failure_domain or observation->>'failureDomain' is distinct from profile.watcher_failure_domain or profile.watcher_cadence_seconds is null or profile.watcher_cadence_seconds>60 or profile.last_watcher_at is null or profile.last_watcher_at<now()-interval '60 seconds' then raise exception 'independent_probation_monitor_unverified' using errcode='42501'; end if;
  end if;
  receipt_hash:=p_receipt->>'payloadSha256';
  if receipt_hash !~ '^[a-f0-9]{64}$' then raise exception 'receipt_digest_invalid'; end if;
  if p_receipt->>'kind' in ('candidate_probe','control_probe','independent_probe') then
    select payload_sha256 into prior_hash from public.update_release_evidence where workspace_id=p_workspace_id and release_id=release.release_id and kind=p_receipt->>'kind' and observed_at=(observation->>'observedAt')::timestamptz;
    if found and prior_hash<>receipt_hash then raise exception 'probe_observation_payload_conflict'; end if;
  end if;
  insert into public.update_release_evidence(workspace_id,release_id,principal_id,kind,payload_sha256,body,observed_at) values(p_workspace_id,release.release_id,p_actor,p_receipt->>'kind',receipt_hash,p_receipt,(observation->>'observedAt')::timestamptz) on conflict do nothing returning id into receipt_id;
  if receipt_id is null then return jsonb_build_object('idempotent',true); end if;
  if p_receipt->>'kind'='readiness' then
    update public.update_release_records set snapshot=snapshot||jsonb_build_object('dependenciesReady',observation->'dependenciesReady','budgetAvailable',observation->'budgetAvailable','securityIncident',observation->'securityIncident','readinessObservedAt',observation->>'observedAt') where workspace_id=p_workspace_id and release_id=release.release_id;
  elsif p_receipt->>'kind'='verification' then
    if observation->>'status' is distinct from 'PASS' or observation->>'manifestSha256' is distinct from release.manifest_sha256 or observation->>'artifactSha256' is distinct from release.manifest->>'artifactSha256' then raise exception 'verification_identity_mismatch'; end if;
    update public.update_release_records set snapshot=snapshot||jsonb_build_object('verification',observation) where workspace_id=p_workspace_id and release_id=release.release_id;
  elsif p_receipt->>'kind'='activation' then
    select p.policy into policy from public.update_policies p where p.workspace_id=p_workspace_id and p.project_id=release.project_id and p.environment=release.environment;
    if observation->>'kind'='provider_atomic_cas' and observation->>'status'='PASS' then raise exception 'vercel_atomic_cas_unavailable'; end if;
    evidence_body:=observation||jsonb_build_object('projectId',release.project_id,'environment',release.environment,'policySha256',policy->>'policySha256','verifiedAt',observation->>'observedAt','evidenceRef',observation->>'evidenceRef');
    insert into public.update_activation_evidence(workspace_id,body) values(p_workspace_id,evidence_body);
  elsif p_receipt->>'kind' in ('candidate_probe','control_probe','independent_probe') then
    if observation->>'deploymentId' is distinct from (case when p_receipt->>'kind'='control_probe' then release.snapshot#>>'{previous,deploymentId}' else coalesce(release.snapshot->>'stagedDeploymentId',release.snapshot->>'activeDeploymentId') end) then raise exception 'probe_deployment_binding_invalid'; end if;
    if p_receipt->>'kind'='candidate_probe' then
      insert into public.update_probation_probes(workspace_id,release_id,body,observed_at) values(p_workspace_id,release.release_id,observation,(observation->>'observedAt')::timestamptz) on conflict do nothing;
      select coalesce(jsonb_agg(body->'observation'),'[]'::jsonb) into candidate_probes from (select body from public.update_release_evidence where workspace_id=p_workspace_id and release_id=release.release_id and kind='candidate_probe' and observed_at>now()-interval '60 seconds' order by observed_at desc limit 3) recent;
      update public.update_release_records set snapshot=jsonb_set(snapshot,'{rollbackProbes}',coalesce(snapshot->'rollbackProbes','{}'::jsonb)||jsonb_build_object('candidate',candidate_probes)) where workspace_id=p_workspace_id and release_id=release.release_id;
    elsif p_receipt->>'kind'='control_probe' then
      update public.update_release_records set snapshot=jsonb_set(snapshot,'{rollbackProbes}',coalesce(snapshot->'rollbackProbes','{}'::jsonb)||jsonb_build_object('control',observation)) where workspace_id=p_workspace_id and release_id=release.release_id;
    else
      update public.update_release_records set snapshot=snapshot||jsonb_build_object('watcher',jsonb_build_object('status',observation->>'status','observedAt',observation->>'observedAt','maxProbeIntervalSeconds',profile.watcher_cadence_seconds,'independent',true),'rollbackProbes',coalesce(snapshot->'rollbackProbes','{}'::jsonb)||jsonb_build_object('independent',observation)) where workspace_id=p_workspace_id and release_id=release.release_id;
    end if;
  else raise exception 'evidence_kind_invalid'; end if;
  return jsonb_build_object('receiptId',receipt_id,'releaseId',release.release_id);
end $$;
do $$ declare procedure record; begin
  for procedure in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('update_register_release','update_authorize_release','update_ingest_evidence','update_assert_stage_or_rollback') loop
    execute format('revoke all on function %s from public,anon,authenticated',procedure.signature);
    execute format('grant execute on function %s to service_role',procedure.signature);
  end loop;
end $$;
