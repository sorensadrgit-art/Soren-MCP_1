---
name: graphics-performance-qa
description: Profile and verify 3D web scenes by measuring draw calls, triangles, GPU memory, leaks, frame time and page vitals in real Chromium, labeling software versus GPU rendering and reporting only actual measurements.
---
# Graphics performance QA

This skill produces evidence, not impressions. It defines what to measure in a three.js or R3F scene, how to collect the numbers with renderer statistics, Chrome DevTools traces and Playwright, how to find leaks, and how to report results honestly by hardware tier.

## When to use / not to use

Use it when:

- A scene stutters, heats the device, drains battery or slows page load.
- You must prove a 3D feature meets a budget before release, or compare before/after an optimization.
- Navigating between pages that mount and unmount canvases seems to grow memory.
- Someone states an FPS number and you need to confirm how and where it was measured.

Do not use it when:

- The fix is clearly in the asset (compression, LOD); run gltf-asset-pipeline, then return here to measure.
- The problem is visual correctness of materials; use shader-material-lab.
- The page has no 3D content; use playwright-browser-qa or general web performance work.

## Compatible versions

| Tool | Version | Use |
| --- | --- | --- |
| three | 0.186.1 | `renderer.info` statistics |
| @react-three/fiber | 9.8.2 | `frameloop`, `invalidate`, `useThree` (pairs with React 19) |
| @react-three/drei | 10.7.9 | `PerformanceMonitor`, `AdaptiveDpr`, `Instances` |
| chrome-devtools-mcp | 1.11.0 | Performance traces, insights, console, network |
| @playwright/mcp | 0.0.83 | Scripted real-Chromium sessions |
| react | 19.3.1 | |

Versions verified 2026-10-22 via npm registry.

## Architecture patterns

Expose renderer statistics in development builds only:

```tsx
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';

export function ExposeStats() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    (window as unknown as { __r3fInfo?: () => unknown }).__r3fInfo = () => ({
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      programs: gl.info.programs?.length ?? 0,
    });
  }, [gl]);
  return null;
}
```

`render.calls` and `render.triangles` reset every frame by default (`info.autoReset`), so sample after a rendered frame.

Static or mostly static scenes should not render continuously:

```tsx
<Canvas frameloop="demand" dpr={[1, 2]}>
  <Scene />
</Canvas>
// after an imperative change outside React state:
const invalidate = useThree((s) => s.invalidate);
invalidate();
```

Adaptive quality with Drei:

```tsx
import { PerformanceMonitor } from '@react-three/drei';

const [dpr, setDpr] = useState(1.5);
<Canvas dpr={dpr}>
  <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(Math.min(window.devicePixelRatio, 2))} />
</Canvas>
```

Reduce draw calls with instancing when many meshes share geometry and material:

```tsx
import { Instances, Instance } from '@react-three/drei';

<Instances limit={500}>
  <boxGeometry />
  <meshStandardMaterial />
  {items.map((p, i) => <Instance key={i} position={p} />)}
</Instances>
```

Disposal for resources created outside JSX:

```ts
useEffect(() => {
  const rt = new THREE.WebGLRenderTarget(512, 512);
  const tex = new THREE.TextureLoader().load('/t.webp');
  return () => { rt.dispose(); tex.dispose(); };
}, []);
```

Leak test with Playwright (mount/unmount cycles):

```ts
import { test, expect } from '@playwright/test';

test('scene does not leak GPU resources', async ({ page }) => {
  await page.goto('/viewer');
  const read = () => page.evaluate(() => (window as any).__r3fInfo());
  const baseline = await read();
  for (let i = 0; i < 10; i++) {
    await page.getByRole('button', { name: 'Hide model' }).click();
    await page.getByRole('button', { name: 'Show model' }).click();
  }
  const after = await read();
  expect(after.geometries).toBeLessThanOrEqual(baseline.geometries);
  expect(after.textures).toBeLessThanOrEqual(baseline.textures);
});
```

JS heap and renderer type through CDP:

```ts
const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
const { metrics } = await cdp.send('Performance.getMetrics');
const heap = metrics.find((m) => m.name === 'JSHeapUsedSize')?.value;

const gpu = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
});
// "SwiftShader" in the string means software rendering
```

## Workflow

1. Define hardware tiers for the project (for example: desktop discrete GPU, laptop integrated GPU, mid-range phone) and the budget for each.
2. Record environment: browser version, OS, GPU string, headless or headed, viewport, DPR.
3. Capture a baseline: `renderer.info` values, JS heap, page load trace, and frame timing during a scripted interaction.
4. Record a Chrome DevTools performance trace (chrome-devtools-mcp `performance_start_trace` / `performance_stop_trace`) covering load and interaction; review long tasks, LCP and main-thread scripting.
5. Run the mount/unmount leak test and a 60-second idle run to check for growth.
6. Apply one optimization at a time: instancing or merging, `frameloop="demand"`, DPR capping, texture or LOD reductions, disposal fixes.
7. Re-measure under identical conditions and keep both result sets.
8. Report numbers with their environment labels; mark anything not measured as unverified.

## Performance requirements

- Draw calls: R3F guidance treats each mesh as a draw call and recommends no more than 1000, optimally a few hundred or less. Record `render.calls` per view.
- DPR capped at 2 on all tiers.
- Static scenes use `frameloop="demand"`; idle CPU usage should drop to near zero after interaction stops (measure it).
- `memory.geometries` and `memory.textures` return to baseline after mount/unmount cycles.
- `renderer.info.programs` count is stable after warmup.
- Long tasks over 50 ms during interaction are listed and explained; LCP is measured on the page that hosts the canvas.
- Frame-time targets are written per hardware tier and verified on that tier. No universal FPS claim.

## Accessibility

- Performance fallbacks must preserve content: the low tier or static poster still conveys the same information and actions.
- `prefers-reduced-motion` reduces or stops continuous rendering, which also saves power; verify it with a trace showing fewer frames.
- Adaptive quality changes must not move focusable controls or shift layout.
- Test that keyboard controls stay responsive while the scene loads (no main-thread lockups over 200 ms during input).
- Report any accessibility regression found during profiling alongside performance results.

## Failure cases & fixes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Thousands of draw calls | Many separate meshes | Instance, merge static geometry, share materials |
| GPU memory grows on navigation | Missing disposal or disposed shared cache misuse | Dispose created resources; `dispose={null}` on cached GLTF |
| Constant CPU while idle | Continuous frameloop | `frameloop="demand"` and `invalidate()` |
| Low FPS only in CI | Headless SwiftShader software rendering | Label as software; measure GPU on headed real hardware |
| Stutter on first interaction | Shader compile or texture upload on demand | `compileAsync`, preload textures during loading |
| Frame drops on high-DPR phones | Full device pixel ratio | Cap DPR, use `PerformanceMonitor` |
| React re-renders every frame | State set inside `useFrame` | Mutate refs; keep React state for discrete changes |

## Verification criteria

- [ ] Environment recorded: browser, OS, GPU renderer string, headless or headed, DPR, viewport.
- [ ] Every FPS or frame-time figure is labeled software (SwiftShader) or GPU.
- [ ] `render.calls`, `render.triangles`, `memory.geometries`, `memory.textures` and program count recorded before and after changes.
- [ ] 10 mount/unmount cycles leave geometries and textures at or below baseline.
- [ ] Performance trace attached for load and interaction, with long tasks and LCP noted.
- [ ] JS heap measured via `Performance.getMetrics` at start and end of a run.
- [ ] Budgets stated per tier and each marked pass, fail or unverified.
- [ ] No numbers in the report that were not measured.

## Related skills

react-three-fiber, threejs-production, gltf-asset-pipeline, shader-material-lab, webgpu-progressive-rendering, blender-to-r3f, playwright-browser-qa, accessibility, nextjs-runtime-engineering, gsap-motion, motion-systems.

## Official sources

- https://threejs.org/docs/#api/en/renderers/WebGLRenderer.info
- https://threejs.org/manual/#en/how-to-dispose-of-objects
- https://r3f.docs.pmnd.rs/advanced/scaling-performance
- https://r3f.docs.pmnd.rs/advanced/pitfalls
- https://drei.docs.pmnd.rs/performances/performance-monitor
- https://github.com/ChromeDevTools/chrome-devtools-mcp
- https://chromedevtools.github.io/devtools-protocol/tot/Performance/
- https://playwright.dev/docs/intro
- https://github.com/microsoft/playwright-mcp
- https://web.dev/articles/lcp
- https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongTaskTiming
