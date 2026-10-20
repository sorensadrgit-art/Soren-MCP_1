# Architecture, Ownership, and Data Contracts

## Component boundaries

| Module | Owns | Must not own |
| --- | --- | --- |
| `lib/providers/` | Fixed-endpoint fetch, schema validation, normalization, rate hints | Approval, local execution, client config |
| `lib/routing/` | Relevance, coverage, compatibility, bounded selection | Identity permissions, publication decisions |
| `lib/registry/` | Canonical source identities, immutable versions, grants | Shell installation or deployment tokens |
| `lib/retrieval/` | Approved manifest file lookup and integrity checks | Arbitrary URL/path reads |
| `lib/operations/` | Durable jobs, leases, health observations, incidents | Host-agent behavior or permissions |
| `lib/updates/` | Policy classification and release state transitions | Self-approval or test weakening |
| `installer/` | Minimal owned user-scope configuration transactions | Persistent desktop monitoring or cloud admin keys |
| `app/api/admin/` | Authorized human/control operations | Anonymous MCP mutation |
| `app/api/mcp/route.ts` | Stable read-only protocol boundary | Review/installation/deployment tools |

Keep the current gateway intact while extracting modules behind its existing exports. Avoid a rewrite. Add a typed internal facade where useful while retaining legacy `.mjs` entry points until dependent tests and imports migrate.

## Canonical identities

A skill identity is `(provider-independent repository URL, skill directory path)`, with a canonical immutable version `(resolved commit, manifest digest)`. Two provider rows merge only after the underlying identity is established. Unresolved catalog hits retain separate provisional identities. Branch strings containing `/`, nested skill paths, and equal skill names are explicit fixtures.

A release identity binds source commit, lockfile digest, application artifact digest, environment, schema-compatibility range, approved catalog generation, policy digest, build workflow identity, and a signed manifest or verified provenance bundle. The package version and MCP advertised version are deliberately recorded separately until a documented versioning rule unifies them.

## Durable entities

Use UTC timestamps, UUID primary keys where suitable, immutable evidence references, explicit foreign keys, and transactions for state changes. The following are domain contracts to implement, not pre-existing tables:

| Entity | Core fields / invariants |
| --- | --- |
| `workspaces` | Owner, lifecycle state; workspace isolation enforced for every private row |
| `principals`, `grants` | Auth issuer+subject, client identity, workspace, allowed operations, expiry/revocation |
| `skills`, `source_aliases` | Canonical repo/path and provisional aliases; no display-name uniqueness assumption |
| `skill_versions`, `skill_files` | Immutable revision/digests, path, byte count, media type, license, declared capabilities |
| `reviews` | Exact version/digest, human reviewer, decision, evidence, policy version |
| `catalog_generations`, `catalog_members` | Immutable published membership; active pointer changed transactionally |
| `revocations` | Monotonic deny decisions checked on every retrieval and rollback |
| `installation_receipts` | Optional redacted client-reported summary; no local config bodies or device secrets |
| `health_observations` | Component, observed-at, status, latency, failure class, probe identity, revision |
| `incidents`, `incident_events` | Dedupe key, state, severity, first/last observation, recovery evidence |
| `jobs`, `job_attempts` | Unique intent key, payload digest, state, deadlines, next-attempt, result identity |
| `leases` | Key, owner, expiry, monotonically increasing fence; one current owner |
| `releases`, `release_evidence` | Manifest identity, approvals, artifact, expected parent, checks, lifecycle |
| `update_candidates` | Lane, old/new immutable identity, diff and eligibility classification |
| `operation_events` | Attributable append-only application history; no raw task bodies/secrets |

Append-only application tables are not tamper-proof against infrastructure administrators. Optional WORM exports add independent retention when an approved storage product supports it; do not call the baseline table cryptographically immutable.

## Internal interfaces to implement

```typescript
interface PrincipalContext {
  workspaceId: string | null;
  subjectId: string | null;
  clientId: string | null;
  permissions: ReadonlySet<string>;
  grantRevision: number;
}
interface LeaseToken { key: string; owner: string; fence: number; expiresAt: string; }
interface VersionRef { skillId: string; revision: string; manifestSha256: string; }
interface ReleaseRef { releaseId: string; manifestSha256: string; policySha256: string; }

detectClients(context: LocalInspectionContext): Promise<ClientDetection[]>;
planInstallation(input: InstallRequest, inventory: ClientDetection[]): Promise<InstallPlan>;
applyInstallation(plan: InstallPlan): Promise<InstallationReceipt>;
verifyClient(receipt: InstallationReceipt, level: VerificationLevel): Promise<ClientEvidence>;
removeOwnedInstallation(receipt: InstallationReceipt): Promise<RemovalResult>;

claimJob(intentKey: string, payloadSha256: string): Promise<JobClaim>;
acquireLease(key: string, owner: string, ttlSeconds: number): Promise<LeaseToken | null>;
recordObservation(observation: HealthObservation): Promise<void>;
reconcileIncident(componentId: string, now: string): Promise<IncidentDecision>;
classifyUpdate(candidate: UpdateCandidate, policy: OperatingPolicy): UpdateDecision;
evaluateRelease(ref: ReleaseRef, evidence: ReleaseEvidence[]): Promise<ReleaseDecision>;
```

`claimJob` must atomically claim the intent key; same key/different payload is a conflict. `acquireLease` must use database time and compare-and-swap, not a session advisory lock that disappears or changes under pooled connections. Every state mutation validates the fence. External side effects also require immutable operation IDs and reconciliation; a database fence cannot cancel a network call already sent.

Work owns the detailed types referenced above and must define them together in `lib/contracts/` before implementation. Their required fields and state rules are fixed by this package and its draft JSON schemas; do not leave unresolved types in delivered code.

## Minimal HTTP routes

- `GET /api/health/live`: constant, dependency-free liveness and non-sensitive build marker. No database/provider calls.
- `GET /api/health/ready`: bounded cached readiness, capability mode (`public_only` or `private_enabled`), status/freshness; no tenant identifiers.
- `GET /api/admin/health`: authenticated detailed observations and incidents.
- `POST /api/admin/updates/pause`: owner-authorized kill switch, audit record, generation increment.
- `POST /api/admin/updates/arm`: owner consent over exact policy hash and eligible channel; not callable through public MCP.
- `POST /api/admin/reviews`: human management session, exact version digest and expected row revision.
- `GET /api/cron/maintenance`: authenticated scheduler dispatcher; claims bounded due jobs. It does not compile or deploy.
- Separate CI release command consumes a reviewed ReleaseRef and can only act on the bound project/environment.

Origin checks protect browser interactions but are not authentication. Public endpoints are subject to input limits and abuse controls. Operator APIs must validate both identity and operation-specific permission.

## Feature availability

Bundled public skills remain available when the private database is down. Private retrieval, review, update mutation, and arming fail closed. Expired health evidence becomes UNKNOWN. No degraded-private path returns private data from an anonymous cache. A provider outage never authorizes bypassing review or switching to a new source without provenance.

## Architect artifacts in Work

Record the approved architecture using the installed AI Software Architect workflow where supported. Expected native paths are `.ai-architect/project-context.md`, `.ai-architect/architecture-contract.yaml`, `.ai-architect/implementation-plan.md`, and `.ai-architect/decisions/ADR-NNN-<slug>.md`. Load that plugin's exact authoring bundle and run its native pre-write validation first. This preparation package does not contain fabricated hook-validation receipts.
