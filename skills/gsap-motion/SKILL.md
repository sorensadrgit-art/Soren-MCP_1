---
name: gsap-motion
description: Build reliable GSAP timelines, ScrollTrigger interactions, React useGSAP scopes and cinematic motion with accessibility and cleanup.
---
# GSAP motion engineering

Official docs: https://gsap.com/docs/v3/ ; React integration: https://gsap.com/resources/React/ . Use the installed GSAP version and verify whether requested plugins are available for the project.

## Workflow

1. Define motion purpose, states, entrance and exit conditions, camera/scroll ownership, responsive breakpoints and reduced-motion equivalents.
2. Prefer timeline composition to unrelated per-element tweens; animate transforms/opacity where practical. Set explicit defaults and avoid replacing native focus/scroll behavior.
3. For React, use scoped GSAP contexts or the official useGSAP hook to clean up tween instances, listeners and ScrollTrigger registrations on unmount or rerun. Avoid duplicate observers and timeline replay after completed reveals.
4. Use ScrollTrigger refresh and responsive matchMedia deliberately. Handle pinned content, browser back navigation, keyboard focus, and device orientation changes.
5. Verify actual frame stability and browser behavior on mobile, reduced motion and no-JS fallbacks. Add regression tests for completed animations and route transitions.

## Constraints

Review GSAP plugin availability and licensing before installation. Keep source animations editable, respect project code ownership, and obtain approval for any external release. A design mockup alone does not prove choreography or input interaction.

## Compatible versions

Verified 2026-10-22 via npm registry/official docs.

| Package | Version | Notes |
| --- | --- | --- |
| `gsap` | 3.15.0 | All plugins, including former Club plugins, are free since 3.13 |
| `@gsap/react` | 2.1.2 | Provides `useGSAP` |

Plugins ship inside the `gsap` package; no private registry or token is needed. Still review the GSAP license terms for the project's use case.

## React integration

Register plugins once, scope selectors to a container, and let `useGSAP` revert everything on unmount.

```tsx
"use client";
import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export function Reveal({ items }: { items: string[] }) {
  const root = useRef<HTMLDivElement>(null);

  const { contextSafe } = useGSAP(
    () => {
      gsap.from(".card", { y: 24, autoAlpha: 0, stagger: 0.08, duration: 0.6 });
    },
    { scope: root, dependencies: [items.length], revertOnUpdate: true },
  );

  const onEnter = contextSafe((e: React.MouseEvent) => {
    gsap.to(e.currentTarget, { scale: 1.03, duration: 0.2 });
  });

  return (
    <div ref={root}>
      {items.map((t) => <article key={t} className="card" onMouseEnter={onEnter}>{t}</article>)}
    </div>
  );
}
```

- `scope` limits selector text to the container.
- `dependencies` reruns the setup when values change; `revertOnUpdate: true` reverts the previous run first.
- Wrap event handlers and delayed callbacks in `contextSafe` so tweens they create are also cleaned up.

## Reduced motion and breakpoints

```ts
const mm = gsap.matchMedia();
mm.add(
  {
    reduce: "(prefers-reduced-motion: reduce)",
    desktop: "(min-width: 1024px)",
  },
  (ctx) => {
    const { reduce, desktop } = ctx.conditions as { reduce: boolean; desktop: boolean };
    if (reduce) { gsap.set(".card", { autoAlpha: 1, y: 0 }); return; }
    gsap.from(".card", { y: desktop ? 40 : 16, autoAlpha: 0, stagger: 0.06 });
  },
);
```

`matchMedia` reverts its animations automatically when conditions stop matching. Inside `useGSAP`, create it within the callback so it is reverted on unmount.

## ScrollTrigger

```ts
gsap.timeline({
  scrollTrigger: { trigger: ".chapter", start: "top top", end: "+=150%", scrub: 1, pin: true, snap: 1 / 3 },
})
  .to(".chapter .a", { autoAlpha: 0 })
  .from(".chapter .b", { autoAlpha: 0, y: 30 });
```

- `scrub` ties progress to scroll; a number adds smoothing in seconds.
- `pin` adds spacing; create pinned triggers in page order or set `refreshPriority`.
- `snap` should match the timeline's labelled steps.
- Call `ScrollTrigger.refresh()` after layout changes that happen later: fonts, images, 3D assets, or async content. For example, call it in a model's load callback or after `document.fonts.ready`.

## Driving a Three.js or R3F camera

Tween plain objects or refs, then apply values in one place. With R3F `frameloop="demand"`, call `invalidate()` on update.

```tsx
import { useThree } from "@react-three/fiber";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

function CameraRig() {
  const { camera, invalidate } = useThree();
  useGSAP(() => {
    const target = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    gsap.to(target, {
      x: 2, y: 1.5, z: 5,
      scrollTrigger: { trigger: "#story", start: "top top", end: "bottom bottom", scrub: true },
      onUpdate: () => { camera.position.set(target.x, target.y, target.z); camera.lookAt(0, 0, 0); invalidate(); },
    });
  });
  return null;
}
```

Only one writer per property: if GSAP owns the camera position, disable `OrbitControls` damping or `useFrame` code that also writes it, or hand ownership off explicitly between phases.

## Cleanup on route changes

- Rely on `useGSAP` or `gsap.context().revert()` to kill tweens and ScrollTriggers on unmount.
- After client-side navigation, call `ScrollTrigger.refresh()` once the new page's layout settles.
- Do not keep global timelines in module scope that reference unmounted DOM.

## Performance requirements

- Animate `transform` and `opacity` (`x`, `y`, `scale`, `autoAlpha`) rather than layout properties.
- Limit simultaneous pinned sections; each pin adds layout work on refresh.
- Avoid per-frame reads of layout (`getBoundingClientRect`) inside `onUpdate`.
- Measure with the browser performance panel; long frames during scroll indicate layout thrash.

## Accessibility

- Provide reduced-motion variants through `gsap.matchMedia()`; content must be fully visible without animation.
- Do not hide focusable content with `autoAlpha: 0` while it can receive focus.
- Keep native scrolling; avoid hijacking wheel or keyboard scroll.
- Ensure pinned sections remain reachable and readable with keyboard navigation.

## Failure cases & fixes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Animations replay or double on rerender | No cleanup or React Strict Mode double run | Use `useGSAP` with `scope`; avoid manual effects |
| Trigger start/end positions wrong | Layout changed after creation | `ScrollTrigger.refresh()` after fonts, images or assets load |
| Pinned sections overlap | Creation order differs from page order | Create in order or set `refreshPriority` |
| Camera jitters | Two writers (GSAP and controls/useFrame) | One owner per property |
| R3F scene does not update during tween | `frameloop="demand"` | Call `invalidate()` in `onUpdate` |
| Handler tweens leak after unmount | Created outside context | Wrap handlers in `contextSafe` |
| Content invisible with reduced motion | Initial hidden state never reset | Set final state in the reduce branch |

## Verification criteria

- [ ] Resolved `gsap` and `@gsap/react` versions recorded.
- [ ] Navigating away and back produces no duplicate ScrollTriggers (`ScrollTrigger.getAll().length` stable).
- [ ] Reduced-motion emulation shows all content in its final state.
- [ ] No long frames over 50 ms during scroll in a performance trace on a throttled mobile profile.
- [ ] Each animated property has a single writer.
- [ ] Keyboard navigation reaches all content in pinned sections.
- [ ] Tested at 1440, 768 and 390 px widths.

## Sandbox field findings (2026-10-22)

- With `gsap.matchMedia()` inside `useGSAP`, use a scrubbed timeline for `(prefers-reduced-motion: no-preference)`. Under `reduce`, create `ScrollTrigger`s whose `onToggle` cuts the camera to each section's pose with no tween. Playwright confirmed exact pose values and zero idle rotation under emulated reduced motion.
- Tween plain objects (`cameraState.position`, `.target`, `.view`) and have an R3F `useFrame` copy them into the camera. Scrolling then causes no React re-renders.
## Related skills

- `motion-systems` for motion design tokens and choreography.
- `react-three-fiber` and `threejs-production` for 3D targets.
- `playwright-browser-qa`, `graphics-performance-qa`, `accessibility` for verification.
- `nextjs-runtime-engineering` for route transitions in Next.js.

## Official sources

- https://gsap.com/docs/v3/
- https://gsap.com/resources/React/
- https://gsap.com/docs/v3/Plugins/ScrollTrigger/
- https://gsap.com/docs/v3/GSAP/gsap.matchMedia()
- https://www.npmjs.com/package/gsap
- https://www.npmjs.com/package/@gsap/react
