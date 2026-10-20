import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpdateAdmin } from '../../lib/updates/admin.mjs';
import { HttpError } from '../../lib/security/auth.mjs';
import { sha256 } from '../../lib/updates/policy.mjs';

function fixture({ agent = false } = {}) {
  const policyBytes = Buffer.from('{"updates":{"defaultMode":"observe"}}');
  let writes = 0, stored = null;
  const env = { SOREN_RELEASE_PROJECT_ID: 'project', SOREN_RELEASE_ENVIRONMENT: 'production' };
  const operations = { rpc: async (name, args) => {
    if (name === 'update_read_policy') return stored;
    if (name === 'update_activation_evidence') return [];
    if (name === 'update_change_policy') { writes++; stored = args.p_policy; return stored; }
    throw new Error('unexpected_rpc');
  } };
  const authenticate = async (_request, options) => {
    assert.equal(options.human, true);
    if (agent) throw new HttpError(403, 'human_session_required');
    return { workspaceId: 'workspace', subjectId: 'owner', isHuman: true, role: 'owner' };
  };
  return { handler: createUpdateAdmin({ env, operations, authenticate, readPolicyBytes: async () => policyBytes }), hash: sha256(policyBytes), writes: () => writes };
}
const post = body => new Request('https://example.test/api/admin/updates/pause', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: 'project', environment: 'production', ...body }) });

test('update status reports observe and unsupported arming; owner pause binds exact policy and generation', async () => {
  const f = fixture();
  const status = await f.handler(new Request('https://example.test/api/admin/updates'), 'status');
  const body = await status.json(); assert.equal(body.effectiveMode, 'observe'); assert.equal(body.canArm, false); assert.equal(f.writes(), 0);
  assert.equal((await f.handler(post({ expectedGeneration: 0, policySha256: f.hash, projectId: 'other' }), 'pause')).status, 409);
  assert.equal((await f.handler(post({ expectedGeneration: 0, policySha256: f.hash, extra: true }), 'pause')).status, 400);
  assert.equal((await f.handler(post({ expectedGeneration: 0, policySha256: 'b'.repeat(64) }), 'pause')).status, 409); assert.equal(f.writes(), 0);
  const paused = await f.handler(post({ expectedGeneration: 0, policySha256: f.hash }), 'pause'); assert.equal(paused.status, 200);
  assert.equal((await paused.json()).generation, 1); assert.equal(f.writes(), 1);
});

test('agent mutation and fabricated activation evidence cannot arm updates', async () => {
  const agent = fixture({ agent: true }); assert.equal((await agent.handler(post({}), 'pause')).status, 403); assert.equal(agent.writes(), 0);
  const f = fixture();
  const response = await f.handler(post({ expectedGeneration: 0, policySha256: f.hash, projectId: 'project', environment: 'production', channel: 'stable', lane: 'application', expiresAt: new Date(Date.now() + 60_000).toISOString(), rehearsalIds: ['fake'], entitlementEvidenceId: 'fake', trustEvidenceId: 'fake', watcherEvidenceId: 'fake', providerCapabilityEvidenceId: 'fake' }), 'arm');
  assert.equal(response.status, 409); assert.equal(f.writes(), 0);
});
