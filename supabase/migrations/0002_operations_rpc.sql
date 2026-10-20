create function public.set_grant(p_workspace_id uuid,p_actor_id uuid,p_principal_id uuid,p_operations text[],p_expires_at timestamptz) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid; principal_kind text;
begin
  perform public.assert_human(p_workspace_id,p_actor_id,true);
  if p_expires_at<=clock_timestamp() or p_expires_at>clock_timestamp()+interval '90 days'
    or not exists(select 1 from public.workspace_memberships where workspace_id=p_workspace_id and principal_id=p_principal_id and revoked_at is null) then raise exception 'invalid_grant'; end if;
  select kind into principal_kind from public.principals where id=p_principal_id and revoked_at is null;
  if principal_kind is null or not (p_operations <@ (case principal_kind
    when 'agent' then array['skills:read','receipts:write']
    when 'observer' then array['health:read','health:observe','receipts:write','updates:read','updates:evidence']
    when 'maintenance' then array['health:read','maintenance:run']
    when 'release_controller' then array['health:read','updates:read','updates:promote','updates:evidence']
    else array['skills:read','receipts:write','health:read','updates:read'] end)::text[]) then raise exception 'grant_scope_denied' using errcode='42501'; end if;
  insert into public.grants(workspace_id,principal_id,operations,expires_at,created_by) values(p_workspace_id,p_principal_id,p_operations,p_expires_at,p_actor_id) returning id into result;
  update public.workspace_memberships set revision=revision+1 where workspace_id=p_workspace_id and principal_id=p_principal_id;
  insert into public.operation_events(workspace_id,actor_id,operation,target_identity) values(p_workspace_id,p_actor_id,'grant_created',result::text);
  return result;
end $$;
create function public.revoke_grant(p_workspace_id uuid,p_actor_id uuid,p_grant_id uuid,p_expected_revision bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_human(p_workspace_id,p_actor_id,true);
  update public.grants set revoked_at=clock_timestamp(),revision=revision+1 where workspace_id=p_workspace_id and id=p_grant_id and revision=p_expected_revision and revoked_at is null;
  if not found then raise exception 'grant_revision_conflict' using errcode='40001'; end if;
  update public.workspace_memberships set revision=revision+1 where workspace_id=p_workspace_id and principal_id=(select principal_id from public.grants where workspace_id=p_workspace_id and id=p_grant_id);
  insert into public.operation_events(workspace_id,actor_id,operation,target_identity) values(p_workspace_id,p_actor_id,'grant_revoked',p_grant_id::text);
end $$;

create function public.record_health_observation(p_workspace_id uuid,p_observation jsonb,p_lease_key text,p_owner text,p_fence bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare sample public.health_observations; profile public.scheduler_profiles; incident public.incidents;
  failures integer:=0; successes integer:=0; cadence integer; last_slot timestamptz; row public.health_observations; notification text; next_state text; incident_id uuid;
begin
  perform public.assert_lease(p_workspace_id,p_lease_key,p_owner,p_fence);
  select * into profile from public.scheduler_profiles where workspace_id=p_workspace_id for update;
  if profile.workspace_id is null then raise exception 'schedule_not_authorized' using errcode='42501'; end if;
  cadence:=public.component_cadence(p_workspace_id,p_observation->>'component');
  if (p_observation->>'observedAt')::timestamptz>clock_timestamp()+interval '5 seconds' or (p_observation->>'scheduledSlot')::timestamptz>clock_timestamp()+interval '5 seconds'
    or clock_timestamp()-(p_observation->>'observedAt')::timestamptz>make_interval(secs=>cadence*3)
    or (p_observation->>'observedAt')::timestamptz-(p_observation->>'scheduledSlot')::timestamptz>make_interval(secs=>cadence*3) then raise exception 'stale_observation'; end if;
  insert into public.health_observations(workspace_id,component,environment,observed_at,scheduled_slot,status,latency_ms,failure_class,probe_identity,source_revision,evidence_refs)
    values(p_workspace_id,p_observation->>'component',p_observation->>'environment',(p_observation->>'observedAt')::timestamptz,(p_observation->>'scheduledSlot')::timestamptz,p_observation->>'status',
      (p_observation->>'latencyMs')::integer,p_observation->>'failureClass',p_observation->>'probeIdentity',p_observation->>'sourceRevision',array(select jsonb_array_elements_text(p_observation->'evidenceRefs')))
    on conflict(workspace_id,component,environment,scheduled_slot) do nothing returning * into sample;
  if sample.id is null then return jsonb_build_object('duplicate',true); end if;
  -- Delayed observations remain evidence but cannot move a newer incident backwards.
  if exists(select 1 from public.health_observations where workspace_id=p_workspace_id and component=sample.component and environment=sample.environment and scheduled_slot>sample.scheduled_slot) then return jsonb_build_object('outOfOrder',true); end if;
  for row in select * from public.health_observations where workspace_id=p_workspace_id and component=sample.component and environment=sample.environment order by scheduled_slot desc limit 3 loop
    if last_slot is not null and last_slot-row.scheduled_slot>make_interval(secs=>cadence*1.5) then exit; end if;
    if sample.status='HEALTHY' and row.status='HEALTHY' then successes:=successes+1;
    elsif (sample.status in ('UNHEALTHY','DEGRADED') or (sample.status='UNKNOWN' and sample.failure_class in ('scheduler_stale','watcher_stale')))
      and row.status=sample.status and row.failure_class is not distinct from sample.failure_class then failures:=failures+1;
    else exit; end if;
    last_slot:=row.scheduled_slot;
  end loop;
  if sample.status='HEALTHY' then
    for incident in select * from public.incidents where workspace_id=p_workspace_id and component=sample.component and environment=sample.environment and state in ('OPEN','RECOVERING','SUSPECT') for update loop
      next_state:=case when successes>=2 then 'RESOLVED' else 'RECOVERING' end;
      update public.incidents set state=next_state,last_observed_at=sample.observed_at,resolved_at=case when next_state='RESOLVED' then sample.observed_at else null end,
        last_notified_at=case when next_state='RESOLVED' and incident.state in ('OPEN','RECOVERING') then sample.observed_at else last_notified_at end where id=incident.id;
      if next_state='RESOLVED' and incident.state in ('OPEN','RECOVERING') then insert into public.incident_events(workspace_id,incident_id,event,observed_at,evidence_ref) values(p_workspace_id,incident.id,'recovered',sample.observed_at,'observation:'||sample.id); end if;
    end loop;
    return jsonb_build_object('recorded',true,'successes',successes);
  end if;
  if failures=0 then return jsonb_build_object('recorded',true); end if;
  select * into incident from public.incidents where workspace_id=p_workspace_id and component=sample.component and environment=sample.environment and failure_class=coalesce(sample.failure_class,'unspecified') for update;
  next_state:=case when failures>=3 or incident.state in ('OPEN','RECOVERING') then 'OPEN' else 'SUSPECT' end;
  notification:=case when next_state='OPEN' and coalesce(incident.state,'') not in ('OPEN','RECOVERING') then 'opened'
    when next_state='OPEN' and sample.observed_at-incident.last_notified_at>=interval '30 minutes' then 'escalated' else null end;
  insert into public.incidents(workspace_id,component,environment,failure_class,severity,state,first_observed_at,last_observed_at,last_notified_at)
    values(p_workspace_id,sample.component,sample.environment,coalesce(sample.failure_class,'unspecified'),case when sample.component like 'provider:%' or sample.status in ('DEGRADED','UNKNOWN') then 'warning' else 'critical' end,next_state,sample.observed_at,sample.observed_at,case when notification is not null then sample.observed_at else null end)
    on conflict(workspace_id,component,environment,failure_class) do update set state=excluded.state,last_observed_at=excluded.last_observed_at,resolved_at=null,
      last_notified_at=coalesce(excluded.last_notified_at,public.incidents.last_notified_at) returning id into incident_id;
  if notification is not null then insert into public.incident_events(workspace_id,incident_id,event,observed_at,evidence_ref) values(p_workspace_id,incident_id,notification,sample.observed_at,'observation:'||sample.id); end if;
  return jsonb_build_object('recorded',true,'failures',failures,'state',next_state,'notification',notification);
end $$;

create function public.get_health_snapshot(p_workspace_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'observations',coalesce((select jsonb_agg(to_jsonb(o)) from (select distinct on(component,environment) component,environment,observed_at,scheduled_slot,status as recorded_status,
      case when clock_timestamp()-observed_at<=make_interval(secs=>public.component_cadence(p_workspace_id,component)*3) and observed_at<=clock_timestamp()+interval '5 seconds' then status else 'UNKNOWN' end as status,
      case when public.component_cadence(p_workspace_id,component) is null then 'unknown' when clock_timestamp()-observed_at>make_interval(secs=>public.component_cadence(p_workspace_id,component)*3) then 'stale' else 'fresh' end as freshness,
      latency_ms,failure_class,probe_identity,source_revision from public.health_observations where workspace_id=p_workspace_id order by component,environment,scheduled_slot desc) o),'[]'::jsonb),
    'incidents',coalesce((select jsonb_agg(to_jsonb(i)-'workspace_id') from public.incidents i where workspace_id=p_workspace_id),'[]'::jsonb),
    'schedulerProfile',(select (to_jsonb(p)-'workspace_id'-'owner_id')||jsonb_build_object('dispatcher_freshness',case when last_dispatcher_at is null then 'unknown' when clock_timestamp()-last_dispatcher_at>make_interval(secs=>cadence_seconds*3) then 'stale' else 'fresh' end,'watcher_freshness',case when last_watcher_at is null then 'unknown' when clock_timestamp()-last_watcher_at>make_interval(secs=>coalesce(watcher_cadence_seconds,cadence_seconds)*3) then 'stale' else 'fresh' end) from public.scheduler_profiles p where workspace_id=p_workspace_id))
$$;
create function public.get_workspace_status(p_workspace_id uuid,p_actor_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not exists(select 1 from public.workspace_memberships m join public.principals p on p.id=m.principal_id where m.workspace_id=p_workspace_id and p.id=p_actor_id and m.revoked_at is null and p.revoked_at is null) then raise exception 'workspace_access_denied' using errcode='42501'; end if;
  select jsonb_build_object('workspace',jsonb_build_object('approvalGeneration',w.approval_generation,'activeCatalogGeneration',w.active_catalog_generation),
    'versions',coalesce((select jsonb_agg(jsonb_build_object('versionId',v.id,'repository',s.repository,'directory',s.directory,'revision',v.revision,'manifestSha256',v.manifest_sha256,
      'reviewRevision',coalesce((select max(review_revision) from public.reviews where workspace_id=v.workspace_id and version_id=v.id),0),
      'decision',(select decision from public.reviews where workspace_id=v.workspace_id and version_id=v.id order by review_revision desc limit 1),
      'revoked',exists(select 1 from public.revocations where workspace_id=v.workspace_id and version_id=v.id),
      'published',public.version_published(v.workspace_id,v.id),
      'files',v.manifest->'files')) from public.skill_versions v join public.skills s on s.workspace_id=v.workspace_id and s.id=v.skill_id where v.workspace_id=p_workspace_id),'[]'::jsonb),
    'health',public.get_health_snapshot(p_workspace_id)) into result from public.workspaces w where id=p_workspace_id;
  return result;
end $$;
create function public.get_review_details(p_workspace_id uuid,p_actor_id uuid,p_version_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare candidate jsonb; previous jsonb; skill uuid; previous_id uuid; selected_id uuid; item jsonb;
begin
  perform public.assert_human(p_workspace_id,p_actor_id);
  select skill_id into skill from public.skill_versions where workspace_id=p_workspace_id and id=p_version_id;
  if skill is null then raise exception 'version_unavailable' using errcode='42501'; end if;
  select v.id into previous_id from public.skill_versions v where v.workspace_id=p_workspace_id and v.skill_id=skill and v.id<>p_version_id
    and public.version_approved(p_workspace_id,v.id) and public.version_published(p_workspace_id,v.id) order by v.created_at desc,v.id limit 1;
  foreach selected_id in array array[p_version_id,previous_id] loop
    if selected_id is null then continue; end if;
    select jsonb_build_object('versionId',v.id,'revision',v.revision,'manifestSha256',v.manifest_sha256,'manifest',v.manifest,
      'reviewRevision',coalesce((select max(review_revision) from public.reviews where workspace_id=v.workspace_id and version_id=v.id),0),
      'files',(select jsonb_agg(jsonb_build_object('path',f.path,'sha256',f.sha256,'byteCount',f.byte_count,'contentBase64',f.content_base64)) from public.skill_files f where f.workspace_id=v.workspace_id and f.version_id=v.id))
      into item from public.skill_versions v where v.workspace_id=p_workspace_id and v.id=selected_id;
    if selected_id=p_version_id then candidate:=item; else previous:=item; end if;
  end loop;
  return jsonb_build_object('candidate',candidate,'previous',previous);
end $$;
create function public.get_scheduler_profile(p_workspace_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$ select to_jsonb(p)-'owner_id' from public.scheduler_profiles p where workspace_id=p_workspace_id $$;
create function public.list_due_jobs(p_workspace_id uuid,p_limit integer default 4,p_environment text default 'default') returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(due)),'[]'::jsonb) from (
    select j.intent_key,j.payload_sha256,j.job_type,j.environment,j.scheduled_slot,j.target_identity
    from public.jobs j left join public.leases l on l.workspace_id=j.workspace_id and l.key='job:'||j.id
    where j.workspace_id=p_workspace_id and j.environment=p_environment and j.job_type in ('gateway_probe','cache_cleanup','provider_probe','private_probe','release_probe','scheduler_probe','watcher_probe')
      and ((j.state='pending' and j.next_attempt_at<=now()) or (j.state='running' and l.expires_at<=now()))
    order by j.next_attempt_at,j.id limit least(4,greatest(0,p_limit))
  ) due
$$;
create function public.record_dispatcher_heartbeat(p_workspace_id uuid,p_key text,p_owner text,p_fence bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_key<>'dispatcher' then raise exception 'invalid_dispatcher_lease'; end if;
  perform public.assert_lease(p_workspace_id,p_key,p_owner,p_fence);
  update public.scheduler_profiles set last_dispatcher_at=clock_timestamp() where workspace_id=p_workspace_id;
  if not found then raise exception 'schedule_not_authorized'; end if;
end $$;
create function public.safe_housekeeping(p_workspace_id uuid,p_key text,p_owner text,p_fence bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cache_deleted integer; budgets_deleted integer;
begin
  perform public.assert_lease(p_workspace_id,p_key,p_owner,p_fence);
  delete from public.federation_cache where key in(select key from public.federation_cache where expires_at<clock_timestamp() order by expires_at limit 100);
  get diagnostics cache_deleted=row_count;
  delete from public.federation_budget_buckets where (bucket,slot) in(select bucket,slot from public.federation_budget_buckets where slot<clock_timestamp()-interval '1 day' order by slot limit 100);
  get diagnostics budgets_deleted=row_count;
  return jsonb_build_object('expiredCacheRecords',cache_deleted,'expiredBudgetRecords',budgets_deleted);
end $$;

do $$ declare routine record; begin
  for routine in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('set_grant','revoke_grant','record_health_observation','get_health_snapshot','get_workspace_status','get_review_details','get_scheduler_profile','list_due_jobs','record_dispatcher_heartbeat','safe_housekeeping') loop
    execute format('revoke all on function %s from public,anon,authenticated',routine.signature);
    execute format('grant execute on function %s to service_role',routine.signature);
  end loop;
end $$;
