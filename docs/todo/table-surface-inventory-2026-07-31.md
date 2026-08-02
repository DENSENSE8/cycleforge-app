# Table-surface inventory — Phase 0 + Phase 1

**Produced for:** [`ledgergrid-unified-table-sot-RESEARCH-HANDOFF.md`](ledgergrid-unified-table-sot-RESEARCH-HANDOFF.md) Phases 0–1
(read-only deep search + classification).
**Date:** 2026-07-31 · **Branch:** `main` · **Status:** research only — no code changed.

Phase 4 (industry actions) is **not** started and must not be until the human approves — see
[Horizon A gate](#horizon-a-gate-what-blocks-phase-4).

---

## Headline findings

1. **The pin is real and widely adopted.** Six families declare `GridSurfaceCapabilities`
   (Orders · Receiving · Incoming · Catalog · Repair · Pickup), and **every dashboard outbound
   lane, Review lane, and Support Orders surface already re-mounts `OrdersGridView`** rather than
   forking. The "likely forks" the handoff listed as suspects — `ReviewPackingTable`,
   `ReviewPairingTable`, `SupportOrdersBoard`, `PackedOrdersTable`, `DashboardShippedTable`,
   `UnshippedShelfBoard`, `StationHistoryTable`, `StationListTable` — are **already on the SoT**.
   Horizon A is much closer to done than the handoff assumed.

2. ~~**Two LedgerGrid consumers sit OUTSIDE the capabilities pin.**~~ **CLOSED 2026-07-31.**
   `StationListTable` (→ Tech / Packer history) and `FbaBoardTable` mounted `LedgerGrid` with no
   capabilities bag, and the guard's hardcoded six-const list could not see them. Both now declare;
   the guard now discovers mounts off disk. Fixing it surfaced a live leak — `OrdersQueueTableRow`
   was resolving Tech/Packer bench rows against `ORDERS_GRID_CAPABILITIES`
   (§ [Gap A1](#a1--two-ledgergrid-consumers-with-no-descriptor--closed-2026-07-31)).

3. **`DataTable` has zero production consumers** — and was disqualified for the wave, not merely
   thin. Locked decision #2 names it the sibling for "non-virtualized lifecycle/admin HTML tables",
   but the only file mounting it is `src/app/design-demo/page.tsx`, while **15 admin / settings /
   reports files hand-roll ~26 `<table>`s**. The audit found the blocker was not sort or selection
   (the wave needs neither) but that `DataTable` was `'use client'` while **13 of the 15 targets are
   RSC**. Grown 2026-08-01: server-safe, typed alignment, four settled states
   (§ [Gap A4](#a4--datatable-is-a-sibling-nobody-mounts--audited--grown-2026-08-01)).

4. **Sort uses two params, and that is correct** — documented 2026-08-01, not migrated. `?colsort=`
   answers "which header did the operator click"; `?sort=` answers "what display ORDER is this list
   in" and carries composite non-column modes (`priority`, `newest`). Which one a surface uses is
   decided by whether `?sort=` is already spent on that route by **server** ordering — it is on
   Catalog / Incoming / History, and it is not on Orders / Repair
   (§ [Gap A3](#a3--two-url-sort-vocabularies)).

5. **Orders remains the deliberate header outlier.** Five families adapt `LedgerGridColumnHeader`;
   Orders keeps `OrdersQueueColumnHeader` (resize/reorder recipe) and mounts `LedgerGrid` +
   `useGridSurface` directly instead of `LedgerGridSurface`. This is the documented deferral —
   confirmed still deferred, **not** half-ported (§ [Gap A2](#a2--orders-header--shell-deferral-confirmed)).

---

## Legend

- **Horizon A action** — `keep` (already SoT) · `thin-adapt` (SoT but missing a pin piece) ·
  `migrate-to-LedgerGrid` · `migrate-to-DataTable` · `keep-sibling-job` · `retire`
- Capabilities shown as `T/M/E/F/D` = `rowTriageFlags` / `multiSelect` / `inCellEdit` / `fieldsMenu` / `dayBands`.

---

## A. On the pin — descriptor + capabilities declared (8 families)

| Route / host | Composer | Descriptor | Caps `T/M/E/F/D` | Row entity | Grouping | Header | Selection | Mutations | Horizon A | Horizon B candidates |
|---|---|---|---|---|---|---|---|---|---|---|
| `/dashboard` (Pending · Tested · Packed · Shipped) | [`OrdersGridView.tsx`](../../src/components/dashboard/orders-queue/OrdersGridView.tsx) | `orders-queue-descriptor.ts` | `T✓ M✓ E✓ F✓ D✗` | `ShippedOrder` | day-band + order fold | **`OrdersQueueColumnHeader` (fork — deferred)** | multi-check + bar | in-cell + bulk + inspector | `keep` | assign staff · ticket · status · bulk ship-by (already partly there) |
| `/unbox`, `/receiving` browse, History, Testing browse | [`ReceivingGridView.tsx`](../../src/components/station/receiving-grid/ReceivingGridView.tsx) | `receiving-grid-descriptor.ts` | `T✗ M✓ E✗ F✓ D✓` | `ReceivingLineRow` | PO fold + day band | `ReceivingGridColumnHeader` (thin) | multi-check + bar | inspector / station | `keep` | link ticket (Unbox claim family already exists) · assign |
| `/receiving?mode=incoming` (Incoming POs) | [`IncomingGridView.tsx`](../../src/components/station/incoming-grid/IncomingGridView.tsx) | `incoming-grid-descriptor.ts` | `T✗ M✓ E✗ F✓ D✗` | `ReceivingLineRow` | PO fold | `IncomingGridColumnHeader` (thin) | multi-check | inspector | `keep` | priority tier · assign |
| `/products?view=catalog` | [`CatalogGridView.tsx`](../../src/components/products/catalog/catalog-grid/CatalogGridView.tsx) | `catalog-grid-descriptor.ts` | `T✗ M✓ E✗ F✓ D✗` | `CatalogListRow` | flat | `CatalogGridColumnHeader` (thin) | multi-check | record only | `keep` | **must stay display-safe** — no triage, no dispatch |
| `/repair` | [`RepairGridView.tsx`](../../src/components/repair/repair-grid/RepairGridView.tsx) (host `RepairTable.tsx`) | `repair-grid-descriptor.ts` | `T✗ M✓ E✗ F✓ D✗` | `RSRecord` | flat | `RepairGridColumnHeader` (thin) | multi-check + bar | inspector | `keep` | status via `transition()` · assign · ticket |
| `/pickup` (Local Pickup) | [`PickupGridView.tsx`](../../src/components/receiving/pickup/grid/PickupGridView.tsx) | `pickup-grid-descriptor.ts` | `T✗ M✗ E✗ F✓ D✗` | `PickupLine` | order fold | `PickupGridColumnHeader` (thin) | none (read map) | read-only | `keep` | — (read surface; do not grow `multiSelect` without a reason) |
| `/support?mode=warranty` **(new 2026-08-01)** | [`WarrantyGridView.tsx`](../../src/components/warranty/grid/WarrantyGridView.tsx) | `warranty-grid-descriptor.ts` | `T✗ M✗ E✗ F✓ D✗` | `WarrantyClaimListRow` | flat | `WarrantyGridColumnHeader` (thin) | record plane (`?open=`) | ticket link (row-scoped) | `keep` | assign · status via `transition()` — **not** multi-select without a reason |
| `/shipping/ready` **(new 2026-08-01)** | [`ReadyGridView.tsx`](../../src/components/outbound/ready/grid/ReadyGridView.tsx) | `ready-grid-descriptor.ts` | `T✗ M✗ E✗ F✓ D✗` | `AllocationHit` | flat | `ReadyGridColumnHeader` (thin) | none (history) | Stage-FBA link (row-scoped) | `keep` | — append-only `testing_results`; there is no record to correct here |

**Shell split:** 7 mount `LedgerGridSurface`; **Orders** mounts `LedgerGrid` + `useGridSurface`
directly (deferred header/resize recipe).

---

## B. On the pin by re-mount — thin composers over `OrdersGridView` (no fork)

These were on the handoff's "likely fork" list. All confirmed **already composing the SoT**.

| Route / host | Composer | What it mounts | Horizon A |
|---|---|---|---|
| `/dashboard` Packed lane | `dashboard/PackedOrdersTable.tsx` | `OrdersGridView` | `keep` |
| `/dashboard` Shipped lane | `shipped/DashboardShippedTable.tsx` | `OrdersGridView` | `keep` |
| `/dashboard` To-Ship shelf | `unshipped/UnshippedShelfBoard.tsx` | `OrdersGridView` (Board\|Grid switcher retired) | `keep` |
| `/review?mode=packing` | `features/review/ReviewPackingTable.tsx` | `OrdersGridView` | `keep` |
| `/review?mode=pairing` | `features/review/pairing/ReviewPairingTable.tsx` | `OrdersGridView` | `keep` |
| `/support?mode=orders` | `support/orders/SupportOrdersBoard.tsx` → `UnshippedTable` | `OrdersGridView` | `keep` |
| `/tech`, `/packer` history | `TechTable.tsx` / `PackerTable.tsx` → `StationHistoryTable` → `StationListTable` | `LedgerGrid` (**no descriptor** — see A1) | `thin-adapt` |
| `/fba` board | `fba/FbaBoardTable.tsx` | `LedgerGrid` (**no descriptor** — see A1) | `thin-adapt` |

---

## C. Forks to migrate — ops/Workbench queues NOT on the pin

| Route / host | Composer | Family today | Row entity | Selection | Mutations | Horizon A | Notes / risk |
|---|---|---|---|---|---|---|---|
| ~~`/receiving/unfound`~~ | ~~`UnfoundQueueTable.tsx` (+ `queue-table/QueueTableRow`)~~ → [`UnfoundGridView.tsx`](../../src/components/receiving/unfound/grid/UnfoundGridView.tsx) | **MIGRATED 2026-08-01** — `LedgerGridSurface` + `receiving.unfound` descriptor | `v_unfound_queue` (unmatched receiving · email PO) | open-highlight only | in-cell PATCH via `LedgerCellEditor` | ✅ `done` | Wave 4. `QueueTableRow` deleted. See [Phase 3 wave log](#phase-3-wave-log). |
| ~~`/shipping/ready`~~ | ~~`ReadyQueueTable.tsx`~~ → [`ReadyGridView.tsx`](../../src/components/outbound/ready/grid/ReadyGridView.tsx) | **MIGRATED 2026-08-01** — `LedgerGridSurface` + `outbound.ready` descriptor | `AllocationHit` | none (history) | Stage-FBA link | ✅ `done` | Wave 2. See [Phase 3 wave log](#phase-3-wave-log). |
| ~~`/warehouse` (bins)~~ | ~~`BinsTable.tsx`~~ → [`BinsGridView.tsx`](../../src/components/warehouse/bins-grid/BinsGridView.tsx) | **MIGRATED 2026-08-01** — `LedgerGridSurface` + `warehouse.bins` descriptor | `BinsOverviewRow` | multi-check (parent-controlled `Set<number>`) | flyout (record) | ✅ `done` | Wave 3. Local `SortKey`/`SortDir` machine retired for `useUrlColumnSort`. See [Phase 3 wave log](#phase-3-wave-log). |
| ~~`/tracking-exceptions`~~ | ~~`TrackingExceptionsTable.tsx` (516 lines)~~ → [`TrackingExceptionsGridView.tsx`](../../src/components/tracking-exceptions/grid/TrackingExceptionsGridView.tsx) | **MIGRATED 2026-08-01** — `LedgerGridSurface` + `ops.trackingExceptions` descriptor | `tracking_exceptions` | none | Dialog edit (record plane) | ✅ `done` | Wave 5. Host now 181 lines. See [Phase 3 wave log](#phase-3-wave-log). |
| ~~`/support?mode=warranty`~~ | ~~`WarrantyClaimsTable.tsx`~~ → [`WarrantyGridView.tsx`](../../src/components/warranty/grid/WarrantyGridView.tsx) | **MIGRATED 2026-08-01** — `LedgerGridSurface` + `support.warranty` descriptor | `WarrantyClaimListRow` | record plane (`?open=`) | ticket popover (row-scoped) | ✅ `done` | Wave 1. See [Phase 3 wave log](#phase-3-wave-log). |
| `/review?mode=catalog-link` | [`ReviewCatalogLinkTable.tsx`](../../src/features/review/catalog-link/ReviewCatalogLinkTable.tsx) | `divide-y <ul>` lists (621 lines) | unmatched listings / missing item-number sheet rows | none | link/resolve actions | **`migrate-to-LedgerGrid`** *(ask-first)* | Named "Table" but is a two-pane resolve UI. Confirm with human whether the job is *browse-a-queue* (migrate) or *resolve-one-at-a-time* (keep-sibling). |

---

## D. Admin / settings / reports — the `DataTable` wave ✅ **DONE 2026-08-01**

All small, non-virtualized lifecycle tables — exactly the sibling's stated job. Every row below now
mounts `DataTable`; Waves 6–7 in the [Phase 3 wave log](#phase-3-wave-log).

| Route | File | `<table>` count | Horizon A |
|---|---|---|---|
| ~~`/settings/staff`~~ | `app/settings/staff/StaffTable.tsx` | ~~1~~ → 0 | ✅ `done` |
| ~~`/settings/audit`~~ | `app/settings/audit/page.tsx` | ~~1~~ → 0 | ✅ `done` |
| ~~`/settings/ai`~~ | `app/settings/ai/page.tsx` | ~~1~~ → 0 | ✅ `done` |
| ~~`/settings` → Kiosk devices~~ | `components/settings/sections/KioskDevicesSection.tsx` | ~~1~~ → 0 | ✅ `done` |
| ~~`/settings` → Sessions~~ | `components/settings/sections/SessionsSection.tsx` | ~~1~~ → 0 | ✅ `done` |
| ~~`/reports`~~ | `app/reports/page.tsx` | ~~3~~ → 0 | ✅ `done` |
| ~~`/admin` → Compatibility~~ | `components/admin/sourcing/CompatibilityManagementTab.tsx` | ~~1~~ → 0 | ✅ `done` |
| ~~`/admin/inventory` (hub)~~ | `_inventory-admin/TableSections.tsx` · `StatusSections.tsx` | ~~4 + 1~~ → 0 | ✅ `done` |
| ~~`/admin/inventory/events`~~ | `events/page.tsx` | ~~1~~ → 0 | ✅ `done` |
| ~~`/admin/inventory/holds`~~ | `holds/page.tsx` | ~~1~~ → 0 | ✅ `done` |
| ~~`/admin/inventory/returns`~~ | `returns/page.tsx` | ~~1~~ → 0 | ✅ `done` |
| ~~`/admin/inventory/cycle-counts` (+ `[id]`)~~ | `cycle-counts/page.tsx` · `[id]/page.tsx` | ~~1 + 1~~ → 0 | ✅ `done` |
| ~~`/admin/inventory/bulk-allocate`~~ | `bulk-allocate/page.tsx` | ~~1~~ → 0 | ✅ `done` |
| `/admin/inventory/throughput` | `throughput/page.tsx` | ~~2~~ → **1 (kept)** | ✅ `keep-sibling-job` — see below |
| ~~`/admin/inventory/sku/[sku]`~~ | `sku/[sku]/page.tsx` | ~~5~~ → 0 | ✅ `done` |

**Was ≈ 26 hand-rolled `<table>` elements across 15 files; now 1.**

**The one deliberate leftover: the throughput heatmap.** `/admin/inventory/throughput` keeps a raw
`<table>` for its **station × hour matrix**, and that is `keep-sibling-job`, not a miss. A heatmap
cell is addressed by *both* axes — the column set IS data (one column per hour), so there is no
stable column model to declare, no per-column type to align from, and no row entity to select.
`DataTable` describes a **collection of records with fixed columns**; forcing a matrix into it would
mean generating 24 column defs per render to carry what is really one two-dimensional value. The
page's own summary/leaderboard tables did migrate. The remaining element carries an inline comment
saying so, so the next audit does not re-flag it.

---

## E. Keep-sibling-job — different job or different region contract

These are **not** forks. Do not force spreadsheet chrome onto them; share atoms only (CopyChip,
dates, tones, `RowMetaColumns`).

| Surface | File | Why it stays a sibling |
|---|---|---|
| Open-carton PO lines | `receiving/workspace/PoLinesAccordion` · `PoLineMetaGrid.tsx` | **Station edit accordion**, not a browse map. Handoff locked decision #5 — ask-first, out of scope. |
| Walk-in / Sales transaction feed | `walk-in/SalesTransactionsFeed.tsx` (via `WalkInFeedPane`, `SalesHistoryTable`, `PickupOrdersTable`) | Day-banded **event feed** (`DateGroupHeader` + `RowTitle` + `LedgerValue`), Monitor density. Now the dashboard `?mode=sales` / `?mode=pickup` domain. Already composes house atoms. |
| Media Library grids | `photos/photo-library-grid/PhotoFlatGrid.tsx` · `PhotoTicketGrid.tsx` · `PhotoListView.tsx` | **Media** surface (thumb cards / rosters), not a typed fact spreadsheet. Has its own selection + saved-views hook. |
| Unit detail (`/inventory` by-unit) | `inventory/ByUnitView.tsx` | Record **fact stack** with sub-tables (timeline / allocations), not a collection map. |
| PO mailbox scanned mode | `po-gmail/mailbox/ScannedMode.tsx` | Preview panel inside a mailbox reader. |
| Location picker | `barcode/LocationSelector.tsx` | Picker control, not a collection surface. |
| Sync dialogs | `shipped/InventoryFulfillmentSyncDialog.tsx` · `sidebar/OrderSyncDialog.tsx` | Modal wizards with a table-shaped preview. |
| Mobile receive / pack | `components/mobile/**` | **No `<table>` and no LedgerGrid** — correctly list-density. Do not add spreadsheet chrome (handoff §Phase 0). |
| `StationPipelineBoard`, `SwimlaneBoard`, FBA lanes | board files | Board primary surface — valid non-spreadsheet primary. |

---

## F. Horizon A excellence checklist — status per item

Scored against the golden adopters (Orders/Pending + Receiving browse).

| # | Item | Status | Note |
|---|---|---|---|
| 1 | One framed shell (`TABLE_SURFACE_*`) | ✅ | All six + `StationListTable`. |
| 2 | Frozen identity pane (`frozen: true` prefix) | ✅ | Pinned by `grid-column-tier.guard.test.ts` (contiguous prefix, never hideable, no in-cell title edit). |
| 3 | Justification via `resolveGridColumnAlign` | ✅ | `grid-column-display.guard.test.ts`. |
| 4 | Fields + visibility (`useGridColumnVisibility`) | ✅ 6/6 | + `StationHistoryTable` (reuses `ORDERS_QUEUE_COLUMNS`). |
| 5 | URL-durable sort | ✅ **documented 2026-08-01** | Two params by design, not drift — the route's existing `?sort=` owner decides. Rule now in `source-of-truth.md`. See [A3](#a3--two-url-sort-vocabularies). |
| 6 | Row fill via `ledgerRowFillClass` | ✅ 6/6 | Capability-gated triage wash confirmed Orders-only. |
| 7 | Empty honesty (settled vs no-match) | ✅ | `emptyMessage` / `searchEmptyMessage` / `isSearching` on the shell. |
| 8 | Virtualization (`VirtualGroupedSections`) | ✅ | Incl. `StationListTable` virtualized path. |
| 9 | Header SoT (thin adapters) | ⚠️ **5/6** | Orders deferred by design. See [A2](#a2--orders-header--shell-deferral-confirmed). |
| 10 | Shared value atoms (`grid-cells`, CopyChip) | ✅ | |
| 11 | Guards green | ✅ **closed 2026-07-31** | Was a blind spot (6 hand-listed consts, blind to descriptor-less mounts). The guard now discovers mounts off disk. See [A1](#a1--two-ledgergrid-consumers-with-no-descriptor--closed-2026-07-31). |
| 12 | Playwright grid suite | ✅ present | `to-ship-pending-grid`, `pending-grid-tanstack-tested`, `grid-fields-menu`, `ledger-grid-column-display`, `incoming-click-to-open`. **Not re-run in this read-only phase.** |

---

## Horizon A gate — what blocks Phase 4

### A1 — Two LedgerGrid consumers with no descriptor — **CLOSED 2026-07-31**

`StationListTable.tsx` (→ `StationHistoryTable` → Tech/Packer history) and `FbaBoardTable.tsx`
mounted `<LedgerGrid>` with **no `GridSurfaceDescriptor` and no `GridSurfaceCapabilities`**.

Why it mattered for Horizon B specifically: capabilities are the gate that keeps Catalog from
growing dispatch actions. A surface with **no** bag is not "all false" — it is *unclassified*, and
the moment Phase 4 reads `capabilities` to decide whether to mount an action, these two had nothing
to read.

**A live consequence, found while fixing it:** `OrdersQueueTableRow` imported
`ORDERS_GRID_CAPABILITIES` *directly*, so a Tech/Packer bench row — which renders through that same
component — resolved its fill and its triage-flag dot against the **outbound dispatch vocabulary**.
That is a capability arriving through a shared component instead of a surface declaration, which is
exactly the leak the bag exists to prevent.

**Landed:**
- `src/components/station/station-history-capabilities.ts` — `STATION_HISTORY_GRID_CAPABILITIES`
  (`rowTriageFlags: false`, multiSelect · fieldsMenu · dayBands true).
- `src/components/fba/fba-board-capabilities.ts` — `FBA_BOARD_GRID_CAPABILITIES`
  (`rowTriageFlags: false`, `fieldsMenu: false` — the board has no Fields menu).
- `OrdersQueueTableRow` takes `capabilities` as a **required** prop (no default — a default is a
  silent opt-in every unvisited call site takes). The triage flag is now gated **once**, at
  `rowFlag` derivation, so the grid fill, the list fill and the dot indicator cannot drift apart.
- `StationListTable` takes a required `capabilities` and will not draw a select gutter a surface did
  not declare.
- `FbaBoardTable` composes `ledgerRowFillClass` instead of a hand-typed
  `bg-blue-50 ring-1 ring-inset ring-blue-400` — that was the **list** selection recipe on a surface
  rendering `gridSkin="airtable"`, i.e. the documented L-glow drift.

**No descriptor for either, deliberately.** Neither surface has a column model of its own —
station history resolves `ORDERS_QUEUE_COLUMNS`, and the FBA board still hand-rolls its track
template. Authoring a `LedgerGridColumnModel[]` that nothing renders from would create exactly the
stale second declaration `makeGridSurfaceDescriptor`'s own docblock warns about. Descriptors land
with their Phase 3 migration waves.

### A2 — Orders header + shell deferral (confirmed)

Orders keeps `OrdersQueueColumnHeader` (resize/reorder recipe) and mounts `LedgerGrid` +
`useGridSurface` rather than `LedgerGridSurface`. Documented deferral; **confirmed not half-ported**
— do not attempt it inside a Phase 3 migration wave.

### A3 — Two URL sort vocabularies — **DOCUMENTED 2026-08-01**

Reading the code closed this more cleanly than Phase 0 framed it. The split is **not** drift, and
the two params answer different questions:

| Param | Question | Engine | Surfaces |
|---|---|---|---|
| `?colsort=` / `?coldir=` | which column header was clicked | `useUrlColumnSort` | Receiving / History · Incoming · Catalog · Pickup |
| `?sort=` / `?dir=` | what display **order** is this list in (incl. composite modes) | `useQueueDisplaySort` · `useRepairDisplaySort` | Orders · Repair |

**What decides which:** whether `?sort=` is already spent on that route. On the four `colsort`
surfaces it is a **server** ordering vocabulary — `useIncomingFilters` (`zoho_newest`, …),
`normalizeHistorySort`, `/api/sku-catalog?sort=az` — so a header click writing `?sort=` would
silently rewrite the API query with a value it does not understand. That is exactly why
`grid-column-sort-params.ts` exists. On Orders and Repair nothing server-side owns it, and the
vocabulary carries composite modes (`priority`, `newest`) a pure column-sort param cannot express —
so the `QueueSortSwitch` dropdown and the header click share it on purpose.

**Migrating would be wrong**, not just costly: it would force Orders' composite modes into a param
that has no room for them, and churn two live URL contracts for symmetry. Rule written into
`source-of-truth.md` → Grid column visibility + sort, with the one-sort-param-per-surface corollary.

### A4 — `DataTable` is a sibling nobody mounts — **AUDITED + GROWN 2026-08-01**

Zero production consumers vs ~26 hand-rolled `<table>`s across 15 files.

**Audit — what the wave actually needs.** Surveyed all 15 target files for sort / selection /
pagination / loading / row-click:

| Feature | Files needing it | Verdict |
|---|---|---|
| Column sort | **0** | Not a gap. Don't build it. |
| Multi-select | 1 (`StaffTable`, one inline checkbox) | Not a gap. |
| Pagination | 1 (`/reports`) | Caller-owned; not a table concern. |
| Loading state | 5 | **Gap** — no `loading` slot, so callers swapped the whole table for a spinner and the page reflowed when data landed. |
| Row click | 6 | Already supported. |

So `DataTable` was **not** thin in the way Phase 0 guessed (sort / selection). It was thin in three
different places, one of them disqualifying:

1. **It was `'use client'` — and 13 of the 15 target files are React Server Components.** Adopting it
   as-is would have put every static admin table behind a client boundary, shipping table JS to pages
   that currently ship none: the bundle-altitude trap in `build-gotchas.md`, which would have made
   the "migration" a measurable regression. **The directive was not load-bearing** — the component
   has no state, no effects, no browser API. Removed. A caller passing `onRowClick` is inherently
   interactive and must be a client component itself; React says so plainly.
2. **Alignment was hand-picked** (`align: left|center|right`) with no link to the house justification
   law, while the wave hand-types `text-right` inside `cell()` — so two count columns in one table
   can align differently. Columns now take the same `type` vocabulary as the grids and **derive**
   alignment via `resolveGridColumnAlign`; explicit `align` stays the override (and still owns
   `center`, which the typed vocabulary has no opinion about).
3. **One `empty` slot** — no absence vs no-match, violating the four-settled-states law in
   `display/workbench.md`. Now `emptyMessage` / `searchEmptyMessage` / `isSearching`, mirroring
   `LedgerGridSurface`.

Plus the loading gap: `loading` / `loadingRows` render placeholder rows **at the real column
geometry** inside the framed shell, so the table does not reflow when rows arrive. The pulse is pure
CSS on purpose — `SkeletonList` is `'use client'` and pulls framer-motion, which would defeat point 1.

Pinned by `src/design-system/components/DataTable/DataTable.test.ts`, including a server-safety
assertion (no `'use client'`, no client-only import) — negative-tested by adding a real `SkeletonList`
import and confirming it fails.

**The admin wave is unblocked**, and it is a genuinely small migration: no sort, no selection, no
pagination to build.

---

## Recommended Phase 2 → Phase 3 sequence

**Phase 2 (SoT excellence — do these before any migration):**

1. ~~Capabilities for `StationListTable` / `StationHistoryTable` and `FbaBoardTable`~~ — **DONE 2026-07-31** *(closes A1)*
2. ~~Guard that fails when a file mounts `<LedgerGrid` / `<LedgerGridSurface` with no declared bag~~ — **DONE 2026-07-31** *(closes A1 structurally)*
3. ~~Document the sort-vocabulary rule in `source-of-truth.md`~~ — **DONE 2026-08-01** *(closes A3)*
4. ~~Audit `DataTable` against the admin wave's needs; grow it if thin~~ — **DONE 2026-08-01** *(unblocks D)*

### The mount guard (item 2, as built)

`grid-surface-capabilities.guard.test.ts` grew a second half. The first half is the hand-listed
family bags; the new half **walks `src/**` off disk** for files matching `<LedgerGrid(Surface)?` and
asserts every one is registered against a declared bag — plus the three reverse directions (no stale
`MOUNTS` entry, no `MOUNTS` value naming a bag that does not exist, no declared bag without a mount).

The hand list could only ever certify surfaces someone remembered to add to it, and it had been
green the entire time both orphans existed. Exactly one exemption: `LedgerGridSurface.tsx` itself,
which mounts on behalf of a descriptor its caller supplies.

Negative-tested: removing one `MOUNTS` entry fails the suite with the "unclassified, not
feature-free" message. A guard that cannot fail proves nothing.

**Phase 3 (migration waves — one family each, verify + Playwright per wave):**

1. ~~`WarrantyClaimsTable`~~ — **DONE 2026-08-01** (proved the thin recipe)
2. ~~`ReadyQueueTable`~~ — **DONE 2026-08-01**
3. ~~`BinsTable`~~ — **DONE 2026-08-01** (retired the hand-rolled sort state machine)
4. ~~`UnfoundQueueTable`~~ — **DONE 2026-08-01** (lit up `inCellEdit`; `QueueTableRow` deleted)
5. ~~`TrackingExceptionsTable`~~ — **DONE 2026-08-01**
6. ~~`/admin/inventory/**` → `DataTable`~~ — **DONE 2026-08-01**
7. ~~`/settings` + `/reports` → `DataTable`~~ — **DONE 2026-08-01**
8. `ReviewCatalogLinkTable` — **still ask-human-first** (job classification unresolved; deliberately
   left out of Waves 3–7)
9. ~~Per-family header/sort boilerplate~~ — **DONE 2026-08-01** (Wave 8: `makeLedgerGridColumnHeader`
   + `GridSortDir`; see [Compound opportunities](#compound-opportunities))

**Phase 3 is complete except item 8.** Every ops queue on the pin now mounts `LedgerGridSurface`
behind a thin host, and every admin/settings/reports list mounts `DataTable`. The only hand-rolled
`<table>` elements left in the product are `keep-sibling-job` by §E or the throughput heatmap (§D).

**Phase 3.5 (display chrome — one affordance, all families):**

1. ~~Retire chrome `Fields`; make the grid header the sole column entry~~ — **DONE 2026-08-01**.
   `GridFieldsMenu` deleted, the trailing-cluster guard now **bans** chrome column pickers, all 14
   grid views mount `GridColumnDetailsPanel`, and Reset lives in that rail.
2. **Replace the permanent header lip with a Notion-style hover overlay** — **SPECCED, not started**:
   [`fields-to-notion-header-hover-HANDOFF.md`](./fields-to-notion-header-hover-HANDOFF.md).

   *Why this reversed:* the lip is permanent chrome, so `pr-9` + an absolute `w-9` track tax **every
   row of every grid, forever**, to host a control the operator needs occasionally. Reserving layout
   for an occasional action is the cost; overlaying on hover removes it without moving the control
   back into page chrome (which is separately banned). The rail, the prefs and the one-registrar rule
   are unaffected — this is an affordance change, not an architecture change.

   Scope is narrow because Phase 3.5 item 1 already landed: two header files
   (`LedgerGridColumnHeader` + the still-forked `OrdersQueueColumnHeader`), one guard inversion, two
   E2E specs, four SoT prose files.

**Phase 4 (industry actions)** stays blocked on Phase 3 — unchanged.

---

## Phase 3 wave log

### Wave 1 — `/support?mode=warranty` (2026-08-01)

Retired the 113-line hand-rolled `<table>` for `LedgerGridSurface` + a
`support.warranty` descriptor. New family under `src/components/warranty/grid/`:
`warranty-grid-layout.ts` · `warranty-grid-descriptor.ts` ·
`WarrantyGridColumnHeader.tsx` (thin adapter) · `WarrantyGridRow.tsx` ·
`WarrantyGridView.tsx`. `WarrantyClaimsTable` stays as the ~55-line data host.

**What the surface gained** (none of it existed on the old table): per-staff
Fields + column visibility, URL-durable `?colsort=`/`?coldir=` sort,
virtualization, the frozen identity pane, adaptive typed headers, and the
absence-vs-no-match empty split.

**Drift the migration retired.** The old row painted selection as
`bg-blue-50 ring-1 ring-inset ring-blue-400` — the LIST recipe. Under the
airtable skin this surface now uses, that inset ring fights the cell rules; the
row composes `ledgerRowFillClass` (fill only). Same class of bug as the FBA
board's in Phase 2.

**Capabilities:** `rowTriageFlags:false · multiSelect:false · inCellEdit:false ·
fieldsMenu:true · dayBands:false`. `multiSelect` is false because nothing acts
on N claims at once — an inert gutter is the thing the workbench law bans. The
`ticket` column is an ACTION track with no `hideKey`, so it is structural and
the Fields menu can never hide a row control.

**Two decisions worth keeping:**
- `warranty` sorts on `daysRemaining` with **null last in both directions**. A
  claim with no computed clock is an *unknown*, not "expired" and not "maximum
  cover"; folding it to a number would park those rows at whichever end the
  operator is actually reading. Pinned by an E2E case.
- The clock column is typed `tag`, not `number` — the chip reads "14d left" /
  "Expired", a category, not a figure compared digit-by-digit. It start-aligns
  beside Status; sorting still runs on the number.

**Guard scope widened** (each was hand-listed despite claiming discovery):
`grid-surface-capabilities` (MOUNTS + bag), `grid-column-tier` (FAMILIES + lean
set), `grid-column-display` (`GRID_DIRS`), `ledger-grid-column-header`
(`ADAPTERS`). Also registered `warranty` in `TableId` + `TABLE_COLUMNS`.

**Shared-shell bug found by this wave — FIXED 2026-08-01 (approved).**
`LedgerGrid` decides `empty` from the **band count**
(`orderGroupsByDate?.length === 0 && daySections?.length === 0`), not from the
row count — even though `countGridRows` already sits three lines below it. So a
surface that always emits one band renders a **headers-only grid with no
teaching box** when it has no rows: column titles over a void, where the
operator should read "nothing logged yet" or "nothing matches".

`LedgerGridSurface` disagrees with its own child here — its `isEmpty` uses
`.every(([, g]) => g.length === 0)` — but that value only gates the skeleton and
day bands, never the empty box, so the disagreement is invisible until a surface
hits zero rows.

**`PickupGridView` had this bug too** — it returns `[['', groups]]`
unconditionally, so `/pickup` with no matching lines showed bare headers.

**Fixed in the shell**, not per surface: `LedgerGrid.empty` is now
`!hasGridRows({...})` — a new pure helper in `grid-row-index.ts` that counts
LEAVES. `countGridRows` could not answer this itself: it starts at
`GRID_HEADER_ROW_INDEX` and adds a row per day band, so its floor moves with the
chrome. Warranty's local workaround was removed with it (two answers to one
question is the thing the SoT rule bans). `/pickup` is repaired for free.
Pinned by six cases in `grid-row-index.test.ts`.

**E2E:** `tests/e2e/warranty-grid.spec.ts` — 7 cases, route-mocked because the
QA org ships no warranty fixtures and `test.skip`-ing around missing data hides
the coverage (`verify.md`). Covers: no `<table>` left, named table role, every
core column owns a labelled track, `serial` stays opt-in, row → `?open=`,
`?colsort=` durable across reload (and never `?sort=`), null-clock sort, the
row-scoped ticket control not opening the record, and both empty answers.

### Wave 2 — `/shipping/ready` (2026-08-01)

Retired the second hand-rolled `<table>` for `LedgerGridSurface` + an
`outbound.ready` descriptor. New family under
`src/components/outbound/ready/grid/`; `ReadyQueueTable` stays as a ~60-line host.

**Capabilities are all-false except `fieldsMenu`, and that is the finding**: an
`AllocationHit` is an append-only `testing_results` row. There is no record to
correct, nothing to transition, and nothing to act on in bulk — the work happens
on the FBA board the action cell links to. Declaring that explicitly is what
stops the surface drifting into a work queue later.

**The row is deliberately not interactive.** No `role="button"`, no pointer
cursor — `ledgerRowFillClass` bakes in `cursor-pointer` for pickable rows, so the
row overrides it with `cursor-default` rather than promising a detail plane that
does not exist.

**Two sort decisions:**
- `destination` orders by what the CELL SHOWS, not `hit.disposition`. A hit with
  no disposition renders its allocation state instead ("In FBA", "Not ready"), so
  ordering on the raw field would scatter those rows against a column the
  operator can see is grouped.
- `tested` parks null instants **last in both directions** — same shape as
  warranty's null clock. Empty-string compare would have sorted them as "oldest".
- `reasons` is explicitly `sortable: false`: a chip list has no single value to
  order by, so sorting it would compare whichever reason happened to be first.

**Lean default** drops `reasons` + `velocity` to `optional` — they are the WHY
behind `destination`, rationale you open rather than a column you scan, and
`reasons` is the widest thing on the row.

**E2E:** `tests/e2e/ready-grid.spec.ts` — 7 route-mocked cases covering the
disposition fallback, the three action-cell states, `?colsort=` durability, the
null-instant sort, and both empty answers.

**Process note:** a `python .replace()` anchor silently missed because a
concurrent session had edited the same guard file, and the guard then failed on
an undefined import. Anchored edits in a shared tree need `assert anchor in s` —
a no-op replace is indistinguishable from a successful one.

### Wave 3 — `/warehouse` bins (2026-08-01)

`BinsTable` → `LedgerGridSurface` + a `warehouse.bins` descriptor. New family under
`src/components/warehouse/bins-grid/`; the host is now **35 lines** and its public
API is unchanged — the parent still owns the selection `Set<number>` so the bulk
action bar can read it.

**What this wave actually retired:** a local `SortKey`/`SortDir` `useState`
machine — the second sort implementation the SoT bans. It is now `useUrlColumnSort`
(`?colsort=`/`?coldir=`), so a bin sort survives reload and can be sent to a
colleague.

**The frozen pane is `select · barcode`, not the house-default `select · title`.**
A bin has no title; the barcode *is* what an operator scans and reads first, so the
header layout declares `frozenEdgeKey: 'barcode'`. That is the per-surface answer
the identity-pane rule asks for, not a deviation from it.

**Capabilities:** `multiSelect: true` + `fieldsMenu: true`; `inCellEdit: false`
(corrections happen in the record flyout) and `rowTriageFlags: false`.

**E2E:** `tests/e2e/bins-grid.spec.ts`.

### Wave 4 — `/receiving/unfound` · PO Mailbox (2026-08-01)

The highest-value wave, and the only one that lit up `inCellEdit: true`.
`UnfoundQueueTable` → `LedgerGridSurface` + a `receiving.unfound` descriptor;
family under `src/components/receiving/unfound/grid/`. **`QueueTableRow` is
deleted** — the point was to retire the second in-cell edit paradigm, not to keep
it alongside the first.

**All three editable fields (ticket · USA note · Vietnam note) now commit through
`LedgerCellEditor`.** The debounced PATCH still lives in `useUnfoundQueueTable`
(`patchRow`), so the mutation waist is unchanged; only the editor UI moved onto the
SoT.

**The row ignores clicks that land on an inline control** (`input, textarea,
button, label`) so an in-cell edit never also swaps the detail plane — the same
rule the hand-rolled row carried. This is load-bearing and easy to mistake for a
bug: a Playwright `.click()` on the row's geometric centre lands in the notes
editor column and is *correctly* ignored, so the spec clicks the title cell's
label instead.

**`unfoundRowTitle` is kind-dependent** — for `email_po` the title renders from the
context prefix (the email subject), falling back to `product_title` only when the
context is empty. Sort orders by the same function the cell renders, so the column
can never sort by a value the operator cannot see.

**E2E:** `tests/e2e/unfound-grid.spec.ts` — 5 route-mocked cases: no `<table>`
left, every core column owns a labelled track, row → detail plane, in-cell PATCH
body, and `?colsort=` durability.

### Wave 5 — `/tracking-exceptions` (2026-08-01)

`TrackingExceptionsTable` (516 lines) → `LedgerGridSurface` + an
`ops.trackingExceptions` descriptor; host now **181 lines**.

**Capabilities are all-false except `fieldsMenu`.** `multiSelect: false` because
nothing on this surface acts on N exceptions at once; `inCellEdit: false` because a
correction opens the record-plane dialog — the dialog is the action plane, and
splitting it across two would give one field two homes.

**`rowTriageFlags: false` with a reason worth keeping:** the row already carries a
status pill, so a triage wash would be chrome inventing a second colour story for a
fact the row states (Kinetic Ledger law 1).

**E2E:** `tests/e2e/tracking-exceptions-grid.spec.ts` — 6 cases including the
row-scoped Refresh *not* opening the edit dialog, and the absence-vs-no-match split.

### Waves 6–7 — admin · settings · reports → `DataTable` (2026-08-01)

~26 hand-rolled `<table>` elements across 15 files collapsed onto `DataTable`
(§D, now all ✅). Batches: `/settings` + `/reports`, then `/admin/inventory/**` +
the Compatibility tab.

**`DataTable` kept its no-`'use client'` property, and that was the constraint that
shaped the wave.** Most consumers here are RSCs that ship zero client JS for their
tables; a directive on the shell (or a transitively client-only import) would put
all 15 behind a client boundary to render static rows. Pages that were RSCs still
are.

**Alignment came for free and was the quiet win:** `DataTable` resolves
end-vs-start from each column's `type` through the same `resolveGridColumnAlign`
the ledger grids use, so ~26 tables stopped hand-typing `text-right` and
inherited the house rule instead.

**One table deliberately did not migrate** — the `/admin/inventory/throughput`
station × hour heatmap. Rationale and the inline comment that protects it: §D.

**E2E:** `tests/e2e/settings-datatable-smoke.spec.ts` ·
`tests/e2e/admin-inventory-datatable-smoke.spec.ts`.

**Process note (a11y, surfaced by the smoke spec):** `PageHeader` →
`PaneHeaderTitle` renders a **`<p>`**, not a heading element, so
`getByRole('heading', …)` can never match a page title. The spec was corrected to
assert by text. Promoting that block to an `<h1>` is a real a11y improvement but an
**ask-first** change: the same block serves right-rail record inspectors, where an
`<h1>` would be wrong — so it needs a variant, not a global swap.

---

## Compound opportunities

**Do now (in scope / low blast radius)**
- ~~Capabilities for the two undeclared LedgerGrid mounts (A1).~~ **Done.**
- ~~Structural guard: "no LedgerGrid mount without a declared bag".~~ **Done** — turns the next miss into a test failure instead of a review catch.
- One-line sort-vocabulary rule in `source-of-truth.md` (A3).
- **New, surfaced by the A1 fix:** `OrdersQueueTableRow` is now the only shared row component threading a capabilities bag. If a second family's row is ever reused across surfaces, thread the bag the same way — required prop, gated once at derivation — rather than importing a neighbour's const.

**Promote to DS next (2+ call sites)**
- ~~`BinsTable`'s local `SortKey`/`SortDir` machine and `UnfoundQueueTable`'s debounced in-cell PATCH~~ — **Done** in Waves 3–4; both now compose `useUrlColumnSort` / `LedgerCellEditor`.
- ~~`DataTable` needs sort + selection parity before it can absorb 15 admin files~~ — **it did not.** The 2026-08-01 audit found the admin wave needs none of them, and Waves 6–7 landed all 15 files without growing the API. Adding sort/selection would have made `DataTable` a second, weaker grid — the thing its own docblock says it must not become.

**Wave 8 — the per-family boilerplate sweep** ✅ **DONE 2026-08-01** *(approved after being raised
as ask-first; it changes a shared DS API across 12 call sites)*

With every family on the pin, the remaining duplication had moved out of the shells and into the
thin adapters. Both halves are now collapsed:

1. **`makeLedgerGridColumnHeader`** (`@/design-system/components/grid`) generates every family's
   sticky header. Each `*GridColumnHeader.tsx` used to be ~65 lines that built a
   `LedgerHeaderLayoutApi` and forwarded six props with `as`-casts; the family now declares its
   layout + column model and gets a header it **cannot mis-forward**. **12 adapters: 903 → 568
   lines**, and most of what remains is the layout object and the docblock — the genuine per-family
   content.

   **Select-all became a MODE, and that is the real win.** `selectMode: 'always' | 'prop' | 'never'`
   changes the generated component's prop *types*: `'always'` makes `selectionScope` **required**
   (select-all without a scope is a checkbox that does nothing — now a compile error, not a dead
   control), and `'never'` makes both selection props impossible to pass. Negative-tested: all three
   constraints produce real `tsc` errors.

   **One family keeps a hand-written wrapper, correctly.** Receiving's `stageLabel`
   (Unboxed / Scanned / Tested) is per-MOUNT state, not a family constant like Repair's glyphs, so it
   stays a wrapper that translates into the factory's `labelFor`.

2. **`GridSortDir`** replaced **13** identical `'asc' | 'desc'` declarations — twelve family aliases
   plus the header's own `LedgerHeaderSortDir`. Thirteen names for a two-member union was thirteen
   places to check whether a surface meant the same thing by "desc".

   **`QueueDisplaySortDir` was deliberately NOT folded in.** It belongs to the `?sort=`/`?dir=`
   display-order vocabulary, which carries composite non-column modes — same shape, different
   question. Folding it would erase the distinction `source-of-truth.md` draws.

**The guard was strengthened, not just kept passing.** `ledger-grid-column-header.guard.test.ts` now
**walks `src/**` off disk** instead of hand-listing ten adapters — by the time the factory landed the
tree held **twelve**, so `My Day` and both `Review · Catalog link` headers had never been guarded at
all. Same hand-listed-scope gap the capabilities guard closed for mounts. It asserts each adapter is
factory-generated, re-asserts no `role="columnheader"`, and forbids reaching for the selection bus
directly. 13 tests, and negative-tested (breaking one adapter fails it).

**A non-finding worth recording:** the per-family `renderRow` / cell registries are **not**
duplication. Row types differ per domain, and the SoT boundary is deliberately shell + capabilities
+ shared atoms (`grid-cells`, `QUEUE_ROW`) — collapsing those would be the fork the rules ban, not a
simplification.

**A non-finding worth recording:** the per-family `renderRow` / cell registries are **not**
duplication. Row types differ per domain, and the SoT boundary is deliberately shell + capabilities
+ shared atoms (`grid-cells`, `QUEUE_ROW`) — collapsing those would be the fork the rules ban, not a
simplification.

**Deferred / ask-first**
- ~~**`LedgerGrid.empty` counts bands, not rows**~~ — **DONE 2026-08-01**: now `hasGridRows`, which repaired `/pickup` for free.
- ~~`ledger-grid-column-header` hand-lists its scope (`ADAPTERS`)~~ — **DONE 2026-08-01** (Wave 8): it now walks the tree, which immediately picked up three previously unguarded adapters.
- **Still hand-listed: `grid-column-display` (`GRID_DIRS`).** Same fix, same reasoning — make it walk. Left alone here only to keep Wave 8 to one concern.
- **PARTLY RULED 2026-08-02 — `id` settled, `date` / `location` still open.** The identifier half
  is decided: an identifier that is the row's **transaction identity** (PO # · sales order # ·
  `order`) aligns **start**; a **catalog item number / SKU** stays **end** as a reference
  attribute. Same `type: 'id'`, different role — implement with an explicit `align: 'start'` on the
  order column's layout model, **never** by changing `ALIGN_BY_TYPE.id` (that would drag SKU,
  serial and ticket with it). SoT docs carry it as *RULED, not yet shipped*; code + spec land in
  the hover handoff's **Stream F**. `date` and `location` remain unadjudicated — the detail below
  stands for those two.
- **UNRESOLVED CONTRADICTION — `date` / `id` / `location` justification.** Found 2026-08-02 while
  running the grid E2E suite; **pre-existing**, not introduced by Wave 8. Two sources say **end**,
  one says **start**, and they cannot all be right:

  | Source | `date` | `order` (`id`) | `tracking` (`location`) |
  |---|---|---|---|
  | `ALIGN_BY_TYPE` (`grid-header-align.ts`) | end | end | end |
  | `source-of-truth.md` → Grid column justification | end | end | end |
  | `tests/e2e/ledger-grid-column-display.spec.ts` D2 `want` map | **start** | **start** | **start** |

  The spec is the outlier, and its comments show it is a deliberate position, not a typo:
  *"id — a label made of digits, not a magnitude"*. That argument is real — an order number is a
  name, not a quantity — but it is **not** what the ratified SoT or the code says, so today D2 fails
  on any receiving surface (`column "date" resolved the wrong alignment`).

  **Do not "fix" this by editing the assertion to match the code** — that papers over a genuine
  disagreement about intent. It needs a human ruling on which philosophy wins, then ONE of:
  (a) update the spec's `want` map, or (b) change `ALIGN_BY_TYPE` + the SoT table + give the prose
  `date` columns their `align: 'start'` override (the escape the module docblock already
  anticipates). Whichever way it goes, all three sources must move together.
- Orders header resize/reorder onto `LedgerGridColumnHeader` (A2).
- TanStack grouping Phase E on day-band surfaces.
- `PoLinesAccordion` / `PoLineMetaGrid` → LedgerGrid (locked decision #5).
- `ReviewCatalogLinkTable` classification.
- **All Phase 4 industry actions** — blocked on A1 + the Phase 3 waves.

---

## Method / limits

- Read-only. No files changed outside this document; nothing committed or stashed.
- Search recipe from the handoff run in full, plus directory walks of `dashboard`, `station`,
  `receiving`, `products/catalog`, `repair`, `support`, `features/review`, `warehouse`,
  `tracking-exceptions`, `warranty`, `outbound`, `photos`, `walk-in`, `mobile`, `app/settings`,
  `app/admin`, `app/reports`.
- Classification is from source reading — `npm run verify` and the Playwright grid suite were
  **not** run in this phase (nothing changed to verify). Both are required per migration wave.

### Audit pass (2026-08-01, post-Waves 3–7)

Waves 0–2 of the thin-adapter plan were audited against the shipped tree rather than re-migrated:
barrel importers, guard registration for all three new families, host thinness, and the forbidden
patterns (`useIsColumnHidden`, hand-typed `justify-*`, a second sort machine). All clean; the four
grid guards pass 101/101. The doc rows above were the only real gap.

**E2E after Wave 8** (2026-08-02, `--project=desktop`, 10 grid + DataTable specs): **47 passed, 11
failed** — and **none of the 11 are Wave 8**. Every swept family's own spec (bins · unfound ·
tracking-exceptions · ready · warranty-except-one · settings · admin) is green, so the factory and
`GridSortDir` are proven in a browser, not just by `tsc`.

The 11 break into three pre-existing groups:

| Count | Spec | Cause |
|---|---|---|
| 8 | `my-day-today` | Another session's in-flight `MyDayWorkspace` refactor (132-line diff, `MyDayKpiStrip` deleted, `MyDayDueHorizonChips` added) — the grid body never mounts on `/` |
| 2 | `ledger-grid-column-display` D2 + fold rows | The alignment contradiction above |
| 1 | `warranty-grid` row → `?open=` | Pre-existing — **proved** by restoring the three warranty files to HEAD and re-running: identical `1 failed, 6 passed` |

That last proof is the method to copy when a shared tree is churning: **restore the suspect files to
HEAD, re-run, compare.** Arguing from "my diff is type-only" is usually right but is not evidence;
the revert is.

**Two measurement lessons from this pass, both worth not repeating:**

- **Piping a gate through `tail` throws away its exit code.** `npm run verify … | tail -40` reports
  `tail`'s status, so a red run reads as green. Redirect to a file and check `$?`.
- **Do not run Playwright concurrently with `npm run verify`.** Contention produced a spurious
  Typecheck ✗ (clean when re-run alone) and one spurious grid-spec failure that passed 3/3 in
  isolation. Serial runs, or the result is noise.

---

## Horizon C implications (pointer only — 2026-08-01)

Long-term multi-tenant extensibility (custom fields / optional custom tables / importable
displays) is **out of scope for this inventory’s A/B classifications**. It must still mount the
same pin (`LedgerGrid` / `LedgerGridSurface` + descriptor + capabilities + RightRailHost) and
must **not** delay Phase 3 migrations (Unfound, bins, tracking-exceptions, DataTable admin wave).

- Research briefing (Gemini — no repo access; facts embedded): [`tenant-table-extensibility-HORIZON-C-GEMINI-RESEARCH-BRIEFING.md`](tenant-table-extensibility-HORIZON-C-GEMINI-RESEARCH-BRIEFING.md)
- Plan (landed later from Gemini’s report by a repo-capable agent — do not invent content here): [`tenant-table-extensibility-HORIZON-C-PLAN.md`](tenant-table-extensibility-HORIZON-C-PLAN.md)
- Sequencing home: [`ledgergrid-unified-table-sot-RESEARCH-HANDOFF.md`](ledgergrid-unified-table-sot-RESEARCH-HANDOFF.md)
