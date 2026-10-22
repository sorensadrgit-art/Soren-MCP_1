---
name: blender-to-r3f
description: Move Blender scenes into React Three Fiber production by preparing scale, transforms, materials and animation for the Khronos glTF exporter, optimizing the GLB and generating disposable-safe R3F components.
---
# Blender to React Three Fiber

This skill covers the full path from a `.blend` file to a component on screen: authoring rules inside Blender, export through the Khronos glTF exporter, optimization, and an R3F component that loads, animates and cleans up correctly. It also sets hard boundaries for AI-driven Blender automation.

## When to use / not to use

Use it when:

- A Blender model, scene or animation must appear in an R3F or three.js app.
- An exported GLB has wrong scale, rotation, missing textures, broken materials or missing animation.
- You want to drive Blender with the Blender Lab MCP server or a `bpy` script to automate export.
- You need a typed R3F component generated from a GLB.

Do not use it when:

- The asset is already a validated, optimized GLB; go straight to react-three-fiber.
- The source is a Spline scene; use spline-to-web.
- Only compression or LODs are needed; use gltf-asset-pipeline.

## Compatible versions

| Tool | Version | Notes |
| --- | --- | --- |
| Blender | 5.1+ | Required by the Blender Lab MCP server |
| Blender Lab MCP server | 1.0.3 | Executes generated Python; isolated environment only |
| glTF-Blender-IO | bundled with Blender | Khronos exporter, `bpy.ops.export_scene.gltf` |
| @gltf-transform/cli | 4.5.1 | Optimization after export |
| three | 0.186.1 | `GLTFLoader` |
| @react-three/fiber | 9.8.2 | Pairs with React 19 (R3F 8 pairs with React 18) |
| @react-three/drei | 10.7.9 | `useGLTF`, `useAnimations`, `useProgress` |
| react | 19.3.1 | |

npm versions verified 2026-10-22 via npm registry. Blender and MCP server versions come from blender.org; confirm the installed Blender version with `blender --version` before scripting.

## Architecture patterns

### Security boundary for Blender automation

The Blender Lab MCP server warns that it runs generated Python inside Blender. Python in Blender has full access to the file system and network of that machine. Therefore:

- Run it only inside an isolated VM, container or dedicated worker that holds copies of the needed assets and no credentials, SSH keys, browser profiles or cloud tokens.
- Never run it on a credential-bearing workstation or expose it on a public server.
- Review every generated script before execution; log scripts and outputs.
- Move results out of the sandbox as files (GLB, textures, reports), never by mounting private directories into it.

### Authoring rules inside Blender

- Scale: 1 Blender unit = 1 meter. Model at real-world size so lights, physics and camera near/far behave predictably.
- Apply transforms (Ctrl+A, All Transforms) on meshes before export, except where an object's transform is intentionally animated.
- Orientation: Blender is +Z up; leave the exporter's +Y Up option on so the GLB matches three.js.
- Naming: unique, stable, ASCII names such as `Chair_Seat`, `Chair_Leg_FL`, `MAT_Oak`. Code references these names, so renaming is a breaking change.
- Materials: use Principled BSDF with image textures plugged directly into Base Color, Metallic, Roughness, Normal (via Normal Map node) and Emission. These map to glTF metallic-roughness PBR. Procedural node trees do not export; bake them to textures first.
- Animation: one action per clip, pushed to NLA tracks or stashed, named for the clip (`Idle`, `Open`). Avoid constraints and drivers that the exporter cannot bake unless you enable sampling.

### Scripted export

```python
import bpy

bpy.ops.export_scene.gltf(
    filepath="/work/out/chair.glb",
    export_format='GLB',
    export_yup=True,
    export_apply=True,          # apply modifiers
    export_texcoords=True,
    export_normals=True,
    export_materials='EXPORT',
    export_animations=True,
    export_draco_mesh_compression_enable=False,  # compress later with glTF Transform
)
```

Parameter names can change between Blender releases; check the `bpy.ops.export_scene` reference for the installed version.

### Optimization handoff

Export uncompressed, then hand the file to gltf-asset-pipeline:

```bash
npx @gltf-transform/cli inspect work/out/chair.glb
npx @gltf-transform/cli optimize work/out/chair.glb public/models/chair.glb --compress meshopt --texture-compress webp
```

### R3F component

Generate a starting component with pmndrs gltfjsx, then review it:

```bash
npx gltfjsx public/models/chair.glb --types --output src/components/Chair.tsx
```

Or write it by hand:

```tsx
import { useGLTF, useAnimations } from '@react-three/drei';
import { useEffect, useRef } from 'react';
import type { Group } from 'three';
import type { ThreeElements } from '@react-three/fiber';

export function Chair(props: ThreeElements['group']) {
  const group = useRef<Group>(null);
  const { nodes, materials, animations } = useGLTF('/models/chair.glb');
  const { actions } = useAnimations(animations, group);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) actions.Idle?.reset().fadeIn(0.3).play();
    return () => { actions.Idle?.fadeOut(0.2); };
  }, [actions]);

  return (
    <group ref={group} {...props} dispose={null}>
      <primitive object={nodes.Chair_Root} />
    </group>
  );
}
useGLTF.preload('/models/chair.glb');
```

`dispose={null}` stops R3F from disposing the cached geometry and materials when this instance unmounts, because `useGLTF` shares them across instances. Dispose them explicitly (or call `useGLTF.clear`) only when the asset is no longer needed anywhere.

Loading shell:

```tsx
import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Html, useProgress } from '@react-three/drei';

function Loader() {
  const { progress } = useProgress();
  return <Html center role="status">{`Loading model ${progress.toFixed(0)}%`}</Html>;
}

export function Viewer() {
  return (
    <Canvas camera={{ position: [2, 1.5, 3], fov: 40 }} dpr={[1, 2]}>
      <Suspense fallback={<Loader />}><Chair /></Suspense>
    </Canvas>
  );
}
```

## Workflow

1. Confirm asset ownership and license; copy the `.blend` and textures into a working folder. Never edit the only original.
2. In Blender: verify scale, apply transforms, fix names, check normals (recalculate outside), and confirm each material uses supported Principled BSDF inputs.
3. Bake procedural materials, ambient occlusion or lighting to image textures where needed; save textures at sensible sizes.
4. Organize animation into named actions on NLA tracks.
5. Export GLB with the Khronos exporter (UI or `bpy.ops.export_scene.gltf`), with +Y Up and modifiers applied.
6. Validate and optimize the export through gltf-asset-pipeline; keep the raw export as the source of truth.
7. Generate or write the R3F component, add `dispose={null}`, `Suspense`, `useProgress` and `useGLTF.preload`.
8. Load in a real browser, compare against a Blender viewport render at the same camera and lighting, and play every animation clip.
9. Record versions, export settings, metrics and license notes in the report.

## Performance requirements

- Mesh count per model is kept low: merge static parts that share a material; every separate mesh costs a draw call.
- Scene draw calls stay in the few hundreds, with 1000 as the R3F documented upper limit.
- Textures are baked at the smallest size that survives a screenshot comparison; 2048 px maximum by default.
- Animation clips contain only animated channels; remove unused actions before export.
- Measure load time and memory with graphics-performance-qa; do not estimate.

## Accessibility

- Provide a text description of the model and what each interaction does.
- Respect `prefers-reduced-motion` by not auto-playing clips and by avoiding camera fly-throughs.
- Camera orbit or part selection has keyboard equivalents (buttons or a list of parts) with visible focus.
- The loader uses `role="status"` with readable progress text; failures show a message and a static image.
- A static poster is shown when WebGL is unavailable.

## Failure cases & fixes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Model 100x too big or small | Unit scale not 1 m, or unapplied scale | Set scene units to meters, apply scale, re-export |
| Model lying on its side | +Y Up disabled or rotation unapplied | Enable +Y Up, apply rotation |
| Grey material, no textures | Procedural nodes or unsupported node setup | Bake to image textures wired into Principled BSDF |
| Inverted or black faces | Flipped normals or missing normals | Recalculate outside; export normals |
| Animation missing | Action not on NLA or not exported | Push down to NLA, enable animations export |
| Parts vanish after remount | Shared GLTF resources disposed | Use `dispose={null}` on the root group |
| Generated script touched host files | Blender MCP run outside isolation | Stop; move work into an isolated VM with copied assets |

## Verification criteria

- [ ] Blender version is 5.1 or newer when Blender Lab MCP is used, and it ran in an isolated environment with no credentials.
- [ ] Exported GLB passes the Khronos validator with 0 errors.
- [ ] Object bounding box in three.js matches the real-world size within 1 percent.
- [ ] All named nodes referenced in code exist in the GLB.
- [ ] Every animation clip plays; reduced-motion mode plays none automatically.
- [ ] Mount/unmount cycle of the component leaves `renderer.info.memory` stable.
- [ ] Browser screenshot compared against a Blender render at the same camera pose.
- [ ] License and provenance recorded.

## Related skills

gltf-asset-pipeline, react-three-fiber, threejs-production, shader-material-lab, graphics-performance-qa, webgpu-progressive-rendering, playwright-browser-qa, accessibility, gsap-motion, spline-to-web.

## Official sources

- https://www.blender.org/lab/mcp-server/
- https://github.com/KhronosGroup/glTF-Blender-IO
- https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html
- https://docs.blender.org/api/current/bpy.ops.export_scene.html
- https://github.com/pmndrs/gltfjsx
- https://r3f.docs.pmnd.rs/tutorials/loading-models
- https://drei.docs.pmnd.rs/loaders/gltf-use-gltf
- https://drei.docs.pmnd.rs/abstractions/use-animations
- https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
