# Optional TypeSafe Jev task-routing advisor

**Status:** source implementation only; disabled by default. This file is not evidence of a production deployment or live paid API call.

## Behavior

The existing `route_task` MCP tool accepts optional `decision_engine: "jev"`.
Jev may recommend a Choice among the four already-approved curated skills or `none`.
The default deterministic routing remains unchanged unless both caller and server opt in.
Code—not Jev—controls the actual routing; no skill can be installed or run.

Privacy and safety:
- Only the technical words produced by `publicQuery(task)` are sent, never full task text, repository content, patient information, credentials, or file paths. The adapter independently checks canonical allowlisting.
- Recommendation reordering requires confidence >= 0.85 and an eligible *already recommended* skill. This threshold is a starting policy, **not yet empirically validated**.
- Explicit `preferred_skills` always win; no model output can add a skill or override the host agent.
- The key is server-only. The API endpoint is fixed, with no redirects, bounded response size and timeout.
- Jev requests are protected by the existing `guardedProviderCall` shared quota store. Missing quotas, low confidence, unavailable API, malformed results and absent credits fall back to deterministic routing.

## Activate safely

1. Visit https://console.typesafe.ai/home. If the organization shows *no available credits*, the console cannot create or reactivate an API key. Any billing change is your decision.
2. Generate an organization API key. **Do not paste it into chat, source control, or public MCP tool inputs.**
3. Add server-side environment variables in the intended Vercel **preview** environment:
   - `TYPESAFE_API_KEY` = your key
   - `TYPESAFE_JEV_ENABLED` = `true`
   The existing `SOREN_RATE_KEY` and shared gateway quota store must also be configured.
4. Deploy to a reviewed preview using the repository's protected release workflow. Do not bypass approval or release gates.
5. Call the MCP tool:
   ```json
   {
     "task": "Build an accessible WebGL experience using GSAP",
     "runtime": "codex",
     "discovery": "local",
     "decision_engine": "jev"
   }
   ```
6. The `decisionEngine.status` property reports `applied`, `low_confidence`, `no_match`, `ineligible`, `disabled`, `not_configured`, `no_public_terms` or `unavailable_or_budget_limited`. Disable instantly for new deployments by setting `TYPESAFE_JEV_ENABLED=false`.

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
