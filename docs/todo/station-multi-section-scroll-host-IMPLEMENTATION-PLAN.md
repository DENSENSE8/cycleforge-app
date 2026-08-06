# Implementation plan — Station multi-section scroll host (work-tree split + Gemini tuning validation)

**Status:** Plan, 2026-08-04. Downstream of
[`station-multi-section-scroll-host-RULING.md`](./station-multi-section-scroll-host-RULING.md)
(terminal for the product/CSS/idiom decisions) and
[`station-multi-section-scroll-host-MOTION-FINDINGS.md`](./station-multi-section-scroll-host-MOTION-FINDINGS.md)
(terminal for the Motion API mechanics). This doc does two things the ruling did not:

1. **Validates the SECOND Gemini pass** — the motion-tuning deep-dive (150ms duration, `cubic-bezier(0.2,0,0,1)`, dual-motion split, mobile constants, the typed-override table). This is a *different, later* Gemini response than the one folded into the ruling, and it does **not** survive validation cleanly.
2. **Translates the ruling into per-lane, per-file diffs** across the worktree split, so an engineer knows exactly what lands where.

**One-line headline:** almost nothing in the pasted Gemini tuning table should be applied. It is working from a **stale 2026-08-03 snapshot** in which the Smart Stack z-depth pile was still shipped; the deck went **flat** on 2026-08-03, so several recommendations validate a decision already made, one targets a **dead constant**, one has **app-wide blast radius**, and the duration figure was **already explicitly overruled** by the ruling. The only genuinely-live change is the isolated `layoutScroll` fix, which the ruling already flagged.

---

## A. Validation of the pasted Gemini motion-tuning pass

Each claim → verdict → evidence (file:line or ruling section). Verdicts: **SHIPPED** (already done, no action) · **OVERRULED** (ruling already decided against) · **WRONG-BASELINE** (factual error) · **BLAST-RADIUS** (would retune unrelated surfaces) · **NO-TARGET** (nothing to change) · **ACTIONABLE**.

| # | Gemini claim | Verdict | Evidence |
|---|---|---|---|
| §1 | Strip watchOS z-depth pile → flat single-column ledger (Linear / iOS Setup Assistant) | **SHIPPED** | `ProcedureDeck.tsx:22-23` docblock: *"No `layout="position"` / height FLIP on faces."* `source-of-truth.md` → Step-advance feedback (flat foundation): faces stay 40px, outline moves, evidence band crossfades. Decision made 2026-08-03; Gemini is corroborating it. Its named refs are fine provenance, not an action. |
| §1 detail | "Maintain the 14px peek and focus expansion" | **OVERRULED (further than Gemini knows)** | The flat foundation **retired peeks entirely** — `source-of-truth.md`: *"Retired on this surface: … peeks, covered tuck, crown scrub."* Gemini is a step behind: it wants to keep a `0.875rem` peek the repo already deleted. |
| §2 | Duration 360ms → 150ms | **WRONG-BASELINE + OVERRULED + dead target** | (a) Baseline is **`0.55s`**, not 0.36s — `motion-framer.ts:106` `procedureStackLayout: 0.55`. (b) Ruling correction #3 already rejected the 150–200ms figure as *"an unverified guess where the house already has a named, battle-tested number,"* ruling **reuse `motionRole.push.rail` (0.24s)** for the Section Host maximize. (c) `procedureStackLayout` is **no longer consumed by the deck** — `ProcedureDeck.tsx:103-104` uses `procedureFocusBody` + `procedureFocusBodyMount`; the only refs to `procedureStackLayout` are its own definition + the deferred `procedure.advance` role. |
| §2 | Curve → `cubic-bezier(0.2,0,0,1)` on `motionBezier.layout` (correctly reads current as `0.25,0.1,0.25,1`) | **BLAST-RADIUS** | `motionBezier.layout` (`motion-framer.ts:11`) is consumed by `push.rail` → `ContextPanelLayout`, `SidebarNavColumn`, `RightRailHost`; plus `sidebarNavColumnMount`, `detailStackOverlayMount`, `PoLineRow`. Changing it retunes **every push column and sidebar in the app** to serve one unbuilt surface. Reject. |
| §3 | Content **exit 0ms** (keep) | **SHIPPED** | `swap.scan` exit carries its own `duration: 0` — `roles.ts:48-52` (station-cadence contract, must not be normalised). Already correct. |
| §3 | Content **enter 100ms** crossfade | **SHIPPED (≈, and deliberately shared)** | Deck evidence-band enter = `procedureFocusBodyMount` → `duration: framerDuration.stationCartonSwap` = **0.12s / 120ms** (`motion-framer.ts:233`). Within 20ms of Gemini's guess and **tied to the shared station-cadence constant on purpose**. Forking it to exactly 100ms buys an imperceptible 20ms at 3ft and breaks the one-station-cadence-number rule. No action. |
| §3 | Crown scrub: transform+opacity only, zero scale | **SHIPPED / moot** | Crown scrub was **retired** with the flat foundation (`source-of-truth.md`). Nothing to tune. |
| §4 | Mobile `/m/unbox` bottom-sheet + 250ms ease-out / spring(300,30) | **NO-TARGET** | `/m/unbox` **does not exist** — no `src/app/m/**`. House rule (`station.md` §10) is *"the same Station on `MobileShell` via `ScanInput`,"* not a parallel client. This is greenfield guidance with nothing to diff; also collides with the "one Station, two terminals" law. Do not stand up a second client to satisfy it. |
| §5 | Prominence: deck hero + right checklist map (VS Code editor+minimap, Stripe main+timeline) | **SHIPPED** | Already ruled (`source-of-truth.md` prominence). Caveat: on **main** the deck is *parked* (PO lines + label centre), so "deck is hero" is an **unbox-work-lane** truth today. |
| §6 | Reduced motion = 100ms opacity fade, not hard cut | **SHIPPED** | The app-wide `MotionConfig reducedMotion="user"` floor already snaps transforms while **opacity keeps animating** (`motion-crossfade.md`, verified frame-by-frame). The degraded form is already a crossfade, not a cut. No action. |
| §7 table | `framerDuration.procedureStackLayout 0.36→0.15` | **REJECT** | Dead constant + wrong baseline + overruled (see §2). |
| §7 table | `motionBezier.layout → (0.2,0,0,1)` | **REJECT** | Blast radius (see §2). |
| §7 table | `PROCEDURE_STACK_LAYOUT_MOTION` "keep channels, update duration/ease" | **REJECT** | The margin-top/height CSS channels were **retired** in the flat foundation. Targets deleted code. |
| §7 table | Mobile dock settlement 250ms | **DEFER** | No target (§4). |
| §7 table | Reduced motion 100ms fade | **CONFIRM** | Already the floor's behavior (§6). |

**Net:** apply **zero** rows of Gemini's override table. The pass is useful only as *independent corroboration* that the flat-ledger direction and the "named-fixed-rem clearance / no ResizeObserver" call (already in the ruling) were right.

---

## B. Work-tree split — who owns what

The worktree split is the load-bearing fact Gemini could not see. Current lanes (`git worktree list`):

| Lane | Path | Relevance |
|---|---|---|
| **main / WS-DOGFOOD** | `cycleforge-app` (this checkout) | Ships **PO lines + label** centre — the deck is **parked** here (`source-of-truth.md` → Unbox centre (main), 2026-08-04). Owns the **shared** `StationWorkbench` shell + the **pinned law** (ruling already landed in `ui-design-system.md` + `station-workbench.md`). |
| **unbox-work** | `cycleforge-unbox` @ `e627e3d3e` [unbox-work] | Owns the **guided `ProcedureDeck` / step dock** (`source-of-truth.md`: *"Guided ProcedureDeck … continues on the `unbox-work` lane"*). The **Section Host (Items + Procedure, one floor owner) is intrinsically an unbox-work feature** — main does not render Items + deck as siblings. |

**Consequence:** the Section Host component build belongs on **unbox-work**, not main. The only main-lane change is the shared-shell `layoutScroll` fix (which every station composing `StationWorkbench` benefits from, and which the ruling already said to file independently).

---

## C. Lane A — main / WS-DOGFOOD (this checkout): ONE isolated fix

**Scope:** the pre-existing `layoutScroll` defect. Not gated on the Section Host; do **not** bundle it into any Section Host PR (ruling "Independent follow-up").

**File:** `src/components/station/workbench/StationWorkbench.tsx:142`

```tsx
// BEFORE
<div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">

// AFTER — promote the scroll port to a motion element and measure its scroll offset,
// matching the five existing correct call sites (DateGroupHeader, ChipColumns,
// SwimlaneBoard ×2, OrdersQueueTableRow).
<motion.div layoutScroll className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
```

**Why (Motion findings §1.4):** `ProcedureDeck` (and any future `layout` child) animates inside this exact port; without `layoutScroll` Motion is blind to the port's scroll offset and mis-projects layout math. Verbatim doc: *"For layout animations to work correctly within scrollable elements, their scroll offset needs measuring… Add the `layoutScroll` prop."*

**Watch-outs:**
- Import `motion` from `@/design-system/motion` (the barrel) — never `motion/react` directly (motion import-boundary guard).
- Confirm nothing depends on this element being a plain `<div>` (ref typing, a `data-` attr, a direct DOM query). It's a structural wrapper, so this should be mechanical.
- This element is a shared shell used by Testing / Triage / Shipping / Pack / Pickup too — the fix is correct for all of them (any `layout` child inside any station body).

**Verify:** `npm run verify`; then browser-check one station whose body has `layout` children.

---

## D. Lane B — unbox-work (`cycleforge-unbox`): build `StationSectionHost` per the ruling

**Scope:** the actual multi-section scroll host (Items reference ⇄ Procedure deck, one floor owner above the dock). Build it in the `../cycleforge-unbox` checkout, on `unbox-work`.

### D.1 Mechanism (settled — do not re-derive)

- **Sections are siblings**, each a `motion.div layout` flex/grid item, wrapped in **one `LayoutGroup`** (Motion findings §2.2). Floor ownership = a single `activeId` state (Radix `Accordion.Root type="single"` shape — one value, one setter, `isOpen = activeId === id`) flipping a class/style (`flex-grow:1` vs collapsed chrome row).
- **NOT** `layoutId` / shared-element / full-screen modal (Motion findings §2.1 — App Store example is the wrong grammar; violates non-modal Kinetic Ledger law).
- **NOT** `AnimatePresence popLayout` — sections never unmount (Motion findings §2.4).

### D.2 Motion (settled — use the existing role, ignore Gemini's 150ms)

- Section maximize/collapse tween = **`motionRole.push.rail`** (tween on `motionBezier.layout`, **0.24s**) — ruling correction #3. It is defined for exactly this job: *"a panel that makes room for itself… a sibling measures against the resulting size."*
- **Do NOT** add a `motionRole.section.maximize`, and **do NOT** retune `procedureStackLayout` or `motionBezier.layout`. If 0.24s genuinely reads wrong once built, open a *new* motion-role decision with a measured A/B (the Motion+ transition editor is available) — not a silent divergence.
- Reduced motion: free from the `MotionConfig` floor (transforms snap, opacity fades). No per-site wiring.

### D.3 CSS contract (settled — from the ruling, now law in `ui-design-system.md`)

```css
/* Host: rigidly constrained, min-height:0 on BOTH levels */
.section-host { display:flex; flex-direction:column; height:100%; min-height:0; }
.section-floor-active { flex:1 1 auto; min-height:0; overflow-y:auto; }
```

- **Outer `StationWorkbench` port goes `overflow-hidden` while a section is immersive** (dual-port ban, Slack/Discord precedent — ruling #4). Only one active scrollport on the axis, ever.
- **No `scroll-padding-bottom` dependency.** Keep the focus target above the dock with a **physical trailing spacer element** sized to `STATION_TERMINAL_PAGER_SCROLL_CLEARANCE` (10rem) + `justify-end` (ruling correction #1 — open Chromium bugs 40055750 / 365913982 make `scroll-padding` + `scrollIntoView` unreliable under a covering dock).
- **Focus card is NOT `sticky`** — `sticky` is bounded by its containing block and stops at the block edge (ruling #5). Spacer + `padding-bottom` + `justify-end` holds the resting position.
- **The immersive floor that hosts the deck MUST carry `layoutScroll`** (same rule as Lane A, one level in) — it hosts `layout`-animated content.

### D.4 Chrome + a11y (settled)

- Collapsed section chrome ≥ **56px** (`3.5rem`), never a bare 40px strip (Fitts's-Law hazard above the dock — Spotify/iOS Mail precedent, ruling #10). Give it a clear state change or a "Back to Procedure" chevron.
- Expand trigger is **keyboard-reachable** (Tab/Enter, WCAG 2.1.1) but **never steals focus** — no `.focus()` into the expanded section; the wedge scanner keeps focus (ruling #8 + `instrument-panel.md`). Every pointer control hands focus back (`receiving-focus-scan`).

### D.5 Deferred to the engineer at the component (ruling "Not pinned")

- Where collapsed Procedure chrome sits when Items is immersive (above / below / thin strip).
- Exact spacer sizing — tie to the **same** clearance rem token, not a second constant.

### D.6 Do-NOT-touch on this lane

- `motionBezier.layout`, `framerDuration.procedureStackLayout`, `framerTransition.procedureStackLayout`, `motionRole.procedure.advance` — all **deliberately retained-but-parked** in the catalog (`roles.ts`: *"Keep the role in the catalog"*). Not dead code to delete, not constants to retune. Leave them.
- The flat deck (`ProcedureDeck`) internals — the Section Host wraps the deck; it does not modify the deck's own step-advance feedback (already flat + shipped).

---

## E. Verification gates (both lanes)

- `npm run verify` (lint, typecheck, DS ratchets, knip, route-auth, schema drift).
- Motion import-boundary guard (`motion-major.guard.test.ts`) — any new `motion.div` imports from the barrel.
- E2E asserts against the **QA org**, not dogfood.
- Section Host specifically: a test that proves **exactly one active `overflow-y-auto`** on the axis in immersive mode, and that the focus target's `getBoundingClientRect().bottom` clears the dock's `top` (geometric proof, not screenshot — `verify.md`).

---

## F. Summary — what actually changes

| Lane | Change | Files |
|---|---|---|
| main / WS-DOGFOOD | Add `layoutScroll` to the shared station scroll port (isolated, ships now) | `StationWorkbench.tsx:142` |
| unbox-work | Build `StationSectionHost` per §D (push.rail 0.24s, `LayoutGroup`+`activeId`, definite-height CSS, spacer not sticky, 56px chrome, no focus steal) | new `StationSectionHost.tsx` + Unbox composition |
| **neither** | **Apply any row of Gemini's override table** | — (all rejected, §A) |

Provenance chain: research briefs → `MOTION-FINDINGS.md` → `RULING.md` → **this plan**. Nothing here reopens the ruling; it validates a later tuning pass against it and lands the ruling on the correct lanes.
