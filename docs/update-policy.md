# Controlled update policy

Installation starts in `observe`. The checked-in operating policy and disabled signing-trust example do not arm an updater. `paused` stops discovery and promotion; health reads continue. A human owner can pause through `POST /api/admin/updates/pause`. A pause increments the durable policy generation, clears arming and invalidates unsent work. A request that already reached a provider must be reconciled.

The four lanes have separate authority:

| Lane | Allowed automatic action | Required gate |
| --- | --- | --- |
| `catalog_metadata` | Bounded refresh/classification | Metadata never conveys approval |
| `skill_content` | Stage and inspect changed bytes | New exact-version human approval for every changed instruction/asset |
| `application` | Reviewed maintenance classification | Exact source/artifact approval, fresh signed evidence, current policy and provider capabilities |
| `desktop_metadata` | Discover a verified installer release | Explicit local invocation or verified native updater |

Application classification fails closed when risk analysis is absent. A patch version cannot authorize new packages/publishers/sources, lifecycle scripts, permission/protocol changes, migrations, major runtime/framework changes, changed tests, resource/billing increases, environment/target changes or trust/schedule/allowlist changes. Protected source includes the updater, security, installer, workflows, migrations, policy, scripts, tests and agent instructions. The controller consumes the durable reviewed classification; an operator cannot replace it with command-line flags.

Arming requires a recent human owner management session, exact policy hash/generation/project/environment, stable application scope, expiry of at most 30 days, and persisted pause/unknown-outcome/rollback rehearsals. Verified entitlement, signing trust, independent monitoring and provider atomic-parent-CAS evidence are also required. The updater cannot create these approvals or alter its own policy. Expired arming becomes `observe`.

The current Vercel promotion API exposes no expected-parent compare-and-swap parameter. The concrete adapter reports `atomicCompareAndSwap: false`. Automatic promotion and automatic Vercel rollback therefore remain unavailable. The dashboard reports `canArm: false`. A separately recorded, short-lived, exact human-owner authorization can permit manual promotion, after all identity, evidence, parent, alias, lease, revocation, budget, schema and watcher checks. A database fence does not cancel a network request that was already sent.

The selected dependency updater is Dependabot: one daily schedule, one open proposal, no grouping and no automatic merge. Its configuration remains in `release/dependabot.example.yml`; an owner must activate it explicitly. The separate default-disabled queue workflow only checks the three-open upper budget. All scheduled workflow jobs require explicit `SOREN_*_ENABLED` repository variables. GitHub scheduled jobs are best effort. The default-disabled 15-minute watcher cannot satisfy the release probation requirement of one direct probe per minute.

No deployment credentials enter the public MCP or pull-request workflow. Runtime management endpoints require a verified human session and operation-specific permission. All update tables use RLS and deny direct anonymous/authenticated table and RPC access. Narrow server code uses the private service identity. No local daemon, Windows scheduler entry, native client update or unrelated MCP repair is created.
