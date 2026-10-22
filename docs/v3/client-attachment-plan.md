# Client attachment plan (dry run)

Generated from `getClientSetupGuide` (lib/integrations/runtime-matrix.mjs) on 2026-10-22. Nothing on this page has been run. SOREN does not edit client configuration, install packages, or handle credentials.

## How to read the states

- **verified**: this agent made a successful native tool call in that client during this session.
- **client_reported**: the name appears in `<client> mcp list` or the client config file. The connection was not exercised.
- **proposed**: not present; the command below is a dry-run suggestion that the user runs after review.
- **unsupported**: the vendor does not document this client.

Inventory sources: `setup-agents inspect --agents all` (read-only, hashes only) and `mcp list` names. Secrets were not read or recorded.

## Matrix

| Integration | codex (0.157.1) | factory (0.244.0) | antigravity (agy 1.4.5) | opencode (not installed) | claude (2.1.283) | qwen (0.25.3) |
|---|---|---|---|---|---|---|
| context7 | client_reported | verified | proposed | proposed | proposed | proposed |
| serena | proposed | proposed | proposed | proposed | proposed | proposed |
| next-devtools | proposed | proposed | proposed | proposed | proposed | proposed |
| github | client_reported | proposed | proposed | proposed | proposed | proposed |
| playwright | client_reported | verified | proposed | proposed | proposed | proposed |
| chrome-devtools | client_reported | verified | proposed | proposed | proposed | proposed |
| vercel | client_reported | unsupported | unsupported | proposed | client_reported | unsupported |
| spline | client_reported | proposed | proposed | proposed | client_reported | proposed |
| gltf-transform-cli | n/a (CLI) | n/a (CLI) | n/a (CLI) | n/a (CLI) | n/a (CLI) | n/a (CLI) |
| blender-lab | proposed (isolated VM) | proposed (isolated VM) | proposed (isolated VM) | proposed (isolated VM) | proposed (isolated VM) | proposed (isolated VM) |
| firecrawl | proposed | proposed | proposed | proposed | proposed | proposed |
| 21st | client_reported | client_reported | proposed | proposed | proposed | proposed |
| motionsites | client_reported | client_reported | proposed | proposed | client_reported | proposed |

## Before any change

1. Back up the client MCP config (paths are in `.local/agents-inspect.json`, not committed).
2. Run the preflight commands for the client and compare with this page.
3. Add one integration at a time. After each, make one harmless read-only native call and record the result.
4. Roll back with the listed remove command if the call fails.

Known conflicts from inspection: Codex reports `PLUGIN_SYMLINK_REQUIRES_REVIEW`; Factory reports `EXISTING_ALIAS_REQUIRES_REVIEW` for `soren-skills`. Neither was changed. Antigravity is configured for `soren-skills` but the installer marks it `compatible: false`, so treat its setup as manual. OpenCode is not installed.

## codex

### serena

```
codex mcp add serena -- serena start-mcp-server --context codex --project-from-cwd
```

- On Windows, some clients need the command wrapped as cmd /c npx ...; check the client documentation.

Verify: Ask the client to list Serena tools, then run a read-only symbol search.

Rollback: codex mcp remove serena

### next-devtools

```
codex mcp add next-devtools -- npx -y next-devtools-mcp@0.4.0
```

- On Windows, some clients need the command wrapped as cmd /c npx ...; check the client documentation.

Verify: With next dev running, request current runtime errors and confirm a structured response.

Rollback: codex mcp remove next-devtools

### blender-lab

1. Provision a disposable VM or machine with no personal or production files.
2. Inside the isolated VM: install the add-on from the Blender Lab repository (https://www.blender.org/lab/mcp-server/), then register the blender-mcp stdio entry point in that VM agent client.
3. Start the add-on server inside Blender manually for this session only.
4. Stop the add-on server and discard the VM snapshot afterwards.

Verify: Inside the VM only: request a read-only scene summary.

Rollback: Stop the Blender add-on server; Remove the server entry from the VM agent client; Revert the VM snapshot

### firecrawl

Credential: set `FIRECRAWL_API_KEY` in your shell or secret manager. Never paste it into chat or commit it.

```
codex mcp add firecrawl --env FIRECRAWL_API_KEY=<value-from-your-secret-store> -- npx -y firecrawl-mcp@3.33.4
```

- On Windows, some clients need the command wrapped as cmd /c npx ...; check the client documentation.

Verify: Scrape one public documentation page and confirm Markdown output.

Rollback: codex mcp remove firecrawl

## factory

### serena

```
droid mcp add serena "serena start-mcp-server --context ide --project-from-cwd"
```

- On Windows, some clients need the command wrapped as cmd /c npx ...; check the client documentation.

Verify: Ask the client to list Serena tools, then run a read-only symbol search.

Rollback: droid mcp remove serena

### next-devtools

```
droid mcp add next-devtools "npx -y next-devtools-mcp@0.4.0"
```

- On Windows, some clients need the command wrapped as cmd /c npx ...; check the client documentation.

Verify: With next dev running, request current runtime errors and confirm a structured response.

Rollback: droid mcp remove next-devtools

### github

Credential: set `GITHUB_PAT_TOKEN` in your shell or secret manager. Never paste it into chat or commit it.

Authentication: OAuth in the client; approve in the browser yourself.

```
droid mcp add --type http github https://api.githubcopilot.com/mcp/
droid mcp auth
```

Verify: Call get_me or list a repository read-only.

Rollback: droid mcp remove github

### spline

Authentication: OAuth in the client; approve in the browser yourself.

```
droid mcp add --type http spline https://mcp.spline.design/mcp
droid mcp auth
```

Verify: After OAuth, list Spline files read-only before any edit.

Rollback: droid mcp remove spline

### blender-lab

1. Provision a disposable VM or machine with no personal or production files.
2. Inside the isolated VM: install the add-on from the Blender Lab repository (https://www.blender.org/lab/mcp-server/), then register the blender-mcp stdio entry point in that VM agent client.
3. Start the add-on server inside Blender manually for this session only.
4. Stop the add-on server and discard the VM snapshot afterwards.

Verify: Inside the VM only: request a read-only scene summary.

Rollback: Stop the Blender add-on server; Remove the server entry from the VM agent client; Revert the VM snapshot

### firecrawl

Credential: set `FIRECRAWL_API_KEY` in your shell or secret manager. Never paste it into chat or commit it.

```
droid mcp add firecrawl "npx -y firecrawl-mcp@3.33.4" --env FIRECRAWL_API_KEY=<value-from-your-secret-store>
```

- On Windows, some clients need the command wrapped as cmd /c npx ...; check the client documentation.

Verify: Scrape one public documentation page and confirm Markdown output.

Rollback: droid mcp remove firecrawl

## antigravity

### context7

Credential: set `CONTEXT7_API_KEY` in your shell or secret manager. Never paste it into chat or commit it.

Add to Antigravity mcp_config.json (Manage MCP Servers > View raw config):

```json
{
  "mcpServers": {
    "context7": {
      "serverUrl": "https://mcp.context7.com/mcp"
    }
  }
}
```

- Edit the config file by hand; SOREN does not modify client configuration.

Verify: Call resolve-library-id for "Next.js" and confirm /vercel/next.js is returned.

Rollback: Remove the "context7" entry from Antigravity mcp_config.json (Manage MCP Servers > View raw config) and restore your backup

### serena

Add to Antigravity mcp_config.json (Manage MCP Servers > View raw config):

```json
{
  "mcpServers": {
    "serena": {
      "command": "serena",
      "args": [
        "start-mcp-server",
        "--context",
        "ide",
        "--project-from-cwd"
      ]
    }
  }
}
```

- On Windows, some clients need the command wrapped as cmd /c npx ...; check the client documentation.
- Edit the config file by hand; SOREN does not modify client configuration.

Verify: Ask the client to list Serena tools, then run a read-only symbol search.

Rollback: Remove the "serena" entry from Antigravity mcp_config.json (Manage MCP Servers > View raw config) and restore your backup

### next-devtools

Add to Antigravity mcp_config.json (Manage MCP Servers > View raw config):

```json
{
  "mcpServers": {
    "next-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "next-devtools-mcp@0.4.0"
      ]
    }
  }
}
```

- On Windows, some clients need the command wrapped as cmd /c npx ...; check the client documentation.
- Edit the config file by hand; SOREN does not modify client configuration.

Verify: With next dev running, request current runtime errors and confirm a structured response.

Rollback: Remove the "next-devtools" entry from Antigravity mcp_config.json (Manage MCP Servers > View raw config) and restore your backup

### github

Credential: set `GITHUB_PAT_TOKEN` in your shell or secret manager. Never paste it into chat or commit it.

Authentication: OAuth in the client; approve in the browser yourself.

Add to Antigravity mcp_config.json (Manage MCP Servers > View raw config):

```json
{
  "mcpServers": {
    "github": {
      "serverUrl": "https://api.githubcopilot.com/mcp/"
    }
  }
}
```

- Edit the config file by hand; SOREN does not modify client configuration.

Verify: Call get_me or list a repository read-only.

Rollback: Remove the "github" entry from Antigravity mcp_config.json (Manage MCP Servers > View raw config) and restore your backup

### playwright

Add to Antigravity mcp_config.json (Manage MCP Servers > View raw config):

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": [
        "-y",
        "@playwright/mcp@0.0.83",
        "--isolated"
      ]
    }
  }
}
```

- On Windows, some clients need the command wrapped as cmd /c npx ...; check the client documentation.
- Edit the config file by hand; SOREN does not modify client configuration.

Verify: Navigate to about:blank or a local preview and take an accessibility snapshot.

Rollback: Remove the "playwright" entry from Antigravity mcp_config.json (Manage MCP Servers > View raw config) and restore your backup

### chrome-devtools

Add to Antigravity mcp_config.json (Manage MCP Servers > View raw config):

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@1.11.0",
        "--isolated",
        "--no-usage-statistics",
        "--no-performance-crux"
      ]
    }
  }
}
```

- On Windows, some clients need the command wrapped as cmd /c npx ...; check the client documentation.
- Edit the config file by hand; SOREN does not modify client configuration.

Verify: Open a new page on a local preview and list console messages.

Rollback: Remove the "chrome-devtools" entry from Antigravity mcp_config.json (Manage MCP Servers > View raw config) and restore your backup

### spline

Authentication: OAuth in the client; approve in the browser yourself.

Add to Antigravity mcp_config.json (Manage MCP Servers > View raw config):

```json
{
  "mcpServers": {
    "spline": {
      "serverUrl": "https://mcp.spline.design/mcp"
    }
  }
}
```

- Edit the config file by hand; SOREN does not modify client configuration.

Verify: After OAuth, list Spline files read-only before any edit.

Rollback: Remove the "spline" entry from Antigravity mcp_config.json (Manage MCP Servers > View raw config) and restore your backup

### blender-lab

1. Provision a disposable VM or machine with no personal or production files.
2. Inside the isolated VM: install the add-on from the Blender Lab repository (https://www.blender.org/lab/mcp-server/), then register the blender-mcp stdio entry point in that VM agent client.
3. Start the add-on server inside Blender manually for this session only.
4. Stop the add-on server and discard the VM snapshot afterwards.

Verify: Inside the VM only: request a read-only scene summary.

Rollback: Stop the Blender add-on server; Remove the server entry from the VM agent client; Revert the VM snapshot

### firecrawl

Credential: set `FIRECRAWL_API_KEY` in your shell or secret manager. Never paste it into chat or commit it.

Add to Antigravity mcp_config.json (Manage MCP Servers > View raw config):

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": [
        "-y",
        "firecrawl-mcp@3.33.4"
      ],
      "env": {
        "FIRECRAWL_API_KEY": "<value-from-your-secret-store>"
      }
    }
  }
}
```

- On Windows, some clients need the command wrapped as cmd /c npx ...; check the client documentation.
- Edit the config file by hand; SOREN does not modify client configuration.

Verify: Scrape one public documentation page and confirm Markdown output.

Rollback: Remove the "firecrawl" entry from Antigravity mcp_config.json (Manage MCP Servers > View raw config) and restore your backup

### 21st

Authentication: OAuth in the client; approve in the browser yourself.

Add to Antigravity mcp_config.json (Manage MCP Servers > View raw config):

```json
{
  "mcpServers": {
    "21st": {
      "serverUrl": "https://21st.dev/api/mcp"
    }
  }
}
```

- Edit the config file by hand; SOREN does not modify client configuration.

Verify: Run a component search and confirm metadata results.

Rollback: Remove the "21st" entry from Antigravity mcp_config.json (Manage MCP Servers > View raw config) and restore your backup

### motionsites

Authentication: OAuth in the client; approve in the browser yourself.

Add to Antigravity mcp_config.json (Manage MCP Servers > View raw config):

```json
{
  "mcpServers": {
    "motionsites": {
      "serverUrl": "https://xgdzyqfalbibzelpdpvr.supabase.co/functions/v1/mcp"
    }
  }
}
```

- Edit the config file by hand; SOREN does not modify client configuration.

Verify: Search prompts and confirm results.

Rollback: Remove the "motionsites" entry from Antigravity mcp_config.json (Manage MCP Servers > View raw config) and restore your backup

## opencode

### context7

Credential: set `CONTEXT7_API_KEY` in your shell or secret manager. Never paste it into chat or commit it.

Add to opencode.json (project) or ~/.config/opencode/opencode.json:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "context7": {
      "type": "remote",
      "url": "https://mcp.context7.com/mcp",
      "enabled": true,
      "headers": {
        "Authorization": "Bearer {env:CONTEXT7_API_KEY}"
      }
    }
  }
}
```

- Edit the config file by hand; SOREN does not modify client configuration.

Verify: Call resolve-library-id for "Next.js" and confirm /vercel/next.js is returned.

Rollback: Remove the "context7" entry from opencode.json (project) or ~/.config/opencode/opencode.json and restore your backup

### serena

Add to opencode.json (project) or ~/.config/opencode/opencode.json:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "serena": {
      "type": "local",
      "command": [
        "serena",
        "start-mcp-server",
        "--context",
        "ide",
        "--project-from-cwd"
      ],
      "enabled": true
    }
  }
}
```

- On Windows, some clients need the command wrapped as cmd /c npx ...; check the client documentation.
- Edit the config file by hand; SOREN does not modify client configuration.

Verify: Ask the client to list Serena tools, then run a read-only symbol search.

Rollback: Remove the "serena" entry from opencode.json (project) or ~/.config/opencode/opencode.json and restore your backup

### next-devtools

Add to opencode.json (project) or ~/.config/opencode/opencode.json:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "next-devtools": {
      "type": "local",
      "command": [
        "npx",
        "-y",
        "next-devtools-mcp@0.4.0"
      ],
      "enabled": true
    }
  }
}
```

- On Windows, some clients need the command wrapped as cmd /c npx ...; check the client documentation.
- Edit the config file by hand; SOREN does not modify client configuration.

Verify: With next dev running, request current runtime errors and confirm a structured response.

Rollback: Remove the "next-devtools" entry from opencode.json (project) or ~/.config/opencode/opencode.json and restore your backup

### github

Credential: set `GITHUB_PAT_TOKEN` in your shell or secret manager. Never paste it into chat or commit it.

Authentication: OAuth in the client; approve in the browser yourself.

Add to opencode.json (project) or ~/.config/opencode/opencode.json:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "github": {
      "type": "remote",
      "url": "https://api.githubcopilot.com/mcp/",
      "enabled": true
    }
  }
}
```

- Edit the config file by hand; SOREN does not modify client configuration.

Verify: Call get_me or list a repository read-only.

Rollback: Remove the "github" entry from opencode.json (project) or ~/.config/opencode/opencode.json and restore your backup

### playwright

Add to opencode.json (project) or ~/.config/opencode/opencode.json:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "playwright": {
      "type": "local",
      "command": [
        "npx",
        "-y",
        "@playwright/mcp@0.0.83",
        "--isolated"
      ],
      "enabled": true
    }
  }
}
```

- On Windows, some clients need the command wrapped as cmd /c npx ...; check the client documentation.
- Edit the config file by hand; SOREN does not modify client configuration.

Verify: Navigate to about:blank or a local preview and take an accessibility snapshot.

Rollback: Remove the "playwright" entry from opencode.json (project) or ~/.config/opencode/opencode.json and restore your backup

### chrome-devtools

Add to opencode.json (project) or ~/.config/opencode/opencode.json:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "chrome-devtools": {
      "type": "local",
      "command": [
        "npx",
        "-y",
        "chrome-devtools-mcp@1.11.0",
        "--isolated",
        "--no-usage-statistics",
        "--no-performance-crux"
      ],
      "enabled": true
    }
  }
}
```

- On Windows, some clients need the command wrapped as cmd /c npx ...; check the client documentation.
- Edit the config file by hand; SOREN does not modify client configuration.

Verify: Open a new page on a local preview and list console messages.

Rollback: Remove the "chrome-devtools" entry from opencode.json (project) or ~/.config/opencode/opencode.json and restore your backup

### vercel

Authentication: OAuth in the client; approve in the browser yourself.

Add to opencode.json (project) or ~/.config/opencode/opencode.json:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "vercel": {
      "type": "remote",
      "url": "https://mcp.vercel.com",
      "enabled": true
    }
  }
}
```

- Edit the config file by hand; SOREN does not modify client configuration.

Verify: List projects read-only after OAuth.

Rollback: Remove the "vercel" entry from opencode.json (project) or ~/.config/opencode/opencode.json and restore your backup

### spline

Authentication: OAuth in the client; approve in the browser yourself.

Add to opencode.json (project) or ~/.config/opencode/opencode.json:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "spline": {
      "type": "remote",
      "url": "https://mcp.spline.design/mcp",
      "enabled": true
    }
  }
}
```

- Edit the config file by hand; SOREN does not modify client configuration.

Verify: After OAuth, list Spline files read-only before any edit.

Rollback: Remove the "spline" entry from opencode.json (project) or ~/.config/opencode/opencode.json and restore your backup

### blender-lab

1. Provision a disposable VM or machine with no personal or production files.
2. Inside the isolated VM: install the add-on from the Blender Lab repository (https://www.blender.org/lab/mcp-server/), then register the blender-mcp stdio entry point in that VM agent client.
3. Start the add-on server inside Blender manually for this session only.
4. Stop the add-on server and discard the VM snapshot afterwards.

Verify: Inside the VM only: request a read-only scene summary.

Rollback: Stop the Blender add-on server; Remove the server entry from the VM agent client; Revert the VM snapshot

### firecrawl

Credential: set `FIRECRAWL_API_KEY` in your shell or secret manager. Never paste it into chat or commit it.

Add to opencode.json (project) or ~/.config/opencode/opencode.json:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "firecrawl": {
      "type": "local",
      "command": [
        "npx",
        "-y",
        "firecrawl-mcp@3.33.4"
      ],
      "enabled": true,
      "environment": {
        "FIRECRAWL_API_KEY": "{env:FIRECRAWL_API_KEY}"
      }
    }
  }
}
```

- On Windows, some clients need the command wrapped as cmd /c npx ...; check the client documentation.
- Edit the config file by hand; SOREN does not modify client configuration.

Verify: Scrape one public documentation page and confirm Markdown output.

Rollback: Remove the "firecrawl" entry from opencode.json (project) or ~/.config/opencode/opencode.json and restore your backup

### 21st

Authentication: OAuth in the client; approve in the browser yourself.

Add to opencode.json (project) or ~/.config/opencode/opencode.json:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "21st": {
      "type": "remote",
      "url": "https://21st.dev/api/mcp",
      "enabled": true
    }
  }
}
```

- Edit the config file by hand; SOREN does not modify client configuration.

Verify: Run a component search and confirm metadata results.

Rollback: Remove the "21st" entry from opencode.json (project) or ~/.config/opencode/opencode.json and restore your backup

### motionsites

Authentication: OAuth in the client; approve in the browser yourself.

Add to opencode.json (project) or ~/.config/opencode/opencode.json:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "motionsites": {
      "type": "remote",
      "url": "https://xgdzyqfalbibzelpdpvr.supabase.co/functions/v1/mcp",
      "enabled": true
    }
  }
}
```

- Edit the config file by hand; SOREN does not modify client configuration.

Verify: Search prompts and confirm results.

Rollback: Remove the "motionsites" entry from opencode.json (project) or ~/.config/opencode/opencode.json and restore your backup

## claude

### context7

Credential: set `CONTEXT7_API_KEY` in your shell or secret manager. Never paste it into chat or commit it.

```
claude mcp add --transport http --scope user context7 https://mcp.context7.com/mcp --header "Authorization: Bearer ${CONTEXT7_API_KEY}"
```

Verify: Call resolve-library-id for "Next.js" and confirm /vercel/next.js is returned.

Rollback: claude mcp remove --scope user context7

### serena

```
claude mcp add --scope user serena -- serena start-mcp-server --context claude-code --project-from-cwd
```

- On Windows, some clients need the command wrapped as cmd /c npx ...; check the client documentation.

Verify: Ask the client to list Serena tools, then run a read-only symbol search.

Rollback: claude mcp remove --scope user serena

### next-devtools

```
claude mcp add --scope user next-devtools -- npx -y next-devtools-mcp@0.4.0
```

- On Windows, some clients need the command wrapped as cmd /c npx ...; check the client documentation.

Verify: With next dev running, request current runtime errors and confirm a structured response.

Rollback: claude mcp remove --scope user next-devtools

### github

Credential: set `GITHUB_PAT_TOKEN` in your shell or secret manager. Never paste it into chat or commit it.

Authentication: OAuth in the client; approve in the browser yourself.

```
claude mcp add --transport http --scope user github https://api.githubcopilot.com/mcp/
```

Verify: Call get_me or list a repository read-only.

Rollback: claude mcp remove --scope user github

### playwright

```
claude mcp add --scope user playwright -- npx -y @playwright/mcp@0.0.83 --isolated
```

- On Windows, some clients need the command wrapped as cmd /c npx ...; check the client documentation.

Verify: Navigate to about:blank or a local preview and take an accessibility snapshot.

Rollback: claude mcp remove --scope user playwright

### chrome-devtools

```
claude mcp add --scope user chrome-devtools -- npx -y chrome-devtools-mcp@1.11.0 --isolated --no-usage-statistics --no-performance-crux
```

- On Windows, some clients need the command wrapped as cmd /c npx ...; check the client documentation.

Verify: Open a new page on a local preview and list console messages.

Rollback: claude mcp remove --scope user chrome-devtools

### blender-lab

1. Provision a disposable VM or machine with no personal or production files.
2. Inside the isolated VM: install the add-on from the Blender Lab repository (https://www.blender.org/lab/mcp-server/), then register the blender-mcp stdio entry point in that VM agent client.
3. Start the add-on server inside Blender manually for this session only.
4. Stop the add-on server and discard the VM snapshot afterwards.

Verify: Inside the VM only: request a read-only scene summary.

Rollback: Stop the Blender add-on server; Remove the server entry from the VM agent client; Revert the VM snapshot

### firecrawl

Credential: set `FIRECRAWL_API_KEY` in your shell or secret manager. Never paste it into chat or commit it.

```
claude mcp add --scope user firecrawl -e FIRECRAWL_API_KEY=<value-from-your-secret-store> -- npx -y firecrawl-mcp@3.33.4
```

- On Windows, some clients need the command wrapped as cmd /c npx ...; check the client documentation.

Verify: Scrape one public documentation page and confirm Markdown output.

Rollback: claude mcp remove --scope user firecrawl

### 21st

Authentication: OAuth in the client; approve in the browser yourself.

```
claude mcp add --transport http --scope user 21st https://21st.dev/api/mcp
```

Verify: Run a component search and confirm metadata results.

Rollback: claude mcp remove --scope user 21st

## qwen

### context7

Credential: set `CONTEXT7_API_KEY` in your shell or secret manager. Never paste it into chat or commit it.

```
qwen mcp add --scope user --transport http context7 https://mcp.context7.com/mcp --header "Authorization: Bearer ${CONTEXT7_API_KEY}"
```

Verify: Call resolve-library-id for "Next.js" and confirm /vercel/next.js is returned.

Rollback: qwen mcp remove context7

### serena

```
qwen mcp add --scope user serena -- serena start-mcp-server --context ide --project-from-cwd
```

- On Windows, some clients need the command wrapped as cmd /c npx ...; check the client documentation.

Verify: Ask the client to list Serena tools, then run a read-only symbol search.

Rollback: qwen mcp remove serena

### next-devtools

```
qwen mcp add --scope user next-devtools -- npx -y next-devtools-mcp@0.4.0
```

- On Windows, some clients need the command wrapped as cmd /c npx ...; check the client documentation.

Verify: With next dev running, request current runtime errors and confirm a structured response.

Rollback: qwen mcp remove next-devtools

### github

Credential: set `GITHUB_PAT_TOKEN` in your shell or secret manager. Never paste it into chat or commit it.

Authentication: OAuth in the client; approve in the browser yourself.

```
qwen mcp add --scope user --transport http github https://api.githubcopilot.com/mcp/
```

Verify: Call get_me or list a repository read-only.

Rollback: qwen mcp remove github

### playwright

```
qwen mcp add --scope user playwright -- npx -y @playwright/mcp@0.0.83 --isolated
```

- On Windows, some clients need the command wrapped as cmd /c npx ...; check the client documentation.

Verify: Navigate to about:blank or a local preview and take an accessibility snapshot.

Rollback: qwen mcp remove playwright

### chrome-devtools

```
qwen mcp add --scope user chrome-devtools -- npx -y chrome-devtools-mcp@1.11.0 --isolated --no-usage-statistics --no-performance-crux
```

- On Windows, some clients need the command wrapped as cmd /c npx ...; check the client documentation.

Verify: Open a new page on a local preview and list console messages.

Rollback: qwen mcp remove chrome-devtools

### spline

Authentication: OAuth in the client; approve in the browser yourself.

```
qwen mcp add --scope user --transport http spline https://mcp.spline.design/mcp
```

Verify: After OAuth, list Spline files read-only before any edit.

Rollback: qwen mcp remove spline

### blender-lab

1. Provision a disposable VM or machine with no personal or production files.
2. Inside the isolated VM: install the add-on from the Blender Lab repository (https://www.blender.org/lab/mcp-server/), then register the blender-mcp stdio entry point in that VM agent client.
3. Start the add-on server inside Blender manually for this session only.
4. Stop the add-on server and discard the VM snapshot afterwards.

Verify: Inside the VM only: request a read-only scene summary.

Rollback: Stop the Blender add-on server; Remove the server entry from the VM agent client; Revert the VM snapshot

### firecrawl

Credential: set `FIRECRAWL_API_KEY` in your shell or secret manager. Never paste it into chat or commit it.

```
qwen mcp add --scope user firecrawl -e FIRECRAWL_API_KEY=<value-from-your-secret-store> -- npx -y firecrawl-mcp@3.33.4
```

- On Windows, some clients need the command wrapped as cmd /c npx ...; check the client documentation.

Verify: Scrape one public documentation page and confirm Markdown output.

Rollback: qwen mcp remove firecrawl

### 21st

Authentication: OAuth in the client; approve in the browser yourself.

```
qwen mcp add --scope user --transport http 21st https://21st.dev/api/mcp
```

Verify: Run a component search and confirm metadata results.

Rollback: qwen mcp remove 21st

### motionsites

Authentication: OAuth in the client; approve in the browser yourself.

```
qwen mcp add --scope user --transport http motionsites https://xgdzyqfalbibzelpdpvr.supabase.co/functions/v1/mcp
```

Verify: Search prompts and confirm results.

Rollback: qwen mcp remove motionsites

## glTF Transform

`gltf-transform-cli` is a CLI, not an MCP server. Run it inside the project that owns the assets; it never overwrites the source file.
