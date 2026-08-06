# Station rails — coupled left ↔ right resize — HANDOFF

**Status:** DONE — sticky Displays + inverse left↔Displays sash coupling
on Unbox / Arrival / Testing (both rails open). Desk inspectors out of
scope.

**Dev server:** attach to `:3050` — never start / restart / kill.

**Prerequisite (do first if still broken):** this chat left Displays as
`flex-1` with **no** painted `width` (fills leftover beside a ≤720 middle).
That fights sticky drag-resize. Before coupling, restore **sticky** Displays
width (`shrink-0` + inline `width` from `useHorizontalEdgeResize`) so a sash
drag is a real px preference again. Keep middle `max-w-[720px]` / no
`min-w-[720px]`. Do **not** reintroduce `STATION_DISPLAYS_OPEN_SPACER_CLASS`
(that parked a gutter left of the middle). Fix
`unbox-push-gutter.guard.test.ts` if it still asserts the spacer.

---

## Paste this into Claude Code

```
Read docs/todo/station-left-right-rail-coupled-resize-HANDOFF.md end-to-end
before editing.

GOAL (operator-visible) — Unbox · Arrival · Testing only, when BOTH
the left context rail and the right Displays column are open:

1. Drag the Displays leading sash LEFT (Displays wider) → left context
   rail NARROWIS by the same delta (clamped to its min).
2. Drag the Displays sash RIGHT (Displays narrower) → left context rail
   WIDENS by the same delta (clamped to its max / pad).
3. Drag the context rail trailing sash the same way in reverse — right
   Displays width moves inversely.
4. Middle scan column stays ≤720 max (`STATION_WORKBENCH_LOCK_PX`), may
   shrink (`min-w-0`), and stays flush between the two rails (no dead
   gray band between middle and Displays; no spacer gutter left of middle).
5. Widths STICK on release (both rails persist). Closing Displays must
   NOT wipe the context-rail preference; closing/collapsing the context
   rail must NOT wipe the Displays preference.
6. Desk / History RightRailHost inspectors are OUT OF SCOPE — do not
   couple them to CONTEXT_PANEL_RESIZE.

BUDGET (one equation)
  contentRowPx ≈ leftRailPx + middlePx + displaysPx
  middlePx ≤ 720 (and ≥ some small floor under pressure, min-w-0 OK)
  leftRailPx ∈ [CONTEXT_PANEL_RESIZE.minWidthPx, stationCap]
  displaysPx ∈ [STATION_DISPLAYS_MIN_WIDTH_PX, frameCap]

  On Displays drag by Δ:
    displays' = clamp(displays + Δ)
    left'     = clamp(left − Δ)     // inverse
    middle    = contentRow − left' − displays'  (flex / max-720)

  On context-rail drag by Δ:
    left'     = clamp(left + Δ)
    displays' = clamp(displays − Δ)

ROOT CAUSE (current)
- ContextPanelLayout owns left width via useHorizontalEdgeResize
  (storageKey: CONTEXT_PANEL_RESIZE.storageKey) and publishes cost with
  setRightRailContextRail.
- UnboxPushColumn owns Displays width via a SEPARATE
  useHorizontalEdgeResize (per-surface storageKey, e.g.
  unbox-displays-push-width) and publishes setStationPushDemand.
- frame.ts only uses left cost to CAP Displays (capPx); it never WRITES
  back into the context-rail width. Two independent preferences → no
  inverse coupling.

IMPLEMENT
1. Sticky Displays first (if still flex-1 / no width)
   - UnboxPushColumn in-flow: `shrink-0 self-stretch` + style width from
     resize hook (clamped). Middle stays max-w-[720px] grow-0.
   - Guards: in-flow is NOT unconditional flex-1; no
     STATION_DISPLAYS_OPEN_SPACER_CLASS on LineEditPanel / Triage /
     Testing.

2. Shared coupling channel (prefer grow frame store — one SoT)
   - src/lib/right-rail/frame.ts (or tiny sibling module next to it):
     add station dual-rail helpers, e.g.
       applyStationDisplaysDelta(deltaPx)
       applyStationContextDelta(deltaPx)
     that, while stationPushActive && context rail open (not operator-
     collapsed), update BOTH desired widths inversely and persist.
   - Do NOT fork a third localStorage key. Keep writing through existing
     CONTEXT_PANEL_RESIZE.storageKey and the Displays storageKey.

3. Wire writers
   - UnboxPushColumn: on Displays drag (leading edge), call the Displays
     delta helper instead of only setWidth locally — helper updates
     Displays + context.
   - ContextPanelLayout: when pathname is a station surface
     (isStationSurfaceRoute) AND stationPushActive, on trailing-edge
     drag call the context delta helper so Displays moves inversely.
     Desk routes keep today’s solo behavior.

4. Clamps (must not fight)
   - Left: CONTEXT_PANEL_RESIZE.minWidthPx (300); station max via
     stationMaxWidthPadPx (already 0) / frame remaining after middle
     floor + Displays min.
   - Displays: STATION_DISPLAYS_MIN_WIDTH_PX (280); max = frame − leftMin
     − middleMax(720) … or remaining after left' + middle cap — pick one
     documented formula and unit-test it.
   - Never auto-collapse MasterNav; never auto-park context rail.

5. Persist + publish
   - After coupled update: write both localStorage keys; call
     setRightRailContextRail + setStationPushDemand so capPx stays honest.
   - Drag freeze: while isDragging, don’t let the other rail’s
     ResizeObserver / recompute stomp the live pair (same pattern as
     publishedDesireRef on UnboxPushColumn).

6. Guards / tests
   - Pure unit test for the inverse delta helper (table of frame /
     left / displays / Δ → expected clamps).
   - Guard: station hosts do not reintroduce leading spacer.
   - Optional: extend unbox-push-gutter.guard or frame.test.

7. SoT — one short paragraph in
   .claude/rules/source-of-truth.md → Frame column budget:
   “On scan stations, open context rail + Displays widths are inverse-
   coupled on sash drag; middle ≤720 sits between them.”

TEST (attach :3050, QA org)
1. Unbox with context rail open + Displays open (Ticket or Units).
2. Drag Displays sash left → Displays wider, context rail narrower;
   middle stays ≤720; no gray gutter between middle and Displays.
3. Drag Displays sash right → inverse; context widens.
4. Drag context rail trailing sash → Displays moves inversely.
5. Hit left min (300) / Displays min (280) — further drag stops cleanly.
6. Collapse context rail → coupling off; Displays solo resize OK.
7. Close Displays → context width unchanged from last coupled value.
8. Reload — both widths restore from storage.
9. npm run verify (full). Do not raise ratchet baselines.

OUT OF SCOPE
- Desk RightRailHost ↔ context coupling
- MasterNav spine width
- Changing STATION_WORKBENCH_LOCK_PX (720 max)
- Reintroducing leading spacer / packing middle+Displays to far right

DONE WHEN
- Both open → sash on either side redistributes left↔right inversely.
- Widths persist; middle ≤720; no left gutter from spacer; verify green.
```

---

## 1. Symptom (operator)

| Action | Expected | Actual (now) |
|---|---|---|
| Drag Displays wider | Context rail shrinks; middle ≤720 between them | Only Displays changes (or flex-1 ignores drag) |
| Drag Displays narrower | Context rail grows into freed space | Dead gutter / only Displays changes |
| Drag context rail | Displays moves inversely | Only context changes |

## 2. Current code (post-session snapshot)

| File | State |
|---|---|
| [`workbench-layout.ts`](../../src/components/station/workbench/workbench-layout.ts) | Middle `max-w-[720px]` grow-0; no min-720 |
| [`UnboxPushColumn.tsx`](../../src/components/receiving/workspace/UnboxPushColumn.tsx) | In-flow `flex-1` + no width (fills leftover) — **fix sticky resize before coupling** |
| [`ContextPanelLayout.tsx`](../../src/components/sidebar/ContextPanelLayout.tsx) | Solo `CONTEXT_PANEL_RESIZE`; publishes `setRightRailContextRail` |
| [`frame.ts`](../../src/lib/right-rail/frame.ts) | `STATION_PUSH_CENTER_FLOOR_PX = 0`; caps Displays from left cost only — no write-back |

## 3. Target geometry (both rails open)

```
┌─ content row ─────────────────────────────────────────────┐
│ [ context rail ◄sash ][ middle ≤720 ][ Displays sash► ]   │
│         ↕ inverse Δ on either sash                        │
└───────────────────────────────────────────────────────────┘
```

Dragging either sash moves the shared seam so **left + displays** trade
width; middle hugs ≤720 between them.

## 4. Session history (avoid re-litigating)

1. Taste max on Displays (560) blocked grow → removed.
2. Center floor 720 blocked grow → station `centerFloorPx = 0`.
3. Full-bleed middle → operator asked max-720 / no min-720.
4. `flex-1` middle parked surplus **after** Displays → wrong.
5. Leading spacer packed middle+Displays to the right → large gutter
   **left** of middle — operator rejected.
6. Displays `flex-1` fill (no width) — expands, but sash width won’t stick.
7. **This handoff:** inverse-couple left ↔ right on sash drag; sticky
   widths; middle ≤720 between; no spacer.

## 5. Verify

```bash
node --test --import tsx \
  src/lib/right-rail/frame.test.ts \
  src/components/receiving/workspace/unbox-push-gutter.guard.test.ts
# plus any new coupled-delta unit test
npm run verify
```

Attach `:3050`. E2E against QA org only if you touch Playwright.
