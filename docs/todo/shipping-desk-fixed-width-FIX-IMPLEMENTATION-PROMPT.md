# IMPLEMENTATION PROMPT — Fix fixed-width Shipping desk (remove rails · constrain stage · tabs SoT)

**Paste everything below the horizontal rule into a fresh agent session.**  
Repo: `cycleforge-app` on **`main`**.  

**Plans this executes (compose, do not fork):**  
- [`desk-page-chrome-fixed-width-PLAN.md`](./desk-page-chrome-fixed-width-PLAN.md) — chrome SoT  
- Slot table stays as-is for column bindings ([`slot-based-metadata-table-PLAN.md`](./slot-based-metadata-table-PLAN.md))  

**Not this prompt:** caged→released / Add form deep work ([`non-scan-desk-chrome-caged-release-PLAN.md`](./non-scan-desk-chrome-caged-release-PLAN.md)) — only leave Add slot empty or existing wire; do not expand release gates here.

---

You are **fixing and restructuring** the Shipping **non-scan desk** (To ship · Amazon Prep · Labels) so the fixed-width display actually works. Today the operator still sees **station-style rails** eating the canvas, overlapping the grid, and fighting `DeskPageChrome`.

Operator screenshots (2026-08-30): left Labels rail (`Order · Tracking · SKU` + printed-recents list); right **Recent** chrome overlapping the Orders grid (`Scanned out` / `NEEDED`). That is the bug class this prompt kills.

## Mission (done when)

1. **Labels recent rail gone** from the desk experience the operator is fixing — no left column of “Labels printed” / scan-band recents stealing width from the fixed stage.  
2. **Right-side “Recent” chrome gone** (or absorbed into desk page tabs / nowhere) — it must not overlay or steal columns from the data table.  
3. **Top desk tabs** (To ship · Amazon Prep · Labels) are the **only** mode navigation for this desk; spine stays flat; no parallel mode rails.  
4. Data table lives in a **constrained stage**: fixed **width** (existing `DESK_STAGE_*`) **and** constrained **height** (`min-h-0` flex chain so the grid scrolls *inside* the stage, not under overlapping rails).  
5. **Fullscreen** control stays **top-right on the desk tab band** (already on `DeskPageChrome`) and must actually reclaim width **and** usable height when toggled.  
6. Pending Orders (To ship) shows the **right details for a Mac-width triage desk** (see § Recommended To-ship paint).  
7. **Scan stations unchanged** (Scan out stays edge-to-edge; do not put `DeskPageChrome` on stations).  
8. `npm run verify` green.

## Remove / stop mounting (named targets)

Trace mounts before deleting. Prefer **stop mounting on desk routes** over blind file deletion when a station still needs a sibling.

### A — Labels left “recent rail”

| Piece | Path | Action |
|---|---|---|
| Labels scan band placeholder | `LabelsScanBand` — placeholder `Order · Tracking · SKU` | Do **not** mount on desk To-ship. For Labels **desk tab**, either remove from desk chrome entirely or replace with in-stage find (DataTable search) — no 360px left rail. |
| Labels printed recents | [`LabelsRecentRail`](src/components/outbound/labels/LabelsRecentRail.tsx) | **Remove from desk sidebar.** |
| Labels mode body shell | [`LabelsModeBody`](src/components/outbound/labels/LabelsModeBody.tsx) | Stop using as Shipping desk context panel body for non-scan desk tabs. |
| Outbound panel dispatch | [`OutboundSidebarPanel`](src/components/sidebar/OutboundSidebarPanel.tsx) | Today: orders → `UnshippedSidebar`; else Labels/Scan-out/FBA. **Desk tabs To ship / Amazon Prep / Labels must be Pattern E rail-less** (or Labels gets zero left rail). Extend `isRaillessOrderFeedSurface` / `hasSidebarContextPanel` / shipping route keys so **`/shipping/orders`, `/shipping/fba`, `/shipping/labels` do not reserve a context column.** Scan-out **keeps** its station rail. |

### B — Right-side “Recent”

| Piece | Path | Action |
|---|---|---|
| Labels Queue/Recent foot/side tab | [`LabelsWorkspaceView`](src/components/outbound/labels/LabelsWorkspaceView.tsx) — `LABELS_VIEW_TABS` `{ id: 'recent', label: 'Recent' }` + `TableStatusBar` | **Remove the Recent side-mode.** If staged/recently-labeled rows still matter, they become a **desk page tab**, a **filter chip inside the stage**, or nowhere — not a second rail overlaying the grid. |
| Any right-rail / history occupant titled Recent on Shipping desk | Grep `Recent` under outbound/shipping/right-rail | Unmount on desk routes. |

### C — Rules / SoT to update (not just components)

- [`isRaillessOrderFeedSurface`](src/lib/sidebar-navigation.ts) — widen honestly to **all Shipping desk segments** that wear `DeskPageChrome` (`orders` · `fba` · `labels`), **not** `scan-out`.  
- [`CONTEXT_PANEL_ROUTE_KEYS`](src/lib/sidebar-navigation.ts) / `hasSidebarContextPanel` — desk paths must **not** reserve 360px empty/full rails.  
- [`OutboundSidebarPanel`](src/components/sidebar/OutboundSidebarPanel.tsx) comments claim To-ship is not LabelsModeBody — **prove Labels tab also never paints LabelsModeBody on desktop desk.**  
- Guards: `outbound-rail-dedup.guard.test.ts` (and related) — update expectations; do not delete guards, retarget them.  
- Do **not** weaken scan-station edge-measure guards.

## Build the correct display

### Frame (already exists — finish it)

[`DeskPageChrome`](src/components/desk/DeskPageChrome.tsx) + [`desk-stage.ts`](src/lib/desk/desk-stage.ts) (`DESK_STAGE_MAX_PX = 1152`, gutters, fullscreen).

Mounted at [`src/app/shipping/(desk)/layout.tsx`](src/app/shipping/(desk)/layout.tsx).

**Fix the flex chain:** from WarehouseShell → desk layout → stage → DataTable → LedgerGrid, every ancestor on the desk path must be `min-h-0` / `flex-1` / `overflow-hidden` so:

- Default: table height = stage height inside gutters (scroll inside grid).  
- Fullscreen: stage fills content canvas; table still scrolls inside — **no** page-level double scroll under a rail.  
- Rails must not `absolute`/`overlay` the stage.

Fullscreen button: keep **top-right on the tab band** (before Add). Verify `data-testid="desk-fullscreen-toggle"` works on To ship with rails gone.

### Tabs (website-style, inside fixed width)

Desk band only:

| Tab | Body |
|---|---|
| **To ship** | Pending orders compound DataTable (slot layout) |
| **Amazon Prep** | Existing FBA board |
| **Labels** | Labels **queue table only** inside the stage — no left LabelsRecentRail, no right Recent overlay |

Spine L1 for Shipping/outbound stays **flat** (`deskChrome: true`). No child dropdown mirroring these tabs.

### Recommended To-ship (pending orders) details @ fixed width

Mac-width (~1152) cannot show every warehouse column. Optimize for **triage glance** (identity → what → state → blockers → money):

| Keep (default / product layout) | Why |
|---|---|
| Select + thumb (if present) | Structural |
| Identity (order · tracking) | Find / open |
| Item title + under-title `qty · condition · notes` (slot subtitles) | What to work |
| Pipeline **state** pill + delay | Lane |
| Bound **status** slots (e.g. Tested / Needed) | Lifecycle verbs — slot catalog, not hard tracks |
| Amount | Money scan |
| Actions ⋮ | Open / secondary |

| Do not force visible by default | Why |
|---|---|
| Extra status columns beyond org layout | Width budget |
| Left filter map rail duplicating DataTable find/filter | Pattern E — filters live in table chrome / Band chips |
| Labels printed / Recent overlays | Station chrome, not desk triage |
| Edge-to-edge full monitor stretch | Defeats gutters |

Org still customizes via slot + Popover; product default should stay dense and readable at 1152.

## Implementation order

1. **Prove routes:** `/shipping/orders` · `/shipping/fba` · `/shipping/labels` vs `/shipping/scan-out`.  
2. **Rail-less desk:** extend railless / context-panel contracts; confirm desktop desk tabs paint **zero** left Labels rail and **zero** right Recent overlay.  
3. **Labels body:** strip `LabelsModeBody` / `LabelsRecentRail` from desk; simplify `LabelsWorkspaceView` (drop Recent tab rail).  
4. **Height chain:** fix overflow/`min-h-0` from desk layout through Orders/Labels tables; screenshot-proof no rail overlap.  
5. **Fullscreen:** verify width + usable height reclaim.  
6. **To-ship default columns:** align product slot layout with § Recommended paint if current default overflows badly.  
7. Update/add unit or guard tests for railless desk segments.  
8. `npm run verify`.

## Non-goals

- Rewriting Unbox / Pack / Scan-out / Test  
- Deleting `LabelsRecentRail.tsx` if Products or another surface still needs a **station** variant — unmount from Shipping **desk** first; delete only if unused  
- Merging FBA into the Orders React tree  
- Caged/release domain  
- Committing unless asked; no branches off `main`; do not restart `:3050` / `usav-dev`

## Report back

1. Paths changed  
2. Which rails stopped mounting on which routes  
3. Before/after: is `/shipping/labels` still desk-chrome + railless?  
4. Flex/overflow fix summary  
5. To-ship default visible tracks after change  
6. `npm run verify` result  

Start by grepping mounts of `LabelsRecentRail`, `LabelsModeBody`, and Labels `Recent` tab, then make desk routes Pattern E rail-less and constrain the stage.
