# Gemini Deep Research brief — scan-station flex measure math (anti-collapse)

**Paste everything below the line into Gemini Pro deep research.** It is self-contained;
the researcher has no access to this repo — treat every path and constant below as
**embedded facts**, not things to invent or “look up” in our tree.

**Deliverable:** a decision brief we can execute in code (constants + inequality
invariants + test vectors), not an essay. Format is specified at the end.

**Companion (already shipped — do not re-litigate):** edge-to-edge **content**
measure inside the locked middle —
`docs/todo/scan-station-edge-measure-CI-LOOP-PROMPT.md`. That loop is about
`STATION_WORKBENCH_COLUMN = w-full min-w-0` (no `max-w-[720px] mx-auto` gutters).
**This brief is the horizontal frame budget math** — how left · middle · Displays
flex/resize so **no column collapses into illegibility**.

**Date:** 2026-08-07  
**From:** Cycle Forge engineering  
**Subject:** Industry-standard measurement model for WMS / ops **vertical panels
and columns** under dual-rail flex pressure — floors, locks, caps, and the
inequality that prevents collapse.

---

## Who is asking

I own the **scan-station work surfaces** of **Cycle Forge**, a multi-tenant SaaS
for used-goods reseller operations (receiving → testing → listing → fulfillment).
Operators work on warehouse benches (typically **1080p / 1440p** desktop monitors,
barcode scanners, dense Kinetic Ledger UI). USAV is the dogfood tenant only —
design for a **sellable** multi-tenant product.

Product identity: **Kinetic Ledger** — exact flush planes, content-hard floors,
not Notion whitespace theater. The right edge **pushes**; it never floats a card
over the work.

---

## The problem, stated plainly

We run a **Flex-Grow Sandwich** on scan stations (Unbox golden):

```text
[ context rail | shrink-0 ]  [ middle LOCK 720 | shrink-0 ]  [ Displays | flex-1 ]
```

Dual-rail sash drag keeps:

```text
left' + 720 + displays' = frame
```

**Failure modes we still see / fear:**

| Mode | Symptom |
|---|---|
| **Peer collapse** | Growing Displays (or context) squeezes the other rail below a usable floor before the math stops it |
| **Middle crush** | Frame too narrow → something yields the 720 lock (or content inside looks crushed) |
| **Invader detach** | Displays painted narrower than leftover → gray band (`ml-auto` debt — already banned) |
| **Min fight** | `leftMin + middleLock + displaysMin > frame` → clamp thrash / overflow / scrollbar on the host |
| **Content vs host** | Host is 720 but inner `max-w` + `mx-auto` re-gutters (separate CI loop) |
| **Vertical stack collapse** | Inside a column, stacked sections / docks steal height until PO lines or notes become unusable |

We need a **provable measurement grammar** (floors · preferred · caps · yield order)
aligned with **industry WMS / ERP workstation multi-pane practice**, so one panel
**never collapses in on itself** under flex adjustment.

---

## Current house state (ground truth — do not contradict)

### Horizontal column registry (px today)

| Column | Role | Constants (embedded) |
|---|---|---|
| MasterNav spine | App navigator | Operator-owned open/close; **never** auto-closed by right rail |
| Context rail (left) | Scan + recents / picker | `CONTEXT_PANEL_RESIZE`: default **360**, min **300**, desk `maxWidthPadPx` **760**, station `stationMaxWidthPadPx` **0** |
| Center (scan) | Primary work | `STATION_WORKBENCH_LOCK_PX` = **720** (`min=max=w`, `shrink-0` while Displays open). Displays-closed: `flex-1` + `min-w-[720px]` |
| Displays (right, station) | Reference tools | `STATION_DISPLAYS_MIN_WIDTH_PX` = **280**; in-flow `flex-1` always fills leftover |
| Desk inspector (right) | Record details | `DETAIL_STACK_RESIZE`: default **420**, min **360**, `maxWidthPadPx` **960** |
| Desk center floor | Queue readability | `MIN_WORK_SURFACE_PX` = **784** |
| Gutters | Between columns | `RIGHT_RAIL_GUTTER_PX` = **0** (flush planes) |

### Frame inequality (desk vs station)

```text
Desk push:     left + MIN_WORK_SURFACE_PX(784) + right ≤ frame
Station push:  left + STATION_PUSH_CENTER_FLOOR_PX(720) + displays ≤ frame
Dual-rail:     left' + 720 + displays' = frame   (both rails open)
```

Pure math lives in:

- `resolveRightRailFrame` — caps the right panel so center floor is preserved
- `resolveStationDualRailDelta` — inverse Δ with hard middle lock + peer mins

### Content measure (orthogonal — already SoT)

Inside the center column: `STATION_WORKBENCH_COLUMN = 'w-full min-w-0'` —
identity + PO lines + floating notes dock share one edge-to-edge measure.
Sibling stations adopt via edge-measure CI loop. **Do not change that contract
in this research** unless you prove the lock width itself must change.

### Explicit non-goals

- Reintroducing host `gap-*` / `justify-between` / `ml-auto` detach gutters
- Auto-closing the left context rail under width pressure
- Floating overlays as the default for station Displays
- Raising DS ratchet baselines to “fix” geometry
- RF handheld character screens as the primary target (we are **desktop
  workstation / vehicle-mount class**, not 20×4 RF)

---

## Industry context we already know (seed — verify / extend)

Use these as **starting citations**, then deepen with WMS / ERP / industrial HMI
practice for **multi-pane desktop workstations** (receiving / packing benches):

1. **SAP Fiori side panel (web):** default expanded width **320 px**; recommend
   side panel between **~15% and ~90%** of screen; with **two** side panels,
   expanded panel limited to **~50%**; resize handle cycles
   max → min → default; prefer **push** over overlay for durable work.
2. **SAP EWM RF / ITS (handheld class):** layouts are historically
   **character columns × rows** (e.g. ~20 cols @ 240 px width, ~25 cols @ 320 px),
   not modern CSS flex — useful as a reminder that floors should track
   **content glyphs / scan fields**, not arbitrary aesthetics.
3. **SAP EWM Work Center:** desktop work centers split **scanner area** vs
   **detail area** (tab pages) — primary transaction vs reference/detail panes;
   width is configuration of regions, not free-collapse flex children.
4. **Elastic / data-dense desktop:** columns get explicit `minWidth` / `maxWidth`;
   overflow scrolls rather than crushing critical identifiers into illegibility.
5. **Logistics dashboard practice:** desktop often `nav | main | alerts` with
   **fixed px side panes + `1fr` main**, or fr ratios (e.g. `3fr 1fr`) — main
   work never becomes the flex child that absorbs all shrink.

**Research must answer what “industry standard” means in measurable px / rem /
ch / % for our class of UI** (warehouse **desktop** multi-column station), not
only handheld RF.

---

## Research questions (answer all)

### A. Measurement grammar

1. What is the industry-standard **tuple** for a resizable vertical panel?
   Propose: `{ contentFloorPx | contentFloorCh, preferredPx, hardMinPx, softMaxPx | maxPctOfFrame, shrinkPriority }`.
2. Should floors be **px**, **rem**, **ch** (scan-field width), or **% of frame**?
   Give a rule for when each unit wins on a warehouse workstation.
3. What is the correct **yield ladder** when
   `Σ(hardMin) > frame`? (park strip / collapse Displays / overlay / block resize /
   horizontal scroll host — pick one primary + fallback.)
4. How do best-in-class WMS / ERP desks prevent **flex-1 invaders from collapsing
   peers**? (CSS `flex-shrink: 0` on floors + JS clamp vs CSS `minmax` grid vs
   container queries.)

### B. Column width recommendations (desktop WMS)

For a **three-column scan station** (context | primary work | tools/detail),
recommend concrete ranges for:

| Pane | hardMin | preferred | softMax / max% | notes |
|---|---|---|---|---|
| Context / list / recents | ? | ? | ? | barcode list + filters |
| Primary work (carton / order) | ? | ? | lock vs fluid? | identity + lines + dock |
| Tools / Displays / detail | ? | ? | ? | ticket · photos · pairing |

Compare our **300 / 720 / 280** (and desk **360 / 784 / 360**) to that recommendation.
Say clearly: **keep**, **raise**, **lower**, or **split by breakpoint**.

### C. Anti-collapse invariants (mathematical)

Write the invariants as inequalities we can unit-test. At minimum cover:

```text
I1  left ≥ leftHardMin            OR left is in parked-strip mode
I2  middle ≥ middleHardMin        (lock or floor — define which mode)
I3  displays ≥ displaysHardMin    OR displays closed
I4  left + middle + displays + gutters ≤ frame   (push mode)
I5  when both rails open and push: left + middleLock + displays = frame
I6  no column with flex-shrink > 0 may shrink below its hardMin
I7  preferred widths are desires; hardMins are laws
```

Also specify **hysteresis** (if any) so sash drag does not chatter at the clamp.

### D. Vertical panels (height) — same grammar?

Operators also stack **identity · lines · floating dock** inside the middle, and
**topic plate · body · actions** inside Displays. Industry standard for
**vertical** measure:

- sticky identity / sticky dock vs scroll body
- min-heights for scan rows / CTA docks
- when a stacked section may collapse vs must stay mounted (spatial predictability)

Give a parallel `{ hardMinH, preferredH, scrollOwner }` model — do **not** invent
new product chrome; map onto existing Unbox: sticky identity, scroll lines,
absolute notes dock.

### E. Breakpoints & device classes

Recommend a small matrix:

| Class | Typical CSS px | Column recipe |
|---|---|---|
| Handheld RF | ~240–480 | out of scope / stack |
| Tablet / kiosk | ~768–1024 | ? |
| Bench desktop 1080p | ~1920 content row after chrome | ? |
| Ultrawide / 1440p | ? | ? |

When does industry **drop from 3 columns → 2 → 1**, and which pane yields first?

### F. Implementation recommendation for Cycle Forge

Given our SoT modules (`frame.ts`, `station-dual-rail.ts`, `workbench-layout.ts`),
recommend the **smallest durable change**:

- Keep 720 lock + flex-1 Displays, but tighten clamp / yield ladder?  
- Move to CSS grid `minmax()` template with named tracks?  
- Introduce content-hard floors in `ch` derived from scan input width?  
- Publish a single `StationColumnBudget` SoT object consumed by host + dual-rail +
  guards?

Call out anything that would **break** the edge-to-edge content measure CI loop.

---

## Constraints the answer must respect

- Compose from named SoT; never fork page-local twin class strings.
- Depth = planes (`canvas` → `sunken` → `card`), not gutters.
- Never auto-close MasterNav or ephemerally park context rail to invent width.
- Motion / chrome stay Kinetic Ledger (flush-square ops chrome).
- Answers must be **executable**: numbers + inequalities + which file owns them.

---

## Deliverable format (strict)

Return markdown with these sections only:

1. **Verdict** (≤8 lines) — keep / change our 300·720·280; one yield ladder.
2. **Measurement grammar** — the tuple + unit rules.
3. **Recommended px table** — context / middle / Displays (+ desk twin) with
   hardMin · preferred · softMax · shrinkPriority.
4. **Invariants** — I1…In as testable inequalities + hysteresis note.
5. **Vertical stack grammar** — height floors / scroll owner.
6. **Breakpoint matrix** — 3→2→1 column yield order.
7. **Implementation delta** — concrete changes to our named modules (or “no
   code change; document only”).
8. **Citations** — WMS / ERP / industrial HMI / design-system sources (links).
9. **Open risks** — what we would still need to measure on a real 1080p bench.

Do **not** propose a visual redesign. Do **not** recommend floating overlays as
default. Do **not** contradict flush gutters (`RIGHT_RAIL_GUTTER_PX = 0`) without
a hard accessibility/WMS reason.

---

## Optional appendix for the researcher (formulas we use today)

```text
resolveRightRailFrame cap:
  capPx = max(detailMin, frame - leftCost - centerFloor - gutters)

resolveStationDualRailDelta:
  leftMax      = max(leftMin, frame - middleLock - displaysMin)
  displaysMax  = max(displaysMin, frame - middleLock - leftMin)
  after Δ on primary: re-pin so left + middleLock + displays = frame
                     within [leftMin, leftMax] × [displaysMin, displaysMax]

Minimum frame that can host both rails open without violating mins:
  frameMinBothOpen = leftMin + middleLock + displaysMin
                   = 300 + 720 + 280 = 1300 px   (content row)
```

If industry says `frameMinBothOpen` should be different, say what to change
(middle lock vs Displays min vs context min) and **why** in warehouse terms
(scan field width, list readability, ticket chrome).

---

# Claude Code handoff (after Gemini returns)

**Status:** wait for research §1–§7. Then paste below into Claude Code.

> Read `docs/todo/scan-station-flex-measure-math-GEMINI-RESEARCH-BRIEFING.md` and
> the Gemini decision brief (attach or paste §1–§7). Implement **only** the
> **Implementation delta** that preserves Unbox golden:
> - middle lock / floor remains a named constant in `workbench-layout.ts`
> - dual-rail equation stays pure in `station-dual-rail.ts`
> - frame cap stays pure in `frame.ts`
> - Displays stays `flex-1` fill (no `ml-auto` detach)
> - content stays `STATION_WORKBENCH_COLUMN` edge-to-edge
>
> Add unit tests for every inequality in §4 (invariants). Extend
> `station-edge-measure.guard.test.ts` or add
> `station-column-budget.guard.test.ts` so floors cannot silently drift.
> Attach to `:3050`; never start/restart/kill the dev server. User owns commits.
> `npm run verify` green. Never raise ratchet baselines.
>
> Non-goals: porting sibling stations’ edge-to-edge content (that is
> `scan-station-edge-measure-CI-LOOP-PROMPT.md`); redesigning Displays IA;
> auto-closing the context rail.
