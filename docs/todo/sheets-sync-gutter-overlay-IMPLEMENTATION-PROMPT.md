# IMPLEMENTATION PROMPT — To-ship sheet triage: same table, instant paint, gutter overlay

**Paste everything below the horizontal rule into a fresh agent session.**  
Repo: `cycleforge-app` on **`main`**.  
Desk: To-ship (`/shipping/orders`).  
Related plan: [`sheets-sync-inline-triage-PLAN.md`](./sheets-sync-inline-triage-PLAN.md) (scope/leases).  
This prompt **supersedes that plan’s display host**: do **not** paint `CsvImportStagingHost` for Google Sheet sync. File CSV staging is unchanged.

Written 2026-09-03.

---

To-ship sheet triage — same table, instant paint, verdicts in the gutter.

## Outcome (one screen)

Click **Sync Google Sheet** on `/shipping/orders`. The LIVE To-ship table
appears immediately with the new rows (Caged). Same display method as the
normal queue: `UnshippedTable` → `useOrdersSpreadsheet` → `OrdersQueueTableRow`.
Approve (green ✓) and reject (X) sit OUTSIDE the DataTable, in the desk’s
right stage gutter (the padding around the 1152px card), as a scroll-synced
overlay. The table width does not change.

In-house ecommerce: eyes on the product row, hand on two fixed squares,
triage as fast as scrolling.

## Why it is slow today (fix this, don’t hide it)

`useOrdersSync.handleTransfer` does `Promise.all(google_sheets, ecwid)` THEN
`/api/orders-exceptions/sync`, and only then opens the desk. The CTA spinner
is `isTransferring` across ALL three. Sheet rows are already written when
`POST /api/integrations/google_sheets/sync` returns. Paint then. Ecwid and
exceptions may continue in the background; they must not block first paint.

## Time budget (the agent must measure)

| Beat | Budget | How to measure |
|---|---|---|
| Click → sheets POST settled | network floor (log `durationMs` / Network) | DevTools or `performance.now` around the fetch |
| Sheets 200 → first caged To-ship **row** on screen | **≤ 300ms** | `performance.now` from `res.ok` to first order / compound row in `UnshippedTable` |
| Click → usable triage (table + gutter ✓/✕, not spinning) | **≤ 2.5s** on dogfood when the sheet hop itself is < 2s. If the sheet hop is slower, paint on the next frame after 200 — do not add the leftover. | Journal + stopwatch. Fail the task if the button stays “Syncing…” until Ecwid/exceptions finish. |

If any beat misses: **cut**, don’t add. See Bloat.

## Display (locked)

- One DataTable. Host: `UnshippedTable`. After sheet sync: `?cage=1`.
- `COMPOUND_ROW_PX` = 48. `DESK_STAGE_MAX_PX` = 1152. `DESK_STAGE_GUTTER_CLASS` is the overlay home.
- Overlay: sibling of the table, absolute in the **right gutter**, one ✓ and one ✕ per **visible** virtualized row, 48×48, same box as the left select gutter. `pointer-events` only on the buttons. Scroll with the virtualizer. Press active square again to undo.
- Keyboard on a focused row: `Y` approve, `N` or `X` reject. No new Tab chords.
- File CSV (`?import=csv`) is unchanged. This task is Google Sheet → To-ship.

## Forbidden

- `CsvImportStagingHost` / `CsvImportStagingGridRow` / `orders-import` columns as the sheet-sync body (that is a second table).
- An `actions` / ⋮ track inside Orders compound columns.
- `RightRailHost`, Dialog, toast, or `OrderSyncDialog` as the results surface.
- Waiting on Ecwid or exceptions before opening the caged To-ship table.
- New `TableId`, `entityFamily`, `*-grid-layout.ts`, or `*GridRow.tsx`.
- Growing a god component (below). Changing `DESK_STAGE_MAX_PX`.

## Bloat / god-component rule (simpler, or revert)

Before editing a file, if it is already a host that does **three jobs**
(fetch + layout + chrome) or is **>400 lines**, do not add a fourth.
Extract a ≤150-line sibling instead, or don’t touch it.

This overlay is **one new file**, roughly:

`src/components/outbound/orders/SheetTriageGutterOverlay.tsx`

wired from `DashboardOrdersView` / UnshippedSheet as a sibling — not a new
row renderer, not a new DataTable binding.

Delete more than you add:

- Sheet-sync must not set `?import=csv`.
- Do not keep a parallel staging draft *for display* if Caged `UnshippedTable` is the SoT. `landSheetTriageRows` may stay as a helper; it must not own paint.
- If you find a flag forest (`isDecisionBoard` + extra presence flags) to make the old staging grid look like To-ship — stop. That is the fork. Use `UnshippedTable`.

Cap: **net new UI ≤ ~150 lines**. If the diff grows `UnshippedTable`,
`useOrdersSync`, or `DataTable` by more than ~40 lines each, split or revert
that hunk.

## Agent loop (must iterate, must test — not a paper design)

Max **3 cycles**. Each cycle:

1. Implement the smallest slice that can miss a budget beat or a forbidden.
2. **Test in the running app** (`cycleforge-dev` :3050), not only unit tests:
   - Click Sync Google Sheet on `/shipping/orders`.
   - Record: spinner duration, time to first To-ship row, whether ✓/✕ are outside the card, whether table width/h-scroll changed vs a normal To-ship visit (open the queue, note column right edge, then after sync — same edge).
   - Hard fail: still on `CsvImportStagingHost`; still spinning through Ecwid; overlay inside the grid; new table family.
3. If a beat misses or a fail fires: **cut bloat first** (background the non-sheet hops, skip staging swap, delete overlay-from-row hacks), then re-time. Do not start a fourth cycle. Report the last measurement.

Eval: `pnpm run eval:cohort slot-table`. If you touched table chrome, also `pnpm run eval:cohort shortcuts`.

The slot-table **router refuse** (`slot-table.new-grid-row`, `slot-table.new-grid-columns-array`, `slot-table.new-sheet-columns`) and the tripwire in `src/lib/tables/slot-table-cohort.test.ts` are the machine that forbids a second table. Do not weaken them. `docs/eval/goals/**` is operator-owned — pin those refuse ids on the goal file yourself.

## Done when

1. Click Sync → To-ship `UnshippedTable`, Caged, same columns/rows as live.
2. Sheets 200 → first row ≤ 300ms; click → usable ≤ 2.5s when the sheet hop is < 2s; spinner is NOT gated on Ecwid/exceptions.
3. ✓ / ✕ in the right gutter overlay, not in the card; table width unchanged.
4. Overlay file ≤ ~150 lines; `UnshippedTable` / `DataTable` not turned into gods; no second grid.
5. One measured run written in the reply (ms numbers, not “feels faster”).
