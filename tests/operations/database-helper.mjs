import {PGlite} from '@electric-sql/pglite';
import {readFile, readdir} from 'node:fs/promises';

export const ids = {
  workspace: '11111111-1111-4111-8111-111111111111', otherWorkspace: '22222222-2222-4222-8222-222222222222',
  owner: '33333333-3333-4333-8333-333333333333', reader: '44444444-4444-4444-8444-444444444444',
  user: '55555555-5555-4555-8555-555555555555', otherUser: '66666666-6666-4666-8666-666666666666',
};
export async function database() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; grant usage on schema auth,public to authenticated,anon,service_role;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    grant execute on all functions in schema auth to authenticated,anon,service_role;`);
  try {
    for (const file of (await readdir(new URL('../../supabase/migrations/', import.meta.url))).filter(name => name.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'));
  } catch (error) { await db.close(); throw new Error(`migration_failed: ${error.message} position=${error.position}`, {cause: {code: error.code}}); }
  await db.query('insert into workspaces(id) values($1),($2)', [ids.workspace, ids.otherWorkspace]);
  await db.query(`insert into principals(id,auth_issuer,auth_subject,client_id,kind) values($1,'https://example.supabase.co/auth/v1',$3,'management','human'),($2,'https://example.supabase.co/auth/v1',$4,'agent','agent')`, [ids.owner, ids.reader, ids.user, ids.otherUser]);
  await db.query(`insert into workspace_memberships(workspace_id,principal_id,role) values($1,$2,'owner'),($1,$3,'reader')`, [ids.workspace, ids.owner, ids.reader]);
  await db.query(`insert into grants(workspace_id,principal_id,operations,expires_at,created_by) values($1,$2,array['skills:read','health:read'],now()+interval '1 day',$3)`, [ids.workspace, ids.reader, ids.owner]);
  return db;
}
export async function rpc(db, name, args) {
  const result = await db.query(`select public.${name}(${args.map((_, index) => `$${index + 1}`).join(',')}) as value`, args);
  return result.rows[0].value;
}
export async function asReader(db, action, {workspace = ids.workspace, client = 'agent', subject = ids.otherUser} = {}) {
  await db.query(`select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)`, [subject, JSON.stringify({sub: subject, iss: 'https://example.supabase.co/auth/v1', client_id: client})]);
  await db.exec('set role authenticated');
  try { return await action(); } finally { await db.exec('reset role'); }
}
