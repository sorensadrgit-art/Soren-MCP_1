export type Outcome = 'NOT_RUN' | 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT_APPLICABLE';
export type VerificationLevel = 'configured' | 'protocol' | 'native';
export type HealthStatus = 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'UNKNOWN' | 'DISABLED';
export interface PrincipalContext { workspaceId: string | null; subjectId: string | null; clientId: string | null; permissions: ReadonlySet<string>; grantRevision: number; }
export interface LeaseToken { key: string; owner: string; fence: number; expiresAt: string; }
export interface VersionRef { skillId: string; revision: string; manifestSha256: string; }
export interface ReleaseRef { releaseId: string; manifestSha256: string; policySha256: string; }
export interface LocalInspectionContext { home: string; platform: string; cwd: string; }
export type ClientId = 'factory' | 'codex' | 'antigravity' | 'opencode' | 'claude' | 'qwen';
export interface ClientDetection { client: ClientId; version: string | null; executable: string | null; detection: string; compatible: boolean; adapterVersion: string; desktopVerification: string; }
export interface InstallRequest { agents: string[]; home: string; }
export interface PlannedChange { operation: 'add' | 'no_op'; semanticPath: string; guidePath: string; guidePreimageSha256: string | null; guideOperation: 'add' | 'no_op'; userConfirmation: string; rollbackScope: string; blockedReason: string | null; }
export interface InstallOperation { client: ClientId; adapterVersion: string; targetPath: string; ownershipMode: 'manual'; expectedPreimageSha256: string | null; ownedKeys: string[]; plannedChanges: PlannedChange[]; }
export interface InstallPlan { schemaVersion: 1; planId: string; createdAt: string; expiresAt: string; hostIdentity: string; clients: InstallOperation[]; residentService: false; }
export interface ReceiptClient { client: ClientId; targetPath: string; guidePath: string; state: string; configOwned: boolean; guideOwned: boolean; postimageSha256: string; guidePostimageSha256: string; ownedSyntaxSha256: string; }
export interface InstallationReceipt { schemaVersion: 1; planId: string; hostIdentity: string; createdAt: string; status: string; clients: ReceiptClient[]; residentService: false; }
export interface ClientEvidence { client: ClientId; level: 'CONFIGURED' | 'AUTHENTICATED' | 'PROTOCOL_VERIFIED' | 'TOOLS_AVAILABLE' | 'AGENT_INVOCATION_VERIFIED'; status: Outcome; nativeInvocation?: string; }
export interface RemovalResult extends InstallationReceipt { receiptPath: string; }
export interface JobClaim { jobId: string; claimed: boolean; state: string; lease?: LeaseToken; }
export interface HealthObservation { component: string; environment: string; observedAt: string; status: HealthStatus; probeIdentity: string; scheduledSlot: string | null; failureClass: string | null; sourceRevision: string | null; evidenceRefs: string[]; }
export interface IncidentDecision { component: string; state: 'open' | 'resolved' | 'unchanged'; failureClass: string | null; }
export interface UpdateCandidate { lane: 'catalog_metadata' | 'skill_content' | 'application' | 'desktop_metadata'; channel?: string; sourceReviewed?: boolean; reviewedManifestSha256?: string; changedPaths?: string[]; [risk: string]: unknown; }
export interface ArmingGrant { ownerId: string; channel: 'stable'; lane: 'application'; projectId: string; environment: string; policySha256: string; grantedAt: string; expiresAt: string; rehearsalIds: string[]; entitlementEvidenceId: string; trustEvidenceId: string; watcherEvidenceId: string; providerCapabilityEvidenceId: string; }
export interface OperatingPolicy { projectId: string; environment: string; mode: 'observe' | 'armed' | 'paused'; generation: number; policySha256: string; arming: ArmingGrant | null; cooldownUntil: string | null; }
export interface UpdateDecision { state: 'PAUSED' | 'CLASSIFIED' | 'REVIEW_REQUIRED' | 'ELIGIBLE'; automatic: boolean; reasons: string[]; }
export interface ReleaseEvidence { testId: string; status: Outcome; scope: string; method: string; sourceRevision: string | null; lockfileSha256: string | null; startedAt: string | null; finishedAt: string | null; environment: string; observed: Record<string, unknown>; evidenceRefs: string[]; }
export interface ReleaseDecision { eligible: boolean; reasons: string[]; manifestSha256: string; }
