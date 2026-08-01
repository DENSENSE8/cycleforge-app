# Local Pickup — LedgerGrid + SoT port (HANDOFF)

**Goal:** make the `/pickup` (Local Pickup) receiving mode a first-class, SoT-composed
surface — the LCPU pickup orders shown as a **grouped one-to-many spreadsheet**
(order → its products, condensed under the same order number) with the **dashboard
context band** (search + filter) and the **Unbox sidebar rail SoT** — *not* hand-rolled
components.

This doc is self-contained. Read `AGENTS.md` first; load `.claude/rules/ui-design-system.md`,
`.claude/rules/display/workbench.md`, and the "Layout: data- and density-scoped" section
(LedgerGrid law).

---

## 0. Status / what's already built (verified)

**Port DONE.** `/pickup` is a first-class SoT-composed surface (Strategy B):

- **Data source is settled.** LCPU products live ONLY in `local_pickup_orders` +
  `local_pickup_order_items`. The `zoho_po_mirror` LCPU rows are header-only;
  `receiving_carton source='local_pickup'` is not the source.
- **Endpoint:** `GET /api/local-pickup-orders/lines` (`src/app/api/local-pickup-orders/lines/route.ts`).
  Row shape (`PickupLine` in `pickup-lines.ts`) + `usePickupLines()` / `groupPickupLines()` / `pickupMoney()`.
- **Right pane:** `PickupWorkspace` → `DashboardScrollShell` + `WorkbenchChromeHeader`
  (All/Draft/Done + `ToolbarSearchToggle`) → `PickupGridView` → `LedgerGridSurface`
  (grouped by LCPU order). Header is a thin `LedgerGridColumnHeader` adapter.
- **Sidebar:** `PickupSidebarRail` → `SidebarRecentRailBase` + `pickupOrderToRailVM`
  (plain PO# title + customer · N meta — Unbox/Pack rail anatomy).
- **Status SoT:** `src/lib/local-pickup/order-status.ts` owns Draft/Done dots + chip
  (rail + grid Product cell + Status column). No page-local amber/emerald maps.
- **Wiring:** `ReceivingRightPane` (`mode==='pickup'` → `PickupWorkspace`) and
  `ReceivingSidebarPanel` (`mode==='pickup'` → `PickupSidebarRail`). Keep this split.

## Requirements (from the product owner)

1. **No hand-rolled table** — compose `LedgerGridSurface` (`@/design-system/components/grid`).
2. **Mirror the dashboard page**: top **context band** with **search + filter** chrome.
3. **First-class one-to-many**: condense products under the **same order number**
   (collapsible group row). One order = one fold, many product rows.
4. **Add a Date column** (pickup date). **No Zoho photos** in the product cell.
5. **Sidebar** must use the SoT (`RecentActivityRailBase` / `SidebarRailShell`), like Unbox —
   not a hand-rolled list.

---

## 1. The SoT components to compose (with file paths)

| Concern | SoT | Notes |
|---|---|---|
| Grid composer | `LedgerGridSurface<Row, K>` (`src/design-system/components/grid/LedgerGridSurface.tsx`) | descriptor + `orderGroupsByDate` + renderers |
| Column defs | `makeGridSurfaceDescriptor` / `buildLedgerColumnDefs` (`grid-surface-descriptor.ts`) | house column models → TanStack defs |
| One-to-many fold | `groupRowsBy` + `RowGroup<T>` (`src/lib/group-rows.ts`) + `CollapsibleGroupRow` | group by order number |
| Grouped adapter reference | `ReceivingGridView.tsx` + `ReceivingGridGroupRow.tsx` (`src/components/station/receiving-grid/`) | the closest template (PO fold) |
| Flat adapter reference | `RepairGridView.tsx` (`src/components/repair/repair-grid/`) | simplest LedgerGridSurface adopter |
| Row/cell geometry | `receiving-grid-layout.ts` (`receivingGridCell`, `receivingGridTemplate`, `receivingGridFrozenLeft`, `RECEIVING_GRID_FROZEN_CELL`) + `@/components/ui/grid-cells` | frozen pane (select·title) + airtable cells |
| Dashboard chrome | `DashboardScrollShell` (`chrome` prop) + `WorkbenchChromeHeader` (`workbench-shell.tsx`, props: `tabs`, `search`, `right`, `trailing`) + `WORKBENCH_CHROME_COLUMN`/`WORKBENCH_BODY_COLUMN` | pinned band OUTSIDE scroll port |
| Scoped search | `ToolbarSearchToggle` (`@/design-system/primitives`) | icon→expand; compose `SearchField` |
| Sidebar rail | `RecentActivityRailBase` (`src/components/sidebar/receiving/RecentActivityRailBase.tsx`) over `SidebarRailShell` | reference wrapper pattern |

**Key coupling caveat:** both `ReceivingGridView` and `RecentActivityRailBase` are typed
to `ReceivingLineRow`. Two strategies (pick one — B recommended):

- **Strategy A — adapt `PickupLine` → `ReceivingLineRow`** and reuse `ReceivingGridView` +
  `RecentActivityRailBase` directly with a pickup column subset.
  - Pro: least new markup; inherits every SoT cell.
  - Con: `ReceivingLineRow` is a large type; the receiving row's **title editor PATCHes
    `/api/receiving-lines`** with the row id — a pickup item id would 400/corrupt. Must pass a
    read-only variant or disable editing. High "action side-effect" risk.
- **Strategy B (RECOMMENDED) — pickup-native grid files mirroring `receiving-grid/`**, composing
  the SAME shared helpers (`receivingGridCell`/template/frozen, `grid-cells`, `group-rows`,
  `LedgerGridSurface`). New domain layer, zero receiving side-effects.

---

## 2. Build plan — Strategy B (pickup-native, mirror `receiving-grid/`)

Create `src/components/receiving/pickup/grid/`:

### 2a. `pickup-grid-layout.ts` (column SoT — mirror `receiving-grid-layout.ts`)
`PickupGridColumnKey = 'select' | 'title' | 'sku' | 'order' | 'date' | 'qty' | 'condition' | 'price' | 'status'`.
Column models (`{ key, width, label, gridLabel?, type?, labelFitRem? }`), e.g.:
```
select  minmax(2rem,2rem)          (sortable:false, frozen)
title   minmax(12rem,1fr)  Product (frozen; flexes)   NO image cell
sku     minmax(7rem,7rem)  SKU
order   minmax(9rem,9rem)  Order   (the LCPU PO#)      ← group fold key
date    minmax(5.5rem,5.5rem) Date  type:'date'
qty     minmax(2.75rem,2.75rem) Qty type:'number'
condition minmax(5.5rem,5.5rem) Cond type:'tag'
price   minmax(5rem,5rem)  Price  type:'number'  (right-align)
status  minmax(5rem,5rem)  Status type:'tag'  (Draft/Done chip)
```
Export `PICKUP_GRID_COLUMNS`, `pickupContentMinWidthRem()`, `pickupGridTemplate()`,
sortable/frozen helpers. Frozen keys = `['select','title']`. Reuse the shared
`ordersQueueColVar` / `receivingGridCell` / `receivingGridFrozenLeft` /
`RECEIVING_GRID_FROZEN_CELL` from `dashboard-order-row-layout` (re-exported by
`receiving-grid-layout.ts`) so geometry matches every other station grid.

### 2b. `pickup-grid-descriptor.ts`
`PICKUP_GRID_DESCRIPTOR = makeGridSurfaceDescriptor('pickup.browse', PICKUP_GRID_COLUMNS, pickupContentMinWidthRem(), { isSortable, sortDescFirst, isLocked })`.

### 2c. `PickupGridRow.tsx` (leaf — mirror `ReceivingGridRow.tsx` renderCell)
`memo`, CSS grid `style={{ gridTemplateColumns: pickupGridTemplate(columns) }}`, frozen
`select`+`title` cells (`RECEIVING_GRID_FROZEN_CELL` + `receivingGridFrozenLeft`). Cells:
- title: status dot + `product_title` (NO image, NO inline editor — read-only).
- sku: `l.sku` or `GridCellDash`.
- order: `OrderIdChip` (from `@/components/ui/CopyChip`) of `po_number`, OR plain text.
- date: `GridDateCellValue` fed from `pickup_date` (civil date → `formatDateKeyShort`).
- qty: `l.quantity` tabular.
- condition: `conditionLabel(condition_grade,'table')` + `conditionGradeTextClass`.
- price: `pickupMoney(total_price)` right-aligned.
- status: Draft/Done chip (order_status) — reuse a chip token, not raw.

### 2d. `PickupGridGroupRow.tsx` (the one-to-many fold — mirror `ReceivingGridGroupRow.tsx`)
Wrap `CollapsibleGroupRow` (`src/components/ui/...`): the group header shows the LCPU
**order number** + customer + item-count + total (condensed), expands to the `PickupGridRow`
leaves. Singleton groups (one item) may render as a plain row. Study
`ReceivingGridGroupRow` + `ReceivingGridGroupSummary` for the summary-cell layout that keeps
the header aligned to the same grid template.

### 2e. `PickupGridColumnHeader.tsx` (mirror `ReceivingGridColumnHeader.tsx`)
Sticky column header aligned to `pickupGridTemplate`; label + click-to-sort via
`toggleColumnSort` (from `LedgerGridSurface`'s `renderColumnHeader({ toggleColumnSort })`).

### 2f. `PickupGridView.tsx` (compose — mirror `ReceivingGridView.tsx`)
- Ephemeral `columnSort`/`sortDir` local state (server/date order is the default).
- `orderGroupsByDate`: group `usePickupLines` rows by **order number** via `groupRowsBy(rows, l => l.po_number || 'order:'+l.order_id)`, banded by `pickup_date` (or a single `['', groups]` band if not day-banding). Apply column sort when active (flatten → sort → regroup, like ReceivingGridView).
- Mount `<LedgerGridSurface descriptor={PICKUP_GRID_DESCRIPTOR} orderGroupsByDate rows={flat} sort dir onSortChange renderColumnHeader renderGroup renderRow testId="pickup-grid-body" />`.

### 2g. Rewrite `PickupWorkspace.tsx` (dashboard chrome + grid)
Replace `DataTable` with the dashboard shell:
```
<DashboardScrollShell chrome={
  <div className={WORKBENCH_CHROME_COLUMN}>
    <WorkbenchChromeHeader
      tabs={[/* e.g. All · Draft · Done status filter */]}
      activeTab={...} onTabChange={...}
      search={<ToolbarSearchToggle> <SearchField .../> </ToolbarSearchToggle>}
    />
  </div>
}>
  <div className={WORKBENCH_BODY_COLUMN}><PickupGridView .../></div>
</DashboardScrollShell>
```
- Search filters `PickupLine` client-side (product_title / sku / po_number / customer_name),
  URL-backed (`?q=`), mirroring Incoming's `search`/`search_field`.
- Filter band = status (`All`/`Draft`/`Done`) → `?status=` → endpoint `?status=` OR client filter.
- Keep `?lcpu=<orderId>` selection highlight (sidebar → row highlight).

### 2h. Rewrite `PickupSidebarRail.tsx` (Unbox rail SoT)
Under Strategy B, the rail lists **orders** (one row per LCPU order). Compose
`SidebarRailShell` directly (the rail engine) OR a thin wrapper like `RecentActivityRailBase`
but typed to the order-group shape (a small pickup rail base). Row = PO# / customer /
item-count / status; selecting writes `?lcpu=`. Reuse `SidebarShell` for the header/search band
per `workbench.md`. Do NOT re-hand-roll a `<ul>`.

---

## 3. Endpoint contract (already built — do not rebuild)
`GET /api/local-pickup-orders/lines?status=&limit=` → `{ success, lines: PickupLine[] }`.
If you need day-banding by pickup date server-side, it already returns `pickup_date`.

## 4. Testing (Playwright — required)
- Auth: `tests/.auth/admin.json` (USAV), baseURL `http://localhost:3000` (dev already running).
- Load `/pickup`, `waitUntil:'domcontentloaded'`, wait ~5s (SPA), screenshot.
- Assert: sidebar rail lists LCPU orders; grid shows grouped product rows with the Date
  column and NO image; a group header condenses its products; column sort toggles.
- Reference script pattern: see the throwaway scripts used during build (chromium.launch +
  newContext storageState). Confirm `GET /api/local-pickup-orders/lines` fires 200.

## 5. Gotchas
- **Concurrent agent churn:** the pickup UI files (`ReceivingRightPane`, `ReceivingSidebarPanel`)
  and `repair/`, `StationComposerDock` have been edited by a parallel agent all session
  (it deleted earlier pickup UI 3×). Keep new work in `src/components/receiving/pickup/grid/`
  (isolated) + the already-safe API dir. Re-check `git status` before large edits.
- **`"use no memo"`** stays on `useGridSurface` (React Compiler freeze trap) — don't remove.
- **No TanStack grouping/widths/markup** — grouping stays house (`group-rows` + CollapsibleGroupRow),
  TanStack owns sort/visibility/order state ONLY (AGENTS.md LedgerGrid law).
- **Data realities (not bugs):** `image_url` null (no image column at all), most `total_price`
  are `$0.00`. Draft orders included (all 40 are DRAFT today).
- **knip flakiness:** the gate has been red on the OTHER agent's untracked files
  (`RepairChromeActions`/`RepairWorkspaceHeader`, `order-lifecycle`, `table-surface`) — not
  pickup. Verify your own files are clean; don't refresh the baseline to hide others' work.
- **tsc:** the tree may be red from the agent's `StationComposerDock.tsx` (read-only ref) —
  confirm no *pickup* TS errors specifically.

## 6. Definition of done
`/pickup` renders: dashboard context band (search + status filter) · a `LedgerGridSurface`
spreadsheet with columns `Product · SKU · Order · Date · Qty · Cond · Price · Status`,
products **condensed under their order number** (collapsible) · SoT sidebar rail of orders ·
`?lcpu=` selection highlight · Playwright-verified · pickup files tsc/eslint/knip clean.
