# Handoff: Station frame resize — elastic-center cascade (Option A + far-rail close)

**Status: COMPLETE + verified live on `:3050`. Uncommitted (user owns commits).**
Supersedes `docs/todo/station-frame-resize-decouple-rails-HANDOFF.md` (that
handoff proposed Option A; this delivered it and grew it two stages further).

## The request (evolved over three operator messages)

1. Original report: *"I should not be able to adjust the left recent rail when I
   move the right panel."* The old model **locked the middle at 720** and made
   Displays a `flex-1` invader, so the two rails were inversely coupled
   (`left + 720 + displays = frame`) — dragging the right Displays sash moved the
   far LEFT rail. Unintuitive; no reference app behaves that way.
2. `/goal`: *"make the sidebar left or right less/more in width, the middle
   expands/shrinks — one sidebar adjustment at a time."*
3. *"if middle is maxed, shorten the left sidebar so the right panel displays
   more."*
4. *"it must be able to close the left or right rail for pushing it more and
   more."*

## The delivered model — the three-stage cascade

The center is now the **single elastic absorber** (`flex-1 min-w-[720px]`, floor
720, no max). Each side sash is a local splitter. There is **no bidirectional
coupling**. Dragging a sash progresses through three stages:

| Stage | Behaviour | Trigger |
|---|---|---|
| **1 — center absorbs** | Drag a sash a little → that rail resizes, the **center flexes**, the **far rail is untouched**. | center above its 720 floor |
| **2 — far rail yields** | Drag FAR (past the point the center floors at 720) → the OPPOSITE rail yields toward its min so the pane keeps growing. | active sash's cap opens to the ladder max; passive rail's cap goes tight and its own resize-clamp shrinks it |
| **3 — far rail closes** | Keep dragging past the far rail's MIN → it CLOSES (context rail parks to a recoverable strip; Displays closes), freeing its full width. | `onOvershootMax` (edge-triggered past `cap + slack`) + the frame-store request bus |

Symmetric both ways. The **LEFT rail is the default authority**, so opening
Displays or narrowing the viewport yields **Displays** (it fits into the
leftover), never the operator's recents rail.

### Verified live (QA sandbox, 1680px viewport, real pointer drag)

Dragging the Displays sash from a clean open rail:

```
open    ctx 360  center 900  disp 420
Stage 1 ctx 360  center 810→720  disp 510→600   (rail untouched)
Stage 2 ctx 300  center 720 floor disp 660        (rail yields to min)
Stage 3 ctx 0 (parked strip)  center ~800  disp 780→928   (rail closed)
```

No horizontal scroll at any point; columns stay flush (no gray band); monotonic
(no jitter). Symmetric Stage 1 confirmed for the context sash (Displays stays
put, center absorbs).

## How it works (architecture)

### The elastic center
- `STATION_CENTER_COLUMN_OPEN_CLASS` = `flex min-h-0 min-w-[720px] flex-1
  flex-col overflow-hidden` — the ONE center class (the locked-720
  `STATION_CENTER_COLUMN_CLASS` variant is **deleted**).
- `StationScanPaneHost` row = `[center flex-1 min-720][utility?][Displays sized
  shrink-0]`. The center eats all leftover, so Displays abuts it with no gray
  band — in flow or (when it overlays) out of it.
- `STATION_WORKBENCH_LOCK_PX` (720) kept its name but is now a **floor**, not a
  lock.

### The directional sash caps (the whole cascade lives here)
`src/lib/right-rail/frame.ts` publishes two reactive caps in its snapshot,
computed from a **single flag** `stationDisplaysSashDragging`:

| | Displays cap | Context cap |
|---|---|---|
| **idle / context drag** | tight `F − leftCost − 720` (Displays yields on open/narrow) | loose `F − DISPLAYS_MIN − 720` (rail is authority) |
| **Displays dragging** | loose `F − looseLeftMin − 720` (ladder max) | tight `F − displaysW − 720` (rail yields) |

`looseLeftMin` = `railOperatorCollapsed ? 32 (strip) : 300 (min)` — so **once the
rail parks (Stage 3), the loose cap grows** from `F − 300 − 720` to
`F − 32 − 720` and the drag flows into the freed space.

Pure helpers: `stationDisplaysSashMaxPx(F, arg)` / `stationContextSashMaxPx(F,
arg)` = `max(paneMin, F − arg − 720)`. The passive rail's own
`useHorizontalEdgeResize` clamp does the Stage-2 shrink reactively (one
directional — active → passive, so no oscillation). There is a ~1-frame lag on
the passive rail (it clamps a frame after the active pane grows); it was
imperceptible in every measured sample.

### The collapse threshold reads the ACTUAL rail cost
`resolveStationDisplaysCollapse` now takes `leftCostPx` (the rail's live resting
cost), not the 300 min — so a **wider-than-min left rail collapses Displays to an
overlay earlier** (`closeAt = leftCost + 720 + 280`), which is required under
decoupling because the left rail no longer auto-yields to make room. Hysteresis
deadband unchanged.

### Stage 3 close = hook overshoot + frame-store request bus
- `useHorizontalEdgeResize` gained `onOvershootMax` + `overshootBeyondPx`
  (edge-triggered, once per upward crossing) — the grow-end mirror of its
  existing drag-past-min `onCollapseBeyondMin`.
- The far rail lives in a **different component** than the sash that closes it,
  so the active sash requests through a tiny emitter in `frame.ts`:
  `requestStationCollapseContext` / `requestStationCloseDisplays` /
  `subscribeStationFarRailRequest`.
  - Displays sash overshoot → `requestStationCollapseContext` →
    `ContextPanelLayout` subscribes → `collapse()` (parks the rail; recoverable
    via the strip).
  - Context sash overshoot → `requestStationCloseDisplays` →
    `StationDisplaysPushColumn` subscribes → `onClose()`.
- The context-rail publish effect now publishes its cost **live during a station
  context drag** (not just on release) so the Displays tight cap shrinks and
  Displays yields as the rail grows. Desk inspectors keep the release-only
  freeze.

## Files changed (all uncommitted, nothing staged)

**Deleted** (the old coupling — its subject is gone):
- `src/lib/right-rail/station-dual-rail.ts`
- `src/lib/right-rail/station-dual-rail.test.ts`
- `src/lib/right-rail/station-yield-ladder.guard.test.ts`

**Code**:
- `src/lib/right-rail/frame.ts` — directional caps, actual-left collapse, the
  request bus, `setStationDisplaysSashDragging`, `stationDisplaysSashMaxPx` /
  `stationContextSashMaxPx`. Removed orphaned getters
  (`getContextRailCostOpenPx`, `getRailOperatorCollapsed`,
  `getRightRailFrameWidthPx`, `getStationPushDesiredWidthPx`,
  `getStationDisplaysCollapsed`).
- `src/components/station/workbench/workbench-layout.ts` — elastic center;
  `STATION_COLUMN_BUDGET` trimmed to the hardMins the auto-close threshold
  consumes.
- `src/components/station/workbench/StationScanPaneHost.tsx` — always-elastic
  center; dropped the collapse subscription.
- `src/components/station/displays/StationDisplaysPushColumn.tsx` — sized/local
  Displays, `stationDisplaysCapPx`, moderate 420 default, drag-state publish,
  overshoot → park context, subscriber for `close-displays`.
- `src/components/sidebar/ContextPanelLayout.tsx` — context cap =
  `stationContextCapPx`, paint from local `width`, live publish during station
  drag, overshoot → close Displays, subscriber for `collapse-context`.
- `src/design-system/hooks/useHorizontalEdgeResize.ts` — additive
  `onOvershootMax` + `overshootBeyondPx`.

**Tests**:
- `src/lib/right-rail/frame.test.ts` — cascade + clamp proofs + directional-cap +
  parked-loose-cap store test (21 tests).
- `tests/e2e/station-frame-resize.spec.ts` — rewritten to the new contract
  (Stage 1 both directions · Stage 2 · Stage 3 · sweep/hysteresis).
- `tests/e2e/unbox-flush-display.spec.ts` — "hugs the lock" → "holds the floor".
- Guards flipped to the new contract: `station-edge-measure.guard.test.ts`,
  `unbox-push-gutter.guard.test.ts`, `context-panel-collapse.guard.test.ts`.

**SoT docs** (surgical, no concurrent-diff overlap): `source-of-truth.md`
(Frame column budget row + block, with all 3 stages), `station-workbench.md`,
`scan-cockpit.md`, `station-port-from-unbox.md`, `AGENTS.md` (Frame width budget
hard law) — all retired "Flex-Grow Sandwich / dual-rail coupling / locked 720"
for "elastic-center cascade".

## Verification

- `npx tsc --noEmit` — **clean**.
- `frame.test.ts` (21) + all affected station/right-rail guards (200) +
  resize-hook consumers (30) — **all pass**.
- `npx eslint` on changed files — **clean**.
- `node scripts/knip-gate.mjs` — **PASS** (my change added zero findings).
- Browser (QA sandbox `:3050`) — full three-stage cascade + symmetric direction
  measured live.
- **Not run**: `tests/e2e/station-frame-resize.spec.ts` in the `qa-desktop`
  Playwright project (needs `pnpm provision:qa-org`). It is updated to the new
  contract; behaviour was hand-verified in the browser instead.

## Open items / follow-ups

- **1-frame passive-rail lag** in Stage 2 (the far rail clamps a frame after the
  active pane grows) is inherent to the reactive one-directional design.
  Imperceptible in every sample; the host `overflow-hidden` clips any sub-frame
  transient. If a hair of clip ever shows on a very fast drag, that's the spot.
- **Context-sash → close-Displays (reverse Stage 3)** calls the Displays
  `onClose` (unmounts the display, navigates `?display=` away) — heavier than
  parking the context rail (which is a recoverable strip). Wired symmetrically
  and unit-tested; only the Displays→context direction was hand-verified in the
  browser. Worth an operator check that closing the whole Displays column from a
  hard recents-rail drag feels right (vs. leaving the context sash to just stop).
- **Persistence of a drag-triggered park**: parking the context rail from a
  Displays overshoot writes `context-panel-collapsed` (consistent with the
  rail's own drag-past-min collapse, which also persists). The rail stays parked
  until the operator clicks the strip. If that surprises operators, make the
  drag-triggered park transient (separate from the localStorage preference).
- The `resolveStationDisplaysCollapse` param rename (`minLeftPx` → `leftCostPx`)
  is reflected in `frame.test.ts`; grep for any external caller before assuming
  none.

## Constraints (still live)

- **Dev server is the user's on `:3050` — attach, never start/kill.**
- **Shared tree with an active concurrent session** editing station files
  (`LineEditPanel`, `ActiveLineConditionSerial`, scan-bar, grid layouts, the
  `.claude/rules/display/*` docs). During this work their WIP twice 500'd the
  `/unbox` route (`onOpenSerial is not defined`) — **that is theirs, not this
  change**. Stage ONLY these files; never `git add -A`; the doc edits above were
  checked against their diff and don't overlap. `station-workbench-chrome-config.ts`
  is theirs (M) — untouched here.
- Stay on `main` (dogfood lane).
