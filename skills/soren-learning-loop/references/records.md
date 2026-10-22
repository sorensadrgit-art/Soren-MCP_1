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

Receipts retain command arguments, working directory, source hashes, timestamps, return code and output hashes. They do not persist stdout or stderr. `--expect` must be a stable non-sensitive marker actually printed by the passing check. A nonzero exit, missing marker or source mutation during the check fails verification. A later failed check, edited lesson, changed source or missing source prevents candidate generation.

The receipt is local evidence, not a signature or hostile-user security boundary. Someone with write access to the store can forge it. A zero exit and output marker do not prove the test checks the intended solution. The human reviewer must assess relevance and limits before promotion.

There is deliberately no automatic install/promote command. After explicit approval, copy only the reviewed candidate to its approved project or user skill directory. Keep evidence with the reviewed change. Native memory generation runs asynchronously; a local record proves persistence in this helper, not immediate native consolidation.
