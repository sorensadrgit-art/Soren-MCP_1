---
name: threejs-production
description: Design and test optimized Three.js scenes, shaders, lighting, cameras, asset pipelines, WebGL/WebGPU fallbacks and interactive rendering.
---
# Three.js 3D engineering

Official documentation: https://threejs.org/docs/ and https://threejs.org/manual/. Use Three.js itself as the core runtime; add React Three Fiber only for a React-rendered architecture.

## Workflow

1. Inspect existing version, renderer, scene graph, animation loop and measured device limits. Start from a grounded shot/interaction brief and actual assets.
2. Define coordinate spaces, camera path, materials, lighting, shadows, postprocessing and animation ownership. Avoid unrelated visual library dependencies.
3. Optimize texture sizes, GLB compression/validation, draw calls, instancing, culling and render resolution. Profile rather than trusting estimated FPS.
4. Coordinate animation with a single authoritative frame/timing system. Integrate GSAP or scroll timelines with consistent cleanup, and avoid unbounded render loops.
5. Validate scene behavior, hit targets, accessibility alternatives, reduced motion, resource disposal, page navigation and WebGL fallback on real browsers.

## Operational boundary

External reference 3D assets and code require provenance/license review. Do not execute unreviewed shaders, scripts or arbitrary downloaded generators based solely on a prompt. Ask approval before publishing, deleting project assets or changing hosting settings.

## Version matrix

| Package | Version | Notes |
| --- | --- | --- |
| three | 0.186.x (0.186.1 current as of 2026-10-22) | Pin the exact minor; three does not follow semver and minors can rename APIs |
| @types/three | 0.186.0 | Keep the minor aligned with three |
| @react-three/fiber | 9.8.2 | Only when React renders the scene; pairs with React 19 (R3F 8 pairs with React 18) |
| @react-three/fiber | 10.0.0-alpha.6 | Alpha; never adopt silently in production |
| @react-three/drei | 10.7.9 | Helpers for R3F 9 |
| gsap | 3.15.0 | Timelines and ScrollTrigger when choreography is needed |

Versions verified 2026-10-22 via npm registry. Always read the project's lockfile first; it wins over this table.

## Renderer setup

```ts
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,                  // disable when postprocessing provides its own AA
  powerPreference: 'high-performance',
  alpha: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
```

- Resize from a `ResizeObserver` on the canvas container, update `camera.aspect` and call `camera.updateProjectionMatrix()`.
- Use `renderer.setAnimationLoop` so the loop can be stopped with `setAnimationLoop(null)`.
- Pause rendering when the canvas is off screen (IntersectionObserver) or the tab is hidden.
- For WebGPU, follow webgpu-progressive-rendering; `WebGPURenderer` comes from `three/webgpu` and needs `await renderer.init()`.

## PBR lighting and look-dev recipe

1. Start with an environment map: `PMREMGenerator.fromScene(new RoomEnvironment(), 0.04)` or a licensed 1k/2k HDRI. Assign it to `scene.environment`.
2. Add one directional key light that casts shadows; fit its shadow camera tightly around the subject.
3. Add at most one soft fill (hemisphere or low-intensity directional). Avoid stacking many point lights; each one adds shader cost.
4. Use `MeshStandardMaterial` by default; switch to `MeshPhysicalMaterial` only for clearcoat, transmission, sheen, iridescence or anisotropy that is actually visible.
5. Tune exposure and tone mapping (ACES, AgX or Neutral) last, comparing against a fixed reference screenshot.
6. Tune `shadow.normalBias` before `shadow.bias` to remove acne without detached shadows.

Detailed shader and material work belongs in shader-material-lab.

## Color management

- `renderer.outputColorSpace = THREE.SRGBColorSpace` (the default in current releases; set it explicitly for clarity).
- Base color, emissive and other visible color textures: `texture.colorSpace = THREE.SRGBColorSpace`.
- Normal, roughness, metalness, AO and packed ORM textures: `THREE.NoColorSpace` (linear data).
- `GLTFLoader` assigns color spaces for glTF textures; set them yourself only for textures you load manually.
- Colors typed in code (`new THREE.Color(0xff8800)`) are treated as sRGB and converted to the linear working space.

## Resource disposal checklist

- [ ] `geometry.dispose()` for every geometry you created.
- [ ] `material.dispose()` for every material, plus each texture it owns (`map`, `normalMap`, `roughnessMap`, and so on).
- [ ] `texture.dispose()` for loaded textures, including environment textures from PMREM.
- [ ] `renderTarget.dispose()` for render targets and postprocessing composers.
- [ ] `pmremGenerator.dispose()` once environment maps are generated.
- [ ] Controls (`OrbitControls.dispose()`), observers, event listeners and GSAP contexts (`ctx.revert()`) removed.
- [ ] `renderer.setAnimationLoop(null)` and `renderer.dispose()` when the canvas is torn down.
- [ ] Shared cached assets (for example GLTF loaded through a cache) are disposed only when no consumer remains.
- [ ] Verified with `renderer.info.memory` returning to baseline after mount/unmount cycles (graphics-performance-qa).

## Loading and fallback

- Show a static poster image with descriptive alt text immediately; replace it with the canvas only after the first frame renders.
- Use `LoadingManager` (or Drei `useProgress` in R3F) for a labeled progress indicator and an error state with retry.
- Detect WebGL2 support before creating the renderer; if creation throws or the context is null, keep the poster.
- Listen for `webglcontextlost` (call `preventDefault()`) and `webglcontextrestored` to rebuild resources.
- Warm up shaders with `renderer.compileAsync(scene, camera)` during loading to avoid a first-interaction hitch.
- Under `prefers-reduced-motion`, render a still frame instead of a continuous loop and skip camera fly-throughs.
- Optimize and validate GLB files through gltf-asset-pipeline before loading them.

## Verification criteria

- [ ] three and @types/three minor versions match, and the installed versions are recorded.
- [ ] Pixel ratio capped at 2; resize keeps the image sharp and undistorted at 1440, 768 and 390 px widths.
- [ ] No console errors or shader warnings in desktop and mobile emulation runs.
- [ ] Color textures sRGB, data textures linear, single place sets output color space and tone mapping.
- [ ] Draw calls, triangles, geometries, textures and program count recorded from `renderer.info`.
- [ ] Mount/unmount or route-change cycles leave GPU memory counts at baseline.
- [ ] Poster fallback appears with WebGL disabled; context-loss simulation recovers or falls back.
- [ ] Reduced-motion mode stops continuous animation; all interactions have keyboard equivalents with visible focus.
- [ ] Asset licenses and provenance recorded.

## Related skills

react-three-fiber, shader-material-lab, webgpu-progressive-rendering, gltf-asset-pipeline, blender-to-r3f, graphics-performance-qa, gsap-motion, motion-systems, playwright-browser-qa, accessibility, nextjs-runtime-engineering, spline-to-web.

## Official sources

- https://threejs.org/docs/
- https://threejs.org/manual/
- https://threejs.org/manual/#en/color-management
- https://threejs.org/manual/#en/how-to-dispose-of-objects
- https://threejs.org/docs/#api/en/renderers/WebGLRenderer
- https://www.npmjs.com/package/three
