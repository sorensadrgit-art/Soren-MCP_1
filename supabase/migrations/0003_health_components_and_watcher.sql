create table public.watcher_receipts (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  principal_id uuid not null references public.principals(id), scheduled_slot timestamptz not null,
  payload_sha256 text not null check(payload_sha256 ~ '^[a-f0-9]{64}$'), observed_at timestamptz not null,
  failure_domain text not null, evidence_ref text not null, body jsonb not null,
  unique(workspace_id,principal_id,scheduled_slot)
);
alter table public.watcher_receipts enable row level security;
revoke all on public.watcher_receipts from public,anon,authenticated,soren_gateway;
grant all on public.watcher_receipts to service_role;
create trigger immutable_record before update or delete on public.watcher_receipts for each row execute function public.immutable_record();

create function public.get_operations_probe_state(p_workspace_id uuid,p_project_id text,p_environment text) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('databaseAvailable',exists(select 1 from public.workspaces where id=p_workspace_id and lifecycle='active'),
    'policy',(select policy from public.update_policies where workspace_id=p_workspace_id and project_id=p_project_id and environment=p_environment),
    'lastControllerEventAt',(select max(created_at) from public.update_release_audit where workspace_id=p_workspace_id and body->>'projectId'=p_project_id),
    'oldestPendingOperationAt',(select min(created_at) from public.update_release_operations where workspace_id=p_workspace_id and project_id=p_project_id and environment=p_environment and status in ('PENDING','SENT','UNKNOWN_OUTCOME')))
$$;

create function public.record_watcher_receipt(p_workspace_id uuid,p_actor_id uuid,p_client_id text,p_receipt jsonb,p_payload_sha256 text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare profile public.scheduler_profiles; prior public.watcher_receipts; receipt_id uuid; lease jsonb; observation jsonb; component text;
begin
  select * into profile from public.scheduler_profiles where workspace_id=p_workspace_id for update;
  if profile.workspace_id is null or profile.watcher_principal_id is distinct from p_actor_id or profile.watcher_client_id is distinct from p_client_id
    or profile.watcher_verified_at is null or profile.watcher_evidence_ref is null or profile.watcher_cadence_seconds is null
    or profile.watcher_failure_domain is null or profile.watcher_failure_domain=profile.failure_domain
    or p_receipt->>'failureDomain' is distinct from profile.watcher_failure_domain then raise exception 'independent_watcher_not_authorized' using errcode='42501'; end if;
  if not exists(select 1 from public.principals p join public.workspace_memberships m on m.principal_id=p.id join public.grants g on g.principal_id=p.id and g.workspace_id=m.workspace_id
    where p.id=p_actor_id and p.kind='observer' and p.client_id=p_client_id and p.revoked_at is null and m.workspace_id=p_workspace_id and m.revoked_at is null
      and g.revoked_at is null and g.expires_at>now() and 'receipts:write'=any(g.operations)) then raise exception 'watcher_grant_denied' using errcode='42501'; end if;
  if p_payload_sha256 !~ '^[a-f0-9]{64}$' or (p_receipt->>'observedAt')::timestamptz>clock_timestamp()+interval '5 seconds'
    or clock_timestamp()-(p_receipt->>'observedAt')::timestamptz>make_interval(secs=>profile.watcher_cadence_seconds*3)
    or (p_receipt->>'scheduledSlot')::timestamptz>clock_timestamp()+interval '5 seconds'
    or (p_receipt->>'scheduledSlot')::timestamptz<>to_timestamp(floor(extract(epoch from (p_receipt->>'observedAt')::timestamptz)/profile.watcher_cadence_seconds)*profile.watcher_cadence_seconds)
    or (p_receipt->>'observedAt')::timestamptz-(p_receipt->>'scheduledSlot')::timestamptz>make_interval(secs=>profile.watcher_cadence_seconds*3)
    or ((p_receipt->>'dispatcherFresh')::boolean and (profile.last_dispatcher_at is null or (p_receipt->>'observedAt')::timestamptz-profile.last_dispatcher_at>make_interval(secs=>profile.cadence_seconds*3)))
    or p_receipt->>'status' not in ('HEALTHY','DEGRADED','UNHEALTHY','UNKNOWN') or octet_length(p_receipt::text)>16384 then raise exception 'invalid_watcher_receipt'; end if;
  select * into prior from public.watcher_receipts where workspace_id=p_workspace_id and principal_id=p_actor_id and scheduled_slot=(p_receipt->>'scheduledSlot')::timestamptz;
  if prior.id is not null then
    if prior.payload_sha256<>p_payload_sha256 then raise exception 'watcher_payload_conflict' using errcode='23514'; end if;
    return jsonb_build_object('receiptId',prior.id,'duplicate',true,'durable',true);
  end if;
  lease:=public.acquire_lease(p_workspace_id,'watcher:'||p_actor_id,p_receipt->>'probeIdentity',120);
  if lease is null then raise exception 'watcher_overlap' using errcode='40001'; end if;
  insert into public.watcher_receipts(workspace_id,principal_id,scheduled_slot,payload_sha256,observed_at,failure_domain,evidence_ref,body)
    values(p_workspace_id,p_actor_id,(p_receipt->>'scheduledSlot')::timestamptz,p_payload_sha256,(p_receipt->>'observedAt')::timestamptz,p_receipt->>'failureDomain',p_receipt->>'evidenceRef',p_receipt) returning id into receipt_id;
  foreach component in array array['gateway','scheduler','independent_watcher'] loop
    observation:=jsonb_build_object('component',component,'environment',p_receipt->>'environment','observedAt',p_receipt->>'observedAt','scheduledSlot',to_timestamp(floor(extract(epoch from (p_receipt->>'observedAt')::timestamptz)/public.component_cadence(p_workspace_id,component))*public.component_cadence(p_workspace_id,component)),
      'status',case when component='independent_watcher' then 'HEALTHY' when component='scheduler' then case when (p_receipt->>'dispatcherFresh')::boolean then 'HEALTHY' else 'UNKNOWN' end else p_receipt->>'status' end,
      'failureClass',case when component='independent_watcher' then null when component='scheduler' and not (p_receipt->>'dispatcherFresh')::boolean then 'scheduler_stale'
        when component='gateway' and p_receipt->>'status'<>'HEALTHY' then 'gateway_availability' else null end,
      'latencyMs',null,'probeIdentity',p_receipt->>'probeIdentity','sourceRevision',p_receipt->>'sourceRevision','evidenceRefs',jsonb_build_array('watcher-receipt:'||receipt_id));
    perform public.record_health_observation(p_workspace_id,observation,lease->>'key',lease->>'owner',(lease->>'fence')::bigint);
  end loop;
  perform public.assert_lease(p_workspace_id,lease->>'key',lease->>'owner',(lease->>'fence')::bigint);
  update public.scheduler_profiles set last_watcher_at=greatest(coalesce(last_watcher_at,'-infinity'::timestamptz),(p_receipt->>'observedAt')::timestamptz) where workspace_id=p_workspace_id;
  update public.leases set expires_at=clock_timestamp() where workspace_id=p_workspace_id and key=lease->>'key';
  return jsonb_build_object('receiptId',receipt_id,'duplicate',false,'durable',true);
end $$;
revoke all on function public.get_operations_probe_state(uuid,text,text),public.record_watcher_receipt(uuid,uuid,text,jsonb,text) from public,anon,authenticated,soren_gateway;
grant execute on function public.get_operations_probe_state(uuid,text,text),public.record_watcher_receipt(uuid,uuid,text,jsonb,text) to service_role;
