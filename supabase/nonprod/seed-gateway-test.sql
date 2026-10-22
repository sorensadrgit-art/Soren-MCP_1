-- Non-production gateway store seed. Never run against the production store.
-- Prerequisites: an isolated Supabase project with supabase/migrations/*.sql applied in sorted order,
-- and two Auth users created in that project (one human owner, one agent identity).
-- Run as the project owner with psql so the variables below are bound:
--   psql "$NONPROD_DB_URL" -v ON_ERROR_STOP=1 -v workspace_id=<uuid> -v issuer=https://<ref>.supabase.co/auth/v1 \
--     -v owner_subject=<auth user uuid> -v owner_client_id=<management client id> \
--     -v agent_subject=<auth user uuid> -v agent_client_id=<agent client id> -f supabase/nonprod/seed-gateway-test.sql
begin;
do $$ begin
  if exists(select 1 from public.workspaces) then raise exception 'seed_requires_empty_nonproduction_store'; end if;
end $$;
insert into public.workspaces(id) values (:'workspace_id'::uuid);
insert into public.principals(auth_issuer,auth_subject,client_id,kind) values
  (:'issuer', :'owner_subject'::uuid, :'owner_client_id', 'human'),
  (:'issuer', :'agent_subject'::uuid, :'agent_client_id', 'agent');
insert into public.workspace_memberships(workspace_id,principal_id,role)
  select :'workspace_id'::uuid, id, case kind when 'human' then 'owner' else 'reader' end
  from public.principals where auth_issuer = :'issuer' and auth_subject in (:'owner_subject'::uuid, :'agent_subject'::uuid);
-- The agent receives only skills:read, for seven days. Extend by issuing a new grant, never by widening it.
insert into public.grants(workspace_id,principal_id,operations,expires_at,created_by)
  select :'workspace_id'::uuid, agent.id, array['skills:read'], now() + interval '7 days', owner.id
  from public.principals agent, public.principals owner
  where agent.auth_issuer = :'issuer' and agent.auth_subject = :'agent_subject'::uuid and agent.client_id = :'agent_client_id'
    and owner.auth_issuer = :'issuer' and owner.auth_subject = :'owner_subject'::uuid and owner.client_id = :'owner_client_id';
commit;
