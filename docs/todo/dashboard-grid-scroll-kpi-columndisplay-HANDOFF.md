# Dashboard / ops-grid polish — scroll · ▦-to-Band-3 · KPI collapse · resize — HANDOFF

**Date:** 2026-08-06. **Lane:** main (dogfood). **Status:** ~80% done, **uncommitted** (user
manages commits). This is a light-context prompt to finish the remaining problems.

The work sits on top of the completed Unbox-History five-row Sheets re-sweep
(`unbox-history-sheets-full-resweep-SWEEP-PROMPT.md`). Golden reference for every pattern below is
**Unbox** (`UnboxWorkspaceHeader.tsx` / `UnboxWorkspaceView.tsx` / `ReceivingLinesTable.tsx`).

---

## ✅ DONE this session (verify, don't redo)

1. **Scroll fix — dashboard To-ship table could not scroll.** Root cause: the three To-ship lanes
   (`UnshippedShelfBoard`, `PackedOrdersTable`, `DashboardShippedTable`) wrapped the grid in an
   **auto-height root** + bounded `workbenchTableViewportClass()` (`h-[calc(100dvh-15.5rem)]`), which
   `flex-1`'s `basis:0` defeated → grid collapsed to the `min-h` floor + destabilized the
   virtualizer (~1 row) + a redundant 2nd scroll port. Fixed by switching all three to the **Unbox
   flex-fill chain**: definite `flex min-h-0 min-w-0 flex-1 flex-col` root + plain
   `WORKBENCH_SHEET_HOST` (no absolute calc). Deleted dead `workbenchTableViewportClass` /
   `WORKBENCH_TABLE_VIEWPORT*` from `workbench-shell.tsx`. **⚠️ Not visually verified** (in-app
   browser is auth-walled) — first thing to confirm.

2. **Resize — Status resizable + Product tiny min.** Receiving `status` `resizable: false → true`
   (`receiving-grid-layout.ts`); Product (`title`) floor lowered `minmax(16rem,1fr) → minmax(4rem,1fr)`
   so resizing a fixed column (Status) drains into Product's flex track — Qty · Price · Loc ·
   Tracking stay put instead of h-scrolling. Guards + tests + SoT updated
   (`receiving-grid-fixed-columns.guard.test.ts`, `receiving-grid-layout.test.ts`,
   `source-of-truth.md`).

3. **Column-display (▦) → Band-3 triage row, on all tables with a Band-3.** Generalized the Unbox
   exception to the norm. Mechanism: `LedgerGridSurface` prop `columnTriggerPortalTarget` (→
   `GridColumnGutter` `triggerPortalTarget`) portals the ▦ into the Band-3 `WorkbenchTriageBand`
   controls slot. **Wired:** To-ship ×3 lanes (`OrdersGridView` gained the prop), Labels, Review
   Packing/Pairing/Catalog-link, Catalog, My Day, Repair, Ready (FBA), **Incoming**. Unbox embedded
   already portals. SoT updated (`GridColumnDetailsTrigger.tsx`, `source-of-truth.md`,
   `workbench-ops-queue.md`). **Kept card-corner (correct — no Band-3):** Scan-out Staged, Warranty,
   Unfound, Tracking-exceptions.

---

## ✅ DONE 2026-08-06 (session 2 — this handoff's TODOs)

- **Product header "T" glyph → "Product" + real min/max resize.** Root cause: the
  receiving Product floor was `minmax(4rem, 1fr)` while `labelFitRem: 8`, so
  `gridHeaderShowsLabel` measured the 4rem floor and degraded the header to the type
  glyph. Two fixes: (a) `gridHeaderShowsLabel` now **always shows a flex (`1fr`) column's
  label** — its floor is not its rendered width (root cause, future-proofs every flex-title
  grid); (b) receiving Product raised to `minmax(8rem, 1fr)` + `minTrackRem: 8` → real
  8rem…720px resize clamp (no sliver). Updated `grid-column-geometry.ts`,
  `receiving-grid-layout.ts` (+ test), `source-of-truth.md`, new
  `grid-header-shows-label.test.ts`.
- **KPI collapse toggle → To-ship (Outbound) + Incoming.** Both now compose
  `WorkbenchKpiBand` + `WorkbenchKpiCollapseToggle` (Band-3 `kpiToggle`, right view-toggle
  zone; search flush left) via `useWorkbenchKpiCollapsed(WORKBENCH_KPI_SURFACE.*)`. Added
  `outbound` / `incoming` surface keys. **Testing was already wired** (`TestingWorkspaceView`
  under `src/components/tech/testing/`). Unbox/Triage/Labels/Shipping/Pack were already done.
  **Ready is intentionally skipped** — its KPI tiles double as the disposition tab selector,
  so a collapse would hide a functional control. Updated `dashboard-orders-sheet.guard.test.ts`.
- **"All" tab ▦ portal.** `TechAllGridView` + `TechAllTriageTable` gained
  `columnTriggerPortalTarget`; wired from Testing · Shipping · Unbox "all" mounts (their
  existing `controlsEl`). Handoff #4 done, plus Shipping/Unbox parity.
- **`npm run verify` PASSED** (full CI mirror green; Tenancy-static advisory only lists
  pre-existing untouched routes). Visual confirm still pending on the authed `:3050` (agent
  browser is auth-walled).

## 🔧 TODO — remaining / deferred

### 1. ~~NEW — KPI collapse toggle~~ — DONE (see above). Original notes retained for reference.
#### KPI collapse toggle (metrics button) in Band-3 `kpiToggle` (right view-toggle zone)

**Ask (user, 2026-08-05):** move KPI hide off the left of search — search flush left for scanner
ingestion; KPI hide clusters with the right-rail inspector as view toggles (Unbox History golden).

Wire the Unbox snap-collapsible pattern with the toggle in **`kpiToggle`**:
- Wrap the KPI in **`WorkbenchKpiBand`** (snap-collapsible), state via
  **`useWorkbenchKpiCollapsed(WORKBENCH_KPI_SURFACE.<surface>)`**.
- Put **`<WorkbenchKpiCollapseToggle …/>`** in **`WorkbenchTriageBand kpiToggle=`** —
  immediately left of History `trailing` inspector when present; never left of search / select gutter.
- **Golden copy-source:** `UnboxWorkspaceHeader.tsx` (`WorkbenchKpiBand` +
  `kpiToggle={<WorkbenchKpiCollapseToggle …/>}` + `trailing={historyInspectorToggle}`).
- Guard: `workbench-kpi-collapse.guard.test.ts`.

### 2. Verify the DONE work (do this first)

```bash
npx tsc --noEmit -p tsconfig.json            # expect 0 errors (was 0 before the last Incoming edits)
node --test --import tsx \
  src/lib/receiving/receiving-grid-layout.test.ts \
  src/lib/receiving/receiving-grid-fixed-columns.guard.test.ts \
  src/components/**/*sheet*.guard.test.ts \
  src/design-system/components/grid/grid-view-plumbing.guard.test.ts
npm run verify                               # full gate
```
Then **visually confirm on the authed app** (`:3050`, user's own browser — the in-app/agent browser
hits the sign-in wall): (a) To-ship / Packed / Shipped scroll; (b) ▦ shows in Band-3 on the wired
tables; (c) resizing receiving Status keeps the right columns still + Product shrinks to a tiny min.

### 3. ~~Standalone `/receiving/history` ▦ → Band-3~~ — DONE (2026-08-05 sweep)

Wired `HistoryTriageBand` `controlsSlotRef` + `ReceivingLinesTable` `historyControlsEl`;
rewrote `tests/e2e/grid-column-display-hover.spec.ts` for resident Band-3 ▦ (no hover-reveal
assertions). Also closed remaining Band-3 gaps in the same sweep: Pickup, Locations/Bins,
Incoming Docked, Testing Pending/Returns/History, Labels Recent, To-ship Drill/Compare.
**Still card-corner (correct — no Band-3):** Scan-out, Warranty, Unfound, Tracking-exceptions.

### 4. ~~Testing "all" tab (`TechAllGridView`)~~ — DONE (session 2 above)

---

## Mechanisms / SoT (don't reinvent)

- **▦ portal:** `LedgerGridSurface` `columnTriggerPortalTarget?: HTMLElement | null` →
  `GridColumnGutter` `triggerPortalTarget`. Default null = hover card-corner (fallback for tables
  with **no** Band-3). Band-3 = `WorkbenchTriageBand` `controlsSlotRef` → the slot element. Thread:
  page holds `const [el, setEl] = useState<HTMLElement|null>(null)` → band `controlsSlotRef={setEl}` →
  grid `columnTriggerPortalTarget={el}`. GridViews that lacked the prop got it this session (copy the
  `OrdersGridView` JSDoc/shape).
- **KPI collapse:** `WorkbenchKpiBand` + `WorkbenchKpiCollapseToggle` + `WORKBENCH_KPI_SURFACE` +
  `useWorkbenchKpiCollapsed` (`workbench-kpi-collapse.tsx`). Toggle lives in triage `kpiToggle`
  (right view-toggle zone; search flush left).
- **Scroll:** every ops sheet self-scrolls via flex-fill `WORKBENCH_SHEET_HOST` inside a definite
  `flex-1 min-h-0` chain (Unbox golden). No absolute `100dvh` calc. One Y port.
- **Resize:** `isGridColumnResizable` (explicit `resizable` wins); `gridTemplate` wraps every column
  in `var(--cf-col-KEY, floor)`; the `1fr` flex column's floor is what fixed-column resize drains
  into — keep it tiny.

## Traps

- Concurrent session edits the tree (order-record/search). Only touch grid/table files; run the
  failing gate on your files before assuming red is yours.
- Two tables share `ReceivingLinesTable` (Incoming ✅ done, History ⏳) — edit serially.
- Never reuse `ReceivingLinesTable`'s `toolbarPortalTarget` for a non-embedded desk (it's the
  Unbox-embedded week-pill target, null there) — use fresh state (Incoming does).
- Don't raise a DS ratchet baseline. `npm run verify` before done.

## Guards to keep green

`receiving-grid-fixed-columns.guard.test.ts` · `receiving-grid-layout.test.ts` ·
`dashboard-orders-sheet.guard.test.ts` · `workbench-trailing-cluster.guard.test.ts` (bans
`onOpenColumnDetails` on headers — the ▦ portal does NOT use it) · `grid-view-plumbing.guard.test.ts` ·
`workbench-kpi-collapse.guard.test.ts` · all `*sheet*.guard.test.ts`.
