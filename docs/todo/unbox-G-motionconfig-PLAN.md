# Plan G — `MotionConfig` as the app-wide reduced-motion floor

**Lane:** G · fully independent · **supersedes most of Lane F**
**Date:** 2026-07-31 · `main` @ `1c226847d`
**Costing:** [`motion-reduce-strategy-COSTING.md`](./motion-reduce-strategy-COSTING.md)
**Size:** one mount + one bug fix + one rules update. Replaces ~20 hand migrations.

---

## 0. What this does

Mount `<MotionConfig reducedMotion="user">` once. framer-motion then honors `prefers-reduced-motion` for **every `motion.*` component in the tree** — disabling transform and layout animations while preserving opacity — instead of each component remembering to call the bridge.

It is available in the installed `framer-motion@^12.42.2` and is currently **used nowhere in `src/`**.

---

## 1. Mount point — ~~`Providers.tsx`, not `layout.tsx`~~ → `layout.tsx` via a client wrapper

> **AMENDED 2026-07-31 (implemented).** Mounted at **`src/app/layout.tsx`** through
> `ReducedMotionProvider` (`src/components/providers/ReducedMotionProvider.tsx`), a one-line
> `'use client'` wrapper around `<MotionConfig reducedMotion="user">`. Three corrections drove this:
>
> 1. **The stated blocker does not exist.** framer-motion ships the directive **per module**:
>    `dist/es/components/MotionConfig/index.mjs:1` is `"use client"`. Next resolves that leaf as a
>    client boundary regardless of the barrel, so importing it from a server component is safe. The
>    dedicated wrapper makes the boundary explicit anyway, so the question is moot.
> 2. **The accepted consequence targeted the wrong file.** `layout.tsx` imports
>    `../components/layout/OfflineBanner` — **not** the `components/station/OfflineBanner` the guard
>    pins. The layout one **does not import framer-motion at all**, so it was never in scope.
> 3. **The real gap was missed.** `<InstallPrompt />` (`layout.tsx:133`) *does* use framer-motion and
>    also sits outside `<Providers>`. Mounting in `Providers.tsx` would have silently left it
>    uncovered — the one component the §1 reasoning existed to protect against.
>
> The layout was **not restructured** — the provider wraps the existing children in place.

---

## 2. Prove the mechanism before relying on it — ✅ DONE, mechanism confirmed

**This step is not optional and comes first.** The entire costing rests on framer's documented behavior.

> **RESULT 2026-07-31 — PASS.** Verified two ways.
>
> **Source.** In the shipped `framer-motion@12.42.2`: `use-visual-element.mjs` reads
> `motionConfig.reducedMotion` → the visual element resolves `shouldReduceMotion` from the media
> query → any animating key in `positionalKeys` is given `{type:false}`, as are layout animations.
> `opacity` is not a positional key, so it is untouched.
>
> **Empirically**, isolated Playwright A/B (repo's own framer bundled by esbuild, `reducedMotion`
> `no-preference` vs `reduce`, geometry sampled per frame for 260ms):
>
> | | no-preference | reduce |
> |---|---|---|
> | `y` translate distinct values | 24 | **2** (snap) |
> | `height` 0→auto distinct values | 30 | **2** (snap) |
> | `opacity` distinct values | 31 | **33** (still tweening) |
>
> **`CommandBar` was the wrong proof target** — it hand-rolls `useReducedMotion()` inline
> (`:252`) and already branches every motion prop on it, so it reduces either way and proves
> nothing. Use `StaggerReveal` / `CollapsibleGroupRow` if re-checking in-app.
>
> **Why isolated rather than in-app:** the working tree has an unrelated broken import
> (`shipped/PhotoGallery.tsx:13` → the renamed `MovePhotosBetweenPoModal`) that fails the build on
> **every** route through `layout.tsx`. Not this lane's; not repaired here. §7 must be re-run in-app
> once that rename lands.

---

## 3. Fix the bridge's height bug while here

`useMotionPresence` (`motion-framer-hooks.ts:28-36`) returns a flat `{ initial:{opacity}, animate:{opacity}, exit:{opacity} }`. Applied to `framerPresence.collapseHeight` or `sidebarSection` — both `{height:0} → {height:'auto'}` — **the height keys are discarded**, so the element fades while holding full height instead of collapsing, and holds its box through exit.

`collapseHeight` is the **one sanctioned height animation** in `display/motion-crossfade.md`. The bridge over-reduces it.

Fix: preserve `height` keys when present; collapse only transforms (`x` / `y` / `scale` / `rotate`). **Done 2026-07-31** — `useMotionPresence` now strips a named transform/filter key set and passes everything else through.

> **CORRECTION.** *"MotionConfig does this correctly by construction"* is **wrong**. `height` is one of framer's `positionalKeys` (`width · height · top · left · right · bottom` + transforms) and gets `{type:false}` under reduce — measured 30 distinct tween values → **2**. It **snaps**. Bridge and floor still agree, because `useMotionTransition`'s `{ duration: 0 }` also snaps a preserved height — but they agree on *snapping*, not on *tweening*.

---

## 4. Update the rules — mandatory, own commit

Once MotionConfig is the floor, two statements in `.claude/rules/display/motion-crossfade.md` become **wrong**:

- the "GAP — residual raw reduced-motion consumers" section, and
- *"new animated code must call the hook bridge — never consume `framerPresence.*` / `framerTransition.*` raw on a user-facing surface."*

Replace with: MotionConfig is the floor; the bridge is for surfaces needing *stronger-than-default* reduction (suppressing an animation entirely rather than crossfading it).

**A rule that describes a superseded mechanism is worse than no rule** — it sends the next agent to do work that is already done. Do this in its own commit with rationale.

---

## 5. What survives

- **`useMotionPresence` / `useMotionTransition` stay** — as the escape hatch for stronger-than-default reduction, with §3 fixed.
- **`station-motion-bridge.guard.test.ts` stays** — it now pins deliberate stronger-reduction surfaces, not baseline compliance. Do not delete it and do not raise its baseline.
- **Lane F's `ExpandableSection` deletion stays** — dead code on its own merit (zero call sites, barrel-exported only).
- **Lane F's three fixes become optional polish**, not WCAG remediation. Deprioritize; do not cancel the deletion.

---

## 6. Out of scope

- **The 289 files using Tailwind `animate-*`.** CSS animations, untouched by MotionConfig, mostly loaders where a spinner is a status indicator rather than vestibular motion. **Do not sweep them.**
- **GSAP** in `card-fan-carousel.tsx:4` — outside framer; needs its own `useReducedMotion` gate. Separate, small.
- **`motion-plus` `AnimateNumber`** — separate package/context, but its only consumer (`AnimatedStat`) already handles reduce manually (`:51`, `:57-68`). No action.
- Re-timing anything. Durations and easings are unchanged.

---

## 7. Verification matrix

Both states, in a real browser, against `:3050` (attach — never start/restart/kill it):

| Case | Reduced ON | Reduced OFF |
|---|---|---|
| Unbridged consumer (`CommandBar`) | opacity only, no translate | unchanged from today |
| Already-bridged (`CardShell`, `StationPacking`) | still reduced — **note the change**: crossfade now, not an instant cut (§3.1 of the costing; this is the more correct behavior) | unchanged |
| `collapseHeight` consumer | height still collapses, no slide | unchanged |
| Sanctioned push toggle (sidebar nav column width) | width animation disabled — **confirm this is intended** | unchanged |
| `CaptureStack` / `MobileFeed` push-up | `layout` already `false` under reduce; consistent | unchanged |

Plus: `npm run verify` green, **no ratchet baseline raised**, and no hydration warning in the console (MotionConfig reads the media query client-side — same as today's `useReducedMotion`, so no regression expected, but confirm).
