# Plan F — DS primitive motion bridge (reduced-motion compliance)

**Lane:** F · fully independent — touches no lane's files, can run immediately and in parallel with A/B/C/D/E
**Date:** 2026-07-31 · `main` @ `1c226847d`
**Size:** three fixes + one deletion. Small, mechanical, no design decisions.

---

## 0. Scope correction — read this first

An earlier note claimed "six DS primitives, fixing one fixes every consumer." **That was wrong on three of the six.** The scan used `grep -rl` on preset names, which also matches doc comments, and did not check consumer counts. Verified per file:

| Primitive | Consumers | Verdict |
|---|---|---|
| `src/design-system/components/Skeletons.tsx` | **12** (`SkeletonList`) | **Fix** — real defect, the only meaningful fan-out |
| `src/design-system/primitives/StaggerReveal.tsx` | 5 | **Fix** — real, different shape (inline variants) |
| `src/design-system/primitives/ChevronToggle.tsx` | 1 | **Fix** — real, trivial |
| `src/design-system/primitives/ExpandableSection.tsx` | **0** | **Delete** — barrel-exported only |
| `src/design-system/components/AnimatedStat.tsx` | 8 | **Leave** — already compliant |
| `src/design-system/components/OverlaySearch.tsx` | — | **Leave** (optional tidy) — not a bridge defect |

Do not "fix" the last two. `AnimatedStat` already calls `useReducedMotion()` and early-returns a static formatted number (`:51`, `:57-68`) — its raw `framerTransition.quantityBump` at `:76` is only reachable on the non-reduced path, which is correct. `OverlaySearch` never imports `motion-framer` at all; its `:31` mention is a stale comment, and its inline transitions are **opacity-only**, so there is no transform to collapse — it is reduce-safe by construction.

---

## 1. Why this matters

`.claude/rules/display/station.md` §9 states that primitives owning entrance motion must route presets through `useMotionPresence` / `useMotionTransition`, and that failing to is a **WCAG 2.3.3 regression** — a `prefers-reduced-motion` user still gets the `y`-slide. `display/motion-crossfade.md` lists this as a known open gap.

Reduced motion is *"replace slides with crossfades,"* not *"no motion"* — and it must be free at the primitive, not re-implemented per call site.

`station-motion-bridge.guard.test.ts` enforces this, but pins only a 7-file allowlist today. Its own doc comment sets the discipline: *"Expand this list only after a file already complies — never add a path that still spreads raw `framerPresence` / `framerTransition` without the bridge."*

---

## 2. The three fixes

### F1 — `Skeletons.tsx` (12 consumers, highest value)

Spreads presets raw in two places:

- `:28-29` — `{...framerPresence.tableRow}` + `transition={framerTransition.tableRowMount}`
- `:55-56` — `{...framerPresence.upNextRow}` + `transition={framerTransition.upNextRowMount}`

Both presets carry a `y` offset, so both slide under reduced motion. Route through `useMotionPresence` / `useMotionTransition`.

**Note the irony worth fixing properly:** these are *loading* skeletons. A reduced-motion user gets slide-in motion from the very component that exists to say "nothing is here yet."

### F2 — `StaggerReveal.tsx` (5 consumers, different shape)

This one does **not** consume presets — it authors its own variants inline with `motionBezier` plus hardcoded durations (`:44`, `:55-61`, `:84`, `:92`, `:106-107`) and has **no reduced-motion handling at all**.

Two-part fix:

1. **Hoist the variants into `motion-framer.ts`** as named presets. Inline motion literals are the drift the SoT exists to prevent (`display/motion-crossfade.md`: *"never re-inline the values"*).
2. Route the new presets through the bridge.

Keep the visual result identical — this is a relocation plus a reduce path, not a re-timing.

### F3 — `ChevronToggle.tsx` (1 consumer, trivial)

`:27` — `transition={framerTransition.upNextChevron}` raw. It animates `rotate`, which is a transform, so reduced motion should collapse it. One-line change via `useMotionTransition`.

## 3. The deletion

### F4 — `ExpandableSection.tsx`

Zero call sites. Referenced only by `src/design-system/primitives/index.ts:15` (`export * from './ExpandableSection'`). Delete the file and the barrel line.

**Do not migrate dead code to the bridge.** If knip does not already flag it, note why in the report — a barrel re-export can mask an unused module, which is itself worth knowing.

---

## 4. Guard work — the point of the lane

Each fixed file joins `REQUIRED_BOTH` (or the transition-only list) in `src/components/ui/station-motion-bridge.guard.test.ts`. **The list only grows, so it becomes a ratchet** and the next primitive cannot regress.

Add entries **only after** the file complies — that is the guard's own stated rule.

## 5. Out of scope

- The other 17 raw consumers from the P1 scan (feature components, not primitives). Separate follow-up.
- `AnimatedStat`, `OverlaySearch` (§0).
- Re-timing any animation. Durations and easings stay exactly as they are.
- The larger question of **baking reduce-to-opacity into the presets themselves** so the bridge becomes unnecessary — that is the better end-state (`display/motion-crossfade.md` says so) but it is a foundations change with a much wider blast radius. Cost it separately; this lane does not attempt it.

## 6. Verification

- `npm run verify` green; **no ratchet baseline raised**.
- `npm run test:ds-guards` green with the expanded allowlist.
- With `prefers-reduced-motion: reduce` set in the browser, each fixed primitive settles with **opacity only — no `y`, no `rotate`, no layout travel**. Verify in the real browser against `:3050` (attach; never start/restart/kill it).
- With reduced motion **off**, animations look unchanged from today. Screenshot or describe both states.
