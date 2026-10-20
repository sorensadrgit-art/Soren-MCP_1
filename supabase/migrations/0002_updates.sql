-- No release, trust root, activation evidence or arming grant is seeded here.
create table public.update_policies (
  workspace_id uuid not null references public.workspaces(id), project_id text not null, environment text not null check(environment='production'),
  generation bigint not null check(generation>=0), policy jsonb not null, primary key(workspace_id,project_id,environment),
  check(policy->>'mode' in ('paused','observe','armed')), check((policy->>'generation')::bigint=generation)
);
create table public.update_release_records (
  workspace_id uuid not null references public.workspaces(id), release_id text not null, project_id text not null, environment text not null check(environment='production'),
  manifest_sha256 text not null check(manifest_sha256 ~ '^[a-f0-9]{64}$'), manifest jsonb not null, snapshot jsonb not null,
  state text not null default 'DISCOVERED', promoted_at timestamptz, rollback_count integer not null default 0 check(rollback_count between 0 and 1),
  primary key(workspace_id,release_id)
);
create table public.update_release_operations (
  workspace_id uuid not null references public.workspaces(id), intent_key text not null, project_id text not null, environment text not null,
  payload_sha256 text not null check(payload_sha256 ~ '^[a-f0-9]{64}$'), operation_id uuid not null,
  status text not null check(status in ('PENDING','SENT','UNKNOWN_OUTCOME','APPLIED','NOT_APPLIED')), body jsonb not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), primary key(workspace_id,intent_key), unique(workspace_id,operation_id)
);
create unique index one_pending_release_operation on public.update_release_operations(workspace_id,project_id,environment) where status in ('PENDING','SENT','UNKNOWN_OUTCOME');
create table public.update_activation_evidence (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id), body jsonb not null,
  created_at timestamptz not null default now(), check(body->>'status' in ('NOT_RUN','PASS','FAIL','BLOCKED','NOT_APPLICABLE'))
);
create table public.update_release_revocations (
  workspace_id uuid not null references public.workspaces(id), digest text not null check(digest ~ '^[a-f0-9]{64}$'),
  actor_id uuid not null references public.principals(id), reason text not null, created_at timestamptz not null default now(), primary key(workspace_id,digest)
);
create table public.update_probation_probes (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id), release_id text not null, body jsonb not null,
  observed_at timestamptz not null, unique(workspace_id,release_id,observed_at), foreign key(workspace_id,release_id) references public.update_release_records(workspace_id,release_id)
);
create table public.update_release_audit (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id), event text not null,
  body jsonb not null, created_at timestamptz not null default now()
);
do $$ declare relation text; begin
  foreach relation in array array['update_policies','update_release_records','update_release_operations','update_activation_evidence','update_release_revocations','update_probation_probes','update_release_audit'] loop
    execute format('alter table public.%I enable row level security',relation);
    execute format('revoke all on public.%I from anon,authenticated',relation);
    execute format('grant all on public.%I to service_role',relation);
  end loop;
  foreach relation in array array['update_activation_evidence','update_release_revocations','update_probation_probes','update_release_audit'] loop
    execute format('create trigger immutable_record before update or delete on public.%I for each row execute function public.immutable_record()',relation);
  end loop;
end $$;

create function public.update_read_policy(p_workspace_id uuid,p_project_id text,p_environment text) returns jsonb
language sql stable security definer set search_path='' as $$
  select policy from public.update_policies where workspace_id=p_workspace_id and project_id=p_project_id and environment=p_environment
$$;
create function public.update_activation_evidence(p_workspace_id uuid,p_ids text[]) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(body || jsonb_build_object('id',id)),'[]'::jsonb) from public.update_activation_evidence where workspace_id=p_workspace_id and id::text=any(p_ids)
$$;
create function public.update_change_policy(p_workspace_id uuid,p_project_id text,p_environment text,p_expected_generation bigint,p_policy jsonb,p_actor uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare current_generation bigint; current_policy jsonb;
begin
  perform public.assert_human(p_workspace_id,p_actor,true);
  select generation,policy into current_generation,current_policy from public.update_policies where workspace_id=p_workspace_id and project_id=p_project_id and environment=p_environment for update;
  if coalesce(current_generation,0)<>p_expected_generation or (p_policy->>'generation')::bigint<>p_expected_generation+1
    or p_policy->>'projectId'<>p_project_id or p_policy->>'environment'<>p_environment
    or p_policy->>'policySha256' !~ '^[a-f0-9]{64}$' or p_policy->>'mode' not in ('paused','observe','armed')
    or (current_policy is not null and current_policy->>'policySha256' is distinct from p_policy->>'policySha256') then raise exception 'policy_conflict'; end if;
  if p_policy->>'mode'='armed' and ((p_policy#>>'{arming,expiresAt}')::timestamptz<=now() or (p_policy#>>'{arming,expiresAt}')::timestamptz>now()+interval '30 days' or p_policy#>>'{arming,ownerId}'<>p_actor::text or p_policy#>>'{arming,policySha256}'<>p_policy->>'policySha256') then raise exception 'invalid_arming'; end if;
  insert into public.update_policies(workspace_id,project_id,environment,generation,policy) values(p_workspace_id,p_project_id,p_environment,p_expected_generation+1,p_policy)
    on conflict(workspace_id,project_id,environment) do update set generation=excluded.generation,policy=excluded.policy where update_policies.generation=p_expected_generation;
  if not found then raise exception 'policy_conflict' using errcode='40001'; end if;
  insert into public.update_release_audit(workspace_id,event,body) values(p_workspace_id,'policy_changed',jsonb_build_object('actor',p_actor,'projectId',p_project_id,'environment',p_environment,'generation',p_expected_generation+1,'mode',p_policy->>'mode'));
  return p_policy;
end $$;
create function public.update_release_snapshot(p_workspace_id uuid,p_project_id text,p_environment text,p_release_id text) returns jsonb
language sql stable security definer set search_path='' as $$
  select r.snapshot || jsonb_build_object('policy',p.policy,'release',jsonb_build_object('releaseId',r.release_id,'state',r.state,'promotedAt',r.promoted_at,'rollbackCount',r.rollback_count,'projectId',r.project_id,'environment',r.environment,'deploymentId',r.snapshot->>'activeDeploymentId'),'promotionCount24h',(select count(*) from public.update_release_operations o where o.workspace_id=p_workspace_id and o.project_id=p_project_id and o.environment=p_environment and o.body->>'kind'='promote' and o.status='APPLIED' and o.updated_at>now()-interval '24 hours'),
    'revokedDigests',coalesce((select jsonb_agg(digest) from public.update_release_revocations where workspace_id=p_workspace_id),'[]'::jsonb))
  from public.update_release_records r join public.update_policies p using(workspace_id,project_id,environment)
  where r.workspace_id=p_workspace_id and r.project_id=p_project_id and r.environment=p_environment and r.release_id=p_release_id
$$;
create function public.update_get_intent(p_workspace_id uuid,p_intent_key text) returns jsonb
language sql stable security definer set search_path='' as $$
  select body || jsonb_build_object('status',status) from public.update_release_operations where workspace_id=p_workspace_id and intent_key=p_intent_key
$$;
create function public.update_assert_promotion_snapshot(p_workspace_id uuid,p_intent jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare release public.update_release_records; policy jsonb; snapshot jsonb; approval_id text; promotion_count bigint; gate_name text; manual_gate jsonb;
begin
  select * into release from public.update_release_records r where r.workspace_id=p_workspace_id and r.release_id=p_intent->>'releaseId' for update;
  if not found or release.manifest_sha256 is distinct from p_intent->>'manifestSha256' or release.manifest->>'artifactSha256' is distinct from p_intent->>'artifactSha256' or release.project_id is distinct from p_intent->>'projectId' or release.environment is distinct from p_intent->>'environment' then raise exception 'release_target_binding_changed'; end if;
  snapshot:=public.update_release_snapshot(p_workspace_id,release.project_id,release.environment,release.release_id);
  select p.policy into policy from public.update_policies p where p.workspace_id=p_workspace_id and p.project_id=release.project_id and p.environment=release.environment;
  if policy is null or policy->>'mode'='paused' or (policy->>'generation')::bigint is distinct from (p_intent->>'policyGeneration')::bigint or policy->>'policySha256' is distinct from release.manifest->>'policySha256' then raise exception 'release_policy_invalidated'; end if;
  if p_intent->>'authorizationMode'='manual' then
    manual_gate:=snapshot->'manualAuthorization';
    if manual_gate->>'manifestSha256' is distinct from release.manifest_sha256 or manual_gate->>'expectedParentDeploymentId' is distinct from p_intent->>'expectedParentDeploymentId' or (manual_gate->>'policyGeneration')::bigint is distinct from (policy->>'generation')::bigint or (manual_gate->>'expiresAt')::timestamptz not between now() and now()+interval '15 minutes' or manual_gate->>'expiresAt' is null then raise exception 'manual_authorization_invalid'; end if;
    perform public.assert_human(p_workspace_id,(manual_gate->>'ownerId')::uuid,true);
  else
    if policy->>'mode' is distinct from 'armed' or (policy#>>'{arming,expiresAt}')::timestamptz<=now() or policy#>>'{arming,expiresAt}' is null then raise exception 'updates_not_armed'; end if;
    perform public.assert_human(p_workspace_id,(policy#>>'{arming,ownerId}')::uuid,true);
    if snapshot#>>'{candidate,channel}' is distinct from 'stable' or jsonb_typeof(snapshot#>'{candidate,changedPaths}') is distinct from 'array' or jsonb_array_length(snapshot#>'{candidate,changedPaths}')=0 then raise exception 'automatic_source_analysis_missing'; end if;
    foreach gate_name in array array['newPackages','newPublishers','newSources','newInstallScripts','permissionChanges','protocolChanges','databaseMigrations','runtimeMajorUpgrade','frameworkMajorUpgrade','scriptChanges','resourceIncrease','billingIncrease','environmentChanges','targetChanges','scheduleChanges','trustChanges','testThresholdChanges','allowlistChanges'] loop
      if snapshot#>>array['candidate',gate_name] is distinct from 'false' then raise exception 'automatic_release_review_required'; end if;
    end loop;
    if exists(select 1 from jsonb_array_elements_text(snapshot#>'{candidate,changedPaths}') path where path ~* '(^/|\\|(^|/)\.\.(/|$)|^lib/(security|updates)/|^lib/client-contract\.mjs$|^\.github/|^installer/|^supabase/|^config/|^release/|^scripts/|^tests/|(^|/)(AGENTS|SKILL)\.md$)') then raise exception 'automatic_protected_path'; end if;
  end if;
  if exists(select 1 from public.update_release_revocations where workspace_id=p_workspace_id and digest in (p_intent->>'manifestSha256',p_intent->>'artifactSha256')) then raise exception 'release_revoked'; end if;
  if snapshot->>'dependenciesReady' is distinct from 'true' or snapshot->>'budgetAvailable' is distinct from 'true' or snapshot->>'securityIncident' is distinct from 'false' or snapshot->>'activeDeploymentId' is distinct from p_intent->>'expectedParentDeploymentId'
    or (snapshot->>'catalogGeneration')::bigint is distinct from (release.manifest->>'catalogGeneration')::bigint
    or (snapshot->>'schemaVersion')::bigint not between (release.manifest#>>'{schemaCompatibility,minimum}')::bigint and (release.manifest#>>'{schemaCompatibility,maximum}')::bigint
    or (snapshot->>'releaseSequence')::bigint < (snapshot->>'minimumSecureSequence')::bigint
    or snapshot->>'releaseSequence' is null or snapshot->>'minimumSecureSequence' is null or snapshot->>'schemaVersion' is null then raise exception 'release_current_safety_gate'; end if;
  if snapshot#>>'{watcher,status}' is distinct from 'PASS' or snapshot#>>'{watcher,independent}' is distinct from 'true' or (snapshot#>>'{watcher,observedAt}')::timestamptz not between now()-interval '60 seconds' and now() or (snapshot#>>'{watcher,maxProbeIntervalSeconds}')::integer>60 or snapshot#>>'{watcher,observedAt}' is null then raise exception 'watcher_stale'; end if;
  if (snapshot->>'readinessObservedAt')::timestamptz not between now()-interval '60 seconds' and now() or snapshot->>'readinessObservedAt' is null or snapshot#>>'{verification,status}' is distinct from 'PASS' or snapshot#>>'{verification,manifestSha256}' is distinct from release.manifest_sha256 or snapshot#>>'{verification,artifactSha256}' is distinct from release.manifest->>'artifactSha256' or (snapshot#>>'{verification,fullEvidenceFinishedAt}')::timestamptz not between now()-interval '60 minutes' and now() or (snapshot#>>'{verification,finalSmokeAt}')::timestamptz not between now()-interval '5 minutes' and now() or snapshot#>>'{verification,finalSmokeAt}' is null then raise exception 'release_evidence_stale_or_missing'; end if;
  for approval_id in select jsonb_array_elements_text(release.manifest->'approvalIds') loop
    if not exists(select 1 from jsonb_array_elements(snapshot->'approvals') a where a->>'id'=approval_id and a->>'decision'='approved' and a->>'isHuman'='true' and a->>'manifestSha256'=release.manifest_sha256 and a->>'sourceCommit'=release.manifest->>'sourceCommit' and a->>'artifactSha256'=release.manifest->>'artifactSha256' and a->>'policySha256'=release.manifest->>'policySha256' and a->>'revokedAt' is null) then raise exception 'release_approval_changed'; end if;
  end loop;
  if snapshot#>>'{candidate,reviewedManifestSha256}' is distinct from release.manifest_sha256 or snapshot#>>'{candidate,sourceReviewed}' is distinct from 'true' then raise exception 'release_source_review_changed'; end if;
  select count(*) into promotion_count from public.update_release_operations where workspace_id=p_workspace_id and project_id=release.project_id and environment=release.environment and body->>'kind'='promote' and status='APPLIED' and updated_at>now()-interval '24 hours';
  if promotion_count>=1 then raise exception 'promotion_budget_exhausted'; end if;
end $$;
create function public.update_begin_intent(p_workspace_id uuid,p_intent jsonb,p_lease_key text,p_owner text,p_fence bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior public.update_release_operations; policy jsonb; release public.update_release_records; manual_authorization jsonb;
begin
  perform public.assert_lease(p_workspace_id,p_lease_key,p_owner,p_fence);
  if p_intent->>'kind' not in ('stage','promote','rollback') then raise exception 'invalid_operation_kind'; end if;
  if p_lease_key<>'release:'||(p_intent->>'projectId')||':'||(p_intent->>'environment') then raise exception 'lease_scope'; end if;
  select * into prior from public.update_release_operations where workspace_id=p_workspace_id and intent_key=p_intent->>'intentKey' for update;
  if found then
    if prior.payload_sha256<>p_intent->>'payloadSha256' or prior.operation_id::text<>p_intent->>'operationId' then raise exception 'intent_conflict'; end if;
    if prior.status<>'NOT_APPLIED' then return prior.body || jsonb_build_object('status',prior.status); end if;
  end if;
  select p.policy into policy from public.update_policies p where p.workspace_id=p_workspace_id and p.project_id=p_intent->>'projectId' and p.environment=p_intent->>'environment' for update;
  if policy is null or policy->>'mode'='paused' or (policy->>'generation')::bigint<>(p_intent->>'policyGeneration')::bigint then raise exception 'policy_invalidated'; end if;
  if p_intent->>'kind'='promote' then
    perform public.update_assert_promotion_snapshot(p_workspace_id,p_intent);
    if p_intent->>'authorizationMode'='manual' then
      select snapshot->'manualAuthorization' into manual_authorization from public.update_release_records where workspace_id=p_workspace_id and release_id=p_intent->>'releaseId';
      if manual_authorization is null or manual_authorization->>'manifestSha256' is distinct from p_intent->>'manifestSha256' or manual_authorization->>'expectedParentDeploymentId' is distinct from p_intent->>'expectedParentDeploymentId' or (manual_authorization->>'policyGeneration')::bigint<>(policy->>'generation')::bigint or (manual_authorization->>'expiresAt')::timestamptz<=now() then raise exception 'manual_authorization_invalid'; end if;
      perform public.assert_human(p_workspace_id,(manual_authorization->>'ownerId')::uuid,true);
    elsif policy->>'mode'<>'armed' or (policy#>>'{arming,expiresAt}')::timestamptz<=now() then raise exception 'updates_not_armed'; end if;
  end if;
  if p_intent->>'kind'='rollback' then
    select * into release from public.update_release_records r where r.workspace_id=p_workspace_id and r.release_id=p_intent->>'releaseId' for update;
    if not found or release.rollback_count<>0 or release.state<>'PROBATION' or release.promoted_at<now()-interval '30 minutes' then raise exception 'rollback_limit'; end if;
    update public.update_release_records set rollback_count=1 where workspace_id=p_workspace_id and release_id=release.release_id;
  end if;
  if p_intent->>'kind' in ('stage','rollback') then perform public.update_assert_stage_or_rollback(p_workspace_id,p_intent,p_intent->>'kind'='rollback'); end if;
  insert into public.update_release_operations(workspace_id,intent_key,project_id,environment,payload_sha256,operation_id,status,body)
    values(p_workspace_id,p_intent->>'intentKey',p_intent->>'projectId',p_intent->>'environment',p_intent->>'payloadSha256',(p_intent->>'operationId')::uuid,'PENDING',p_intent)
    on conflict(workspace_id,intent_key) do update set status='PENDING',updated_at=now();
  return p_intent || jsonb_build_object('status','PENDING');
end $$;
create function public.update_bind_staged_deployment(p_workspace_id uuid,p_intent_key text,p_deployment_id text,p_lease_key text,p_owner text,p_fence bigint) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_lease(p_workspace_id,p_lease_key,p_owner,p_fence);
  update public.update_release_operations set body=body||jsonb_build_object('targetDeploymentId',p_deployment_id),updated_at=now()
    where workspace_id=p_workspace_id and intent_key=p_intent_key and body->>'kind'='stage' and (body->>'targetDeploymentId' is null or body->>'targetDeploymentId'=p_deployment_id) and p_lease_key='release:'||project_id||':'||environment;
  if not found then raise exception 'stage_identity_conflict'; end if;
end $$;
create function public.update_mark_intent(p_workspace_id uuid,p_intent_key text,p_patch jsonb,p_lease_key text,p_owner text,p_fence bigint) returns void
language plpgsql security definer set search_path='' as $$
declare intent public.update_release_operations; policy jsonb;
begin
  perform public.assert_lease(p_workspace_id,p_lease_key,p_owner,p_fence);
  if p_patch->>'status' not in ('SENT','UNKNOWN_OUTCOME','APPLIED','NOT_APPLIED') then raise exception 'invalid_intent_state'; end if;
  if p_patch->>'status'='SENT' then
    select * into intent from public.update_release_operations where workspace_id=p_workspace_id and intent_key=p_intent_key;
    select p.policy into policy from public.update_policies p where p.workspace_id=p_workspace_id and p.project_id=intent.project_id and p.environment=intent.environment for update;
    if policy is null or policy->>'mode'='paused' or (policy->>'generation')::bigint<>(intent.body->>'policyGeneration')::bigint then raise exception 'policy_invalidated_before_send'; end if;
    if intent.body->>'kind'='promote' then perform public.update_assert_promotion_snapshot(p_workspace_id,intent.body); end if;
    if intent.body->>'kind' in ('stage','rollback') then perform public.update_assert_stage_or_rollback(p_workspace_id,intent.body,intent.body->>'kind'='rollback'); end if;
  end if;
  update public.update_release_operations set status=p_patch->>'status',body=body||p_patch,updated_at=now() where workspace_id=p_workspace_id and intent_key=p_intent_key and p_lease_key='release:'||project_id||':'||environment;
  if not found then raise exception 'intent_not_found'; end if;
end $$;
create function public.update_release_outcome(p_workspace_id uuid,p_intent_key text,p_observed jsonb,p_at timestamptz,p_lease_key text,p_owner text,p_fence bigint) returns void
language plpgsql security definer set search_path='' as $$
declare intent jsonb; previous_status text; changed integer;
begin
  perform public.assert_lease(p_workspace_id,p_lease_key,p_owner,p_fence);
  select body into intent from public.update_release_operations where workspace_id=p_workspace_id and intent_key=p_intent_key and status='APPLIED' and p_lease_key='release:'||project_id||':'||environment for update;
  if intent is null then raise exception 'unverified_outcome'; end if;
  if intent->>'outcomeCommitted'='true' then return; end if;
  if p_observed->>'deploymentId' is distinct from intent->>'targetDeploymentId' or p_observed->>'artifactSha256' is distinct from intent->>'artifactSha256' or p_observed->>'projectId' is distinct from intent->>'projectId' or p_observed->>'environment' is distinct from intent->>'environment' or (intent->>'kind'<>'stage' and p_observed->>'aliasVerified' is distinct from 'true') then raise exception 'outcome_identity_mismatch'; end if;
  update public.update_release_records set state=case intent->>'kind' when 'promote' then 'PROBATION' when 'rollback' then 'ROLLED_BACK' else 'STAGED' end,
    promoted_at=case when intent->>'kind'='promote' then coalesce(promoted_at,now()) else promoted_at end,
    snapshot=snapshot||case when intent->>'kind'='stage' then jsonb_build_object('stagedDeploymentId',p_observed->>'deploymentId') else jsonb_build_object('activeDeploymentId',p_observed->>'activeDeploymentId') end
    where workspace_id=p_workspace_id and project_id=intent->>'projectId' and release_id=intent->>'releaseId' and
      ((intent->>'kind'='stage' and state in ('BUILT','STAGED')) or (intent->>'kind'='promote' and state in ('STAGED','APPROVED_FOR_PROMOTION','PROMOTING')) or (intent->>'kind'='rollback' and state='PROBATION'));
  get diagnostics changed=row_count;
  if changed=1 and intent->>'kind'<>'stage' then update public.update_environment_bounds set active_deployment_id=p_observed->>'activeDeploymentId',updated_at=now() where workspace_id=p_workspace_id and project_id=intent->>'projectId' and environment=intent->>'environment'; end if;
  update public.update_release_operations set body=body||jsonb_build_object('outcomeCommitted',true),updated_at=now() where workspace_id=p_workspace_id and intent_key=p_intent_key;
  insert into public.update_release_audit(workspace_id,event,body) values(p_workspace_id,'provider_outcome',jsonb_build_object('intentKey',p_intent_key,'observed',p_observed));
end $$;
create function public.update_cooldown(p_workspace_id uuid,p_input jsonb,p_lease_key text,p_owner text,p_fence bigint) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_lease(p_workspace_id,p_lease_key,p_owner,p_fence);
  update public.update_policies set generation=generation+1,policy=policy||jsonb_build_object('generation',generation+1,'mode',case when p_input->>'mode'='paused' then 'paused' else 'observe' end,'arming',null,'cooldownUntil',now()+interval '60 minutes')
    where workspace_id=p_workspace_id and project_id=p_input->>'projectId' and environment=p_input->>'environment' and p_lease_key='release:'||project_id||':'||environment;
  insert into public.update_release_audit(workspace_id,event,body) values(p_workspace_id,'rollback_cooldown',p_input);
end $$;
create function public.update_schedule_reconciliation(p_workspace_id uuid,p_input jsonb,p_lease_key text,p_owner text,p_fence bigint) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_lease(p_workspace_id,p_lease_key,p_owner,p_fence);
  insert into public.update_release_audit(workspace_id,event,body) values(p_workspace_id,'scheduler_reconciliation',p_input);
end $$;
create function public.update_probation_probes(p_workspace_id uuid,p_release_id text) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(body order by observed_at),'[]'::jsonb) from public.update_probation_probes where workspace_id=p_workspace_id and release_id=p_release_id
$$;
create function public.update_finish_probation(p_workspace_id uuid,p_binding jsonb,p_lease_key text,p_owner text,p_fence bigint) returns void
language plpgsql security definer set search_path='' as $$
declare release public.update_release_records; snapshot jsonb; policy jsonb; observation jsonb:=p_binding->'observation'; probe_count integer; first_probe timestamptz; last_probe timestamptz; probes_valid boolean;
begin
  perform public.assert_lease(p_workspace_id,p_lease_key,p_owner,p_fence);
  select * into release from public.update_release_records where workspace_id=p_workspace_id and release_id=p_binding->>'releaseId' for update;
  if not found or release.state is distinct from 'PROBATION' or release.rollback_count<>0 or release.promoted_at is null or release.promoted_at>now()-interval '30 minutes' or p_lease_key is distinct from 'release:'||release.project_id||':'||release.environment then raise exception 'probation_not_ready'; end if;
  select p.policy into policy from public.update_policies p where p.workspace_id=p_workspace_id and p.project_id=release.project_id and p.environment=release.environment for update;
  snapshot:=public.update_release_snapshot(p_workspace_id,release.project_id,release.environment,release.release_id);
  if policy is null or policy->>'mode' not in ('observe','armed') or (policy->>'generation')::bigint is distinct from (p_binding->>'policyGeneration')::bigint or policy->>'policySha256' is distinct from release.manifest->>'policySha256' then raise exception 'probation_policy_changed'; end if;
  if release.manifest_sha256 is distinct from p_binding->>'manifestSha256' or release.manifest->>'artifactSha256' is distinct from p_binding->>'artifactSha256' or snapshot->>'activeDeploymentId' is distinct from p_binding->>'deploymentId' or release.snapshot->>'stagedDeploymentId' is distinct from p_binding->>'deploymentId' or p_binding->>'deploymentId' is null then raise exception 'probation_identity_changed'; end if;
  if p_binding->>'artifactBytesVerified' is distinct from 'true' or not coalesce((p_binding->>'verifiedAt')::timestamptz between now()-interval '60 seconds' and now(),false) or observation->>'deploymentId' is distinct from p_binding->>'deploymentId' or observation->>'activeDeploymentId' is distinct from p_binding->>'deploymentId' or observation->>'artifactSha256' is distinct from p_binding->>'artifactSha256' or observation->>'projectId' is distinct from release.project_id or observation->>'environment' is distinct from release.environment or observation->>'artifactBytesVerified' is distinct from 'true' or observation->>'productionConfiguration' is distinct from 'true' or observation->>'productionDomainsAssigned' is distinct from 'true' or observation->>'aliasVerified' is distinct from 'true' or not coalesce((observation->>'observedAt')::timestamptz between now()-interval '60 seconds' and now(),false) then raise exception 'probation_provider_verification_required'; end if;
  if snapshot->>'dependenciesReady' is distinct from 'true' or snapshot->>'budgetAvailable' is distinct from 'true' or snapshot->>'securityIncident' is distinct from 'false' or not coalesce((snapshot->>'readinessObservedAt')::timestamptz between now()-interval '60 seconds' and now(),false) then raise exception 'probation_readiness_or_security_unavailable'; end if;
  if exists(select 1 from public.update_release_revocations where workspace_id=p_workspace_id and digest in (release.manifest_sha256,release.manifest->>'artifactSha256')) then raise exception 'probation_release_revoked'; end if;
  if not coalesce((snapshot->>'releaseSequence')::bigint >= (snapshot->>'minimumSecureSequence')::bigint and (snapshot->>'schemaVersion')::bigint between (release.manifest#>>'{schemaCompatibility,minimum}')::bigint and (release.manifest#>>'{schemaCompatibility,maximum}')::bigint and (snapshot->>'catalogGeneration')::bigint=(release.manifest->>'catalogGeneration')::bigint,false) then raise exception 'probation_security_schema_or_catalog_changed'; end if;
  if snapshot#>>'{watcher,status}' is distinct from 'PASS' or snapshot#>>'{watcher,independent}' is distinct from 'true' or not coalesce((snapshot#>>'{watcher,maxProbeIntervalSeconds}')::integer<=60 and (snapshot#>>'{watcher,observedAt}')::timestamptz between now()-interval '60 seconds' and now(),false) then raise exception 'probation_watcher_stale'; end if;
  if exists(select 1 from jsonb_array_elements_text(release.manifest->'approvalIds') id where not exists(select 1 from jsonb_array_elements(snapshot->'approvals') approval where approval->>'id'=id and approval->>'decision'='approved' and approval->>'isHuman'='true' and approval->>'manifestSha256'=release.manifest_sha256 and approval->>'artifactSha256'=release.manifest->>'artifactSha256' and approval->>'sourceCommit'=release.manifest->>'sourceCommit' and approval->>'policySha256'=release.manifest->>'policySha256' and approval->>'revokedAt' is null)) then raise exception 'probation_approval_revoked'; end if;
  if exists(select 1 from public.update_release_operations where workspace_id=p_workspace_id and project_id=release.project_id and environment=release.environment and status in ('PENDING','SENT','UNKNOWN_OUTCOME')) then raise exception 'probation_operation_unresolved'; end if;
  select count(distinct observed_at),min(observed_at),max(observed_at),bool_and(body->>'status' is not distinct from 'PASS' and body->>'deploymentId' is not distinct from p_binding->>'deploymentId' and coalesce(observed_at-previous_at<=interval '60 seconds',true)) into probe_count,first_probe,last_probe,probes_valid
    from (select body,observed_at,lag(observed_at) over(order by observed_at) previous_at from public.update_probation_probes where workspace_id=p_workspace_id and release_id=release.release_id and observed_at between release.promoted_at-interval '60 seconds' and now()) probes;
  if probe_count<31 or first_probe>release.promoted_at or last_probe<release.promoted_at+interval '30 minutes' or last_probe<now()-interval '60 seconds' or probes_valid is distinct from true then raise exception 'probation_probe_gap_or_failure'; end if;
  update public.update_release_records set state='STABLE' where workspace_id=p_workspace_id and release_id=release.release_id;
  insert into public.update_release_audit(workspace_id,event,body) values(p_workspace_id,'probation_completed',p_binding);
end $$;
do $$ declare procedure record; begin
  for procedure in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'update\_%' escape '\' loop
    execute format('revoke all on function %s from public,anon,authenticated',procedure.signature);
    execute format('grant execute on function %s to service_role',procedure.signature);
  end loop;
end $$;
