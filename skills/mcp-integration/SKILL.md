---
name: mcp-integration
description: Connect agents to a single shared Model Context Protocol service using Streamable HTTP and capability-based, least-privilege tools.
---
# Remote MCP integration

Use one remote HTTPS MCP endpoint across compatible agents. Prefer Streamable HTTP for new deployments; use stdio launchers only for legacy clients that cannot connect directly.

## Workflow
1. Inventory client versions and native remote MCP support before editing configuration.
2. Restrict the server to tools/resources relevant to the agents; never expose local user files, executable skills, credentials, or private configs.
3. Configure client URLs in supported agent settings. Use authentication and per-client scoped credentials if the service contains private data or write actions.
4. Validate initialization, tool listing, resources/list, resources/read, and one representative tool call.
5. Preserve original configs, remove duplicate local background start commands only after the remote path is proven, and test after client restart.

## Security
Do not execute skill markdown as code. Review provenance and permissions before distribution. Reject path traversal, untrusted origins and arbitrary command execution. Keep read-only curated catalogs separate from installation permissions.
