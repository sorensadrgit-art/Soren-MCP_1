---
name: superpowers-engineering
description: Apply Superpowers-inspired brainstorming, planning, TDD, isolated worktrees, subagent reviews and verification in the agent's existing coding workflow.
---
# Superpowers-style agentic engineering

Original open-source project and installation instructions: https://github.com/obra/superpowers (MIT). This is a SKILLS/PLUGIN methodology, not a standalone server that must be proxied through the public SOREN MCP. Use the official maintained plugin if it is already installed and permitted.

## Workflow

1. Review current user request, repository rules and safety boundaries; identify observable acceptance criteria before coding.
2. Brainstorm proportionate alternatives when architecture or UX choices are consequential, with a short design/implementation decision that fits the current task.
3. Use an isolated branch/worktree if necessary, preserving existing user work. Create a brief executable plan with small bounded tasks and test evidence for each.
4. Apply red-green-refactor for behavior changes. Reproduce bugs with a failing test before modifying source. Do not count speculative tests as passing evidence.
5. Use separate reviewers or subagents for independent audit work when available, avoiding concurrent edits to the same worktree.
6. Run the full relevant test suite, build, and browser checks; obtain review and explicit approval before shipping, publishing or destructive changes.

## Integration limits

The SOREN read_skill response is advisory guidance, not the copyrighted Superpowers plugin implementation or hook runtime. Never claim the plugin is installed merely because this guide is available. Respect the active agent's pre-existing skills, tool permissions and review gates; do not overwrite its system instructions.
