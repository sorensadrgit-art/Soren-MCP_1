---
name: react-three-fiber
description: Engineer interactive declarative 3D interfaces with React Three Fiber and Drei while preserving React compatibility, accessibility and rendering performance.
---
# React Three Fiber production workflow

Official renderer: https://r3f.docs.pmnd.rs/getting-started/introduction. Official package: @react-three/fiber. Match major versions to React: R3F 8 with React 18, and R3F 9 with React 19 unless the project's resolved versions require a reviewed alternative.

## Workflow

1. Inspect existing package versions, canvas composition, hosting capabilities, asset format and UX goals; review an appropriate scene reference.
2. Design scene ownership, Canvas lifecycle, camera framing, lighting, material budget, loaders and reusable components. Use @react-three/drei only when compatible with installed R3F/React versions.
3. Use idiomatic React-driven components, refs and useFrame carefully. Avoid expensive React state updates every animation frame; update imperative objects only where needed.
4. Establish interaction hit targets, focus and keyboard equivalents, a 2D fallback for unsupported WebGL, graceful loading and prefers-reduced-motion behavior.
5. Test in real Chromium/WebGL, on narrow/mobile viewports and with fallback conditions; profile render cost, asset load time and disposal of geometries, textures, render targets and observers.

## Quality gates

Review dependencies and licenses before installation. Do not claim a static screenshot proves a functioning 3D scene or a Blender/GLB asset is runtime-ready. Production publish, paid asset use and private account access remain approval-controlled by the executing agent.

## Compatible versions

Verified 2026-10-22 via npm registry/official docs.

| Package | Version | Notes |
| --- | --- | --- |
| `@react-three/fiber` | 9.8.2 | Pairs with React 19 |
| `react`, `react-dom` | 19.3.x | R3F 8 pairs with React 18 |
| `three` | 0.186.x | Match `@types/three` to the same minor |
| `@react-three/drei` | 10.7.9 | Drei 10 targets R3F 9 |
| `@react-three/fiber` v10 | 10.0.0-alpha.6 | Alpha, WebGPU by default; do not adopt silently |

Only move to v10 alpha with explicit user agreement and a dedicated branch; it changes renderer defaults (see `webgpu-progressive-rendering`).

## Advanced architecture

Separate scene rendering from application state. React components describe the scene; an external store holds app state; per-frame values live in refs.

```tsx
// store.ts — zustand-style external store, read outside React render when needed
import { create } from "zustand";
type SceneState = { selected: string | null; select: (id: string | null) => void };
export const useScene = create<SceneState>((set) => ({
  selected: null,
  select: (id) => set({ selected: id }),
}));
```

Canvas in a client component; in Next.js load it with `dynamic(..., { ssr: false })` from a client wrapper (see `nextjs-runtime-engineering`).

```tsx
"use client";
import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { useProgress, Html } from "@react-three/drei";

function Loader() {
  const { progress } = useProgress();
  return <Html center><p role="status">Loading {Math.round(progress)}%</p></Html>;
}

export default function Stage() {
  return (
    <Canvas frameloop="demand" dpr={[1, 2]} camera={{ position: [0, 1, 4], fov: 45 }}>
      <Suspense fallback={<Loader />}>
        <Model />
      </Suspense>
    </Canvas>
  );
}
```

Cached GLTF and preloading. `useGLTF` caches by URL; mark cloned or shared scene graphs with `dispose={null}` so unmounting one consumer does not dispose shared resources.

```tsx
import { useGLTF } from "@react-three/drei";
function Model() {
  const { scene } = useGLTF("/models/product.glb");
  return <primitive object={scene} dispose={null} />;
}
useGLTF.preload("/models/product.glb");
```

Frame updates without React state. Use `delta` for frame-rate independence, mutate refs, and never call `setState` every frame.

```tsx
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Mesh } from "three";

function Spinner() {
  const ref = useRef<Mesh>(null);
  useFrame((_, delta) => { if (ref.current) ref.current.rotation.y += delta * 0.5; });
  return <mesh ref={ref}><boxGeometry /><meshStandardMaterial /></mesh>;
}
```

With `frameloop="demand"`, call `invalidate()` after any external change (store update, GSAP tween, control input) so a frame renders.

Events and raycasting. Pointer events on meshes use raycasting; set `raycast` to a cheaper function or disable events on decorative meshes, and stop propagation where overlapping objects should not both react. Ensure the canvas container has `touch-action` and `pointer-events` set deliberately so page scroll still works on mobile.

Instancing. Repeated geometry with the same material belongs in `<instancedMesh>` or Drei `<Instances>`, updating matrices in refs.

## Performance requirements

- Each mesh is generally one draw call. Per the R3F docs, treat about 1000 draw calls as an absolute maximum and aim for a few hundred or fewer.
- Use adaptive DPR (`dpr={[1, 2]}`) and Drei `PerformanceMonitor` to lower DPR or effects when frame rate drops.
- Prefer `frameloop="demand"` for mostly static scenes.
- Compress assets (Draco or Meshopt geometry, KTX2 textures) through `gltf-asset-pipeline`.
- Dispose of geometries, materials, textures and render targets you create imperatively.
- Check `renderer.info` (draw calls, triangles, textures) during profiling; see `graphics-performance-qa`.

## Accessibility

- Put real controls in the DOM (overlay buttons, sliders) rather than relying only on clickable meshes.
- Provide keyboard equivalents for every pointer interaction, with visible focus.
- Announce selection and loading changes through an `aria-live="polite"` region.
- Honor `prefers-reduced-motion: reduce`: stop autorotation and camera moves, keep a static framing.
- Provide a WebGL fallback (poster image plus text) when context creation fails or is lost.

## Failure cases & fixes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Peer dependency errors on install | R3F major does not match React major | R3F 9 with React 19, R3F 8 with React 18 |
| `window is not defined` in Next.js | Canvas rendered on server | Client component plus `dynamic(..., { ssr: false })` |
| Scene does not update after state change | `frameloop="demand"` without `invalidate()` | Call `invalidate()` after external changes |
| React re-renders every frame | `setState` inside `useFrame` | Mutate refs; store only discrete state |
| Model disappears after remounting elsewhere | Shared cached GLTF disposed | `dispose={null}` on primitives using cached scenes |
| Low FPS with many objects | Too many draw calls | Instancing, merging, fewer materials |
| Page cannot scroll on touch devices | Canvas captures touch | Adjust `touch-action` and event handling |
| Blank canvas after tab switch | WebGL context lost | Handle context loss and show fallback |

## Verification criteria

- [ ] Resolved R3F, React, three and drei versions match the compatibility table or a reviewed alternative.
- [ ] Draw calls measured via `renderer.info` and below a few hundred for typical views.
- [ ] No React render triggered per frame (React DevTools profiler or render counter).
- [ ] Reduced-motion emulation stops autoplay motion.
- [ ] Every interactive object has a keyboard-operable DOM equivalent.
- [ ] WebGL-disabled run shows the fallback with no uncaught errors.
- [ ] Unmount and remount leave no growing geometry or texture counts.
- [ ] Tested at 1440, 768 and 390 px widths.

## Related skills

- `threejs-production`, `gltf-asset-pipeline`, `blender-to-r3f`, `shader-material-lab`, `webgpu-progressive-rendering`.
- `gsap-motion` and `motion-systems` for choreography.
- `graphics-performance-qa`, `playwright-browser-qa`, `accessibility` for verification.
- `nextjs-runtime-engineering` for Next.js integration; `spline-to-web` for Spline scenes.

## Official sources

- https://r3f.docs.pmnd.rs/getting-started/introduction
- https://r3f.docs.pmnd.rs/advanced/scaling-performance
- https://r3f.docs.pmnd.rs/advanced/pitfalls
- https://drei.docs.pmnd.rs
- https://threejs.org/docs/
- https://www.npmjs.com/package/@react-three/fiber
