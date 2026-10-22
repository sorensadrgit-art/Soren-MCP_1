---
name: playwright-browser-qa
description: Use Microsoft's Playwright MCP for structured accessibility-tree browser interaction and verification of production-grade UI and end-to-end flows.
---
# Playwright MCP browser QA

Official server: https://github.com/microsoft/playwright-mcp. This is an agent-native local browser automation server, normally registered with command npx and argument @playwright/mcp@latest. It is NOT a public SOREN Vercel execution tool.

## Workflow

1. Review the app and choose a safe test target, base URL, test account, fixture reset strategy and relevant permissions. Never infer that a production website is a safe mutable test sandbox.
2. Verify which browser and profile the requesting client controls. Prefer an isolated test profile; do not silently switch to or copy an existing authenticated user's browser session.
3. If the host exposes Playwright MCP tools, navigate and inspect accessibility snapshots for reliable selectors and state. Use its own browser tools for actual interactions.
4. Test critical flows, navigation, responsive breakpoints, keyboard focus, form validation, errors, loading, and reduced motion. Collect console and network failure evidence, plus screenshots where useful.
5. Run project Playwright tests where authorized and available. Report assertion outcomes separately from snapshot browsing. Distinguish a passing build, an automated browser pass and a successful live deployment.

## Security and lifecycle

Review server package/runtime and access scope before first execution. A saved MCP definition does not prove the browser can launch or authenticate. Ask approval before irreversible form submissions, payments, account changes or destructive data edits. Do not disable site access safeguards, skip login or silently connect the browser to private accounts.
