# Costing — bake reduce-to-opacity into the presets vs. hand-migrate to the bridge

**Date:** 2026-07-31 · `main` @ `1c226847d`
**Question:** is it cheaper to bake reduced-motion into the motion SoT than to migrate 23 files to `useMotionPresence` / `useMotionTransition`?
**Answer:** yes — but not by rewriting the presets. **framer-motion already ships the mechanism and we do not use it.**

---

## 0. The finding that decides this

`<MotionConfig reducedMotion="user">` is available in the installed `framer-motion@^12.42.2` (confirmed in `node_modules/framer-motion/dist/index.d.ts`) and appears **nowhere in `src/`**.

It makes framer itself honor `prefers-reduced-motion` for **every `motion.*` component in the tree** — disabling transform and layout animations while preserving opacity. That is literally "bake reduce-to-opacity in," implemented by the library, at **one mount point**.

**Mount point:** `src/app/layout.tsx` (the provider stack begins at `:101`).

---

## 1. Why rewriting the presets does not work

Three shapes were considered and rejected before landing on MotionConfig:

| Approach | Why it fails |
|---|---|
| Make presets **functions** — `framerPresence.stationCard(reduced)` | Breaking API change across **46 presence entries** × every consumer. Strictly more work than migrating 23 files. |
| Express reduction in **CSS** `@media (prefers-reduced-motion)` | framer writes inline transform styles via JS/WAAPI. A media query cannot override an inline style framer owns. Does not work. |
| A **module-level reactive store** the presets read | React will not re-render on a module mutation, so toggling the OS setting mid-session yields stale values; reading mutable external state during render violates React's rules (needs `useSyncExternalStore`); and SSR has no preference to read, so it hydration-mismatches. |

The presets are plain objects. Making a plain object reduce-aware requires either a hook or a context — and framer already provides the context.

---

## 2. Cost comparison

| | **Hand-migrate to the bridge** | **MotionConfig at root** |
|---|---|---|
| Files edited | ~20 (3 primitives + 17 feature files) + guard list per file | **1** |
| Lines | several hundred | **~5** |
| Coverage | only files someone remembers to migrate | **every framer `motion.*` in the app, present and future** |
| New code | can regress until added to the guard list | **covered by default** |
| API break | none | none |
| Verification | per file | one sweep |

The guard (`station-motion-bridge.guard.test.ts`) is a **ratchet, not a rule** — it pins only files already on its 7-entry list. It cannot catch a new component. MotionConfig makes compliance the default and the guard becomes a backstop for surfaces wanting *stronger* reduction.

---

## 3. MotionConfig is also *more correct* than the current bridge

This is not only cheaper. Two places where the hand-rolled bridge is semantically worse:

### 3.1 `useMotionTransition` returns `{ duration: 0 }` — an instant cut

Reduced motion is *"replace slides with crossfades,"* **not** *"no motion"* — stated in `.claude/rules/display/motion-crossfade.md` and in Apple HIG. The current bridge produces a hard cut; MotionConfig keeps opacity animating at its normal duration, i.e. an actual crossfade.

### 3.2 `useMotionPresence` discards `height`

It returns a flat `{ initial:{opacity}, animate:{opacity}, exit:{opacity} }` (`motion-framer-hooks.ts:28-36`). Applied to `framerPresence.collapseHeight` or `sidebarSection` — both `{height:0} → {height:'auto'}` — the height keys vanish, so the element no longer collapses at all; it fades while holding full height, and on exit holds its box until unmount.

`collapseHeight` is the **one sanctioned height animation** in the house rules. MotionConfig preserves it (height is not a transform) while still killing the slide. That is the documented intent; the current bridge over-reduces.

---

## 4. What MotionConfig does NOT cover

Honest gaps — none of them block the change, but do not claim total coverage:

| Gap | Files | Disposition |
|---|---|---|
| **`motion-plus` `AnimateNumber`** — separate package, separate context | `AnimatedStat.tsx` only | Already handles reduce manually (`:51`, early-returns a static number). **No action.** |
| **GSAP** | `card-fan-carousel.tsx:4` (sole consumer) | Outside framer entirely. Needs its own `useReducedMotion` gate — small, separate. |
| **Tailwind CSS `animate-*`** (`animate-pulse` / `-spin` / `-bounce`) | **289 files** | CSS animations, not framer. Mostly loaders/skeletons where a spinner is a status indicator, not vestibular motion. Address with `motion-safe:` / `motion-reduce:` variants **only where it is decorative** — do not sweep 289 files. |

---

## 5. Risks to verify empirically (do not trust the docs)

1. **Already-bridged files change behavior.** The 7 guard-listed files currently get an instant cut; under MotionConfig they crossfade. Different — arguably better (§3.1) — but it is a visible change and needs a look.
2. **Double reduction is harmless but redundant.** A bridged file under MotionConfig gets `duration: 0` from the bridge *and* framer's reduction. No bug; just dead code once MotionConfig lands.
3. **Layout animations get disabled globally.** That includes `CaptureStack`/`MobileFeed`'s `layout="position"` push-up — which already sets `layout={false}` under reduce, so it is consistent — and the **sanctioned push toggles** (sidebar nav column width, photo details drawer). Those are deliberate layout animations per `motion-crossfade.md`; disabling them under reduce is probably right, but confirm it is intended.
4. **SSR / first paint.** MotionConfig reads the media query client-side, same as today's `useReducedMotion`. No regression, but confirm no hydration warning.
5. **Prove the mechanism before relying on it.** Set `prefers-reduced-motion: reduce` in the browser and confirm a *known-unbridged* component (e.g. `CommandBar`) stops translating. If it does not behave as documented, this whole costing collapses — verify first, migrate after.

---

## 6. Recommendation

**Do MotionConfig first, keep the bridge as an escape hatch.**

1. **Mount `<MotionConfig reducedMotion="user">`** at `src/app/layout.tsx`. Verify per §5. This is the floor for the entire app.
2. **Re-scope Lane F.** Its three fixes become optional polish rather than WCAG remediation — MotionConfig already covers them. **The `ExpandableSection` deletion still stands** on its own merit (dead code, zero call sites).
3. **Cancel the 17-file follow-up** as a compliance exercise. It was buying coverage MotionConfig gives for free.
4. **Keep `useMotionPresence` / `useMotionTransition`** for surfaces needing *stronger-than-default* reduction — suppressing an animation entirely rather than crossfading it. Fix §3.2's height-discarding bug while there.
5. **Gate GSAP** in `card-fan-carousel.tsx` separately.
6. **Update `.claude/rules/display/motion-crossfade.md`** — its "residual raw consumers" gap note and the "new animated code must call the hook bridge" instruction both become wrong once MotionConfig is the floor. Rules that describe a superseded mechanism are worse than no rules.

**Net:** ~20 file edits collapse to 1 mount + 1 deletion + 1 GSAP gate + 1 rules update, with strictly better coverage and more faithful reduced-motion semantics.
