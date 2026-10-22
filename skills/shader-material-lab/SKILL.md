---
name: shader-material-lab
description: Author, debug and verify WebGL/GLSL and TSL shaders plus physically based Three.js materials, image-based lighting, color management, tone mapping and shadows for photoreal yet portable rendering.
---
# Shader and material lab

Use this skill to build or repair the look of a Three.js scene at the material and shader level: custom GLSL, patched built-in materials, node materials for the WebGPU path, physically based surfaces, environment lighting, color pipelines, tone mapping and shadows. The aim is a believable image that compiles on every target device and stays inside a measured frame budget.

## When to use / not to use

Use it when:

- A surface needs a custom shader (`ShaderMaterial`, `RawShaderMaterial`) or a small patch of a built-in material via `onBeforeCompile`.
- A scene looks flat, washed out, too dark or oversaturated and the cause is likely lighting, color space or tone mapping.
- You need advanced `MeshPhysicalMaterial` features: clearcoat, transmission, sheen, iridescence or anisotropy.
- Shaders fail to compile on mobile, show precision artifacts, or cause a visible hitch on first appearance.
- A material must work with both `WebGLRenderer` and `WebGPURenderer` (TSL / NodeMaterial).

Do not use it when:

- The issue is asset weight, compression or triangle count; use gltf-asset-pipeline.
- The question is renderer tiering or WebGPU availability; use webgpu-progressive-rendering.
- You only need to measure frame time or memory; use graphics-performance-qa.
- The scene is a React tree problem (state, Suspense, Canvas lifecycle); use react-three-fiber first.

## Compatible versions

| Package | Version | Notes |
| --- | --- | --- |
| three | 0.186.1 | GLSL path via `WebGLRenderer`; TSL/NodeMaterial via `three/webgpu` and `three/tsl` |
| @types/three | 0.186.0 | Match the three minor version |
| @react-three/fiber | 9.8.2 | Pairs with React 19; 10.0.0-alpha.6 is alpha only |
| @react-three/drei | 10.7.9 | `Environment`, `shaderMaterial`, `useTexture` helpers |
| react | 19.3.1 | Required by R3F 9 |

Versions verified 2026-10-22 via npm registry. Re-check `package.json` and the lockfile in the target project before relying on any API; minor three releases can rename shader chunks.

## Architecture patterns

Renderer color pipeline, set once and owned by one module:

```ts
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; // or AgXToneMapping / NeutralToneMapping
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // VSMShadowMap for softer, costlier results
```

Texture color spaces: only textures that hold visible color are sRGB. Everything that stores data stays linear.

```ts
const loader = new THREE.TextureLoader();
const albedo = loader.load('/tex/albedo.webp');
albedo.colorSpace = THREE.SRGBColorSpace;           // baseColor, emissive, sheenColor
const normal = loader.load('/tex/normal.webp');
normal.colorSpace = THREE.NoColorSpace;             // normal, roughness, metalness, AO, ORM
```

Image-based lighting without shipping a large HDRI:

```ts
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const pmrem = new THREE.PMREMGenerator(renderer);
const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
scene.environment = envRT.texture;
pmrem.dispose(); // keep envRT until the scene unmounts, then envRT.dispose()
```

If a real HDRI is used, record its source and license next to the file and prefer a 1k or 2k version for the web.

Patching a built-in material keeps lighting, shadows and fog intact:

```ts
const mat = new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.4 });
mat.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = { value: 0 };
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nuniform float uTime;')
    .replace('#include <begin_vertex>',
      '#include <begin_vertex>\ntransformed.y += sin(position.x * 4.0 + uTime) * 0.05;');
  mat.userData.shader = shader;
};
mat.customProgramCacheKey = () => 'wave-v1';
```

Physical material features, enabled only where they are visible:

```ts
const lacquer = new THREE.MeshPhysicalMaterial({
  color: 0x1b2a3a, metalness: 0, roughness: 0.35,
  clearcoat: 1, clearcoatRoughness: 0.05,
  sheen: 0, iridescence: 0, anisotropy: 0,
});
const glass = new THREE.MeshPhysicalMaterial({
  transmission: 1, thickness: 0.4, ior: 1.5, roughness: 0.05,
});
```

Each non-zero feature adds shader work; transmission also adds an extra render pass. Keep it off on low tiers.

TSL node material for the WebGPU path (also runs on the WebGL2 fallback backend of `WebGPURenderer`):

```ts
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { color, positionLocal, sin, time } from 'three/tsl';

const nodeMat = new MeshStandardNodeMaterial();
nodeMat.colorNode = color(0x3366ff);
nodeMat.positionNode = positionLocal.add(sin(time.add(positionLocal.x.mul(4))).mul(0.05));
```

Do not mix: `onBeforeCompile` and `ShaderMaterial` GLSL do not run on `WebGPURenderer`. Choose one path per material and document it.

Shader warmup to avoid first-frame hitches:

```ts
await renderer.compileAsync(scene, camera); // falls back to renderer.compile(scene, camera)
```

Precision: write `precision highp float;` in `RawShaderMaterial` and guard with `#ifdef GL_FRAGMENT_PRECISION_HIGH` when a fragment shader might run on hardware that lacks highp. Avoid large world-space values in mediump math; pass positions relative to the camera or object.

## Workflow

1. Read the existing renderer configuration, three version, material list and texture loading code. Record a reference screenshot before changing anything.
2. Fix the color pipeline first: output color space, per-texture color space, tone mapping choice and exposure. Many "lighting" complaints end here.
3. Establish lighting: environment map (PMREM from `RoomEnvironment` or a licensed HDRI), one key light that casts shadows, and minimal fill.
4. Tune shadows: map size, camera frustum fitted tightly to the subject, `shadow.bias` and `shadow.normalBias` to remove acne without peter-panning.
5. Build materials from the simplest model that works (Standard before Physical; built-in before custom). Add physical features one by one with a before/after capture.
6. For custom effects, prefer `onBeforeCompile` patches on WebGL or TSL nodes on WebGPU; reach for `RawShaderMaterial` only when you need full control.
7. Warm up programs with `compileAsync` behind the loading state, then verify no shader compile errors in the console on desktop and a mobile profile.
8. Capture final screenshots at the same camera pose and compare with the reference; record program count and frame time via graphics-performance-qa.

## Performance requirements

- Program count (`renderer.info.programs.length`) stays stable after warmup; new programs appearing during interaction indicate a cache key or define problem.
- Shadow casters: one shadow-casting light per scene by default; shadow map 1024 on mobile tier, 2048 on desktop unless measured headroom allows more.
- Transmission, VSM shadows and high sample counts are disabled on the low tier.
- Environment maps: PMREM from a scene or a 1k/2k HDRI; do not ship 4k+ HDRIs to mobile without a measured need.
- No per-frame material creation, no per-frame `needsUpdate = true` on materials; update uniforms instead.
- Budgets for frame time are set per hardware tier and confirmed with real measurements, never assumed.

## Accessibility

- Honor `prefers-reduced-motion`: freeze time-driven uniforms (set `uTime` constant) or present a still frame; do not rely on shader animation to convey information.
- Keep sufficient contrast between any text overlay and the rendered background under every tone-mapping setting.
- Avoid high-frequency flashing or strobing shader effects (stay well under three flashes per second).
- Provide a text alternative describing the rendered object or scene, and a static image fallback when shaders fail to compile or WebGL is unavailable.
- Any interactive material switch (for example a finish picker) must be operable by keyboard with visible focus, not only by clicking the mesh.

## Failure cases & fixes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Colors washed out or too dark | Wrong texture color space or double gamma | sRGB on color maps only, linear on data maps, `outputColorSpace = SRGBColorSpace` |
| Normal map looks wrong or inverted | Normal map tagged sRGB, or green channel convention | Set `NoColorSpace`; flip `normalScale.y` for DirectX-style maps |
| Metal looks black | No environment map | Assign `scene.environment` from PMREM |
| Shadow acne stripes | Bias too small | Increase `normalBias` first, then small negative `bias` |
| Floating shadows | Bias too large | Reduce bias; tighten the shadow camera frustum |
| Compile error only on phones | Missing precision, unsupported extension, too many uniforms | Add precision guards, reduce lights, check the console error line |
| Hitch when a model first appears | Programs compiled lazily | `compileAsync` during loading |
| Custom GLSL ignored under WebGPU | `onBeforeCompile` is WebGL-only | Port the effect to TSL nodes |
| Blown highlights | Exposure or tone mapping off | Try AgX or Neutral, lower `toneMappingExposure` |

## Verification criteria

- [ ] Zero shader compile errors or warnings in the browser console on desktop Chromium and on a mobile emulation profile.
- [ ] Every color texture is `SRGBColorSpace`; every data texture is `NoColorSpace` (checked in code or at runtime).
- [ ] Renderer `outputColorSpace`, `toneMapping` and `toneMappingExposure` are set in exactly one place.
- [ ] `renderer.info.programs.length` is unchanged after 30 seconds of interaction following warmup.
- [ ] Before/after screenshots at a fixed camera pose are attached to the report.
- [ ] Reduced-motion mode shows no time-driven shader animation.
- [ ] Static fallback renders when WebGL is disabled.
- [ ] Environment and texture licenses are recorded.

## Related skills

threejs-production, react-three-fiber, webgpu-progressive-rendering, gltf-asset-pipeline, blender-to-r3f, graphics-performance-qa, playwright-browser-qa, accessibility, motion-systems, gsap-motion.

## Official sources

- https://threejs.org/docs/
- https://threejs.org/manual/#en/color-management
- https://threejs.org/docs/#api/en/materials/MeshPhysicalMaterial
- https://threejs.org/docs/#api/en/materials/ShaderMaterial
- https://threejs.org/docs/#api/en/extras/PMREMGenerator
- https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language
- https://www.khronos.org/opengl/wiki/Core_Language_(GLSL)
- https://www.npmjs.com/package/three
