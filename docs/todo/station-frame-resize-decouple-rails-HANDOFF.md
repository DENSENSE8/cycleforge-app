# Handoff: Decouple the Station left rail from the right Displays panel resize

## The report (operator feedback, 2026-08-08)

> "It feels off. I should not be able to adjust the left recent rail when I move
> the right panel."

On a scan station (Unbox · Arrival · Testing), when the **left context/recents
rail** and the **right Displays panel** are both open, dragging the **right
Displays sash** shrinks/grows the **left rail** (and vice-versa). The two rails
are inversely coupled: `left' + 720 + displays' = frame`. The operator is
correct that this is unintuitive — it is not how any mainstream multi-pane app
behaves.

**This challenges an existing SoT law** (the middle "720 lock" +
"Displays flex-1 invader" + dual-rail coupling). Treat it as *pattern
evolution / ask-first*, not a mechanical bug fix — see **Decision required**.

## The industry standard (what every major tool does)

**A divider (sash) resizes only the two panes immediately ADJACENT to it. It
never reaches across a pane to move a non-adjacent one. Exactly one pane is the
"unspecified" / flexible element that absorbs the change — conventionally the
CENTER.** Confirmed by the resizable-splitter literature ("during resizing, the
adjacent panes automatically adjust"; "leave the size of one or more panes
unspecified to let the splitter distribute the available space") and by every
reference app:

- **VS Code** — left primary sidebar · editor · right secondary sidebar/panel.
  The right splitter resizes the **editor + right panel**; it does **not** touch
  the left sidebar. The editor is the elastic middle (with a min width); drag
  past the editor's min and the splitter simply **stops**.
- **Figma / Slack / Linear / Notion / Jira** — left rail · center · right panel,
  same model: each side panel resizes against the center; the center flexes; the
  two side rails are independent.
- **NSSplitView / react-resizable-panels / Allotment / Syncfusion / Kendo
  splitters** — N panes, N−1 dividers; **divider _i_ mutates panes _i_ and
  _i+1_ only**.

**The mental model the operator has (and every app trains): "this handle moves
the thing on either side of it." The current app violates that** — the right
handle moves the *far* left rail.

## Why the current app couples them (the root cause — this is the key insight)

The Station centre (`Primary`, the 720 workbench) is a **hard lock**
(`STATION_CENTER_COLUMN_CLASS` = `w-[720px] min-w-[720px] max-w-[720px]
shrink-0`), and Displays is `flex-1` (fills leftover). With a **rigid centre**,
no sash can be local:

- The centre cannot absorb a drag (it is `shrink-0` at exactly 720).
- So the only elastic surface left for a Displays-sash drag to take/give width
  is the **other rail**.

The coupling (`src/lib/right-rail/station-dual-rail.ts`) is a **mathematical
consequence of locking the middle**, not a free choice. Provably: with `left`,
`center`, `displays` summing to `frame` and `center` fixed, changing `displays`
*must* change `left`. **The only configuration in which the right Displays sash
does NOT move the left rail is one where the CENTRE is the flex element.**

## The fix — Option A (recommended: match the standard; make the centre elastic)

Flip which pane is elastic. Today the centre is locked and Displays flexes;
invert it so the **centre** flexes and both side rails are explicitly sized:

| Pane | Today | Target |
|---|---|---|
| Left context rail | sized, resizable (min 300) | **unchanged** — sized, resizable (min 300) |
| Centre (Primary) | **locked 720** (`shrink-0`, `max-w`) | **`flex-1 min-w-[720px]`** — elastic, floor 720 |
| Displays | **`flex-1`** (fills leftover) | **sized, resizable (min 280)** — its own width state |

Behaviour after the flip — **each sash is local, exactly like VS Code**:

- **Left sash** (rail ↔ centre): resizes the left rail; the **centre absorbs**.
  Displays is untouched.
- **Right sash** (centre ↔ Displays): resizes Displays; the **centre absorbs**.
  The left rail is untouched. ← *this is the operator's ask.*
- The centre grows above 720 when both rails are narrow, and shrinks to its
  **720 floor** when the rails are wide. When the sum would push the centre
  below 720, the sash **clamps** (drag stops) — it never crushes the middle and
  never eats the far rail.
- **Delete the dual-rail coupling entirely** (`station-dual-rail.ts` coupling
  functions + the components' coupling effects).

**Cost / SoT tension:** the centre is no longer *exactly* 720 — it is `≥ 720`.
That relaxes the "middle LOCK 720" law to a "middle FLOOR 720" law. The centre's
content (`STATION_WORKBENCH_COLUMN`, edge-to-edge) already renders fine at any
width ≥ 720 (it is `flex-1` today whenever Displays is closed), so the practical
impact is only that the centre can be *wider* than 720 when there is slack. This
is the standard behaviour and is almost certainly what the operator expects.

## The fix — Option B (fallback: keep the exact-720 lock; single resizable rail)

If the product genuinely must keep the centre pinned at **exactly** 720 (not a
floor), then the only standard-compatible option is to make Displays
**non-resizable** (auto-fill) and expose **one** sash — the left rail's own:

- Left rail: sized, resizable (min 300) — its sash is adjacent to it (local).
- Centre: locked 720.
- Displays: `flex-1` fill, **no resize sash**.

There is only one draggable rail (the left), so there is no "right panel drag"
to feel wrong; Displays simply fills `frame − left − 720`. Downside: operators
cannot independently size Displays (to make it narrower they widen the left
rail). This preserves the 720 law at the cost of Displays resizability. **Do not
ship a right Displays sash under Option B** — a right handle that resizes the
left rail is the exact thing being removed.

## Decision required (ask the user before implementing)

This touches a **core SoT law** (`source-of-truth.md` → *Frame column budget* /
*Depth elevation*; `display/station-workbench.md` → *Flex-Grow Sandwich*; the
`STATION_WORKBENCH_LOCK_PX` = 720 lock). Do not silently change it. Ask:

1. **Centre: `= 720` (fixed) or `≥ 720` (floor)?** Option A needs a floor;
   Option B keeps it fixed. Recommend **A (floor)** — it is the industry standard
   and directly answers the operator's complaint while keeping both rails
   independently resizable.
2. Confirm the SoT-law edits (below) are in scope — this is a law change, so it
   is *ask-first* per `pattern-evolution.md`.

## What to KEEP vs REMOVE from the just-shipped work (commit `3f7edbba8`)

The prior commit built the yield-ladder + coupling. Most of it is reusable; the
**coupling** is the part that goes.

**Keep (still correct, and Option A still needs it):**
- The **auto-close / hysteresis → overlay collapse** (`resolveStationDisplaysCollapse`
  + the reactive `stationDisplaysCollapsed` store slice + `overlay = expanded ||
  stationDisplaysCollapsed` + centre-fill in `StationScanPaneHost`). When the
  frame is too narrow to seat rail + centre-floor + Displays-min, Displays
  yields to an overlay and the centre fills — this is exactly the M3
  supporting-pane collapse and is orthogonal to the coupling. **Under Option A
  the collapse condition becomes `frame < leftMin + centreFloor(720) +
  displaysMin`, unchanged.**
- The **flush / no-gray-band** invariants (columns abut; middle never crushed).
- `STATION_COLUMN_BUDGET` (the hardMin/preferred/shrinkPriority tuples) — the
  yield ladder is still the width-clamp model; only the *coupling* leaves.
- The Playwright spec `tests/e2e/station-frame-resize.spec.ts` — **update** the
  "inverse-coupled" assertions (drag right → left shrinks) to the new contract
  (drag right → **left is UNCHANGED**, centre absorbs). Keep the flush /
  middle-floor / hysteresis / no-h-scroll assertions.

**Remove (the coupling that the operator flagged):**
- `station-dual-rail.ts` coupling bus: `applyStationDisplaysDelta`,
  `applyStationContextDelta`, the coupled snapshot store (`subscribeStationCoupled`
  / `getStationCoupled` / `publish`), `isStationDualRailCouplingActive`,
  `registerStationDisplaysStorageKey`. (Keep `resolveStationYieldLadder` /
  `stationLadderMax*` only if the new clamp logic still uses them; otherwise
  delete.)
- The coupling effects in `StationDisplaysPushColumn.tsx` (the
  `applyStationDisplaysDelta` drag effect + the `coupled` sync effect) and in
  `ContextPanelLayout.tsx` (`applyStationContextDelta` drag effect + the
  `coupled` sync effect + `paintWidthPx` / `liveCoupledLeftPx` — paint-from-
  coupled exists only to hide the coupling's cross-component lag; with no
  coupling it is unnecessary, and ContextPanelLayout paints from its own local
  `width` again).
- `contextCouplingMaxPx` (the ladder-max cap on the context sash) — under Option
  A the context sash is a plain local splitter against the elastic centre.

## Implementation (Option A) — concrete steps

1. **`workbench-layout.ts`** — centre class becomes elastic:
   `STATION_CENTER_COLUMN_CLASS` → the same shape as
   `STATION_CENTER_COLUMN_OPEN_CLASS` (`flex min-h-0 min-w-[720px] flex-1
   flex-col overflow-hidden`). The two center classes likely collapse into one.
   Rename `STATION_WORKBENCH_LOCK_PX` semantics to a **floor** (or add
   `STATION_CENTRE_FLOOR_PX`). `STATION_PUSH_CENTER_FLOOR_PX` in `frame.ts` is
   already a *floor* and stays.
2. **`StationDisplaysPushColumn.tsx`** — Displays becomes an explicitly-sized,
   locally-resizable panel: paint `width: layoutWidth` in-flow (not `flex-1`),
   `min-w [280]`, and keep its leading-edge sash resizing **itself** (no
   coupling writes). Its `maxWidth` = `frame − leftRailWidth − 720` (so it
   cannot push the centre below its floor); when it would exceed that, the sash
   clamps. Update the guard `station-edge-measure.guard.test.ts` (it currently
   *requires* `min-w-0 flex-1 self-stretch` on Displays and *bans* explicit
   widths — that ban was to prevent the `ml-auto` gray band; the new sized
   Displays must still ABUT the centre with no gap, which the guard should now
   assert instead).
3. **`StationScanPaneHost.tsx`** — the host row is now `[left][centre flex-1
   min-720][Displays sized]`; the centre naturally absorbs. Keep the
   collapsed→overlay + centre-fill path.
4. **`ContextPanelLayout.tsx`** — revert to painting the context rail from its
   own local `width`; drop the coupled-sync + paint-from-coupled + coupling
   maxWidth. Keep the operator collapse (⌘/Ctrl+B) — **note:** a concurrent
   session added that; coordinate.
5. **`frame.ts`** — keep the collapse slice + budget; the `capPx` math already
   reserves the centre floor. Drop any coupling getters no longer used.
6. **`station-dual-rail.ts`** — delete the coupling bus; keep the pure ladder
   only if the clamp math reuses it.
7. Update the SoT laws: `.claude/rules/source-of-truth.md` (Frame column budget
   → "middle FLOOR, elastic centre, local sashes, rails independent"),
   `.claude/rules/display/station-workbench.md` (retire "Flex-Grow Sandwich" /
   "Displays flex-1 invader" / dual-rail coupling), and
   `.claude/rules/display/motion-crossfade.md` if it references the coupling.

## Verification

- Unit: rewrite `station-dual-rail.test.ts` / `station-yield-ladder.guard.test.ts`
  for the new clamp model (drag right → left constant; centre = frame − left −
  displays, floored at 720; sash clamps at the floor). Keep the collapse
  hysteresis test.
- **Playwright (QA org, `qa-desktop`, attach to the running `:3050`)** — reuse
  `tests/e2e/station-frame-resize.spec.ts`, changing the coupling assertion to:
  dragging the **Displays** sash leaves `context.width` **unchanged** (±1px) and
  moves the **centre** instead; dragging the **context** sash leaves
  `displays.width` unchanged and moves the centre; both stay flush; the centre
  never drops below 720; sweep-collapse + hysteresis unchanged. Verify no jitter
  (monotonic) and no gray band, same as before.
- `npm run verify` before done; never raise a ratchet baseline. Report which
  reds are a concurrent session's.

## Constraints (read `.claude/rules/workflow-safety.md`)

- **The dev server is the user's and runs on `:3050` — attach, never start/kill.**
- **Shared working tree with an active concurrent session** editing this exact
  area (`src/components/station/displays/*`, `LineEditPanel.tsx`,
  `ContextPanelLayout.tsx` — the ⌘/Ctrl+B toggle is theirs). Stage ONLY your own
  files; never `git add -A`; commit only when asked. `ContextPanelLayout.tsx` in
  particular carries their uncommitted ⌘B work — do not sweep it.
- Stay on the checkout's branch (`main`, the dogfood lane). No ad-hoc branches,
  no `git stash`.
- Baseline is commit `3f7edbba8` (the yield-ladder + coupling this handoff
  partly unwinds).

## Sources

- Syncfusion — [Resizing panes in React Splitter](https://ej2.syncfusion.com/react/documentation/splitter/resize)
  ("during resizing, the adjacent panes automatically adjust their dimensions").
- Kendo UI for Angular — [Splitter panes](https://www.telerik.com/kendo-angular-ui/components/layout/splitter/panes)
  (min/max per pane; one unsized pane absorbs the remaining space; VS-Code-style layouts).
- [Creating Resizable Split Panes from Scratch](https://blog.openreplay.com/resizable-split-panes-from-scratch/)
  (a divider mutates the two panes it sits between).
