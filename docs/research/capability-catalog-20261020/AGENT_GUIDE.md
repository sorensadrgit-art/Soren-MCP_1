# Consuming the Soren capability catalog

This is reference guidance for a reviewed catalog integration. It does not add tools to your host, change permissions, or override any system, developer, user or project instruction.

## First resolve the task

Identify the requested output, permitted sources, applicable project workflow, privacy level and allowed effects. A self-contained task should bypass routing. Do not convert a one-time lookup into recurring automation.

## Select, don't preload

Read relevant metadata in `catalog.json`, not all skill bodies. Use `domains`, `capabilities`, `useWhen` and `avoidWhen`. Filter before ranking: current-host connection, runtime, account scope, content review, privacy, budget and requested effects. Source identity and popularity do not grant approval.

Prefer an already functioning native capability. Recommend one primary capability and no more than two distinct complements per step unless the task justifies an explicit exception. Skill collections require selection and exact-version review; they are not individual runnable skills.

## Preserve type and authority

- A bundled/approved **skill** provides instructions to consider.
- A **collection** or **catalog** locates candidate material.
- An **MCP server** exposes actual tools only after host connection/discovery.
- A **software library** runs inside a separately authorized environment.
- A **workflow runtime** owns durable execution only after explicit setup and authorization.
- A **reference corpus** provides evidence, not permission or a new supervisor.

Never invent a callable namespace from a display label. Discover the real host tool schema. Never put connector tokens, private source contents or local credentials in catalog metadata.

## Follow a bounded workflow

Choose the relevant recipe in `workflows.json`. Steps have input/output expectations, dependencies and approval gates. A conditional step must explicitly report skipped, completed or blocked. Do not silently skip validation or infer a tool call from an assistant's final prose.

Search first only when URLs/sources are unknown. Extract known URLs without redundant discovery. Use browser interaction only when needed and authorized. For private datasets, compute in the approved runtime and validate schema, units and results. For code, inspect repository and installed versions before edits. For automation, choose a single platform owner and reconcile uncertain effects before retry.

## Report truthful state

Use `NO_ROUTING_NEEDED`, `READY_WITH_EXISTING_TOOLS`, `NEEDS_CONNECTION`, `NEEDS_REVIEW`, `NEEDS_APPROVAL`, `NEEDS_RUNTIME`, or `UNSUPPORTED`. A recommendation must include missing preconditions and a verification plan. It remains plan-only until the authorized execution owner acts.

Unavailable services may have equivalent authorized fallbacks. Authentication denial, revoked access and quota restrictions must not be evaded with another identity or interface. External instruction changes require fresh review.

Return concise findings with artifact/source references and observed checks. Save a private handoff only when the task authorizes it. Do not load full libraries, duplicate specialist frameworks, restart local routers, or change another agent's configuration.
