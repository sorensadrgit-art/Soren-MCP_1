---
name: spline-to-web
description: Design, edit and embed Spline 3D scenes in web applications with the Spline MCP server, lazy-loaded runtime embedding, accessible fallbacks and a clear decision path for exporting to GLB and React Three Fiber.
---
# Spline to web

Spline is suited to designer-driven interactive 3D: quick scene composition, states and events, and Hana UI work. This skill covers how an agent edits Spline scenes through MCP, how to embed exported scenes in a site without hurting load performance or accessibility, and when to leave Spline's runtime for a GLB plus React Three Fiber pipeline.

## When to use

- The user has or wants a Spline scene and needs it embedded in a React, Next.js or plain HTML site.
- An agent should create or modify a Spline 3D or Hana file through the Spline MCP server.
- Wiring site UI to Spline objects and events (hover, click, state changes).

## When not to use

- Photoreal assets, baked lighting, precise topology or heavy retopology: use Blender and `blender-to-r3f`.
- Scenes that need custom shaders, postprocessing pipelines or fine render-loop control: export GLB and use `react-three-fiber` with `gltf-asset-pipeline`.
- Simple 2D motion: use `gsap-motion` or `motion-systems`.

## Spline or Blender

| Need | Choose |
| --- | --- |
| Fast designer iteration, interactive states, Hana UI | Spline |
| Photoreal materials, baking, accurate topology, rigging | Blender |
| Code-owned scene with custom shaders and instancing | GLB export to R3F |
| Designer-owned scene embedded as-is | Spline runtime |

## Compatible versions

Verified 2026-10-22 via npm registry/official docs.

| Package / service | Version or endpoint | Notes |
| --- | --- | --- |
| `@splinetool/react-spline` | 4.1.0 | React wrapper component |
| `@splinetool/runtime` | 2.0.105 | Required peer runtime |
| Spline hosted MCP | `https://mcp.spline.design/mcp` | OAuth with a Spline account; edits run in a per-conversation cloud editor; Spline 3D or Hana files |
| Spline desktop MCP | Built into the desktop app | Agent edits files open locally in the app |

Review Spline's terms for exported scenes and runtime usage before shipping, and confirm the account plan, since MCP usage may consume quota or credits.

## MCP connection

Hosted server, added once per client:

```bash
codex mcp add spline --url https://mcp.spline.design/mcp
claude mcp add --transport http --scope user spline https://mcp.spline.design/mcp
```

Sign in through the OAuth prompt. A configured entry is not the same as a working connection: confirm with a harmless read-only call (for example listing files) before planning edits. Use the desktop server when the user wants edits to local files they already have open.

## Architecture patterns

Lazy-loaded embed with a reserved box and poster fallback:

```tsx
"use client";
import { lazy, Suspense, useRef, useState } from "react";
import type { Application } from "@splinetool/runtime";

const Spline = lazy(() => import("@splinetool/react-spline"));

export function HeroScene({ scene }: { scene: string }) {
  const app = useRef<Application | null>(null);
  const [ready, setReady] = useState(false);

  return (
    <div className="hero-scene" style={{ aspectRatio: "16 / 9", position: "relative" }}>
      {!ready && <img src="/hero-poster.webp" alt="Preview of the 3D product scene" className="poster" />}
      <Suspense fallback={null}>
        <Spline
          scene={scene}
          onLoad={(a) => { app.current = a; setReady(true); }}
        />
      </Suspense>
    </div>
  );
}
```

Driving scene objects from DOM controls with the events API:

```ts
function highlight(app: Application, name: string) {
  const obj = app.findObjectByName(name);
  if (!obj) return;
  app.emitEvent("mouseHover", obj.name);
}
```

In Next.js, keep the embed in a client component and load it through `dynamic(..., { ssr: false })` from that client component (see `nextjs-runtime-engineering`). Use the hosted `https://prod.spline.design/<id>/scene.splinecode` URL or a self-hosted `.splinecode` file.

## Workflow

1. Confirm the goal, target framework, the scene file location and who owns the design.
2. Check the Spline plan and quota before MCP edits; confirm the connection with a read-only call.
3. Make scene edits through MCP in small steps, naming objects meaningfully so code can find them.
4. Decide runtime: Spline embed, or GLB export to R3F with `gltf-asset-pipeline` if the earlier criteria apply.
5. Implement the embed with lazy loading, reserved layout box, poster image and error fallback.
6. Wire DOM controls to scene events, with keyboard-operable buttons for every meaningful interaction.
7. Apply reduced-motion behavior: show the poster or a static state instead of autoplaying animation.
8. Measure on desktop and mobile; run `graphics-performance-qa` and `playwright-browser-qa`.

## Performance requirements

- The Spline runtime and scene must not block first paint; load after the hero text renders or on visibility.
- Reserve dimensions with `aspect-ratio` or explicit sizes so loading causes no layout shift.
- Keep scene file size and polygon counts modest for mobile; test on a mid-range phone or throttled emulation.
- Pause or unmount scenes that are off screen, and avoid multiple concurrent Spline canvases on one page.
- If the scene cannot meet mobile budgets, serve the poster on small screens.

## Accessibility

- Every interactive object needs an equivalent DOM control (button or link) with an accessible name.
- Give the canvas region a text description and keep essential content in HTML, not only in 3D.
- Honor `prefers-reduced-motion: reduce` by disabling autoplay animation and camera moves.
- Announce load failures in readable text and keep the poster visible.
- Do not trap scroll or focus inside the canvas.

## Security & permission boundaries

- OAuth tokens stay inside the MCP client; never paste them into code or logs.
- MCP edits may spend account credits: get user consent before large generation or editing runs.
- Do not publish scenes, change sharing settings or make files public without explicit approval.
- Treat third-party assets inside scenes as license-sensitive; preserve credits.

## Failure cases & fixes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Blank box, no error | Wrong or private scene URL | Re-export, confirm public URL or self-host the `.splinecode` file |
| `window is not defined` in Next.js | Rendered on the server | Client component plus `dynamic(..., { ssr: false })` |
| Layout jumps on load | No reserved dimensions | Set `aspect-ratio` or fixed height on the wrapper |
| `findObjectByName` returns undefined | Object renamed or nested differently | Name objects explicitly in Spline; check after each MCP edit |
| Low frame rate on phones | Scene too heavy | Simplify scene, lower quality settings, or poster on mobile |
| MCP calls rejected | Not signed in, quota exhausted or plan limit | Re-authenticate, check plan, report the gap to the user |
| Custom shader or instancing needed | Outside Spline runtime scope | Export GLB and move to R3F |

## Verification criteria

- [ ] MCP connection confirmed by a successful read-only call in the same client before edits.
- [ ] Cumulative layout shift from the embed is 0 in a Lighthouse or Playwright measurement.
- [ ] Hero text and primary actions render before the Spline runtime loads.
- [ ] Every scene interaction has a keyboard-operable DOM equivalent.
- [ ] Reduced-motion emulation shows a static state with no autoplay.
- [ ] Load failure shows the poster and readable message, with no uncaught console errors.
- [ ] Tested at 1440, 768 and 390 px widths.
- [ ] Spline export terms and account plan reviewed and noted.

## Related skills

- `react-three-fiber`, `threejs-production`, `gltf-asset-pipeline` for the GLB route.
- `blender-to-r3f` for Blender-authored assets.
- `graphics-performance-qa` and `playwright-browser-qa` for measurement.
- `accessibility` for audits.
- `nextjs-runtime-engineering` for Next.js integration.
- `gsap-motion` and `motion-systems` for surrounding page motion.
- `mcp-integration` for client configuration.

## Official sources

- https://docs.spline.design/generate/spline-mcp-server
- https://docs.spline.design
- https://www.npmjs.com/package/@splinetool/react-spline
- https://www.npmjs.com/package/@splinetool/runtime
- https://github.com/splinetool/react-spline
