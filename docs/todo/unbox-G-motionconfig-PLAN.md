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

> **GUARDED 2026-08-01** (`a0f8d5a8b`). The fix shipped with no test, and it is
> **unobservable in a browser at both current call sites**: `/signin` and
> `CardShell` pair `useMotionPresence` with `useMotionTransition`, whose
> `{ duration: 0 }` snaps everything, so the old flat shape and the fixed shape
> measure *identically* under reduce (§7 row 3). Only a unit test separates them.
>
> The pure core is now exported as **`reducePresenceShape`** — a hook cannot be
> called without a React renderer, and this repo's tests are plain `node:test` +
> `tsx` with no testing-library/jsdom, so the pure function is the only honest
> seam. `motion-framer-hooks.test.ts` pins the **real** `framerPresence` presets
> (not synthetic shapes), including a sweep asserting no preset silently loses a
> `height` key. Verified to fail **4/6** against the pre-fix implementation.

---

## 4. Update the rules — mandatory, own commit

Once MotionConfig is the floor, two statements in `.claude/rules/display/motion-crossfade.md` become **wrong**:

- the "GAP — residual raw reduced-motion consumers" section, and
- *"new animated code must call the hook bridge — never consume `framerPresence.*` / `framerTransition.*` raw on a user-facing surface."*

Replace with: MotionConfig is the floor; the bridge is for surfaces needing *stronger-than-default* reduction (suppressing an animation entirely rather than crossfading it).

**A rule that describes a superseded mechanism is worse than no rule** — it sends the next agent to do work that is already done. Do this in its own commit with rationale.

---

## 5. What survives

- **`useMotionPresence` / `useMotionTransition` stay** — as the escape hatch for stronger-than-default reduction, with §3 fixed. The pure core is exported as `reducePresenceShape`; call the hook, not the core, from components.
- **`motion-framer-hooks.test.ts` is new** (`a0f8d5a8b`) — it pins which presence keys survive reduction against the real `framerPresence` presets. It is the *only* thing that can catch a §3 regression, since the bug is invisible in a browser wherever `useMotionTransition` is also in play.
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

Both states, in a real browser, against `:3050` (attach — never start/restart/kill it).

> **RUN 2026-08-01 — the floor is confirmed IN-APP.** Measured with Playwright
> (`reducedMotion: 'reduce' | 'no-preference'`, storage state `tests/.auth/admin.json`,
> 1440×900) rather than the Browser pane, which cannot emulate the media query —
> and per `verify.md`, geometry claims come from the real runner. Method: sample a
> property every `requestAnimationFrame` and count **distinct values**; ~1–2 means
> the property SNAPPED, a high count means it tweened.
>
> §2 proved the mechanism in isolation. This run proves it **in the app tree**.

| Case | Reduced ON | Reduced OFF | Verdict |
|---|---|---|---|
| **Unbridged** — `BootSplash` ring + sweep | `scale` **1 distinct** (frozen 1.0) · `translateX` **1 distinct** (frozen) · `opacity` **142 distinct** (0.152–0.599) | `scale` 96 (1.002–1.12) · `translateX` 145 (−64→170) · `opacity` 145 | ✅ **PASS** — transforms freeze, opacity keeps tweening |
| **Bridged** — `/signin` `collapseHeight` reveal | `height` **1 distinct @ 66.2px** · `opacity` **1 distinct @ 1** — instant, fully formed | `height` 2.3→66.2 (26 distinct) · `opacity` 0→1 (21) | ⚠️ **row 2 expectation was WRONG** — see below |
| `collapseHeight` consumer | reaches natural height, no slide | real expand | ✅ (bridged path only — see gap) |
| Sanctioned push toggle (sidebar nav column) | `width` 0→240px in **2 distinct** = snap; animation disabled, column still opens | real tween | ✅ behaviour confirmed — **intent still needs a human call** |
| `CaptureStack` / `MobileFeed` push-up | not separately measured; mobile `/dashboard` load clean | — | ⚪ not measured |

**Row 1's target was replaced.** `CommandBar` proves nothing (§2 already flagged it —
it hand-rolls `useReducedMotion()` at `:252` and reduces either way). `BootSplash`
(`src/components/boot/BootSplash.tsx`) is the correct probe: pure framer, **no bridge
and no `useReducedMotion`**, animating a transform *and* an opacity on the same
element, so one measurement answers the whole question and any difference between
states is attributable **only** to `MotionConfig`.

> **CORRECTION — row 2 as written is wrong.** Already-bridged surfaces do **not**
> "crossfade now, not an instant cut". `useMotionTransition` returns `{ duration: 0 }`
> under reduce, which zeroes **opacity too**, and an explicit transition beats
> `MotionConfig`'s per-key handling. Bridged surfaces still instant-cut, exactly as
> before this lane. The crossfade-instead-of-cut improvement lands **only on
> unbridged surfaces** — which is precisely where it was missing, so the lane's value
> stands; only this row's prediction was wrong. `motion-crossfade.md` states this
> correctly and needed no edit.

**Coverage gap — the unbridged `collapseHeight` path is untested in-app.**
`CollapsibleGroupRow` (the one raw `framerPresence.collapseHeight` consumer) was
unreachable: zero `role="row"[aria-expanded]` elements on `/dashboard`, `/incoming`
or `/unbox` in current dogfood data, and the dashboard loading state renders
`BootSplash`, not `SkeletonList`. `BootSplash` covers the same mechanism more
strongly, so this was not chased further.

**Hydration — clean, with a caveat.** Warnings appeared under `reduce` in 2 of 3
early loads, which looked like a regression. It does not hold up: an **interleaved
warm A/B of 6 loads per state showed 0/6 in both**, and one early hit was
`Switched to client rendering because the server rendering errored` — a Turbopack
cold-compile artifact. Correlated with dev-mode first compile, **not** with `reduce`.
Not tested against a production build.

**`npm run verify` — red, none of it from this lane.** The shared tree was moving
mid-run (`Lint` flipped ✗→✓ between runs with no action). Failures: `Typecheck` — 3×
`Cannot find module '@/components/dogfood/DogfoodSurfaceGate'` in
`src/app/{ai,ai-chat,sourcing}/layout.tsx`; `knip` — 11 findings, all in other
sessions' files (`selection-occupancy.ts`, `sidebar-navigation.ts`,
`unbox-right-edge.ts`, …). Lane G's own files: ESLint exit 0, **Unit tests + DS
guards ✓** (including the new `motion-framer-hooks.test.ts`). **No ratchet baseline
raised**; `station-motion-bridge.guard.test.ts` untouched.

### Still open

- **Is disabling the sidebar push toggle under reduce intended?** Behaviour is
  confirmed (snap, not tween); the *intent* is a taste call. Argument for: a width
  reflow is the most vestibularly aggressive motion in the app, and this doc already
  calls the push toggle sanctioned *because* it is user-invoked — not because it must
  survive reduce.
- `CaptureStack` / `MobileFeed` push-up never independently measured.
- No production-build hydration check.
