# Optional TypeSafe Jev task-routing advisor

**Status:** source implementation only; disabled by default. This file is not evidence of a production deployment or live paid API call.

## Behavior

The existing `route_task` MCP tool accepts optional `decision_engine: "jev"`.
Jev may recommend a Choice among the current catalog-derived, already-approved and eligible local skill shortlist or `none`; it is no longer limited to four hardcoded skill names.
The default deterministic routing remains unchanged unless both caller and server opt in.
Code—not Jev—controls the actual routing; no skill can be installed or run.

Privacy and safety:
- Only the technical words produced by `publicQuery(task)` are sent, never full task text, repository content, patient information, credentials, or file paths. The adapter independently checks canonical allowlisting.
- Recommendation reordering requires confidence >= 0.85 and an eligible *already recommended* skill. This threshold is a starting policy, **not yet empirically validated**.
- Explicit `preferred_skills` always win; no model output can add a skill or override the host agent.
- Local discovery and private/provided-only capability plans never invoke Jev. Explicit preferred skills skip the API call entirely.
- The key is server-only. The API endpoint is fixed, with no redirects, bounded response size and a total deadline covering response streaming as well as headers.
- Jev requests are protected by the existing `guardedProviderCall` shared quota store. Missing quotas, low confidence, unavailable API, malformed results and absent credits fall back to deterministic routing.

## Activate safely

1. Visit https://console.typesafe.ai/home. If the organization shows *no available credits*, the console cannot create or reactivate an API key. Any billing change is your decision.
2. Generate an organization API key. **Do not paste it into chat, source control, or public MCP tool inputs.**
3. Add server-side environment variables in the intended Vercel **preview** environment:
   - `TYPESAFE_API_KEY` = your key
   - `TYPESAFE_JEV_ENABLED` = `true`
   - `SOREN_TYPESAFE_TOOLS` = `1` only to expose the **three additional** optional advisory tools, and `SOREN_V3_TOOLS` = `1` to enable their V3 parent surface.
   The existing `SOREN_RATE_KEY` and shared gateway quota store must also be configured.
4. Deploy to a reviewed preview using the repository's protected release workflow. Do not bypass approval or release gates.
5. Call the MCP tool:
   ```json
   {
     "task": "Build an accessible WebGL experience using GSAP",
     "runtime": "codex",
     "discovery": "auto",
     "decision_engine": "jev"
   }
   ```
6. The `decisionEngine.status` property reports `applied`, `low_confidence`, `no_match`, `ineligible`, `disabled`, `not_configured`, `no_public_terms`, `local_only`, `privacy_scope_preserved`, `explicit_preference_preserved`, `no_eligible_skills`, or `unavailable_or_budget_limited`. Disable instantly for new deployments by setting `TYPESAFE_JEV_ENABLED=false`.

## Additional advisory tools (all off unless TWO tool flags are enabled)

The add-on is independently gated by `SOREN_V3_TOOLS=1` and
`SOREN_TYPESAFE_TOOLS=1`. It does NOT change the eight original tools or
the six existing V3 tools while the flag is off.

### 1. Specialist-agent suggestion

Tool: `soren_jev_suggest_specialist`.

Pass a manually curated PUBLIC summary, an explicit allowlist of candidate
agent names and capabilities, and `public_confirmed: true`. The candidate
list is caller-supplied and must describe agents already available through the
client: TypeSafe never discovers whether those agents are installed or
authenticated. It returns a suggestion, no-match or review-needed outcome,
with no execution authority. Threshold 0.85 is provisional, not a guarantee.

Example MCP arguments:

```json
{
  "public_summary": "Run automated Playwright accessibility and browser QA",
  "candidates": [
    {"id":"qa-agent","description":"Runs browser tests and accessibility reports"},
    {"id":"frontend-agent","description":"Builds React components and GSAP interactions"}
  ],
  "public_confirmed": true
}
```

### 2. Learning Loop triage

Tool: `soren_jev_triage_learning`.

Supply only a human-curated PUBLIC technical summary and 1–5 public provenance
labels. It runs a Choice (retain, review, discard) and a Noul (lasting value)
in one TypeSafe request. It **never** writes memory, updates a file,
promotes a candidate, or overrides the Learning Loop's explicit consent
and verified-evidence checks.

```json
{
  "public_summary": "The Vite build uses npm run build and writes to dist",
  "sources": ["public package.json"],
  "public_confirmed": true
}
```

### 3. Agent claim/source verification

Tool: `soren_jev_verify_claim`.

Supply a PUBLIC claim, the verbatim PUBLIC evidence excerpt and an exact quote
from it. First, a local deterministic quote check returns `fabricated`
without model inference if the quote does not appear in the excerpt. Otherwise
Jev can return supported, contradicted, unsupported or insufficient, with
uncertain results downgraded to review. **This is not full agent verification,
a security test, source authentication or independent fact-checking.**

```json
{
  "claim": "The build succeeded",
  "source_excerpt": "Build completed successfully. Exit code 0.",
  "quote": "Exit code 0",
  "public_confirmed": true
}
```

### Data and failure boundaries

- Any tool with `public_confirmed: true` sends its public summary/evidence
  and candidate/source labels to TypeSafe. The caller must first determine
  it is appropriate to share; pattern screening is not complete PII detection.
  Never send transcripts, private customer work, medical/clinical material,
  raw memory, credentials, private repository code or private tool logs.
- All three use `https://api.typesafe.ai/v1/systemone`, bounded responses,
  a short total deadline, server-side keys, the existing shared budget store
  and no auto-activation or auto-save.
- Responses marked unavailable, low confidence or review needed do not
  authorize execution, memory persistence or acceptance of a claim.
- Flags default off. Disable either `TYPESAFE_JEV_ENABLED` or
  `SOREN_TYPESAFE_TOOLS` for rollback after a new deployment; previously
  running instances only pick up new variables when reloaded.
- No TypeSafe credits or key exist in this repository. A deployment can
  advertise the tools but return `not_configured` until a credited API
  credential and shared budget store are configured.

## Optional agent skill

Official skill: https://github.com/typesafe-ai/skills/tree/main/skills/typesafe-ai

Run `npx skills add typesafe-ai/skills --skill typesafe-ai` to install in an agent environment after reviewing source and selecting your agent. The skill does not create an API key or credit balance. Do not automatically publish it to the curated MCP catalog.

## Verify

```sh
node --test tests/routing/typesafe.test.mjs
npm run test:routing
npm test
npm run typecheck
npm run build
```

Unit tests use a **mock TypeSafe HTTP response**, not real paid inference. Live verification remains blocked until funded credentials and approval for the appropriate environment exist. Publishing source is not a production deployment.

## Capability-plan integration

This implementation reuses the optional advisor source from PR #2 while keeping the 30-entry capability plan deterministic and non-authorizing. Its tests use simulated provider responses. Missing model readiness never blocks the metadata planner. See [capability-planning.md](capability-planning.md) for the opt-in request and exact evidence boundary.
