---
name: motion-systems
description: Design and implement cinematic 3D motion systems using React, Next.js, GSAP, ScrollTrigger, and React Three Fiber with production-grade performance and accessibility.
---
# Motion systems architecture

Plan visual storytelling as a deterministic timeline: scenes, camera rigs, scroll choreography, loading transitions, fallback states and clear animation ownership.

## Workflow
1. Define a shot list and motion map with durations, easing curves, overlap, trigger ranges, camera targets and interaction states.
2. Select GSAP ScrollTrigger for orchestrated scroll timelines; React Three Fiber for actual WebGL depth; CSS transitions for small UI states. Avoid competing animation writers.
3. Create a scene controller, animation registry and reusable transition primitives; dispose geometries, textures and observers correctly.
4. Use adaptive DPR, GPU-friendly transforms, lazy media, LOD, instancing and explicit performance budgets.
5. Support pointer/touch/keyboard, small screens, reduced motion, low-power fallback and loading/errors.
6. Verify FPS, layout shift, animation timing, route transitions and browser GPU memory.

## Deliverables
Architecture diagram, component/file map, timeline table, performance constraints, quality gates, negative constraints and verifiable acceptance criteria. No decorative 3D that blocks usability.
