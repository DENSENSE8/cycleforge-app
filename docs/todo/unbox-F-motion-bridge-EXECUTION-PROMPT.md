# EXECUTION PROMPT — Lane F · DS primitive motion bridge

> Paste below the line into a fresh session at `/Users/icecube/repos/cycleforge-app`.
> **Plan SoT:** [`docs/todo/unbox-F-motion-bridge-PLAN.md`](./unbox-F-motion-bridge-PLAN.md) — the plan wins on conflict.
> **Parallel lane:** F. Independent of A/B/C/D/E — no shared files. Can start immediately.

---

# Cycle Forge — Lane F: reduced-motion compliance for DS primitives

You are Claude Code in the Cycle Forge monorepo. Small, mechanical, no design decisions. **Three fixes and one deletion.** Do not expand scope.

## Mission

Route three design-system primitives through the reduced-motion bridge (`useMotionPresence` / `useMotionTransition`), delete one dead primitive, and ratchet each fixed file into `station-motion-bridge.guard.test.ts` so it cannot regress.

## Read first

1. `docs/todo/unbox-F-motion-bridge-PLAN.md` — SoT, especially §0 (what NOT to touch).
2. `.claude/rules/display/station.md` §9 — the bridge requirement; failing it is a **WCAG 2.3.3 regression**.
3. `.claude/rules/display/motion-crossfade.md` — the motion law + the known gap this closes.
4. `src/design-system/foundations/motion-framer-hooks.ts` (37 lines) — the two hooks.
5. `src/components/ui/station-motion-bridge.guard.test.ts` — the ratchet you extend.

## Do NOT touch

- `src/design-system/components/AnimatedStat.tsx` — **already compliant.** `useReducedMotion()` at `:51` early-returns a static formatted number at `:57-68`; the raw `framerTransition.quantityBump` at `:76` is only reachable on the non-reduced path. Leave it.
- `src/design-system/components/OverlaySearch.tsx` — **not a bridge defect.** No `motion-framer` import; the `:31` mention is a stale comment. Its inline transitions are **opacity-only**, so there is no transform to collapse.
- Any of the other 17 raw consumers (feature components). Separate follow-up.
- Any duration or easing value. **This lane changes no timing.**

---

## F1 — `src/design-system/components/Skeletons.tsx` (12 consumers — do this first)

Two raw spreads:
- `:28-29` — `{...framerPresence.tableRow}` + `transition={framerTransition.tableRowMount}`
- `:55-56` — `{...framerPresence.upNextRow}` + `transition={framerTransition.upNextRowMount}`

Both presets carry `y`, so both slide under reduced motion. Route both through `useMotionPresence` / `useMotionTransition`.

Highest value in the lane — `SkeletonList` has 12 call sites.

## F2 — `src/design-system/primitives/StaggerReveal.tsx` (5 consumers)

**Different shape — read carefully.** It does *not* consume presets. It authors variants inline with `motionBezier` and hardcoded durations (`:44`, `:55-61`, `:84`, `:92`, `:106-107`) and has **no reduced-motion handling at all**.

1. **Hoist the variants into `src/design-system/foundations/motion-framer.ts`** as named presets. Inline motion literals are exactly the drift the SoT exists to prevent.
2. Route the new presets through the bridge.

**Keep the visual result identical.** This is a relocation plus a reduce path — not a re-timing. If a value must change to hoist cleanly, stop and report instead.

## F3 — `src/design-system/primitives/ChevronToggle.tsx` (1 consumer)

`:27` — raw `framerTransition.upNextChevron`. It animates `rotate` (a transform), so reduced motion must collapse it. One-line fix via `useMotionTransition`.

## F4 — delete `src/design-system/primitives/ExpandableSection.tsx`

Zero call sites; referenced only by the barrel at `src/design-system/primitives/index.ts:15`. Delete the file and the barrel line.

**Verify zero consumers yourself before deleting** — do not take the plan's word for it. If you find one, fix it via the bridge instead and report the discrepancy.

---

## Guard work — the point of the lane

After each file complies, add it to `REQUIRED_BOTH` (or the transition-only list) in `src/components/ui/station-motion-bridge.guard.test.ts`.

**Order matters:** make the file comply, *then* add it to the list. The guard's own comment says: *"Expand this list only after a file already complies — never add a path that still spreads raw `framerPresence` / `framerTransition` without the bridge."*

The list only grows. That is what makes it a ratchet.

## Verification

- `npm run verify` green; **never raise a ratchet baseline**.
- `npm run test:ds-guards` green with the expanded list.
- **Prove both motion states in the real browser** against `:3050` (attach; never start, restart, or kill it):
  - `prefers-reduced-motion: reduce` → each fixed primitive settles with **opacity only** — no `y`, no `rotate`, no layout travel.
  - reduced motion **off** → visually unchanged from today.
- Confirm `SkeletonList`'s 12 consumers still render correctly (spot-check three).

## Report back

1. Confirm `ExpandableSection` had zero consumers (or correct me).
2. The preset names you added to `motion-framer.ts` for `StaggerReveal`.
3. Which guard list each file joined.
4. Whether any timing had to change to hoist cleanly — it should not have.
5. Anything in the plan you believe is wrong.

Commit only when asked. Stage only files you changed — other sessions share this tree.
