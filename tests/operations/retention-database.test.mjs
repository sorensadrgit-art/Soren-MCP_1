import test from 'node:test';
import assert from 'node:assert/strict';
import {database, ids, rpc, asReader} from './database-helper.mjs';

test('fenced retention rolls up each expired sample once, bounds deletion and preserves recent/private records', async () => {
  const db = await database();
  try {
    const before = (await db.query('select count(*)::integer n from grants')).rows[0].n;
    await db.query(`insert into health_observations(workspace_id,component,environment,observed_at,scheduled_slot,status,failure_class,probe_identity)
      select $1,'gateway','test',now()-interval '31 days'+n*interval '1 second',now()-interval '31 days'+n*interval '1 second',case when n%2=0 then 'HEALTHY' else 'UNKNOWN' end,null,'old:'||n from generate_series(1,105) n`, [ids.workspace]);
    await db.query(`insert into health_observations(workspace_id,component,environment,observed_at,scheduled_slot,status,probe_identity) values($1,'gateway','test',now(),now(),'HEALTHY','recent')`, [ids.workspace]);
    await db.query(`insert into health_daily_aggregates values($1,'old','test',current_date-181,1,1,0,0,0,0,now()-interval '181 days')`, [ids.workspace]);
    const lease = await rpc(db, 'acquire_lease', [ids.workspace, 'retention', 'worker', 120]);
    const clean = () => rpc(db, 'safe_housekeeping', [ids.workspace, lease.key, lease.owner, lease.fence]);
    const first = await clean();
    assert.equal(first.expiredHealthObservations, 100); assert.equal(first.healthCleanupRemaining, true); assert.equal(first.expiredHealthAggregates, 1);
    assert.equal((await db.query('select sum(sample_count)::integer n from health_daily_aggregates')).rows[0].n, 100);
    const second = await clean();
    assert.equal(second.expiredHealthObservations, 5); assert.equal(second.healthCleanupRemaining, false);
    assert.equal((await db.query('select sum(sample_count)::integer n from health_daily_aggregates')).rows[0].n, 105);
    assert.equal((await clean()).expiredHealthObservations, 0);
    assert.equal((await db.query('select count(*)::integer n from health_observations')).rows[0].n, 1);
    assert.equal((await db.query('select count(*)::integer n from grants')).rows[0].n, before);
    assert.equal((await asReader(db, () => db.query('select * from health_daily_aggregates'))).rows.length, 0);
    await db.query(`update leases set expires_at=clock_timestamp()-interval '1 second' where workspace_id=$1 and key=$2`, [ids.workspace, lease.key]);
    await assert.rejects(clean(), /stale_lease_fence/);
  } finally { await db.close(); }
});

test('fenced housekeeping purges expired federation cache and budget rows in bounded batches', async () => {
  const db = await database();
  try {
    await db.query(`insert into federation_cache(key,value,negative,expires_at)
      select repeat(md5(n::text),2), jsonb_build_object('n',n), n%2=0, clock_timestamp()-interval '1 second' from generate_series(1,105) n`);
    await db.query(`insert into federation_cache(key,value,negative,expires_at) values
      (repeat(md5('fresh-negative'),2), '{"fresh":true}'::jsonb, true, clock_timestamp()+interval '30 seconds'),
      (repeat(md5('fresh-positive'),2), '{"fresh":true}'::jsonb, false, clock_timestamp()+interval '600 seconds')`);
    await db.query(`insert into federation_budget_buckets(bucket,slot,used) select 'address:'||n, clock_timestamp()-interval '2 days', 1 from generate_series(1,105) n`);
    await db.query(`insert into federation_budget_buckets(bucket,slot,used) values('global', date_trunc('minute',clock_timestamp()), 0)`);
    const lease = await rpc(db, 'acquire_lease', [ids.workspace, 'housekeeping', 'worker', 120]);
    const clean = () => rpc(db, 'safe_housekeeping', [ids.workspace, lease.key, lease.owner, lease.fence]);
    const first = await clean();
    assert.equal(first.expiredCacheRecords, 100);
    assert.equal(first.expiredBudgetRecords, 100);
    assert.equal((await db.query('select count(*)::integer n from federation_cache where expires_at<=clock_timestamp()')).rows[0].n, 5);
    assert.equal((await db.query('select count(*)::integer n from federation_cache where expires_at>clock_timestamp()')).rows[0].n, 2);
    assert.equal((await db.query(`select count(*)::integer n from federation_budget_buckets where bucket='global'`)).rows[0].n, 1);
    const second = await clean();
    assert.equal(second.expiredCacheRecords, 5);
    assert.equal(second.expiredBudgetRecords, 5);
    assert.equal((await db.query('select count(*)::integer n from federation_budget_buckets')).rows[0].n, 1);
    assert.equal((await db.query('select count(*)::integer n from federation_cache')).rows[0].n, 2);
    await db.query(`select set_config('request.jwt.claims',$1,false)`, [JSON.stringify({workspace_id: ids.workspace})]);
    await db.exec('set role soren_gateway');
    try { await assert.rejects(clean(), /permission denied/); } finally { await db.exec('reset role'); }
  } finally { await db.close(); }
});
