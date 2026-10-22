# Local Codex learning loop

This branch adds `soren-learning-loop` to the existing read-only skill catalog. It does not add tools, a database service, hooks, permissions, packages, or model training. No hosted change is active until separately reviewed and released. The original catalog order and V3 feature gate remain intact.

## Architecture and scopes

Use native Codex memories for persistent factual recall. Keep generated memory files under `$CODEX_HOME/memories` managed by Codex. The bootstrap skill coordinates project instructions, native recall, existing SOREN discovery and a small Python standard-library evidence helper.

The helper keeps immutable curated records in `$CODEX_HOME/soren-learning/lessons`, check receipts in `evidence`, and inactive procedures in `candidates`. It is an evidence/review queue, not a second memory MCP. Reads are scoped to the exact project plus explicitly portable `*` records. An unverified record is visibly labeled and cannot generate a candidate.

Temporary notes stay in ignored project scratch storage. Project skills belong in `<repo>/.agents/skills`; user skills belong in `~/.agents/skills`. Generated candidates live outside both locations. Human review and explicit approval are required before globally promoting a harvested procedure. The requested bootstrap itself is the only newly installed user skill.

The existing `self-learning` skill already captures golden paths. Reuse that harvesting concept rather than installing another competing meta-skill. Connected Basic Memory Cloud capabilities and Headroom learned patterns were also present; neither needs replacement or an additional connector.

## Source audit and decision, 2026-10-22

Reviewed source snapshots, without executing their installers:

- `liza-studio/skillmem` at `491e2b1169ad430468e082af238dd0a5b046d7ad`, version 0.12.1. `pyproject.toml` declares click, MCP 1.x, PyYAML, platformdirs, FastAPI, uvicorn and snowballstemmer. Semantic search optionally adds fastembed/numpy and an approximately 220 MB model. The Windows installer can install Python, change user PATH, initialize Claude Code and schedule decay by default. It proceeds without a checksum when the checksum file is absent. None of those actions was run. These are bounded source-audit observations, not a claim that the entire package is secure or insecure.
- `scottfalconer/self-learning-skills` at `c383c25606c61a47c5a064e1fd55e6bc11c02bf5`. Its helper uses Python standard library and a separate append-only JSONL store. It includes global promotion and direct skill-backport application commands. This duplicates native recall plus the installed harvesting skill and exposes more write paths than needed here. It was not installed or executed.
- Official [Codex memories](https://developers.openai.com/codex/customization/memories) and [skill scopes](https://developers.openai.com/codex/skills) were fetched. Native memory generation is asynchronous; do not claim that an update proposal has already been consolidated.

Chosen combination: existing native memory + the existing harvesting guidance + the requested bootstrap/evidence helper. No third-party dependency was installed. Isolated upstream audit checkouts remain outside the repository source.

## Verification

From the repository root:

```text
python -m unittest discover -s tests/learning -v
node --test tests/client-contract.test.mjs "tests/contracts/*.test.mjs" "tests/routing/*.test.mjs" tests/catalog.test.mjs tests/learning-routing.test.mjs
git diff --check
```

On the isolated worktree: 8 Python tests and 116 Node tests passed. Tests cover independent-process persistence, exact project scope, portable facts, unverified/factual record rejection, stale source/lesson rejection, latest failed evidence, output marker checks, duplicate protection, common credential patterns, catalog lookup, MCP contracts, and unchanged V3 gating. Receipts retain output hashes rather than raw logs. Tests establish these explicit checks, not complete secret detection or semantic correctness of every future lesson.

A real `argparse.REMAINDER` option-order failure was reproduced, checked, recorded, recalled by a fresh Codex process, and rendered as an inactive skill candidate. A first CLI attempt failed through the configured model/proxy stream; a desktop-bundled CLI read-only attempt could read injected instructions but could not read the global skill under the Windows sandbox. A subsequent fresh bundled CLI session under the existing permission profile successfully read the skill and recalled the record, its `check-passed` label and inactive status. No permission configuration was changed to perform this test.

Live read-only MCP calls succeeded for SOREN routing and approved-skill reading, Headroom retrieval, Context7 resolution/documentation, and Playwright tab listing. PlayCanvas returned `Transport closed`. Other configured MCP servers were inventoried but were not all exercised. Local contract tests do not substitute for end-to-end tests of each external application.

## Operational limits

Checks execute only when explicitly invoked and already authorized for the task. A receipt proves a command returned zero, printed its expected marker, and left tracked input hashes unchanged. It does not prove semantic relevance, owner approval, or hostile-user tamper resistance. Human review remains mandatory. Secret screening is heuristic; curate minimal data instead of dumping transcripts.

The global instruction block makes the before/after workflow discoverable. It is agent guidance, not a background daemon or enforcement hook. Native memory eligibility, quota and idle-time rules can delay consolidation. No service or scheduled task was registered. No client TOML or existing V3 configuration was changed.

Rollback the local installation by removing only the marked global instruction block and archiving the bootstrap, evidence store and update proposal. Keep native generated memory and unrelated instructions intact. Repository changes remain isolated on `feat/soren-learning-loop`; do not merge or deploy them as part of learning.
