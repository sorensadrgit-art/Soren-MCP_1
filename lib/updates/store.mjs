import { requireGate } from './policy.mjs';

export function createUpdateStore(operations, workspaceId) {
  requireGate(operations?.rpc && workspaceId, 'durable_update_store_unavailable');
  const call = (name, args = {}) => operations.rpc(name, { p_workspace_id: workspaceId, ...args });
  const leaseArgs = lease => ({ p_lease_key: lease.key, p_owner: lease.owner, p_fence: lease.fence });
  return {
    readPolicy: scope => call('update_read_policy', { p_project_id: scope.projectId, p_environment: scope.environment }),
    changePolicy: (previous, next, actor) => call('update_change_policy', { p_project_id: next.projectId, p_environment: next.environment, p_expected_generation: previous.generation, p_policy: next, p_actor: actor.subjectId }),
    readActivationEvidence: ids => call('update_activation_evidence', { p_ids: ids }),
    registerRelease: (record, policy, actor, generation) => call('update_register_release', { p_record: record, p_policy: policy, p_actor: actor.subjectId, p_expected_generation: generation }),
    authorizeRelease: (request, actor) => call('update_authorize_release', { p_request: request, p_actor: actor.subjectId }),
    ingestEvidence: (receipt, actor, expectedClient, expectedKind) => call('update_ingest_evidence', { p_receipt: receipt, p_actor: actor.subjectId, p_expected_client: expectedClient, p_expected_kind: expectedKind }),
    snapshot: manifest => call('update_release_snapshot', { p_project_id: manifest.projectId, p_environment: manifest.environment, p_release_id: manifest.releaseId }),
    assertFence: lease => call('assert_lease', { p_key: lease.key, p_owner: lease.owner, p_fence: lease.fence }),
    getIntent: intentKey => call('update_get_intent', { p_intent_key: intentKey }),
    beginIntent: (intent, lease) => call('update_begin_intent', { p_intent: intent, ...leaseArgs(lease) }),
    markIntent: (intentKey, patch, lease) => call('update_mark_intent', { p_intent_key: intentKey, p_patch: patch, ...leaseArgs(lease) }),
    bindStagedDeployment: (intentKey, deploymentId, lease) => call('update_bind_staged_deployment', { p_intent_key: intentKey, p_deployment_id: deploymentId, ...leaseArgs(lease) }),
    recordReleaseOutcome: (intent, observed, lease, at) => call('update_release_outcome', { p_intent_key: intent.intentKey, p_observed: observed, p_at: at, ...leaseArgs(lease) }),
    enterCooldown: (input, lease) => call('update_cooldown', { p_input: input, ...leaseArgs(lease) }),
    recordScheduleReconciliation: (input, lease) => call('update_schedule_reconciliation', { p_input: input, ...leaseArgs(lease) }),
    probationProbes: releaseId => call('update_probation_probes', { p_release_id: releaseId }),
    finishProbation: (binding, lease) => call('update_finish_probation', { p_binding: binding, ...leaseArgs(lease) }),
  };
}
