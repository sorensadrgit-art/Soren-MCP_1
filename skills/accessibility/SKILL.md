---
name: accessibility
description: Implement and audit inclusive digital interfaces against WCAG 2.2 Level AA. Use for keyboard, screen reader, ARIA, focus, and contrast requirements.
---
# Accessible interface engineering

Use semantic HTML before ARIA overrides. Build keyboard-operable controls with visible focus, discernible names, and meaningful state. For content text, target WCAG AA contrast ratios (typically 4.5:1 normal and 3:1 large text). Ensure form labels, errors, live-region announcements, reflow and appropriate touch targets.

## Workflow
1. Identify user actions, roles, labels, focus order, and responsive states.
2. Implement native semantic controls; add ARIA only when native semantics are insufficient.
3. Check keyboard-only, screen-reader semantics, pointer alternatives, and 200–400% zoom behavior.
4. Test contrast, focus visibility, error associations and reduced-motion handling.
5. Report measurable failures with criteria, evidence, and exact component-level fixes.

## Completion
No inaccessible custom controls, invisible focus indicators, unlabeled inputs, or autoplay motion that ignores reduced-motion preferences. Never claim WCAG conformance without audited evidence.
