import { readFileSync } from 'node:fs';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { LIMITS, REQUIRED_CHECKS, requireGate, sha256, time } from './policy.mjs';

const ajv = new Ajv({ allErrors: true, strict: true, strictTypes: false });
addFormats(ajv);
const manifestSchema = JSON.parse(readFileSync(new URL('../../docs/implementation/contracts/release-manifest.schema.json', import.meta.url)));
const evidenceSchema = JSON.parse(readFileSync(new URL('../../docs/implementation/contracts/verification-evidence.schema.json', import.meta.url)));
const validateManifest = ajv.compile(manifestSchema);
const validateEvidence = ajv.compile(evidenceSchema);
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function parseManifest(bytes, now = Date.now(), { allowExpiredForReconciliation = false } = {}) {
  requireGate(Buffer.isBuffer(bytes) && bytes.length <= 65_536, 'manifest_size_invalid');
  let manifest;
  try { manifest = JSON.parse(bytes.toString('utf8')); } catch { requireGate(false, 'manifest_json_invalid'); }
  requireGate(validateManifest(manifest), 'manifest_schema_invalid');
  requireGate(time(manifest.createdAt) <= now && (allowExpiredForReconciliation || time(manifest.expiresAt) > now) && time(manifest.expiresAt) > time(manifest.createdAt), 'manifest_expired_or_future');
  requireGate(manifest.schemaCompatibility.minimum <= manifest.schemaCompatibility.maximum, 'schema_range_invalid');
  return { manifest, manifestSha256: sha256(bytes) };
}

// Sigstore performs certificate, transparency-log and TUF verification; this layer only binds reviewed release claims.
export async function verifyProvenance({ bundle, bundleBytes, artifact, manifest, trust, verifier, evidenceSha256 }) {
  if (Array.isArray(trust?.identities)) {
    requireGate(trust.enabled === true && trust.identities.length > 0 && trust.identities.length <= 2, 'signing_trust_not_provisioned');
    const matches = trust.identities.filter(identity => identity.certificateIdentityURI === manifest.provenance.trustedIdentity);
    requireGate(matches.length === 1, 'provenance_identity_not_owner_approved');
    trust = { ...matches[0], enabled: true };
  }
  requireGate(trust?.enabled === true && typeof trust.certificateIssuer === 'string' && trust.certificateIssuer && typeof trust.certificateIdentityURI === 'string' && trust.certificateIdentityURI && trust.repository && trust.workflow && trust.ref, 'signing_trust_not_provisioned');
  requireGate(manifest.provenance.method === 'verified_ci_attestation' && manifest.provenance.trustedIdentity === trust.certificateIdentityURI, 'provenance_identity_mismatch');
  requireGate(manifest.provenance.verificationReference === `sha256:${sha256(bundleBytes)}`, 'provenance_bundle_mismatch');
  requireGate(bundle?.dsseEnvelope?.payloadType === 'application/vnd.in-toto+json', 'provenance_statement_required');
  const verify = verifier ?? (await import('sigstore')).verify;
  await verify(bundle, { certificateIssuer: trust.certificateIssuer, certificateIdentityURI: `^${escapeRegex(trust.certificateIdentityURI)}$`, tlogThreshold: 1, ctLogThreshold: 1, timeout: 5000, retry: 0 });
  let statement;
  try { statement = JSON.parse(Buffer.from(bundle.dsseEnvelope.payload, 'base64').toString('utf8')); } catch { requireGate(false, 'provenance_statement_invalid'); }
  requireGate(statement._type === 'https://in-toto.io/Statement/v1' && statement.predicateType === 'https://slsa.dev/provenance/v1', 'unsupported_provenance');
  const artifactSha256 = artifact ? sha256(artifact) : manifest.artifactSha256;
  requireGate(statement.subject?.some(subject => subject.digest?.sha256 === artifactSha256), 'attested_artifact_mismatch');
  if (evidenceSha256) requireGate(statement.subject?.some(subject => subject.name === 'verification-evidence.json' && subject.digest?.sha256 === evidenceSha256), 'attested_evidence_mismatch');
  const definition = statement.predicate?.buildDefinition;
  const workflow = definition?.externalParameters?.workflow;
  requireGate(workflow?.repository === trust.repository && workflow.path === trust.workflow && workflow.ref === trust.ref, 'attested_workflow_mismatch');
  requireGate(definition?.resolvedDependencies?.some(dependency => dependency.uri?.startsWith(`git+${trust.repository}@`) && dependency.digest?.gitCommit === manifest.sourceCommit), 'attested_source_mismatch');
  requireGate(definition?.resolvedDependencies?.some(dependency => dependency.uri === 'file:package-lock.json' && dependency.digest?.sha256 === manifest.lockfileSha256), 'attested_lockfile_mismatch');
  requireGate(definition?.resolvedDependencies?.some(dependency => dependency.uri === 'file:config/operating-policy.json' && dependency.digest?.sha256 === manifest.policySha256), 'attested_policy_mismatch');
  return { method: 'verified_ci_attestation', trustedIdentity: trust.certificateIdentityURI, artifactSha256, artifactBytesVerified: Boolean(artifact), bundleSha256: sha256(bundleBytes) };
}

export function verifyEvidence(manifest, evidence, now = Date.now()) {
  requireGate(Array.isArray(evidence), 'release_evidence_missing');
  for (const check of [...REQUIRED_CHECKS, 'final-smoke', 'staged-observation']) {
    const matches = evidence.filter(item => item.testId === check);
    requireGate(matches.length === 1, `ambiguous_or_missing_check:${check}`);
    const [row] = matches;
    requireGate(row && validateEvidence(row) && row.status === 'PASS', `check_not_passed:${check}`);
    requireGate(row.sourceRevision === manifest.sourceCommit && row.lockfileSha256 === manifest.lockfileSha256 && row.environment === 'staged_production' && row.observed?.artifactSha256 === manifest.artifactSha256 && row.observed?.policySha256 === manifest.policySha256, `evidence_identity_mismatch:${check}`);
    const maxAge = (check === 'final-smoke' ? LIMITS.smokeMinutes : LIMITS.fullEvidenceMinutes) * 60_000;
    requireGate(time(row.startedAt) <= time(row.finishedAt) && time(row.finishedAt) <= now && now - time(row.finishedAt) <= maxAge, `evidence_stale:${check}`);
    if (check === 'staged-observation') requireGate(time(row.finishedAt) - time(row.startedAt) >= LIMITS.stageMinutes * 60_000 && row.observed.maximumProbeGapSeconds <= LIMITS.probeSeconds && row.observed.failures === 0, 'staged_observation_incomplete');
  }
  return true;
}

export async function verifyRelease({ manifestBytes, artifact, lockfileBytes, policyBytes, bundleBytes, evidence, evidenceBytes, trust, verifier, now = Date.now(), evidenceRequired = true, reconciliationOnly = false, metadataOnly = false }) {
  const result = parseManifest(manifestBytes, now, { allowExpiredForReconciliation: reconciliationOnly });
  const { manifest } = result;
  let authenticatedEvidence; let authenticatedEvidenceBytes;
  if (evidenceRequired) {
    authenticatedEvidenceBytes = evidenceBytes ? Buffer.from(evidenceBytes) : Buffer.from(JSON.stringify(evidence));
    try { authenticatedEvidence = JSON.parse(authenticatedEvidenceBytes); } catch { requireGate(false, 'evidence_json_invalid'); }
    if (evidenceBytes && evidence !== undefined) requireGate(JSON.stringify(authenticatedEvidence) === JSON.stringify(evidence), 'evidence_bytes_array_mismatch');
  }
  if (!metadataOnly) {
    requireGate(Buffer.isBuffer(artifact) && artifact.length > 0 && artifact.length <= LIMITS.maxArtifactBytes, 'artifact_size_invalid');
    requireGate(sha256(artifact) === manifest.artifactSha256, 'artifact_digest_mismatch');
  }
  requireGate(sha256(lockfileBytes) === manifest.lockfileSha256, 'lockfile_digest_mismatch');
  requireGate(sha256(policyBytes) === manifest.policySha256, 'policy_digest_mismatch');
  let bundle;
  try { bundle = JSON.parse(bundleBytes.toString('utf8')); } catch { requireGate(false, 'provenance_bundle_invalid'); }
  const identity = await verifyProvenance({ bundle, bundleBytes, artifact: metadataOnly ? undefined : artifact, manifest, trust, verifier, ...(evidenceRequired ? { evidenceSha256: sha256(authenticatedEvidenceBytes) } : {}) });
  if (evidenceRequired) verifyEvidence(manifest, authenticatedEvidence, now);
  return { ...result, identity, evidence: authenticatedEvidence, verifiedAt: new Date(now).toISOString(), artifactSha256: manifest.artifactSha256 };
}
