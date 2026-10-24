import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpdateStore } from '../../lib/updates/store.mjs';
import { UpdateDenied } from '../../lib/updates/policy.mjs';

test('createUpdateStore throws UpdateDenied when operations or workspaceId are invalid', () => {
  assert.throws(
    () => createUpdateStore(null, 'ws-123'),
    err => err instanceof UpdateDenied && err.code === 'durable_update_store_unavailable'
  );

  assert.throws(
    () => createUpdateStore({}, 'ws-123'),
    err => err instanceof UpdateDenied && err.code === 'durable_update_store_unavailable'
  );

  assert.throws(
    () => createUpdateStore({ rpc: null }, 'ws-123'),
    err => err instanceof UpdateDenied && err.code === 'durable_update_store_unavailable'
  );

  assert.throws(
    () => createUpdateStore({ rpc: async () => {} }, null),
    err => err instanceof UpdateDenied && err.code === 'durable_update_store_unavailable'
  );

  assert.throws(
    () => createUpdateStore({ rpc: async () => {} }, ''),
    err => err instanceof UpdateDenied && err.code === 'durable_update_store_unavailable'
  );
});

test('createUpdateStore delegates policy operations to RPC with p_workspace_id', async () => {
  const calls = [];
  const mockOperations = {
    async rpc(name, args) {
      calls.push({ name, args });
      return { status: 'mock_success', rpc: name };
    }
  };
  const workspaceId = 'ws-test-456';
  const store = createUpdateStore(mockOperations, workspaceId);

  // readPolicy
  const scope = { projectId: 'project-alpha', environment: 'production' };
  const readResult = await store.readPolicy(scope);
  assert.deepEqual(readResult, { status: 'mock_success', rpc: 'update_read_policy' });

  // changePolicy
  const previous = { generation: 2 };
  const next = { projectId: 'project-alpha', environment: 'production', generation: 3 };
  const actor = { subjectId: 'user-actor-1' };
  const changeResult = await store.changePolicy(previous, next, actor);
  assert.deepEqual(changeResult, { status: 'mock_success', rpc: 'update_change_policy' });

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], {
    name: 'update_read_policy',
    args: {
      p_workspace_id: 'ws-test-456',
      p_project_id: 'project-alpha',
      p_environment: 'production'
    }
  });
  assert.deepEqual(calls[1], {
    name: 'update_change_policy',
    args: {
      p_workspace_id: 'ws-test-456',
      p_project_id: 'project-alpha',
      p_environment: 'production',
      p_expected_generation: 2,
      p_policy: next,
      p_actor: 'user-actor-1'
    }
  });
});

test('createUpdateStore delegates evidence and release registration operations to RPC', async () => {
  const calls = [];
  const mockOperations = {
    async rpc(name, args) {
      calls.push({ name, args });
      return { ok: true };
    }
  };
  const workspaceId = 'ws-evidence-789';
  const store = createUpdateStore(mockOperations, workspaceId);

  const actor = { subjectId: 'actor-123' };

  // readActivationEvidence
  await store.readActivationEvidence(['evidence-1', 'evidence-2']);

  // registerRelease
  const record = { releaseId: 'rel-1', manifestSha256: 'sha-manifest' };
  const policy = { generation: 1 };
  await store.registerRelease(record, policy, actor, 1);

  // authorizeRelease
  const authRequest = { releaseId: 'rel-1', mode: 'armed' };
  await store.authorizeRelease(authRequest, actor);

  // ingestEvidence
  const receipt = { evidenceId: 'ev-1', sha256: 'sha-evidence' };
  await store.ingestEvidence(receipt, actor, 'client-a', 'rehearsal');

  // snapshot
  const manifest = { projectId: 'proj-1', environment: 'staging', releaseId: 'rel-1' };
  await store.snapshot(manifest);

  assert.equal(calls.length, 5);

  assert.deepEqual(calls[0], {
    name: 'update_activation_evidence',
    args: { p_workspace_id: 'ws-evidence-789', p_ids: ['evidence-1', 'evidence-2'] }
  });

  assert.deepEqual(calls[1], {
    name: 'update_register_release',
    args: {
      p_workspace_id: 'ws-evidence-789',
      p_record: record,
      p_policy: policy,
      p_actor: 'actor-123',
      p_expected_generation: 1
    }
  });

  assert.deepEqual(calls[2], {
    name: 'update_authorize_release',
    args: {
      p_workspace_id: 'ws-evidence-789',
      p_request: authRequest,
      p_actor: 'actor-123'
    }
  });

  assert.deepEqual(calls[3], {
    name: 'update_ingest_evidence',
    args: {
      p_workspace_id: 'ws-evidence-789',
      p_receipt: receipt,
      p_actor: 'actor-123',
      p_expected_client: 'client-a',
      p_expected_kind: 'rehearsal'
    }
  });

  assert.deepEqual(calls[4], {
    name: 'update_release_snapshot',
    args: {
      p_workspace_id: 'ws-evidence-789',
      p_project_id: 'proj-1',
      p_environment: 'staging',
      p_release_id: 'rel-1'
    }
  });
});

test('createUpdateStore delegates fence and intent lifecycle operations to RPC with lease spreading', async () => {
  const calls = [];
  const mockOperations = {
    async rpc(name, args) {
      calls.push({ name, args });
      return { rpc: name };
    }
  };
  const workspaceId = 'ws-intents-101';
  const store = createUpdateStore(mockOperations, workspaceId);

  const lease = { key: 'release:proj-1:prod', owner: 'runner-node-1', fence: 7 };
  const intent = { intentKey: 'intent-key-abc', kind: 'promote' };

  // assertFence
  await store.assertFence(lease);

  // getIntent
  await store.getIntent('intent-key-abc');

  // beginIntent
  await store.beginIntent(intent, lease);

  // markIntent
  await store.markIntent('intent-key-abc', { status: 'APPLIED' }, lease);

  // bindStagedDeployment
  await store.bindStagedDeployment('intent-key-abc', 'dep-123', lease);

  // recordReleaseOutcome
  await store.recordReleaseOutcome(intent, { success: true }, lease, '2026-03-31T12:00:00Z');

  assert.equal(calls.length, 6);

  assert.deepEqual(calls[0], {
    name: 'assert_lease',
    args: {
      p_workspace_id: 'ws-intents-101',
      p_key: 'release:proj-1:prod',
      p_owner: 'runner-node-1',
      p_fence: 7
    }
  });

  assert.deepEqual(calls[1], {
    name: 'update_get_intent',
    args: {
      p_workspace_id: 'ws-intents-101',
      p_intent_key: 'intent-key-abc'
    }
  });

  assert.deepEqual(calls[2], {
    name: 'update_begin_intent',
    args: {
      p_workspace_id: 'ws-intents-101',
      p_intent: intent,
      p_lease_key: 'release:proj-1:prod',
      p_owner: 'runner-node-1',
      p_fence: 7
    }
  });

  assert.deepEqual(calls[3], {
    name: 'update_mark_intent',
    args: {
      p_workspace_id: 'ws-intents-101',
      p_intent_key: 'intent-key-abc',
      p_patch: { status: 'APPLIED' },
      p_lease_key: 'release:proj-1:prod',
      p_owner: 'runner-node-1',
      p_fence: 7
    }
  });

  assert.deepEqual(calls[4], {
    name: 'update_bind_staged_deployment',
    args: {
      p_workspace_id: 'ws-intents-101',
      p_intent_key: 'intent-key-abc',
      p_deployment_id: 'dep-123',
      p_lease_key: 'release:proj-1:prod',
      p_owner: 'runner-node-1',
      p_fence: 7
    }
  });

  assert.deepEqual(calls[5], {
    name: 'update_release_outcome',
    args: {
      p_workspace_id: 'ws-intents-101',
      p_intent_key: 'intent-key-abc',
      p_observed: { success: true },
      p_at: '2026-03-31T12:00:00Z',
      p_lease_key: 'release:proj-1:prod',
      p_owner: 'runner-node-1',
      p_fence: 7
    }
  });
});

test('createUpdateStore delegates cooldown, schedule reconciliation, and probation operations to RPC', async () => {
  const calls = [];
  const mockOperations = {
    async rpc(name, args) {
      calls.push({ name, args });
      return { rpc: name };
    }
  };
  const workspaceId = 'ws-probation-202';
  const store = createUpdateStore(mockOperations, workspaceId);

  const lease = { key: 'release:proj-1:prod', owner: 'runner-node-2', fence: 12 };

  // enterCooldown
  await store.enterCooldown({ minutes: 60 }, lease);

  // recordScheduleReconciliation
  await store.recordScheduleReconciliation({ status: 'reconciled' }, lease);

  // probationProbes
  await store.probationProbes('release-99');

  // finishProbation
  await store.finishProbation({ bindingId: 'bind-1' }, lease);

  assert.equal(calls.length, 4);

  assert.deepEqual(calls[0], {
    name: 'update_cooldown',
    args: {
      p_workspace_id: 'ws-probation-202',
      p_input: { minutes: 60 },
      p_lease_key: 'release:proj-1:prod',
      p_owner: 'runner-node-2',
      p_fence: 12
    }
  });

  assert.deepEqual(calls[1], {
    name: 'update_schedule_reconciliation',
    args: {
      p_workspace_id: 'ws-probation-202',
      p_input: { status: 'reconciled' },
      p_lease_key: 'release:proj-1:prod',
      p_owner: 'runner-node-2',
      p_fence: 12
    }
  });

  assert.deepEqual(calls[2], {
    name: 'update_probation_probes',
    args: {
      p_workspace_id: 'ws-probation-202',
      p_release_id: 'release-99'
    }
  });

  assert.deepEqual(calls[3], {
    name: 'update_finish_probation',
    args: {
      p_workspace_id: 'ws-probation-202',
      p_binding: { bindingId: 'bind-1' },
      p_lease_key: 'release:proj-1:prod',
      p_owner: 'runner-node-2',
      p_fence: 12
    }
  });
});
