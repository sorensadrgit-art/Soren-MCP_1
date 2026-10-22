---
name: webgpu-progressive-rendering
description: Ship WebGPU rendering safely by detecting capability, falling back through WebGL2 to a static poster, handling device and context loss, and keeping React Three Fiber on stable releases.
---
# WebGPU progressive rendering

WebGPU unlocks compute shaders and a modern pipeline, but it is not yet a guaranteed platform feature. This skill treats it as a progressive enhancement: the best renderer the device can actually run, a working WebGL2 path, and a meaningful static fallback, all decided by capability checks rather than user-agent guesses.

## When to use / not to use

Use it when:

- Adding or evaluating `WebGPURenderer`, TSL node materials or compute work in a three.js or R3F project.
- A scene must keep working on browsers or devices without WebGPU, or in insecure (HTTP) contexts.
- You see blank canvases, `requestAdapter()` returning `null`, device-lost errors or WebGL context loss.
- Someone proposes upgrading to an R3F alpha "for WebGPU".

Do not use it when:

- The project only needs `WebGLRenderer` and has no WebGPU requirement; stay on threejs-production or react-three-fiber.
- The work is material look-dev; use shader-material-lab.
- The problem is asset size; use gltf-asset-pipeline.

## Compatible versions

| Package | Version | Status and notes |
| --- | --- | --- |
| three | 0.186.1 | `WebGPURenderer` from `three/webgpu`, automatic WebGL2 backend fallback |
| @types/three | 0.186.0 | Match the three minor version |
| @react-three/fiber | 9.8.2 | Stable; `WebGLRenderer` by default; WebGPU only through an async custom `gl` factory |
| @react-three/fiber | 10.0.0-alpha.6 | Alpha: WebGPU by default, WebGL via `@react-three/fiber/legacy`. Not for production without explicit approval |
| @react-three/drei | 10.7.9 | Built for R3F 9 |
| react | 19.3.1 | R3F 9 pairs with React 19; R3F 8 pairs with React 18 |

Versions verified 2026-10-22 via npm registry. Per MDN (checked October 2026), WebGPU is not Baseline and is available only in secure contexts (HTTPS or localhost).

## Architecture patterns

Capability detection that never throws and distinguishes "no API" from "no adapter":

```ts
export type RenderTier = 'webgpu' | 'webgl2' | 'static';

export async function detectTier(): Promise<RenderTier> {
  if (typeof window !== 'undefined' && window.isSecureContext && 'gpu' in navigator) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) return 'webgpu';
    } catch { /* fall through */ }
  }
  const probe = document.createElement('canvas');
  const gl = probe.getContext('webgl2');
  if (gl) { gl.getExtension('WEBGL_lose_context')?.loseContext(); return 'webgl2'; }
  return 'static';
}
```

`requestAdapter()` resolving to `null` is normal (blocklisted GPU, disabled flag, headless run); treat it as "no WebGPU", not as an error.

Plain three.js with `WebGPURenderer` (initialization is asynchronous):

```ts
import * as THREE from 'three/webgpu';

const renderer = new THREE.WebGPURenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
await renderer.init(); // required before the first render
renderer.setAnimationLoop(() => renderer.render(scene, camera));
```

`WebGPURenderer` picks its WebGL2 backend automatically when WebGPU is unavailable. Pass `forceWebGL: true` in tests to exercise that backend deliberately. Materials must be node materials (or built-ins); GLSL `ShaderMaterial` and `onBeforeCompile` do not carry over.

R3F 9 (stable) with an opt-in WebGPU renderer through an async `gl` factory:

```tsx
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three/webgpu';

export function Scene({ tier }: { tier: 'webgpu' | 'webgl2' }) {
  return (
    <Canvas
      gl={tier === 'webgpu'
        ? async (props) => {
            const r = new THREE.WebGPURenderer(props as ConstructorParameters<typeof THREE.WebGPURenderer>[0]);
            await r.init();
            return r;
          }
        : { antialias: true, powerPreference: 'high-performance' }}
      dpr={[1, 2]}
    >
      {/* scene */}
    </Canvas>
  );
}
```

This combination is not the default R3F path: test it on real hardware, confirm Drei helpers you use work with node materials, and keep the WebGL branch as the default when in doubt.

Progressive shell that always renders something useful:

```tsx
export function Hero() {
  const [tier, setTier] = useState<RenderTier | null>(null);
  useEffect(() => { detectTier().then(setTier); }, []);
  if (tier === null || tier === 'static') return <img src="/hero-poster.avif" alt="Product shown from the front" />;
  return <Scene tier={tier} />;
}
```

Device loss (WebGPU) and context loss (WebGL):

```ts
const device = (renderer.backend as { device?: GPUDevice }).device;
device?.lost.then((info) => {
  if (info.reason !== 'destroyed') scheduleRebuild(); // recreate renderer and resources
});

canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); pauseLoop(); });
canvas.addEventListener('webglcontextrestored', () => { rebuildResources(); resumeLoop(); });
```

Calling `preventDefault()` on `webglcontextlost` is what allows the browser to restore the context. After restoration, GPU resources must be re-uploaded. If a rebuild fails twice, drop to the next tier and show the poster.

## Workflow

1. Inventory: three and R3F versions, renderer construction sites, custom GLSL, Drei helpers, hosting protocol (HTTPS required for WebGPU).
2. Decide whether WebGPU adds measurable value (compute, many instances, node features). If not, stay on WebGL2 and stop.
3. Implement `detectTier()` and a static poster with real alt text before any renderer work.
4. Port custom materials to TSL nodes only where the WebGPU path needs them; keep GLSL variants for a pure `WebGLRenderer` path if it remains the default.
5. Wire `await renderer.init()` (or the async `gl` factory) and guard the first frame behind it.
6. Add device-lost and context-lost handling with a bounded retry, then tier downgrade.
7. Test each tier explicitly: WebGPU on a real GPU, `forceWebGL: true`, WebGL disabled, HTTP origin, and headless Chromium.
8. Record which tier each test environment actually used and attach it to the report.

## Performance requirements

- Tier detection completes before the renderer is created and does not block first contentful paint; the poster is visible immediately.
- `devicePixelRatio` is capped at 2 on every tier; lower tiers may cap at 1.5 when measured frame time requires it.
- Only one live renderer per canvas; tear down the old one completely before a tier switch.
- Frame-time budgets are defined per tier and per hardware class, measured with graphics-performance-qa, never claimed universally.
- No R3F alpha in production builds unless the user explicitly approves it with a rollback plan.

## Accessibility

- The static poster is a first-class experience: descriptive `alt`, the same headline and calls to action, and no dependency on WebGL.
- Under `prefers-reduced-motion`, render a still frame or the poster and stop continuous animation loops.
- All scene interactions have keyboard-reachable DOM controls with visible focus; the canvas itself is not the only control surface.
- Announce tier downgrades only if they change available features, using a polite live region rather than an alert.
- Loading states have a text label, not only a spinner.

## Failure cases & fixes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `navigator.gpu` undefined | Unsupported browser or insecure context | Serve over HTTPS or localhost; fall back to WebGL2 |
| `requestAdapter()` returns `null` | Blocklisted GPU, headless browser, flag off | Treat as no WebGPU; use WebGL2 tier |
| Black canvas on first frame | Rendered before `renderer.init()` resolved | Await init before `setAnimationLoop` |
| Custom shader missing under WebGPU | GLSL or `onBeforeCompile` used | Port to TSL node material |
| R3F crashes with WebGPU renderer | Synchronous `gl` prop or incompatible helper | Use async factory; test helpers; revert to WebGL default |
| Scene freezes after sleep or driver reset | Device or context lost without handler | Handle `device.lost` / `webglcontextlost`, rebuild resources |
| Works locally, blank in production | Production served over HTTP or blocked by policy | Check protocol and permissions policy headers |

## Verification criteria

- [ ] Each tier (webgpu, webgl2, static) was forced and observed rendering, with the tier logged in the report.
- [ ] `renderer.init()` is awaited before the first render on every WebGPU code path.
- [ ] Simulated WebGL context loss (`WEBGL_lose_context`) recovers or downgrades without an uncaught error.
- [ ] The static poster appears with WebGL disabled and has non-empty, descriptive alt text.
- [ ] No console errors on any tier during a 30-second interaction run.
- [ ] Installed `@react-three/fiber` is a stable 9.x release unless alpha use was approved in writing.
- [ ] Headless results are labeled as software rendering where applicable.

## Related skills

threejs-production, react-three-fiber, shader-material-lab, graphics-performance-qa, gltf-asset-pipeline, playwright-browser-qa, accessibility, nextjs-runtime-engineering, motion-systems.

## Official sources

- https://threejs.org/docs/#api/en/renderers/webgpu/WebGPURenderer
- https://threejs.org/manual/#en/webgpurenderer
- https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language
- https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API
- https://developer.mozilla.org/en-US/docs/Web/API/GPU/requestAdapter
- https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/lost
- https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event
- https://r3f.docs.pmnd.rs/api/canvas
- https://www.w3.org/TR/webgpu/
