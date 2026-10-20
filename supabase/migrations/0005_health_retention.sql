-- Fixed retention policy: raw observations 30 days, daily aggregates 180 days.
-- Review, revocation, release and audit evidence is outside this housekeeping operation.
create table public.health_daily_aggregates (
  workspace_id uuid not null references public.workspaces(id), component text not null, environment text not null, day date not null,
  sample_count bigint not null check(sample_count>=0), healthy_count bigint not null check(healthy_count>=0),
  degraded_count bigint not null check(degraded_count>=0), unhealthy_count bigint not null check(unhealthy_count>=0),
  unknown_count bigint not null check(unknown_count>=0), disabled_count bigint not null check(disabled_count>=0),
  last_observed_at timestamptz not null, primary key(workspace_id,component,environment,day),
  check(sample_count=healthy_count+degraded_count+unhealthy_count+unknown_count+disabled_count)
);
alter table public.health_daily_aggregates enable row level security;
revoke all on public.health_daily_aggregates from public,anon,authenticated,soren_gateway;
grant all on public.health_daily_aggregates to service_role;
grant select on public.health_daily_aggregates to authenticated;
create policy management_read on public.health_daily_aggregates for select to authenticated using(public.can_workspace(workspace_id,'management:read'));

create or replace function public.safe_housekeeping(p_workspace_id uuid,p_key text,p_owner text,p_fence bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cache_deleted integer; budgets_deleted integer; observations_deleted integer; aggregates_deleted integer; expired_ids uuid[];
begin
  perform public.assert_lease(p_workspace_id,p_key,p_owner,p_fence);
  delete from public.federation_cache where key in(select key from public.federation_cache where expires_at<clock_timestamp() order by expires_at limit 100);
  get diagnostics cache_deleted=row_count;
  delete from public.federation_budget_buckets where (bucket,slot) in(select bucket,slot from public.federation_budget_buckets where slot<clock_timestamp()-interval '1 day' order by slot limit 100);
  get diagnostics budgets_deleted=row_count;
  select array_agg(id) into expired_ids from (select id from public.health_observations where workspace_id=p_workspace_id and observed_at<clock_timestamp()-interval '30 days' order by observed_at,id limit 100 for update skip locked) expired;
  insert into public.health_daily_aggregates(workspace_id,component,environment,day,sample_count,healthy_count,degraded_count,unhealthy_count,unknown_count,disabled_count,last_observed_at)
    select workspace_id,component,environment,(observed_at at time zone 'UTC')::date,count(*),count(*) filter(where status='HEALTHY'),count(*) filter(where status='DEGRADED'),count(*) filter(where status='UNHEALTHY'),count(*) filter(where status='UNKNOWN'),count(*) filter(where status='DISABLED'),max(observed_at)
    from public.health_observations where id=any(expired_ids) and (observed_at at time zone 'UTC')::date>=(clock_timestamp() at time zone 'UTC')::date-180 group by workspace_id,component,environment,(observed_at at time zone 'UTC')::date
    on conflict(workspace_id,component,environment,day) do update set
      sample_count=public.health_daily_aggregates.sample_count+excluded.sample_count,
      healthy_count=public.health_daily_aggregates.healthy_count+excluded.healthy_count,
      degraded_count=public.health_daily_aggregates.degraded_count+excluded.degraded_count,
      unhealthy_count=public.health_daily_aggregates.unhealthy_count+excluded.unhealthy_count,
      unknown_count=public.health_daily_aggregates.unknown_count+excluded.unknown_count,
      disabled_count=public.health_daily_aggregates.disabled_count+excluded.disabled_count,
      last_observed_at=greatest(public.health_daily_aggregates.last_observed_at,excluded.last_observed_at);
  delete from public.health_observations where workspace_id=p_workspace_id and id=any(expired_ids);
  get diagnostics observations_deleted=row_count;
  delete from public.health_daily_aggregates where (workspace_id,component,environment,day) in (
    select workspace_id,component,environment,day from public.health_daily_aggregates where workspace_id=p_workspace_id and day<(clock_timestamp() at time zone 'UTC')::date-180 order by day,component,environment limit 100);
  get diagnostics aggregates_deleted=row_count;
  perform public.assert_lease(p_workspace_id,p_key,p_owner,p_fence);
  return jsonb_build_object('expiredCacheRecords',cache_deleted,'expiredBudgetRecords',budgets_deleted,'expiredHealthObservations',observations_deleted,'expiredHealthAggregates',aggregates_deleted,
    'healthCleanupRemaining',exists(select 1 from public.health_observations where workspace_id=p_workspace_id and observed_at<clock_timestamp()-interval '30 days'));
end $$;
revoke all on function public.safe_housekeeping(uuid,text,text,bigint) from public,anon,authenticated,soren_gateway;
grant execute on function public.safe_housekeeping(uuid,text,text,bigint) to service_role;
