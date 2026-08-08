# Unbox station — Displays resize + middle detach — HANDOFF

**Status:** SUPERSEDED (2026-08-07) — operator feedback: always-expanded
Displays (`flex-1` fill leftover) beats detach/`ml-auto` gray band. SoT is
now flush-always sandwich; see Frame column budget + `UnboxPushColumn`.

**Dev server:** attach to `:3050` — never start / restart / kill.

---

## Paste this into Claude Code

```
Read docs/todo/unbox-station-middle-detach-displays-resize-HANDOFF.md end-to-end
before editing.

GOAL (operator-visible)
1. Drag-resize the Unbox / Arrival / Testing right Displays panel and have the
   width STICK (not spring back / not look stuck).
2. When Displays is open and resized SMALLER than leftover frame, the MIDDLE
   scan column DETACHES — sunken gutter appears between the locked ~720 middle
   and Displays. Middle content stays centered (mx-auto / justify-between on
   identity) — never left-glued to Displays.
3. When Displays is CLOSED, middle stays one centered 720 measure with equal
   gutters; PhotoPeek stays absolute right-0 of the center column (pane edge).
4. When Displays is OPEN at its preferred/max width, flush hairline is OK
   (no forced gray gap) — but resize-smaller MUST reveal gutter (detach).
5. PhotoPeek always pinned to the trailing edge of the CENTER column
   (Displays seam when open, pane edge when closed) — never left behind in
   the middle of a gutter, never overlaid on Displays.

ROOT CAUSE (current code)
UnboxPushColumn in-flow class is `flex-1 self-stretch` with inline `width`
from useHorizontalEdgeResize. Flex-grow eats surplus after the locked 720
center, so:
  • Dragging Displays narrower still leaves it visually filling the right
    half (flex-1 grows back into free space) — "can't adjust the right panel".
  • Middle never detaches — no sunken gutter between center and Displays.

Earlier session briefly tried shrink-0 + host justify-between (gutter when
open). Operator then said "no gutter when the right panel is open" + keep
middle centered + PhotoPeek pinned right — that was interpreted as full
revert to flex-1. Correct synthesis: flush when Displays wants full leftover;
DETACH (shrink-0 / no flex-grow) when operator has resized below leftover so
a gutter can appear. Do NOT reintroduce host justify-between that parks
Displays at the far right with a giant empty band by default on first open.

IMPLEMENT
1. UnboxPushColumn (src/components/receiving/workspace/UnboxPushColumn.tsx)
   - In-flow: stop unconditional flex-1 grow. Prefer shrink-0 (or flex-none)
     so `width` from useHorizontalEdgeResize is the painted width.
   - On first open / default width: still allow filling leftover IF desired
     width >= available (capPx path) — OR set default desire to fill then
     shrink-0 after drag. Pick one clear rule; document it in the file.
   - Keep leading-edge HorizontalEdgeResizeHandle; min =
     STATION_DISPLAYS_MIN_WIDTH_PX (280); respect frame capPx.
2. LineEditPanel host (data-unbox-pane-host)
   - Do NOT use showDisplays && justify-between as the default open layout
     (that forced a permanent gutter). Use normal flex row: center locked
     720 + Displays at resized width; leftover sunken space is the gutter
     (justify-start is fine — gutter sits between or after Displays
     depending on order; prefer [center][gutter][Displays] via
     ml-auto on Displays OR margin-left:auto on the push aside so Displays
     stays flush to the RIGHT EDGE of the pane while gutter sits BETWEEN
     middle and Displays).
   - Critical: Displays pinned to the RIGHT EDGE of the pane host; middle
     stays left/locked or centered in the remaining space; gutter between.
3. Middle measure (workbench-layout.ts)
   - Keep STATION_WORKBENCH_COLUMN = max-w-[720px] mx-auto (one middle
     wrapper: identity + PO lines + dock). CartonContextCard justify-between.
   - STATION_CENTER_COLUMN_CLASS stays min-w/max-w 720 while Displays open.
4. PhotoPeekFan — keep absolute inset-y-0 right-0 on StationPanelRoot /
   center column. After detach, verify peek sits on the center's right
   edge (left of the gutter), not floating mid-gutter and not on Displays.
5. Guards — update unbox-push-gutter.guard.test.ts to match the new law:
   - Displays in-flow is NOT unconditional flex-1 (assert shrink-0 / flex-none
     or documented grow-only-when-filling rule).
   - No showDisplays && justify-between on the host.
   - PhotoPeek still absolute right-0.
   - Middle still mx-auto 720.
6. SoT — one short paragraph in .claude/rules/source-of-truth.md Frame
   column budget → Center row: "Displays resized below leftover → sunken
   gutter between locked middle and Displays; Displays stays flush to the
   pane's right edge; PhotoPeek pins to center right-0."

TEST (attach :3050, QA org)
1. Unbox a multi-serial carton; Open displays (Units or Photos).
2. Drag the leading resize sash left — Displays width must visibly shrink
   and STAY; sunken gutter must appear between middle and Displays.
3. Drag sash right toward max/cap — gutter closes; flush hairline OK.
4. Close Displays — middle centered with equal gutters; PhotoPeek on
   pane right edge.
5. Re-open Displays — width restores from storage key
   `unbox-displays-push-width`; detach still works.
6. PhotoPeek hover-fan still works; never covers Displays content.
7. npm run verify (full). Do not raise ratchet baselines.

OUT OF SCOPE
- Carton-read ReceivingLineContentsRow
- Changing STATION_WORKBENCH_LOCK_PX (720)
- MasterNav / context-rail resize (left) unless needed for frame capPx
- Re-opening the resolved →| band alignment handoff

DONE WHEN
- Operator can resize Displays and see sticky width + detach gutter.
- Middle not left-glued; PhotoPeek pinned correctly in both states.
- Guards + SoT updated; verify green.
```

---

## 1. Symptom (operator)

| Action | Expected | Actual (now) |
|---|---|---|
| Drag Displays sash narrower | Panel shrinks and **stays**; sunken gutter between middle and panel | Panel looks stuck / fills leftover via `flex-1` — middle never detaches |
| Displays closed | Middle centered 720, equal gutters, PhotoPeek on pane right | Mostly OK after `mx-auto` middle wrapper |
| Displays open at full leftover | Flush hairline OK | OK (flex-1) — but this also blocks detach |

## 2. Current code (post-session)

| File | State |
|---|---|
| [`UnboxPushColumn.tsx`](../../src/components/receiving/workspace/UnboxPushColumn.tsx) | In-flow `flex-1 self-stretch` + inline `width` — **grow defeats resize** |
| [`LineEditPanel.tsx`](../../src/components/receiving/workspace/LineEditPanel.tsx) | Host is plain flex (no `justify-between`); center locked 720 when Displays open |
| [`workbench-layout.ts`](../../src/components/station/workbench/workbench-layout.ts) | `STATION_WORKBENCH_COLUMN` = `max-w-[720px] mx-auto` (keep) |
| [`PhotoPeekFan.tsx`](../../src/components/receiving/workspace/line-edit/PhotoPeekFan.tsx) | `absolute inset-y-0 right-0` on center (keep) |
| [`unbox-push-gutter.guard.test.ts`](../../src/components/receiving/workspace/unbox-push-gutter.guard.test.ts) | Currently asserts flex-1 flush — **must change** with the fix |

## 3. Target geometry

```
Displays CLOSED:
┌─ pane ────────────────────────────────────────────┐
│ [gutter][ middle 720 mx-auto ][gutter][PhotoPeek▸]│  peek on pane right-0
└───────────────────────────────────────────────────┘

Displays OPEN (resized narrow — DETACHED):
┌─ pane ────────────────────────────────────────────┐
│ [ middle 720 ][ sunken gutter ][ Displays ▸edge ] │
│              [PhotoPeek▸]                         │  peek on center right-0
└───────────────────────────────────────────────────┘

Displays OPEN (wants full leftover — FLUSH):
┌─ pane ────────────────────────────────────────────┐
│ [ middle 720 ][ Displays flex-fill to right edge ]│
│              [PhotoPeek▸]│                        │  peek on seam
└───────────────────────────────────────────────────┘
```

**Pin Displays to the pane's right edge** (`ml-auto` / `margin-left: auto` on
the push aside) so the gutter opens *between* middle and Displays, not to the
right of Displays.

## 4. Session history (avoid re-litigating)

1. Nested PO line CSS grid shipped (meta boxed tracks + View All → Units).
2. Frame pass #1: shrink-0 + host `justify-between` → permanent gutter when open.
3. Operator: no gutter when open; middle justify center; PhotoPeek pinned right.
4. Frame pass #2: reverted to `flex-1` flush — **broke detach/resize again**.
5. This handoff: synthesize — flush when filling leftover; **detach when
   resized below leftover**; Displays always on the pane's right edge.

## 5. Verify

```bash
node --test --import tsx \
  src/components/receiving/workspace/unbox-push-gutter.guard.test.ts
npm run verify
```

Attach `:3050`. E2E against QA org only if you touch Playwright.
