# Soren MCP — Typed Capability Catalog and Agent Workflow Design

**Research date:** October 20, 2026
**Repository baseline:** `sorensadrgit-art/Soren-MCP_1` at `cf851014c6aff9d51f967d18ea9cc2b950c6bb7f`
**Delivery scope:** researched metadata, proposed routing contracts, workflow recipes and structural validation. **Not a runtime release, dependency installation, connection grant, or deployed provider adapter.**

## Executive decision

Expand the existing router as a **typed capability registry**, not a giant instruction prompt or an unrestricted tool proxy. Preserve its eight public tools, four bundled skills, read-only authority, current project architecture, and separation between public guidance and private operations. The host agent continues to act through its own authorized tools.

The catalog contains **30 entries**: **8 entities represented in the inspected source** and **22 research candidates**. It includes 4 bundled skills, 6 skill collections, 3 discovery catalogs, 7 MCP services, 6 software libraries, 3 workflow runtimes, and 1 reference corpus. Existing source is not proof of fresh production health. All target-client availability fields are deliberately `NOT_PROBED`; no external package has been approved or pinned by this research.

The five requested domains are assistance, research, data, development, and automation. An entity may support more than one domain without being duplicated. Source IDs in this document resolve in `sources.json`.

## 1. What the current project already provides

The source gateway exposes `list_skills`, `search_skills`, `route_task`, `read_skill`, `list_providers`, `discover_skills`, `inspect_candidate`, and `search_mcp_servers`. It preserves bundled skills `accessibility`, `motion-systems`, `mcp-integration`, and `skill-orchestration`, with their `skill://.../SKILL.md` resources. Skills.sh, SkillsMP, Anthropic and the official MCP Registry are already represented in the provider model. [S00]

The checked-in source also supports optional `auto` discovery, explicit preferred/unavailable bundled skills, and a private-version read path. These source capabilities are not a claim that the same revision is deployed. This research does not merge the separate authentication/preflight PR, activate private storage, change updater mode, or alter native client configurations. [S00]

### The actual gap

The public names focus on skills and server discovery. They do not yet provide a complete typed inventory of runnable services, host-side data libraries, optional workflow engines and the plans connecting them. Treating these things as interchangeable would create false expectations: a DuckDB recommendation is not an MCP connection; a skill describing deployment is not permission to deploy; an n8n workflow trigger is not a read-only lookup.

## 2. Research method and evidence boundaries

Used GitHub to inspect the project contract; Exa for broad source discovery and first-party collection reads; Firecrawl for developer-index evidence and document-conversion documentation; HAPI to inspect registry publishers; and Agentic Atlas release `v1.1.0` for context placement and contract design.

The accompanying source register contains **31 source records**, including primary documentation, first-party repositories, project source and exact Atlas sections. This is a curated decision set, not a claim to have exhausted every available library. No popularity threshold or star count is used as a security or suitability score.

Two principles from Atlas materially shape the design: retrieve answer-sized records instead of loading the entire corpus, and check outputs/effects against an actual contract rather than assuming prose guidance enforces behavior. These are design arguments, not measured token-savings or production benchmark results. [S12, S29, S30]

## 3. Recommended source coverage

| Domain | Recommended first choices | Conditional additions | Selection rule |
|---|---|---|---|
| General agent assistance | Existing orchestration/integration skills; Agentic Atlas for design questions | Basic Memory for authorized private project context | No memory read/write for self-contained tasks; no competing global instruction packs |
| Web scraping and research | Exa for discovery; Firecrawl for bounded extraction | Playwright for necessary rendered interaction; Crawl4AI for an approved programmable crawl | Start with one suitable working provider; escalate only when capability or evidence is insufficient |
| Data analysis and processing | DuckDB **or** Polars; Pandera for validation | PyArrow for necessary interchange; MarkItDown for source-document extraction | Preserve user-selected tooling; keep private data in an approved runtime |
| Development and coding | Native GitHub/repository tools; Context7; selected Vercel/Supabase guidance | Official GSAP for motion; Microsoft skills only for matching Azure/SDK work; Playwright for UI evidence | Inspect repo/lockfile first; use specific relevant guidance rather than whole libraries |
| Automation and orchestration | Existing project/platform first; GitHub Actions for repository CI | n8n for business workflows; Temporal for justified durable processes; Prefect MCP for monitoring existing Prefect | One execution owner; don't install several engines to answer a routing question |

These are proposed selection defaults, not deployment decisions. Each record includes use/avoid criteria, prerequisites, effects, alternatives, evidence references and unknown connection status.

## 4. High-value findings that change the design

### Skill libraries are not interchangeable with executable services

Agent Skills packages can include `SKILL.md`, references, assets and scripts. A collection is a discovery container; approval must select an exact path/revision and inspect its supporting files. Loading a skill does not install its dependencies or authorize its scripts. [S01]

Vercel, Supabase, Microsoft, Firecrawl and GSAP provide useful task-specific collections. Their guidance should be selected by actual stack and intent. Microsoft is particularly Azure/SDK-oriented. Firecrawl's distribution catalog mirrors different upstream sources for core session work, application/API integration and workflow deliverables; provenance must retain that distinction. [S07-S11]

### Registry search is discovery, not trust

The HAPI Firecrawl search returned the official `io.github.firecrawl/firecrawl-mcp-server` along with unrelated or unofficial wrappers. Exa also had substring matches unrelated to the official `ai.exa/exa` entry. Resolve publisher, repository, service endpoint and exact selected revision independently. Registry activity status and a familiar title do not establish safe execution. [S06, S14, S15]

### Authentication and quotas are evolving metadata

Current SkillsMP documentation permits a small anonymous MCP trial and an optional account Bearer key sharing keyword allowance with REST. It also documents JSON-RPC quota failures returned with HTTP 200 and limits shared by IP. Do not preserve an obsolete blanket statement that MCP credentials can never affect account allowance. Test current behavior before updating the existing adapter. Keep credentials out of catalog records. [S04]

Firecrawl documents distinct OAuth and API-key/keyless MCP paths. The connector available in this research session does not automatically provide authorization to Soren's deployed gateway or to every desktop agent. Prefer existing native connections; never copy their credential material into a public proxy. [S15]

### Browser concurrency needs actual isolation

Playwright MCP's persistent profile can conflict between simultaneous sessions. Give each acting agent a separate authorized context/profile and keep account boundaries explicit. Browser tools can submit forms and mutate external state; using structured snapshots does not make them read-only or a security sandbox. [S18]

### Workflow services differ in authority

n8n instance-level MCP exposure is user-scoped, not independently scoped to each MCP client. Use appropriate account/workflow boundaries rather than promising isolation that it does not supply. Prefect's documented MCP is beta and read-only; its CLI/SDK can have different effects and permissions. Temporal is a durable runtime, not an automatically connected MCP tool, and retried activities still need idempotency or compensation for external writes. [S19, S26, S27]

### Data libraries should stay out of public router execution

DuckDB and Polars are analytical execution choices, Pandera validates data, and PyArrow supplies interchange/format support. These belong in a user's approved local or isolated remote runtime, not an unauthenticated arbitrary SQL/code executor. MarkItDown accesses resources with its process privileges; restrict files, destinations and converter methods and isolate untrusted parsing. [S20-S24]

## 5. Efficient data model

Use **independent axes**, not one misleading `trusted` or `available` flag:

1. **Entity kind:** bundled skill, collection, catalog, MCP service, library, workflow runtime or reference corpus.
2. **Task applicability:** domain, capability verbs, use conditions and negative examples.
3. **Provenance:** source/publisher identity, distribution mirror, upstream path, research date.
4. **Approval:** metadata reviewed versus exact content/version approved; do not copy approval to changed bytes.
5. **Availability:** supported/connected/authenticated/probed for the current host, account and environment.
6. **Effects:** public/private reads, workspace writes, external writes, execution, scheduling or spending.

The included catalog is intentionally metadata-only. `executionAuthorized` is false for every record. `selectedArtifactRevision` and `selectedArtifactSha256` remain null because this research has not pinned or audited external instruction packages. The installed bundled baseline is identified by the inspected project revision rather than a fabricated new approval.

Canonical identity should be source repository plus exact skill path; version identity adds commit and manifest digest. Services need publisher/server identity and actual transport/schema identity. Equal names from different repositories are not duplicates; mirrored records retain both distribution and source-of-truth provenance. [S00, S01, S02]

### Progressive disclosure

- **Level 0:** short capability metadata and prerequisites.
- **Level 1:** the selected workflow recipe and one primary skill, with at most two justified complements per step.
- **Level 2:** relevant approved reference sections/files, fetched only when needed.
- **Level 3:** output artifacts and verification evidence returned by the execution owner.

These are proposed defaults. No exact token or latency improvement is claimed. Evaluate against real tasks before choosing a tokenizer budget or embedding index. Start with normalized fields and task vocabulary; add semantic retrieval only if measured recall gaps justify it. [S12, S30]

## 6. Predicted agent process

**Understand -> classify -> inventory -> filter -> select -> retrieve -> act -> verify -> hand off.**

The agent first identifies the requested outcome, instructions and source boundaries. Simple questions bypass routing. For substantial work, classify the operation (not merely topic words): researching React, editing React and deploying React have different permissions.

Inspect the actual tools and credentials available in the current host. Filter candidates before scoring: permission, source restrictions, content approval, runtime compatibility, data sensitivity and budget all come first. Prefer an already usable native capability. A catalog entry is not evidence that its tool can be invoked.

Choose one primary capability and a small number of complements with distinct jobs. Retrieve only their relevant approved instructions or factual references. Execute through the host's native tool or approved runner; the public router never silently borrows a connector token or starts a daemon.

Every step has preconditions, input artifact references, expected output, verification and a stop/fallback rule. Timeout is not authorization denial. A failed or denied provider cannot be bypassed through a new identity/interface. An uncertain write must be reconciled by operation ID before retry.

Validate outputs using the right observer: source citations for research, schema/invariant checks for data, tests/rendered behavior for coding, and actual platform receipts for workflows. A final model statement is not sufficient evidence of a tool action. Save only an authorized, concise private handoff; do not copy full transcripts or private datasets into the public catalog.

## 7. Five explicit workflow recipes

`workflows.json` specifies all steps, candidate IDs, ownership, preconditions, output expectations and failure gates.

| Workflow | Core sequence | What prevents confusion |
|---|---|---|
| Contextual assistance | Scope -> authorized context -> select -> reason -> verify -> optional handoff | Memory is conditional and private; no automatic writes |
| Source-to-brief research | Scope -> discover -> extract -> conditional browser -> assess -> cite | Search, extraction and interaction have distinct roles |
| Source-to-analysis | Profile -> conditional extraction -> validate -> compute -> optional interchange -> verify | One primary engine; data never silently leaves approved runtime |
| Repository-to-tested-change | Inspect -> versioned docs -> focused guidance -> implement -> test -> authorized publication | Existing project workflow wins; PR is not merge/deploy permission |
| Intent-to-controlled-workflow | Scope -> choose existing engine -> inspect -> prepare -> rehearse -> approve/activate -> observe | One state/effect owner; schedules exist only after explicit activation |

Steps in the JSON are an ordered DAG. Conditional steps return an explicit skipped result so downstream dependencies remain understandable. Independent read-only work may be parallelized under a single synthesizer. Independent file writers require separate worktrees or disjoint ownership; the router supplies no filesystem locking.

## 8. Non-interference rules

Soren.mode, Superpowers, Product Design, Agent Skills and host tools may already provide methodology. Do not install duplicate copies or import another repository's top-level agent prompt. The registry recommends *capabilities*, not a competing supervisor.

Fetched descriptions, skills, pages and logs remain lower-trust content. Tool annotations and prose labels do not enforce authorization; validate permissions at the actual operation boundary. The router must not grant approval to its own outputs, rewrite another client's configuration, or delegate recursively. [S02, S29]

The proposed recommendation status is one of `NO_ROUTING_NEEDED`, `READY_WITH_EXISTING_TOOLS`, `NEEDS_CONNECTION`, `NEEDS_REVIEW`, `NEEDS_APPROVAL`, `NEEDS_RUNTIME`, or `UNSUPPORTED`. Each response also identifies evidence freshness and missing preconditions. A prepared plan remains `planOnly: true` and does not authorize effects.

## 9. Integration path into the existing repository

**This deliverable integrates researched data into a review package only.** It intentionally does not wire these candidates into the public runtime.

1. Review the metadata/schema and select initial pilots: Exa, Firecrawl, Context7, GitHub, and existing approved coding guidance; DuckDB/Polars plus validation for data tasks. Reuse working connections rather than copying credentials.
2. Design an opt-in `include_capability_plan` input and additive `capabilityPlan` result for `route_task`; these names are proposed, not implemented. Leave default responses, all eight tool names, the four bundled resources and legacy arrays unchanged. Do not relabel libraries as `list_skills` entries or add a general-purpose execution tool.
3. Extend task routing with typed recommendations and explicit missing-capability statuses after design approval. Runtime selection must consume host-verified availability, not user-supplied identity fields as authorization.
4. Implement only selected provider adapters using existing budgets, authorization and failure handling. Native connectors stay host-owned unless a separately authorized server-to-server delegation path is built.
5. Pin and review exact skill versions through the existing private registry. Do not change publication/updater safeguards to make catalog expansion easier.
6. Run the proposed evaluation cases and live target-host tests. Only then publish to the active endpoint and report actual connectivity separately from schema/code success.

Do not add n8n, Temporal and Prefect infrastructure just because they appear in the catalog. They are conditional choices for real workloads, not mandatory dependencies of this router.

## 10. Verification boundaries

The validation script checks metadata schema, IDs, source links, references, 5-domain coverage, workflow DAGs, effects/authorization gates and the absence of approved execution claims. Negative fixtures exercise schema and cross-reference rejection. The 24 evaluation cases are a **test specification**, not passed routing cases or an accuracy benchmark.

No source application tests, hosted account actions, new provider installations, native desktop invocations, or production deployment are claimed for this research package. No target performance improvement has been measured. Review `VALIDATION.json` for the checks actually run.

## Files

- `catalog.json`: 30 typed entries, 22 additions proposed.
- `sources.json`: 31 source records with supported findings and evidence method.
- `workflows.json`: proposed policy and five operational recipes.
- `catalog.schema.json`: strict catalog structural contract.
- `evaluation-cases.json`: 24 positive/negative agent scenarios, not execution results.
- `AGENT_GUIDE.md`: concise consumption guide, not a replacement system prompt.
- `validate_catalog.py`: local structural validator; Python 3 and jsonschema required.
- `VALIDATION.json`: bounded validation result.

**Outcome:** broaden task coverage without multiplying persistent local processes, duplicating agent supervisors, or mistaking researched possibilities for deployed capabilities.
