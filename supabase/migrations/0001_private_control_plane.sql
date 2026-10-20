-- Apply through an authorized Supabase migration runner. No seed accounts or public private-data policies.
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  lifecycle text not null default 'active' check (lifecycle in ('active','suspended')),
  approval_generation bigint not null default 0,
  active_catalog_generation uuid,
  created_at timestamptz not null default now()
);
create table public.principals (
  id uuid primary key default gen_random_uuid(), auth_issuer text not null, auth_subject uuid not null,
  client_id text not null, kind text not null check (kind in ('human','agent','observer','maintenance','release_controller')),
  revoked_at timestamptz, unique(auth_issuer,auth_subject,client_id)
);
create table public.workspace_memberships (
  workspace_id uuid not null references public.workspaces(id), principal_id uuid not null references public.principals(id),
  role text not null check (role in ('owner','reviewer','observer','maintenance','reader')), revision bigint not null default 1,
  revoked_at timestamptz, primary key(workspace_id,principal_id)
);
create table public.grants (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  principal_id uuid not null references public.principals(id), operations text[] not null default '{}',
  revision bigint not null default 1, expires_at timestamptz not null, revoked_at timestamptz,
  created_by uuid not null references public.principals(id), created_at timestamptz not null default now(),
  check (operations <@ array['skills:read','receipts:write','health:read','health:observe','maintenance:run','updates:read','updates:promote','updates:pause','updates:evidence']::text[])
);
create table public.skills (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  repository text not null check (repository ~ '^https://(github.com|gitlab.com|bitbucket.org)/[a-z0-9_.-]+/[a-z0-9_./-]+$'),
  directory text not null check (directory !~ '(^/|\\|%|:|(^|/)\.\.?(/|$))'),
  unique(workspace_id,repository,directory), unique(workspace_id,id)
);
create table public.source_aliases (
  workspace_id uuid not null references public.workspaces(id), skill_id uuid not null,
  provider text not null, source_identity text not null, provisional boolean not null default true,
  primary key(workspace_id,provider,source_identity), foreign key(workspace_id,skill_id) references public.skills(workspace_id,id)
);
create table public.skill_versions (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, skill_id uuid not null,
  revision text not null check (revision ~ '^[a-f0-9]{40,64}$'),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[a-f0-9]{64}$'), manifest jsonb not null,
  license text not null, declared_capabilities text[] not null default '{}', created_at timestamptz not null default now(),
  foreign key(workspace_id,skill_id) references public.skills(workspace_id,id),
  unique(workspace_id,skill_id,revision,manifest_sha256), unique(workspace_id,id)
);
create table public.skill_files (
  workspace_id uuid not null, version_id uuid not null, path text not null,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'), byte_count integer not null check(byte_count between 0 and 60000),
  media_type text not null, content_base64 text not null check (length(content_base64) <= 80000),
  primary key(workspace_id,version_id,path), foreign key(workspace_id,version_id) references public.skill_versions(workspace_id,id),
  check (path <> '' and path !~ '(^/|\\|%|:|(^|/)\.\.?(/|$))'),
  check (octet_length(decode(content_base64,'base64'))=byte_count),
  check (encode(sha256(decode(content_base64,'base64')),'hex')=sha256)
);
create table public.reviews (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, version_id uuid not null,
  manifest_sha256 text not null check (manifest_sha256 ~ '^[a-f0-9]{64}$'), reviewer_id uuid not null references public.principals(id),
  decision text not null check(decision in ('approve','reject')), review_revision bigint not null,
  policy_sha256 text not null check (policy_sha256 ~ '^[a-f0-9]{64}$'), evidence_ref text not null check(length(evidence_ref) between 1 and 256),
  created_at timestamptz not null default now(), foreign key(workspace_id,version_id) references public.skill_versions(workspace_id,id),
  unique(workspace_id,version_id,review_revision)
);
create table public.revocations (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, version_id uuid not null,
  actor_id uuid not null references public.principals(id), reason text not null check(length(reason) between 1 and 256),
  created_at timestamptz not null default now(), foreign key(workspace_id,version_id) references public.skill_versions(workspace_id,id)
);
create table public.catalog_generations (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  generation bigint not null, actor_id uuid not null references public.principals(id), created_at timestamptz not null default now(),
  unique(workspace_id,generation), unique(workspace_id,id)
);
alter table public.workspaces add constraint active_generation_workspace foreign key(id,active_catalog_generation) references public.catalog_generations(workspace_id,id);
create table public.catalog_members (
  workspace_id uuid not null, generation_id uuid not null, version_id uuid not null,
  primary key(workspace_id,generation_id,version_id),
  foreign key(workspace_id,generation_id) references public.catalog_generations(workspace_id,id),
  foreign key(workspace_id,version_id) references public.skill_versions(workspace_id,id)
);
create table public.installation_receipts (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  principal_id uuid not null references public.principals(id), client text not null,
  verification_level text not null check(verification_level in ('DETECTED','CONFIGURED','AUTHENTICATED','PROTOCOL_VERIFIED','TOOLS_AVAILABLE','AGENT_INVOCATION_VERIFIED')),
  outcome text not null check(outcome in ('NOT_RUN','PASS','FAIL','BLOCKED','NOT_APPLICABLE')),
  source_revision text not null, evidence_ref text not null, observed_at timestamptz not null,
  created_at timestamptz not null default now()
);
create table public.leases (
  workspace_id uuid not null references public.workspaces(id), key text not null, owner text not null,
  fence bigint not null check(fence > 0), expires_at timestamptz not null, primary key(workspace_id,key)
);
create table public.jobs (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  intent_key text not null, payload_sha256 text not null check(payload_sha256 ~ '^[a-f0-9]{64}$'),
  job_type text not null check(job_type in ('gateway_probe','provider_probe','private_probe','release_probe','scheduler_probe','watcher_probe','queue_reconcile','cache_cleanup')),
  environment text not null default 'default' check(environment ~ '^[A-Za-z0-9_.-]{1,80}$'),
  scheduled_slot timestamptz not null, target_identity text not null,
  state text not null default 'pending' check(state in ('pending','running','succeeded','failed','dead_letter')),
  attempts integer not null default 0 check(attempts between 0 and 3),
  next_attempt_at timestamptz not null default now(), deadline_at timestamptz not null,
  result_identity text, failure_class text, created_at timestamptz not null default now(), finished_at timestamptz,
  unique(workspace_id,intent_key), unique(workspace_id,job_type,environment,scheduled_slot,target_identity)
);
create table public.job_attempts (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  job_id uuid not null references public.jobs(id), attempt integer not null, owner text not null, fence bigint not null,
  started_at timestamptz not null default now(), finished_at timestamptz, outcome text, unique(job_id,attempt)
);
create table public.health_observations (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  component text not null, environment text not null, observed_at timestamptz not null,
  scheduled_slot timestamptz not null, status text not null check(status in ('HEALTHY','DEGRADED','UNHEALTHY','UNKNOWN','DISABLED')),
  latency_ms integer check(latency_ms between 0 and 45000), failure_class text, probe_identity text not null,
  source_revision text, evidence_refs text[] not null default '{}',
  unique(workspace_id,component,environment,scheduled_slot)
);
create table public.incidents (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  component text not null, environment text not null, failure_class text not null,
  severity text not null default 'warning' check(severity in ('info','warning','critical')),
  state text not null check(state in ('SUSPECT','OPEN','RECOVERING','RESOLVED','UNKNOWN')),
  first_observed_at timestamptz not null, last_observed_at timestamptz not null,
  last_notified_at timestamptz, resolved_at timestamptz,
  unique(workspace_id,component,environment,failure_class)
);
create table public.incident_events (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  incident_id uuid not null references public.incidents(id), event text not null check(event in ('opened','recovered','escalated')),
  observed_at timestamptz not null default now(), evidence_ref text
);
create table public.operation_events (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  actor_id uuid references public.principals(id), operation text not null, target_identity text not null,
  evidence_ref text, created_at timestamptz not null default now()
);
create table public.scheduler_profiles (
  workspace_id uuid primary key references public.workspaces(id),
  profile text not null check(profile in ('frequent','budget')), cadence_seconds integer not null check(cadence_seconds between 300 and 172800),
  timezone text not null default 'UTC' check(timezone='UTC'), entitlement_evidence_ref text not null,
  owner_id uuid not null references public.principals(id), consent_at timestamptz not null,
  failure_domain text not null, watcher_failure_domain text, watcher_evidence_ref text,
  watcher_principal_id uuid references public.principals(id), watcher_client_id text, watcher_verified_at timestamptz,
  watcher_cadence_seconds integer check(watcher_cadence_seconds between 60 and 172800),
  last_dispatcher_at timestamptz, last_watcher_at timestamptz
);
create table public.federation_budget_buckets (
  bucket text not null, slot timestamptz not null, used integer not null default 0, primary key(bucket,slot)
);
create table public.federation_cache (
  key text primary key check(key ~ '^[a-f0-9]{64}$'), value jsonb not null,
  negative boolean not null, expires_at timestamptz not null, created_at timestamptz not null default now(),
  check(octet_length(value::text) <= 650000)
);

create function public.immutable_record() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'immutable_record' using errcode='23514'; end $$;
do $$ declare relation text; begin
  foreach relation in array array['skill_versions','skill_files','reviews','revocations','catalog_generations','catalog_members','operation_events','incident_events'] loop
    execute format('create trigger immutable_record before update or delete on public.%I for each row execute function public.immutable_record()',relation);
  end loop;
end $$;
create function public.component_cadence(p_workspace_id uuid,p_component text) returns integer
language sql stable security definer set search_path='' as $$
  select case when p_component like 'provider:%' then greatest(cadence_seconds,1800)
    when p_component in ('independent_watcher','watcher_deadman') then coalesce(watcher_cadence_seconds,cadence_seconds) else cadence_seconds end
  from public.scheduler_profiles where workspace_id=p_workspace_id
$$;

create function public.can_workspace(p_workspace_id uuid, p_operation text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspaces w join public.workspace_memberships m on m.workspace_id=w.id
    join public.principals p on p.id=m.principal_id
    where w.id=p_workspace_id and w.lifecycle='active' and m.revoked_at is null and p.revoked_at is null
    and p.auth_subject=auth.uid() and p.auth_issuer=auth.jwt()->>'iss' and p.client_id=auth.jwt()->>'client_id'
    and ((p.kind='human' and m.role in ('owner','reviewer') and p_operation='management:read')
      or exists(select 1 from public.grants g where g.workspace_id=w.id and g.principal_id=p.id and g.revoked_at is null and g.expires_at>now() and p_operation=any(g.operations)))
  )
$$;
create function public.version_approved(p_workspace_id uuid,p_version_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists(select 1 from public.revocations r where r.workspace_id=p_workspace_id and r.version_id=p_version_id)
    and coalesce((select r.decision='approve' and r.manifest_sha256=v.manifest_sha256 from public.reviews r
      join public.skill_versions v on v.workspace_id=r.workspace_id and v.id=r.version_id
      where r.workspace_id=p_workspace_id and r.version_id=p_version_id order by r.review_revision desc limit 1),false)
$$;
create function public.version_published(p_workspace_id uuid,p_version_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.catalog_members m join public.workspaces w on w.id=m.workspace_id and w.active_catalog_generation=m.generation_id where m.workspace_id=p_workspace_id and m.version_id=p_version_id)
$$;
create function public.can_read_version(p_workspace_id uuid,p_version_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.can_workspace(p_workspace_id,'skills:read') and public.version_approved(p_workspace_id,p_version_id) and public.version_published(p_workspace_id,p_version_id)
$$;

do $$ declare relation text; begin
  foreach relation in array array['workspaces','principals','workspace_memberships','grants','skills','source_aliases','skill_versions','skill_files','reviews','revocations','catalog_generations','catalog_members','installation_receipts','leases','jobs','job_attempts','health_observations','incidents','incident_events','operation_events','scheduler_profiles','federation_budget_buckets','federation_cache'] loop
    execute format('alter table public.%I enable row level security',relation);
    execute format('revoke all on public.%I from anon, authenticated',relation);
    execute format('grant all on public.%I to service_role',relation);
  end loop;
  foreach relation in array array['workspace_memberships','grants','skills','source_aliases','skill_versions','skill_files','reviews','revocations','catalog_generations','catalog_members','installation_receipts','health_observations','incidents','incident_events','operation_events','scheduler_profiles'] loop
    execute format('grant select on public.%I to authenticated',relation);
    execute format('create policy management_read on public.%I for select to authenticated using(public.can_workspace(workspace_id,''management:read''))',relation);
  end loop;
end $$;
grant select on public.skill_versions,public.skill_files,public.skills,public.catalog_generations,public.catalog_members to authenticated;
create policy approved_version_read on public.skill_versions for select to authenticated using(public.can_read_version(workspace_id,id));
create policy approved_file_read on public.skill_files for select to authenticated using(public.can_read_version(workspace_id,version_id));
create policy approved_skill_read on public.skills for select to authenticated using(public.can_workspace(workspace_id,'skills:read') and exists(select 1 from public.skill_versions v where v.workspace_id=skills.workspace_id and v.skill_id=skills.id));
create policy own_workspace_read on public.workspaces for select to authenticated using(public.can_workspace(id,'management:read') or public.can_workspace(id,'skills:read'));
grant select on public.workspaces to authenticated;

create function public.get_principal_context(p_workspace_id uuid,p_issuer text,p_subject uuid,p_client_id text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare context jsonb;
begin
  if current_setting('role',true)='soren_gateway' and coalesce(auth.jwt()->>'workspace_id','')<>p_workspace_id::text then raise exception 'workspace_access_denied' using errcode='42501'; end if;
  select jsonb_build_object('workspaceId',w.id,'subjectId',p.id,'clientId',p.client_id,'kind',p.kind,'role',m.role,'grantRevision',greatest(m.revision,coalesce(max(g.revision),0)),
    'permissions',coalesce(jsonb_agg(distinct op) filter(where op is not null),'[]'::jsonb) ||
      case when p.kind='human' and m.role='owner' then '["dashboard:read","health:read","updates:read","reviews:write","grants:write","updates:arm","updates:pause","updates:promote"]'::jsonb
        when p.kind='human' and m.role='reviewer' then '["dashboard:read","health:read","updates:read","reviews:write"]'::jsonb else '[]'::jsonb end)
  into context from public.workspaces w join public.workspace_memberships m on m.workspace_id=w.id
  join public.principals p on p.id=m.principal_id left join public.grants g on g.workspace_id=w.id and g.principal_id=p.id and g.revoked_at is null and g.expires_at>now()
  left join lateral unnest(g.operations) op on true
  where w.id=p_workspace_id and w.lifecycle='active' and p.auth_issuer=p_issuer and p.auth_subject=p_subject and p.client_id=p_client_id and p.revoked_at is null and m.revoked_at is null
  group by w.id,p.id,m.role,m.revision;
  return context;
end $$;

create function public.assert_human(p_workspace_id uuid,p_actor_id uuid,p_owner boolean default false) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.principals p join public.workspace_memberships m on m.principal_id=p.id join public.workspaces w on w.id=m.workspace_id
    where w.id=p_workspace_id and w.lifecycle='active' and p.id=p_actor_id and p.kind='human' and p.revoked_at is null and m.revoked_at is null
    and (m.role='owner' or (not p_owner and m.role='reviewer'))) then raise exception 'human_authority_required' using errcode='42501'; end if;
end $$;

create function public.stage_skill_version(p_workspace_id uuid,p_actor_id uuid,p_manifest jsonb,p_manifest_sha256 text,p_files jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare skill uuid; version uuid; item jsonb; total integer;
begin
  perform public.assert_human(p_workspace_id,p_actor_id);
  if p_manifest_sha256 !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_files)<>'array' or jsonb_array_length(p_files) not between 1 and 128 then raise exception 'invalid_manifest'; end if;
  select sum((value->>'byteCount')::integer) into total from jsonb_array_elements(p_files);
  if total>2097152 or not exists(select 1 from jsonb_array_elements(p_files) where value->>'path'='SKILL.md')
    or jsonb_array_length(p_manifest->'files')<>jsonb_array_length(p_files)
    or exists(select 1 from jsonb_array_elements(p_files) f where not exists(select 1 from jsonb_array_elements(p_manifest->'files') m where m->>'path'=f->>'path' and m->>'sha256'=f->>'sha256' and m->>'byteCount'=f->>'byteCount' and m->>'mediaType'=f->>'mediaType')) then raise exception 'invalid_package'; end if;
  insert into public.skills(workspace_id,repository,directory) values(p_workspace_id,p_manifest->>'repository',p_manifest->>'directory') on conflict(workspace_id,repository,directory) do update set directory=excluded.directory returning id into skill;
  insert into public.skill_versions(workspace_id,skill_id,revision,manifest_sha256,manifest,license,declared_capabilities)
    values(p_workspace_id,skill,p_manifest->>'revision',p_manifest_sha256,p_manifest,p_manifest->>'license',array(select jsonb_array_elements_text(p_manifest->'capabilities')))
    on conflict(workspace_id,skill_id,revision,manifest_sha256) do nothing returning id into version;
  if version is null then select id into version from public.skill_versions where workspace_id=p_workspace_id and skill_id=skill and revision=p_manifest->>'revision' and manifest_sha256=p_manifest_sha256; return version; end if;
  for item in select value from jsonb_array_elements(p_files) loop
    insert into public.skill_files(workspace_id,version_id,path,sha256,byte_count,media_type,content_base64) values(p_workspace_id,version,item->>'path',item->>'sha256',(item->>'byteCount')::integer,item->>'mediaType',item->>'contentBase64');
  end loop;
  insert into public.operation_events(workspace_id,actor_id,operation,target_identity) values(p_workspace_id,p_actor_id,'version_staged',version::text);
  return version;
end $$;

create function public.review_skill_version(p_workspace_id uuid,p_actor_id uuid,p_version_id uuid,p_manifest_sha256 text,p_decision text,p_expected_revision bigint,p_policy_sha256 text,p_evidence_ref text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare current_revision bigint; digest text; result_id uuid;
begin
  perform public.assert_human(p_workspace_id,p_actor_id);
  select manifest_sha256 into digest from public.skill_versions where workspace_id=p_workspace_id and id=p_version_id for update;
  if digest is null or digest<>p_manifest_sha256 then raise exception 'version_digest_conflict' using errcode='23514'; end if;
  if exists(select 1 from public.revocations where workspace_id=p_workspace_id and version_id=p_version_id) then raise exception 'version_revoked' using errcode='42501'; end if;
  select coalesce(max(review_revision),0) into current_revision from public.reviews where workspace_id=p_workspace_id and version_id=p_version_id;
  if current_revision<>p_expected_revision then raise exception 'review_revision_conflict' using errcode='40001'; end if;
  insert into public.reviews(workspace_id,version_id,manifest_sha256,reviewer_id,decision,review_revision,policy_sha256,evidence_ref) values(p_workspace_id,p_version_id,p_manifest_sha256,p_actor_id,p_decision,current_revision+1,p_policy_sha256,p_evidence_ref) returning id into result_id;
  update public.workspaces set approval_generation=approval_generation+1 where id=p_workspace_id;
  insert into public.operation_events(workspace_id,actor_id,operation,target_identity,evidence_ref) values(p_workspace_id,p_actor_id,'version_reviewed',p_version_id::text,p_evidence_ref);
  return jsonb_build_object('reviewId',result_id,'reviewRevision',current_revision+1,'decision',p_decision);
end $$;

create function public.revoke_skill_version(p_workspace_id uuid,p_actor_id uuid,p_version_id uuid,p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  perform public.assert_human(p_workspace_id,p_actor_id,true);
  perform 1 from public.skill_versions where workspace_id=p_workspace_id and id=p_version_id for update;
  insert into public.revocations(workspace_id,version_id,actor_id,reason) values(p_workspace_id,p_version_id,p_actor_id,p_reason) returning id into result;
  update public.workspaces set approval_generation=approval_generation+1 where id=p_workspace_id;
  insert into public.operation_events(workspace_id,actor_id,operation,target_identity) values(p_workspace_id,p_actor_id,'version_revoked',p_version_id::text);
  return result;
end $$;

create function public.publish_catalog(p_workspace_id uuid,p_actor_id uuid,p_version_ids uuid[],p_expected_generation bigint) returns uuid
language plpgsql security definer set search_path = '' as $$
declare current_generation bigint; result uuid; version uuid;
begin
  perform public.assert_human(p_workspace_id,p_actor_id);
  select approval_generation into current_generation from public.workspaces where id=p_workspace_id for update;
  if current_generation<>p_expected_generation then raise exception 'catalog_generation_conflict' using errcode='40001'; end if;
  foreach version in array p_version_ids loop
    perform 1 from public.skill_versions where workspace_id=p_workspace_id and id=version for update;
    if not public.version_approved(p_workspace_id,version) then raise exception 'version_not_approved' using errcode='42501'; end if;
  end loop;
  insert into public.catalog_generations(workspace_id,generation,actor_id) values(p_workspace_id,current_generation+1,p_actor_id) returning id into result;
  insert into public.catalog_members(workspace_id,generation_id,version_id) select p_workspace_id,result,unnest(p_version_ids);
  update public.workspaces set approval_generation=current_generation+1,active_catalog_generation=result where id=p_workspace_id;
  return result;
end $$;

create function public.read_private_version(p_workspace_id uuid,p_principal_id uuid,p_version_id uuid,p_manifest_sha256 text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if current_setting('role',true)='soren_gateway' and coalesce(auth.jwt()->>'workspace_id','')<>p_workspace_id::text then raise exception 'workspace_access_denied' using errcode='42501'; end if;
  if not exists(select 1 from public.grants g join public.principals p on p.id=g.principal_id join public.workspace_memberships m on m.principal_id=p.id and m.workspace_id=g.workspace_id join public.workspaces w on w.id=m.workspace_id
    where g.workspace_id=p_workspace_id and w.lifecycle='active' and g.principal_id=p_principal_id and 'skills:read'=any(g.operations) and g.revoked_at is null and g.expires_at>now() and p.revoked_at is null and m.revoked_at is null)
    or not public.version_approved(p_workspace_id,p_version_id) then raise exception 'private_access_denied' using errcode='42501'; end if;
  select jsonb_build_object('versionId',v.id,'revision',v.revision,'manifestSha256',v.manifest_sha256,'manifest',v.manifest,'approvalGeneration',w.approval_generation,
    'files',(select jsonb_agg(jsonb_build_object('path',f.path,'sha256',f.sha256,'byteCount',f.byte_count,'contentBase64',f.content_base64)) from public.skill_files f where f.workspace_id=v.workspace_id and f.version_id=v.id))
    into result from public.skill_versions v join public.workspaces w on w.id=v.workspace_id
    join public.catalog_members m on m.workspace_id=v.workspace_id and m.version_id=v.id and m.generation_id=w.active_catalog_generation
    where v.workspace_id=p_workspace_id and v.id=p_version_id and v.manifest_sha256=p_manifest_sha256;
  if result is null then raise exception 'private_access_denied' using errcode='42501'; end if;
  return result;
end $$;

create function public.acquire_lease(p_workspace_id uuid,p_key text,p_owner text,p_ttl_seconds integer default 120) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result public.leases;
begin
  if p_ttl_seconds not between 1 and 120 or length(p_key) not between 1 and 256 or length(p_owner) not between 1 and 160 then raise exception 'invalid_lease'; end if;
  insert into public.leases(workspace_id,key,owner,fence,expires_at) values(p_workspace_id,p_key,p_owner,1,clock_timestamp()+make_interval(secs=>p_ttl_seconds))
    on conflict(workspace_id,key) do update set owner=excluded.owner,fence=public.leases.fence+1,expires_at=excluded.expires_at where public.leases.expires_at<=clock_timestamp() returning * into result;
  if result.key is null then return null; end if;
  return jsonb_build_object('key',result.key,'owner',result.owner,'fence',result.fence,'expiresAt',result.expires_at);
end $$;
create function public.assert_lease(p_workspace_id uuid,p_key text,p_owner text,p_fence bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.leases where workspace_id=p_workspace_id and key=p_key and owner=p_owner and fence=p_fence and expires_at>clock_timestamp() for update;
  if not found then raise exception 'stale_lease_fence' using errcode='40001'; end if;
end $$;
create function public.renew_lease(p_workspace_id uuid,p_key text,p_owner text,p_fence bigint,p_ttl_seconds integer default 120) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if p_ttl_seconds not between 1 and 120 then raise exception 'invalid_lease'; end if;
  perform public.assert_lease(p_workspace_id,p_key,p_owner,p_fence);
  update public.leases set expires_at=clock_timestamp()+make_interval(secs=>p_ttl_seconds) where workspace_id=p_workspace_id and key=p_key;
  return (select jsonb_build_object('key',key,'owner',owner,'fence',fence,'expiresAt',expires_at) from public.leases where workspace_id=p_workspace_id and key=p_key);
end $$;

create function public.claim_job(p_workspace_id uuid,p_intent_key text,p_payload_sha256 text,p_job_type text,p_scheduled_slot timestamptz,p_target_identity text,p_owner text,p_environment text default 'default') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare job public.jobs; token jsonb; exhausted_incident_id uuid;
begin
  if length(p_intent_key) not between 1 and 512 or length(p_target_identity) not between 1 and 256 then raise exception 'invalid_job'; end if;
  insert into public.jobs(workspace_id,intent_key,payload_sha256,job_type,environment,scheduled_slot,target_identity,deadline_at) values(p_workspace_id,p_intent_key,p_payload_sha256,p_job_type,p_environment,p_scheduled_slot,p_target_identity,clock_timestamp()+interval '45 seconds') on conflict do nothing;
  select * into job from public.jobs where workspace_id=p_workspace_id and intent_key=p_intent_key for update;
  if job.id is null or job.payload_sha256<>p_payload_sha256 or job.job_type<>p_job_type or job.environment<>p_environment or job.target_identity<>p_target_identity or job.scheduled_slot<>p_scheduled_slot then raise exception 'job_payload_conflict' using errcode='23514'; end if;
  if job.state in ('succeeded','dead_letter','failed') or job.next_attempt_at>clock_timestamp() then return jsonb_build_object('claimed',false,'jobId',job.id,'state',job.state,'resultIdentity',job.result_identity); end if;
  token:=public.acquire_lease(p_workspace_id,'job:'||job.id,p_owner,120);
  if token is null then return jsonb_build_object('claimed',false,'jobId',job.id,'state',job.state); end if;
  if job.attempts>=3 then
    update public.jobs set state='dead_letter',failure_class='lease_exhausted',finished_at=clock_timestamp() where id=job.id;
    insert into public.incidents(workspace_id,component,environment,failure_class,state,first_observed_at,last_observed_at,last_notified_at)
      values(p_workspace_id,'job:'||job.job_type,job.environment,'job_exhausted','OPEN',clock_timestamp(),clock_timestamp(),clock_timestamp())
      on conflict(workspace_id,component,environment,failure_class) do nothing returning id into exhausted_incident_id;
    if exhausted_incident_id is not null then insert into public.incident_events(workspace_id,incident_id,event,evidence_ref) values(p_workspace_id,exhausted_incident_id,'opened','job:'||job.id); end if;
    update public.leases set expires_at=clock_timestamp() where workspace_id=p_workspace_id and key='job:'||job.id;
    return jsonb_build_object('claimed',false,'jobId',job.id,'state','dead_letter');
  end if;
  update public.jobs set state='running',attempts=attempts+1,deadline_at=clock_timestamp()+interval '45 seconds' where id=job.id;
  insert into public.job_attempts(workspace_id,job_id,attempt,owner,fence) values(p_workspace_id,job.id,job.attempts+1,p_owner,(token->>'fence')::bigint);
  return jsonb_build_object('claimed',true,'jobId',job.id,'state','running','attempt',job.attempts+1,'lease',token);
end $$;
create function public.finish_job(p_workspace_id uuid,p_job_id uuid,p_owner text,p_fence bigint,p_success boolean,p_result_identity text,p_failure_class text default null,p_retry_after_seconds integer default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare job public.jobs; retry boolean; delay integer; next_state text; incident_id uuid;
begin
  perform public.assert_lease(p_workspace_id,'job:'||p_job_id,p_owner,p_fence);
  select * into job from public.jobs where workspace_id=p_workspace_id and id=p_job_id for update;
  if job.state<>'running' or job.deadline_at<clock_timestamp() then raise exception 'job_not_running' using errcode='40001'; end if;
  retry:=not p_success and job.attempts<3 and p_failure_class not in ('authentication','invalid_payload','policy_denied','unknown_outcome');
  delay:=greatest(case job.attempts when 1 then 30 when 2 then 120 else 600 end,least(86400,greatest(0,p_retry_after_seconds)));
  next_state:=case when p_success then 'succeeded' when retry then 'pending' else 'dead_letter' end;
  update public.jobs set state=next_state,result_identity=p_result_identity,failure_class=p_failure_class,next_attempt_at=clock_timestamp()+make_interval(secs=>delay),finished_at=case when retry then null else clock_timestamp() end where id=p_job_id;
  update public.job_attempts set finished_at=clock_timestamp(),outcome=next_state where job_id=p_job_id and attempt=job.attempts;
  if next_state='dead_letter' then
    insert into public.incidents(workspace_id,component,environment,failure_class,state,first_observed_at,last_observed_at,last_notified_at)
      values(p_workspace_id,'job:'||job.job_type,job.environment,'job_exhausted','OPEN',clock_timestamp(),clock_timestamp(),clock_timestamp())
      on conflict(workspace_id,component,environment,failure_class) do nothing returning id into incident_id;
    if incident_id is not null then insert into public.incident_events(workspace_id,incident_id,event,evidence_ref) values(p_workspace_id,incident_id,'opened','job:'||job.id);
    else update public.incidents set last_observed_at=clock_timestamp(),state='OPEN',resolved_at=null where workspace_id=p_workspace_id and component='job:'||job.job_type and environment=job.environment and failure_class='job_exhausted'; end if;
  end if;
  update public.leases set expires_at=clock_timestamp() where workspace_id=p_workspace_id and key='job:'||p_job_id;
  return jsonb_build_object('state',next_state,'retryAfterSeconds',case when retry then delay else null end);
end $$;

create function public.claim_federation_budget(p_subject text,p_authenticated boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare current_slot timestamptz:=date_trunc('minute',clock_timestamp()); subject_bucket text; used_count integer; global_count integer;
begin
  if p_subject !~ '^[a-f0-9]{64}$' then raise exception 'invalid_budget_subject'; end if;
  subject_bucket:=case when p_authenticated then 'grant:' else 'address:' end||p_subject;
  -- Lock the global bucket first so concurrent per-address claims cannot exceed the aggregate cap.
  insert into public.federation_budget_buckets(bucket,slot) values('global',current_slot) on conflict do nothing;
  select used into global_count from public.federation_budget_buckets where bucket='global' and slot=current_slot for update;
  insert into public.federation_budget_buckets(bucket,slot) values(subject_bucket,current_slot) on conflict do nothing;
  select used into used_count from public.federation_budget_buckets where bucket=subject_bucket and slot=current_slot for update;
  if global_count>=30 or used_count>=(case when p_authenticated then 30 else 6 end) then return jsonb_build_object('allowed',false,'retry_after',greatest(1,ceil(extract(epoch from current_slot+interval '1 minute'-clock_timestamp())))); end if;
  update public.federation_budget_buckets set used=used+1 where slot=current_slot and bucket in ('global',subject_bucket);
  return jsonb_build_object('allowed',true,'retry_after',0);
end $$;
create function public.get_federation_cache(p_key text) returns jsonb
language sql stable security definer set search_path = '' as $$ select value from public.federation_cache where key=p_key and expires_at>now() $$;
create function public.put_federation_cache(p_key text,p_value jsonb,p_negative boolean,p_ttl_seconds integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_ttl_seconds<1 or p_ttl_seconds>(case when p_negative then 30 else 600 end) or p_value->>'status' in ('401','403') or p_value ? 'accessToken' or p_value ? 'private' then raise exception 'invalid_public_cache'; end if;
  insert into public.federation_cache(key,value,negative,expires_at) values(p_key,p_value,p_negative,clock_timestamp()+make_interval(secs=>p_ttl_seconds)) on conflict(key) do update set value=excluded.value,negative=excluded.negative,expires_at=excluded.expires_at;
end $$;

-- No application role may invoke an unchecked definer function directly.
do $$ declare routine record; begin
  for routine in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('immutable_record','component_cadence','can_workspace','can_read_version','version_approved','version_published','get_principal_context','assert_human','stage_skill_version','review_skill_version','revoke_skill_version','publish_catalog','read_private_version','acquire_lease','assert_lease','renew_lease','claim_job','finish_job','claim_federation_budget','get_federation_cache','put_federation_cache') loop
    execute format('revoke all on function %s from public,anon,authenticated',routine.signature);
    execute format('grant execute on function %s to service_role',routine.signature);
  end loop;
end $$;
grant execute on function public.can_workspace(uuid,text),public.can_read_version(uuid,uuid) to authenticated;

-- Provision a dedicated server credential with this role and an exact workspace_id claim outside this migration.
do $$ begin
  if not exists(select 1 from pg_roles where rolname='soren_gateway') then create role soren_gateway nologin noinherit nobypassrls; end if;
  if exists(select 1 from pg_roles where rolname='authenticator') then grant soren_gateway to authenticator; end if;
end $$;
grant usage on schema public to soren_gateway;
grant execute on function public.get_principal_context(uuid,text,uuid,text),public.read_private_version(uuid,uuid,uuid,text),public.claim_federation_budget(text,boolean),public.get_federation_cache(text),public.put_federation_cache(text,jsonb,boolean,integer) to soren_gateway;

-- Private assets are stored in RLS-protected skill_files. No public bucket is created.
-- A future object-storage adapter must use a private bucket and the same live approval/grant checks.
