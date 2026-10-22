---
name: gltf-asset-pipeline
description: Validate, compress, simplify and measure glTF/GLB assets with glTF Transform and the Khronos validator, wiring the matching runtime decoders and recording provenance and before/after metrics.
---
# glTF asset pipeline

This skill turns a source GLB into a web-ready copy that is smaller, validated, decodable at runtime and documented. Originals are never modified: every step writes a new file, and every claim about savings comes from measurements taken on the actual files.

## When to use / not to use

Use it when:

- A GLB or glTF is heavy, slow to load, or has oversized textures.
- You need Meshopt, Draco or KTX2 compression, deduplication, welding, simplification or texture resizing.
- A model fails to load, renders incorrectly, or you need a validation report before shipping.
- You need LOD variants for distance-based switching.

Do not use it when:

- The model still needs authoring changes in Blender (topology, UVs, baking); use blender-to-r3f first.
- The problem is materials or lighting in the browser; use shader-material-lab.
- Only runtime profiling is needed; use graphics-performance-qa.

## Compatible versions

| Tool | Version | Role |
| --- | --- | --- |
| @gltf-transform/cli | 4.5.1 | `inspect`, `optimize` and per-step commands; uses sharp for image work |
| meshoptimizer | 1.3.0 | Meshopt codec and `MeshoptDecoder` |
| gltf-validator | 2.0.0-dev.3.10 | Khronos validator for Node (`validateBytes`) |
| three | 0.186.1 | `GLTFLoader`, `DRACOLoader`, `KTX2Loader` |
| @react-three/drei | 10.7.9 | `useGLTF`, `Detailed` |
| @react-three/fiber | 9.8.2 | Pairs with React 19 |

Versions verified 2026-10-22 via npm registry. Run tools through `npx` or a pinned dev dependency already present in the project; do not install new packages without approval.

## Architecture patterns

Directory convention that keeps originals untouched:

```text
assets/source/chair.glb        # original, read-only, with LICENSE/provenance note
public/models/chair.glb        # optimized output served to users
public/models/chair-lod1.glb   # optional simplified variant
reports/chair.metrics.json     # before/after numbers and validator summary
```

Inspect and optimize (CLI):

```bash
npx @gltf-transform/cli inspect assets/source/chair.glb
npx @gltf-transform/cli optimize assets/source/chair.glb public/models/chair.glb \
  --compress meshopt --texture-compress webp
# alternatives: --compress draco, --texture-compress ktx2
```

Individual steps when `optimize` is too aggressive or you need control:

```bash
npx @gltf-transform/cli dedup in.glb step1.glb
npx @gltf-transform/cli prune step1.glb step2.glb
npx @gltf-transform/cli weld step2.glb step3.glb
npx @gltf-transform/cli resize step3.glb step4.glb --width 2048 --height 2048
npx @gltf-transform/cli simplify step4.glb lod1.glb --ratio 0.5 --error 0.001
npx @gltf-transform/cli meshopt step4.glb out.glb
```

Run `npx @gltf-transform/cli --help` and `<command> --help` to confirm flags for the installed version before scripting them.

Validation in Node (fail the pipeline on errors):

```ts
import { readFile } from 'node:fs/promises';
import { validateBytes } from 'gltf-validator';

const bytes = new Uint8Array(await readFile('public/models/chair.glb'));
const report = await validateBytes(bytes);
const { numErrors, numWarnings } = report.issues;
if (numErrors > 0) throw new Error(`glTF validation failed with ${numErrors} errors`);
console.log({ numErrors, numWarnings });
```

Runtime decoders must match the compression chosen:

```ts
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);                         // --compress meshopt
loader.setDRACOLoader(new DRACOLoader().setDecoderPath('/draco/')); // --compress draco
loader.setKTX2Loader(new KTX2Loader().setTranscoderPath('/basis/').detectSupport(renderer)); // ktx2
```

Self-host the Draco decoder and Basis transcoder files from the matching three version so they work offline and under a strict CSP.

R3F with LOD via Drei:

```tsx
import { Detailed, useGLTF } from '@react-three/drei';

export function Chair() {
  const hi = useGLTF('/models/chair.glb');       // Drei wires Draco/Meshopt helpers
  const lo = useGLTF('/models/chair-lod1.glb');
  return (
    <Detailed distances={[0, 12]}>
      <primitive object={hi.scene} />
      <primitive object={lo.scene.clone()} />
    </Detailed>
  );
}
useGLTF.preload('/models/chair.glb');
```

If KTX2 textures are used with `useGLTF`, extend the loader with a configured `KTX2Loader`; confirm it in the browser rather than assuming.

Metrics record (written per asset):

```json
{
  "asset": "chair.glb",
  "source": { "bytes": 0, "triangles": 0, "textures": 0, "textureMemoryBytes": 0 },
  "optimized": { "bytes": 0, "triangles": 0, "textures": 0, "textureMemoryBytes": 0 },
  "runtime": { "drawCalls": 0 },
  "validator": { "errors": 0, "warnings": 0 },
  "compression": "meshopt+webp",
  "license": "CC-BY-4.0, author, source URL"
}
```

Fill every number from tools (`inspect`, validator, `renderer.info`); leave the field out rather than guessing.

## Workflow

1. Confirm provenance: who made the asset, under which license, and whether modification and redistribution are allowed. Stop and ask if unclear.
2. Copy the original into `assets/source/` (or confirm it is already there) and treat it as read-only.
3. Run `inspect` and the validator on the source; record bytes, triangle count, texture count and dimensions, and issues.
4. Choose compression: Meshopt for general geometry and animation, Draco when geometry dominates and decoder cost is acceptable; WebP for broad compatibility, KTX2 when GPU texture memory is the constraint.
5. Run `optimize` (or individual steps) into a new output path. Resize textures to the largest size actually visible on screen.
6. Produce LOD variants with `simplify` when objects are seen at very different distances.
7. Validate the output; zero errors is mandatory, review every new warning.
8. Wire matching decoders in the app and load the optimized file in a real browser.
9. Compare screenshots of source and optimized at the same camera pose; inspect silhouettes, normals, UV seams and animation.
10. Record before/after metrics and the license note in the report.

## Performance requirements

- Every shipped GLB has a recorded byte size, triangle count and texture memory estimate before and after optimization.
- Textures are no larger than needed: 2048 px maximum by default for hero assets, smaller for secondary assets, unless a visual diff justifies more.
- Draw calls per asset are measured with `renderer.info.render.calls`; R3F guidance keeps total scene draw calls in the few hundreds, with 1000 as an upper limit.
- Decoder and transcoder files are served from the same origin and cached.
- No regression in validator errors compared with the source.

## Accessibility

- Provide a text description of each model's purpose and a static image fallback for devices that cannot load WebGL or the asset.
- Show a labeled, determinate loading state where possible (`useProgress`), and a clear error message with a retry if loading fails.
- Large downloads respect reduced-data intent: offer a poster first and load the model on interaction when `prefers-reduced-data` or a slow connection is detected.
- Avoid auto-playing embedded animations under `prefers-reduced-motion`.

## Failure cases & fixes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `THREE.GLTFLoader: setMeshoptDecoder must be called` | Meshopt file without decoder | Call `setMeshoptDecoder(MeshoptDecoder)` |
| `No DRACOLoader instance provided` | Draco file without loader | Attach `DRACOLoader` with a valid decoder path |
| KTX2 textures black or missing | Transcoder path wrong or `detectSupport` not called | Serve Basis files; call `detectSupport(renderer)` |
| Seams or faceting after optimize | Weld or simplify too aggressive | Lower simplify ratio / error, skip weld on hard-edged meshes |
| Animation broken after optimize | Pruned or resampled tracks | Re-run steps individually; compare with source |
| Colors shifted | Texture re-encoding or wrong color space at runtime | Check sRGB on base color; compare against source render |
| Validator errors on source | Exporter issue | Fix in Blender and re-export (blender-to-r3f) |

## Verification criteria

- [ ] Source file unchanged (same byte size and hash as before the run).
- [ ] Optimized file passes the Khronos validator with 0 errors.
- [ ] Before/after bytes, triangles, texture memory and draw calls recorded from tools.
- [ ] Optimized asset loads in a real browser with no console errors, using the matching decoder.
- [ ] Side-by-side screenshots at a fixed camera show no visible regression, or differences are documented.
- [ ] License and provenance recorded for every shipped asset.
- [ ] LOD switch distances checked by moving the camera across each threshold.

## Related skills

blender-to-r3f, react-three-fiber, threejs-production, shader-material-lab, graphics-performance-qa, webgpu-progressive-rendering, playwright-browser-qa, spline-to-web, accessibility.

## Official sources

- https://gltf-transform.dev/
- https://gltf-transform.dev/cli
- https://github.com/KhronosGroup/glTF-Validator
- https://www.npmjs.com/package/gltf-validator
- https://meshoptimizer.org/
- https://threejs.org/docs/#examples/en/loaders/GLTFLoader
- https://threejs.org/docs/#examples/en/loaders/DRACOLoader
- https://threejs.org/docs/#examples/en/loaders/KTX2Loader
- https://drei.docs.pmnd.rs/loaders/gltf-use-gltf
- https://drei.docs.pmnd.rs/performances/detailed
- https://r3f.docs.pmnd.rs/advanced/scaling-performance
- https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
