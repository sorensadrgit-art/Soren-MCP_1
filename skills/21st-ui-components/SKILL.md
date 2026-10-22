---
name: 21st-ui-components
description: Discover and evaluate 21st.dev UI components, themes and templates through the official 21st MCP, then adapt reviewed code to the project.
---
# 21st.dev component discovery and design integration

The official unified 21st MCP endpoint is https://21st.dev/api/mcp. Its current product supersedes the legacy Magic MCP proxy. Reference: https://21st.dev/mcp and https://github.com/21st-dev/magic-mcp.

## Workflow

1. Review the product brief, target platform, React and Tailwind/shadcn versions, design tokens, accessibility requirements, desired component behavior and license constraints.
2. If the requesting agent has 21st MCP connected and authenticated, use search or get_inspiration to find lightweight component/theme/template metadata. This public SOREN router only supplies this guide; it does not authenticate to 21st or invoke account tools.
3. Shortlist by visual fit, accessibility, responsive behavior, dependencies, cost and licensing. Retrieve full code only if the user has access and the operation is authorized: some get_component calls consume a quota or require payment.
4. Examine returned source before installing anything. Adapt to the project's existing components, typography and motion tokens; avoid replacing a well-functioning design system.
5. Verify mobile, focus order, reduced motion, semantics, build and actual browser behavior. Prefer user-approved UI generation only when the 21st account reports hosted AI generation enabled.

## Boundaries

Use the host agent's own connection and login. Do not request API keys in chat, copy authentication headers into public files, or assume that connection metadata proves sign-in. Search/review must not silently publish templates, delete components, spend credits or alter the account.
