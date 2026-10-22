# V3 graphics sandbox validation

Date: 2026-10-22. Host: Windows, Node 24.19.0, Chromium 156.0.8078.4 (Playwright 1.64.1).

The sandbox lives at `C:\Users\soren\Projects\soren-v3-graphics-sandbox`. It is a separate project with its own local Git repository and no remote, and it is not part of any portfolio or production site. It is committed locally as `d48839ed8ea3a7d197da39b31494d8248c2e6782` (branch `master`), authored with the owner's repo-local noreply identity, and is not published. Raw evidence is copied to `docs/evidence/v3/sandbox/`.

## Stack

| Package | Version |
| --- | --- |
| react, react-dom | 19.3.1 |
| @react-three/fiber | 9.8.2 (peer: react >=19 <19.4, three >=0.156) |
| @react-three/drei | 10.7.9 (peer: @react-three/fiber ^9) |
| three | 0.186.1 |
| gsap / @gsap/react | 3.15.0 / 2.1.2 |
| vite / @vitejs/plugin-react | 8.3.5 / 6.1.2 |
| @gltf-transform/cli, core, extensions, functions | 4.5.1 |
| meshoptimizer | 1.3.0 |

Dependencies were installed with `npm install --ignore-scripts`. The scene makes no network requests at runtime: no CDN decoders, HDRIs or web fonts.

## GLB pipeline (measured)

`scripts/make-asset.mjs` builds a deterministic procedural GLB: a torus knot with a packed metal/roughness PNG, a clearcoat ceramic orb, a brass halo and an obsidian pedestal. The asset is original and licensed CC0-1.0.

| Step | Command | Result |
| --- | --- | --- |
| Build | `npm run asset:build` | `assets/source/sculpture.glb`, 3,058,144 bytes |
| Inspect | `gltf-transform inspect` | 4 meshes, 86,336 triangles, 1 texture 1024² (5.59 MB GPU estimate) |
| Optimize | `gltf-transform optimize … --compress meshopt --texture-compress webp --texture-size 1024 --palette false --flatten false --join false` | `public/models/sculpture.glb`, 337,980 bytes (−88.9%) |
| Validate | `gltf-transform validate` (source and output) | 0 errors, 0 warnings on both files; output has 1 info: `UNSUPPORTED_EXTENSION EXT_meshopt_compression` |
| Report | `scripts/asset-report.mjs` | `asset-report.json` with SHA-256 hashes, per-mesh vertices and attributes |
| Load | drei `useGLTF(url, false, true)` | Loaded in Chromium with no console errors |
| Dispose | Unload/reload ×3 | Counts return exactly to baseline (see below) |

The default `simplify` step reduced the knot from 65,536 to 50,002 triangles and the halo from 8,192 to 6,133. Attributes were quantized: position i16, normal i8, uv u16. The WebP texture is 19,660 bytes, down from 801,101 bytes of PNG, but its GPU estimate is unchanged.

## Browser tests

`npm run test:e2e` builds the app, then runs Playwright against `vite preview` on 127.0.0.1:4317. Final run: **14 passed, 0 failed** (`docs/evidence/v3/sandbox/playwright-run.txt`).

| Test | Project | Result |
| --- | --- | --- |
| Model loads, frames render, zero console errors | swiftshader | pass |
| No horizontal overflow, panel inside viewport, 44 px targets at 1440, 768 and 390 px | swiftshader | pass ×3 |
| Keyboard reaches finish buttons with `:focus-visible` outline; Enter changes material; live region updates | swiftshader | pass |
| Skip link moves focus to content | swiftshader | pass |
| Clicking the projected sculpture point cycles the finish (raycast) | swiftshader | pass |
| Scroll drives the GSAP ScrollTrigger camera timeline (camera moves more than 1 unit; final pose y above 4) | swiftshader | pass |
| Reduced motion: no idle rotation, copy fully opaque, camera cuts exactly to the chapter pose | swiftshader | pass |
| GLB request aborted: error status shown, page content intact, only the expected loader page error | swiftshader | pass |
| Unload/reload ×3 disposes GPU resources with no growth | swiftshader | pass |
| WebGL disabled (`--disable-webgl --disable-3d-apis`): accessible fallback, no canvas, 3D chunk never requested, zero console errors | no-webgl | pass |
| Performance metrics | swiftshader, gpu | pass (values below) |

Screenshots: `swiftshader-desktop-hero.png`, `swiftshader-tablet.png`, `swiftshader-mobile.png`, `swiftshader-pipeline-chapter.png`, `no-webgl-fallback.png`.

## Metrics (actual values, 1440×900, DPR 1)

| Metric | SwiftShader (software) | GPU (Intel UHD, D3D11) |
| --- | --- | --- |
| Renderer string | ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver) | ANGLE (Intel, Intel(R) UHD Graphics (0x0000A788) Direct3D11 vs_5_0 ps_5_0, D3D11) |
| Draw calls / triangles (sampled frame) | 9 / 135,680 | 9 / 135,680 |
| Geometries / textures / programs | 20 / 7 / 8 | 20 / 7 / 8 |
| Idle fps (3 s rAF sample) | 15.9 | 165.0 |
| Idle frame time p50 / p95 / max | 16.7 / 133.4 / 250 ms | 6.1 / 6.2 / 6.2 ms |
| Scrolling fps | 6.8 | 165.0 |
| Scrolling frame time p50 / p95 / max | 116.7 / 433.4 / 433.4 ms | 6.1 / 6.2 / 7.4 ms |
| DOMContentLoaded | 46 ms | 43 ms |
| First rendered frame | 453 ms | 500 ms |
| Model ready | 477 ms | 542 ms |
| JS heap after forced GC | 7.62 MB | 8.02 MB |
| DOM nodes | 84 | 84 |

Transfer sizes (local preview, identical in both projects): app JS 115,838 B; 3D chunk 281,776 B (1,047 KB minified); CSS 1,921 B; GLB 338,280 B.

How to read these numbers:

- They come from a local loopback server on one laptop. They are not field data or device benchmarks.
- The GPU figure of 165 fps is capped by the display refresh rate. Frame-time percentiles are the better signal.
- The triangle count counts the shadow pass, which renders the scene a second time. On two of the three reload cycles the sampled frame showed 6 calls and 67,853 triangles. That variation was not investigated further.
- JS heap does not include GPU memory. GPU memory was not measured directly; only the glTF Transform estimate exists.
- No trace was recorded, so LCP and long tasks were not measured.

## Disposal cycles

Loaded baseline: 20 geometries, 7 textures, 8 programs. After unload: 16 geometries, 6 textures, 5 programs. These are the persistent environment, shadow map and catcher resources. After each reload the counts were back to exactly 20, 7 and 8, across all three cycles.

## Findings fed into skills and recipes

1. **Drei `ContactShadows` 10.7.9 leaks on unmount.** It allocates two `WebGLRenderTarget`s and a `PlaneGeometry` in `useMemo` and never disposes them. Measured growth was +1 geometry and +2 textures per cycle. The sandbox fix is a `<shadowMaterial>` catcher plane that reuses the light's shadow map. → `react-three-fiber`, `graphics-performance-qa`.
2. **Full release of a single-owner GLTF works.** Traverse and dispose, then call `useGLTF.clear(url)`. Use `dispose={null}` only for shared scenes. → `react-three-fiber`, recipe `blender-glb-pipeline` load step.
3. **Set `useGLTF(url, false, true)` for meshopt assets.** This keeps drei from pointing Draco at a CDN decoder. → `react-three-fiber`.
4. **A failed load still emits one uncaught page error.** The error boundary contains it, but tests must allowlist exactly that message. → `react-three-fiber`.
5. **Lazy-loading the 3D chunk saves the fallback path 281.6 KB.** → `react-three-fiber`.
6. **`optimize` merges by default.** Its default `palette`/`flatten`/`join` steps can merge named materials and nodes, and `simplify` is on by default. → `gltf-asset-pipeline`.
7. **The validator cannot check meshopt payloads.** Validate the source or an uncompressed copy too. → `gltf-asset-pipeline`, recipe `blender-glb-pipeline` optimize step.
8. **WebP reduces download size, not VRAM.** Use KTX2 for GPU memory. → `gltf-asset-pipeline`.
9. **Labeling and harness details.** SwiftShader needs `--enable-unsafe-swiftshader`. The GPU path needs `channel: 'chromium'` and the D3D11 flags. Texture counts include environment and shadow textures. The `chromium` channel favicon 404 breaks zero-console-error gates. → `graphics-performance-qa`.
10. **Reduced motion with GSAP.** `gsap.matchMedia` plus discrete `ScrollTrigger` camera cuts satisfies reduced motion. Tweening plain objects keeps scrolling free of React re-renders. → `gsap-motion`.

## Not verified

- Real mobile hardware, Safari/WebKit, Firefox, high-DPR displays and touch input. Mobile and tablet were only emulated as viewport sizes in desktop Chromium.
- KTX2 textures, Draco, LOD switching and animated assets.
- Blender export. The asset is procedural, and Blender Lab was not used because it requires an isolated VM.
- Long idle runs (60 s or more), and context loss and restore.
- Screen-reader output. Only the roles, labels and live-region text were asserted.

## Blockers

- Resolved 2026-10-22: the owner configured a repo-local identity and the sandbox was committed as `d48839e`.

## Reproducibility check (2026-10-22)

A clean clone of `d48839e` in a temporary directory ran `npm ci`, `npm run asset:pipeline` and `npm run test:e2e`:

- `npm ci` installed 257 packages from the committed lockfile.
- The asset pipeline regenerated `assets/source/sculpture.glb` and `public/models/sculpture.glb` byte-identically to the committed files (optimized SHA-256 `F5046A0B8AEF06036DD4FFBB34136A1DB7D44A615849EB34CE34272B53C84E89`, 337,980 bytes, 88.9% smaller than the 3,058,144-byte source).
- Playwright passed 14/14 (SwiftShader, GPU and no-WebGL projects).
- Only timestamped or measured report files differed (`asset-report.json` `generatedAt`, metrics, dispose cycles and Playwright results).
