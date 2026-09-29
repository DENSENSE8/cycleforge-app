# CycleForge motion contracts

Motion is a projection of product state. It may clarify a change, preserve spatial continuity, or acknowledge an action; it must not become a second state machine.

## Foundational rules

1. **Product state is authoritative.** Resolve a semantic state first, then use a `StateMotionContract` to map that state to visual targets.
2. **One element owns a morph.** Geometry, radius, color, and content timing belong to the same persistent element. Content exits before replacement content enters.
3. **Timing describes presentation, not truth.** A timeout may hold an acknowledgement or pace a deliberate intro, but must never decide whether a product operation succeeded.
4. **Direct manipulation stays direct.** During a drag, pointer position owns the value. Springs begin only after release.
5. **Motion+ has one boundary.** Application code imports Motion+ capabilities from `@/design-system/motion/plus`; it does not import the package directly.
6. **Accessibility changes the path, not the outcome.** Reduced motion removes travel, magnetism, and decorative transforms while preserving final geometry and content.

## Shared primitives

- `defineStateMotionContract` and `motionTargetFor`: typed semantic-state projection.
- `motionContentSwap`: shared, non-overlapping content replacement timing.
- `AnimatedStat profile="kpi" | "scanQuantity"`: semantic number-motion profiles; formatting and missing-value handling are pure.
- `MagneticActionField`: fine-pointer-only Motion+ pull with a spatial cap and reduced-motion suppression.
- `@/design-system/motion/plus`: the only Motion+ import facade.

## Migrated reference surfaces

- The Motion+ listing-button demo is the small reference implementation for a single-element morph.
- `SearchAssistantFrame` derives `closed | composing | conversing` from real open/transcript state and projects that through a contract.
- `WelcomeAssembly` keeps DOM readiness and presentation steps in an explicit reducer; absent regions are skipped atomically without dead beats.
- Scan quantities opt into the `scanQuantity` profile; generic KPIs retain the default `kpi` profile.

## Timer audit

Run `pnpm motion:audit` to inventory files that combine Motion with timers and to enforce the Motion+ import boundary. Every current intersection carries a reviewed intent and authority note: choreography, acknowledgement, interaction lifetime, focus handoff, direct manipulation, time/cooldown, data debounce, deferred render, demo-only, or a mixed lifecycle.

`pnpm motion:audit:strict` fails when a new timer-coupled motion module has not been reviewed. A filename pattern never auto-approves it. The current inventory passes the strict audit; the command remains separate from the default verifier so its ownership can be adopted deliberately.

For every timer finding, ask:

- Is it pacing a visual sequence, or secretly advancing business state?
- Can completion be driven by the real async operation or animation completion callback?
- Is cleanup deterministic on unmount and interruption?
- Does reduced motion reach the same final state immediately or through a short crossfade?
