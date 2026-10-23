# Skill Foundry Core V3 → SOREN Universal / Router

## Status and trust boundary

This is a local, explicit-owner-review import bridge, not a live hosted
Foundry-to-SOREN webhook. Skill Foundry Core V3 is an independent connected
plugin. It creates and validates SKILL.md files and can attest a release.
SOREN Universal exposes a read-only approved skill catalog and its Router only
recommends skills. A Foundry release attestation is NOT a SOREN approval, code
safety guarantee, client installation, or production deployment.

**Guarantees:** pending files never appear in the registered SOREN catalog;
approved entries require explicit named reviewer confirmation of an exact
SKILL.md SHA-256 and an evidence-file SHA-256; metadata is extracted instead
of retyped; the runtime fails closed if approved content or metadata drifts;
normal bundled skills remain usable if a Foundry registry record fails.

**Not automated:** calling Foundry in a different plugin session; verifying
the authenticity of caller-provided Foundry evidence; claiming a license;
installing other agents' skills; merging a PR; promoting a deployment.

## Prerequisites

Use an isolated worktree or feature branch from the approved main commit.
Do not change main or the production Vercel deployment without separate
approval. Only the new SKILL.md itself is imported; Foundry support scripts
and assets are not loaded or executed.

Export the exact standalone SKILL.md from foundry_forge. Run
foundry_release_check on that same artifact and capture the original
forge gate report, risk, attestation, release check and provenance. Put the
JSON evidence file OUTSIDE the repository. Example envelope:

~~~json
{
  "producer": "Skill Foundry Core V3",
  "forgeResult": {"gate": "...original gate output...", "attestation": "..."},
  "releaseCheck": {"sha256": "...original export hash..."}
}
~~~

This is an example envelope FORMAT, not an attestation or a real successful
forge. Include the original results; never invent them. The reviewer must
independently inspect the plugin output. Do not save secrets in the evidence.

## 1 — Stage the candidate (does not approve)

From the SOREN repo:

~~~bash
npm run foundry:stage -- --skill "/path/to/SKILL.md" --evidence "/outside-repo/foundry-evidence.json"
~~~

The command parses name, description and optional tags from frontmatter,
derives routing tags, fingerprints the two supplied files and creates only:

~~~text
catalog/foundry-pending/<name>/SKILL.md
catalog/foundry-pending/<name>/manifest.json
~~~

It does not modify the curated catalog. Its JSON output includes TWO distinct
SHA-256 values. Evidence bytes remain outside source control; only their
fingerprint is staged. The Foundry export hash may refer to an archive, so
DO NOT mistake that digest for the raw SKILL.md digest.

## 2 — Manual review and explicit approval

Review the exact staged file for prompt injection, secret collection,
unexpected network or shell instructions, unrelated agent-policy overrides,
license/provenance issues, Foundry risk and all six gates, and the matching
release-check result. A human owner must compare the original evidence and
decide whether to adopt the skill. After a positive review, run:

~~~bash
npm run foundry:approve -- --name "spline-cinematic-workflow" --skill-sha256 "<stage skillSha256>" --evidence-sha256 "<stage evidenceSha256>" --evidence "/outside-repo/foundry-evidence.json" --reviewer "owner" --confirm-reviewed
~~~

The explicit --confirm-reviewed flag is NEVER passed by an unattended Foundry
generator or routing agent. Both digests are required. The evidence file
must still hash to the reviewed digest. Approval copies the exact SKILL.md to
skills/<name>/SKILL.md, removes the pending copy, and writes a sorted entry to
catalog/foundry-approved.json with review provenance.

The runtime checks all approved entries before including any in list_skills,
search_skills, route_task, read_skill, or resources. This step never adds a
new MCP tool, grants permissions, or executes imported instructions.

## 3 — Verify and propose a release

~~~bash
npm run foundry:verify
node --test tests/foundry/bridge.test.mjs
npm test
npm run typecheck
npm run build
~~~

Prepare a draft PR containing reviewed source/registry and test evidence.
CI rejects broken approved hashes. Reviewers should check the source bytes,
digest, licensing and review receipt. Approval, PR review, merge, preview
tests and production activation are DISTINCT gates.

The already-running SOREN endpoint does NOT dynamically ingest a file from
a development machine. Router exposes a new approved skill only after the
exact reviewed artifact is deployed.

## Recovery

- Reject pending: remove its catalog/foundry-pending/<name> folder after
  preserving any required audit record. Nothing was exposed to Router.
- Revoke approved: remove its catalog entry and skill folder in a reviewed
  PR, then deploy a revised artifact. Never silently edit the pinned file.
- Tamper or metadata mismatch: foundry:verify returns nonzero; runtime excludes
  ALL Foundry additions while retaining the original bundled skills.
- Never embed a personal Foundry token, scrape session cookies, or add a
  write-capable approval endpoint to the public, read-only SOREN MCP service.
