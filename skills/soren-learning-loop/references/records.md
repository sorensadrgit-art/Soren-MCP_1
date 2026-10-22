# Lesson records and evidence

Use Python 3.11 or newer. No package installation is required. Paths below are examples; resolve the installed skill path first. Never include secret values or sensitive user data in input, arguments, sources or output markers.

`record` accepts exactly these fields:

```json
{
  "id": "specific-solved-problem",
  "title": "Short trigger and solution description",
  "kind": "procedure",
  "project": "C:/path/to/repository",
  "problem": "Observed failure pattern",
  "solution": "Verified resolution, with limits",
  "steps": ["Inspect the relevant input", "Apply the proven resolution", "Run the relevant check"],
  "dead_ends": ["Actual attempted approach and why it failed"],
  "sources": ["Repository commit and file:line, or official source URL; observed YYYY-MM-DD"]
}
```

Use `kind: fact` for a factual note; steps and dead ends may then be empty lists. Use `project: "*"` only for a safe fact or procedure that genuinely applies across projects. `record` does not verify anything. It rejects unknown fields, duplicate IDs, common credential patterns and oversized input; human review must also exclude sensitive personal information and unusual secret formats.

```text
python <skill>/scripts/learning.py record <curated-input.json>
python <skill>/scripts/learning.py recall "specific failure terms" --project <absolute-project>
python <skill>/scripts/learning.py verify --cwd <project> --file <tested-source> --expect "PASS marker" <id> -- <executable> <arguments>
python <skill>/scripts/learning.py candidate <id>
```

Put verify options **before** the ID; everything after the ID is the check command. Repeat `--file` for every file whose changes would invalidate this evidence, including the relevant test and dependency manifests. Include the implementation under test, not just its test file. Commands run once with `shell=False` and a 120-second timeout. Invoke shell builtins through their interpreter only when that command is already authorized. No command runs during `record`, `recall` or `candidate`.

Relative `--file` paths resolve under the check's `--cwd`. Absolute paths remain absolute.

Receipts retain command arguments, working directory, source hashes, timestamps, return code and output hashes. They do not persist stdout or stderr. `--expect` must be a stable non-sensitive marker actually printed by the passing check. A nonzero exit, missing marker or source mutation during the check fails verification. A later failed check, edited lesson, changed source or missing source prevents candidate generation.

The receipt is local evidence, not a signature or hostile-user security boundary. Someone with write access to the store can forge it. A zero exit and output marker do not prove the test checks the intended solution. The human reviewer must assess relevance and limits before promotion.

There is deliberately no automatic install/promote command. After explicit approval, copy only the reviewed candidate to its approved project or user skill directory. Keep evidence with the reviewed change. Native memory generation runs asynchronously; a local record proves persistence in this helper, not immediate native consolidation.

## Automatic Stop capture

The dedicated Stop hook must be registered and reviewed in Codex `/hooks`. The user authorized this minimal local capture workflow; that does not authorize transcript retention, sensitive data, external actions, new permissions or global skill activation. If the hook is untrusted, Codex skips it. Do not substitute manual writes as proof that the hook ran.

After a completed task, the trusted handler creates an awaiting decision keyed by session ID plus turn ID. It requests one native continuation, not another Codex process. During that continuation:

1. Classify the completed task from its existing context. Do not open or parse a transcript. If no verified reusable outcome exists, or context is sensitive or opted out, stage a skip below.
2. For eligible knowledge, curate the exact JSON schema above. Use a fresh lowercase ID. Keep project scope unless portability is demonstrated. Record the observed failure and an actual attempted dead end; never invent either. Include provenance and limits. For verified standalone facts, use `kind: fact`; no candidate is generated.
3. Write the minimal input JSON in ignored project scratch storage. Run the exact `stage` prefix supplied by the hook, adding options **before** `--`. Repeat only the current task's already-authorized relevant test, including implementation/test/manifests in `--file` as applicable. Use a stable non-sensitive marker the test actually prints to **stdout**. If a runner writes status to stderr, use an already-reviewed test harness that runs the suite, fails on failure and prints a success marker; do not bless an unrelated echo as verification.

```text
<python> <skill>/scripts/learning.py stage --session <session-id> --turn <original-turn-id> --input <curated.json> --cwd <project> --file <implementation> --file <test> --expect <stdout-pass-marker> -- <authorized-test-executable> <args>
<python> <skill>/scripts/learning.py stage --session <session-id> --turn <original-turn-id> --skip no_verified_outcome
```

Allowed skip codes: `no_verified_outcome`, `no_reusable_knowledge`, `sensitive_context`, `user_opt_out`, `duplicate_lesson`. Staging retains only the curated entry and a receipt, not raw test output. It does **not** create a permanent lesson or candidate. Do not call `record`, `verify` or `candidate` to work around a failed stage. Report the failure and finish; the Stop handler logs the result.

4. Finish after staging. On the next Stop, the handler rechecks scope, lesson/receipt binding and current source hashes. It writes the lesson and evidence, then generates an eligible inactive procedure candidate. Exact normalized project/problem/solution duplicates are skipped. This is exact-content deduplication; semantic overlap still needs review.

The original session/turn key makes repeats idempotent. A continuation with a new turn ID is bound to the single awaiting decision from its session. A missing packet produces an explicit skip, never another continuation. Interrupted writes can resume without overwriting a different lesson. Unverified, malformed, secret-looking or stale packets fail visibly and cannot generate a candidate.

Invocation, continuation, stage, success, skip and failure events append to `$CODEX_HOME/soren-learning/hook-events.jsonl`. It contains event IDs/status/reason codes only, not prompts, transcript paths, assistant text, raw output or secret values. Runtime failures return a JSON `systemMessage`, a nonzero exit and a sanitized stderr warning. A stale `capture.lock` from a killed process causes a visible failure; after confirming no capture process is running, remove only that lock and retry the affected event. No daemon clears locks or promotes skills.
