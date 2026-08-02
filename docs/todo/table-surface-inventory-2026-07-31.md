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
| `/receiving/unfound` | [`UnfoundQueueTable.tsx`](../../src/components/receiving/unfound/UnfoundQueueTable.tsx) (+ `queue-table/QueueTableRow`) | hand-rolled `<table class="table-fixed">` | `v_unfound_queue` (unmatched receiving · email PO) | open-highlight only | **debounced in-cell PATCH** per field | **`migrate-to-LedgerGrid`** | Highest-value wave: it is a genuine ops queue *and* already has in-cell edit — it would light up `inCellEdit: true` + `multiSelect`. Filter state already URL-backed. |
| ~~`/shipping/ready`~~ | ~~`ReadyQueueTable.tsx`~~ → [`ReadyGridView.tsx`](../../src/components/outbound/ready/grid/ReadyGridView.tsx) | **MIGRATED 2026-08-01** — `LedgerGridSurface` + `outbound.ready` descriptor | `AllocationHit` | none (history) | Stage-FBA link | ✅ `done` | Wave 2. See [Phase 3 wave log](#phase-3-wave-log). |
| `/warehouse` (bins) | [`BinsTable.tsx`](../../src/components/warehouse/BinsTable.tsx) (host `WarehouseShell`) | hand-rolled `<table>` + **local `SortKey`/`SortDir` state machine** | `BinsOverviewRow` | multi-check (parent-controlled `Set<number>`) | flyout (record) | **`migrate-to-LedgerGrid`** | Hand-rolled sort toggle = a second sort state machine (SoT ban). Already has selection + bulk bar semantics → `multiSelect: true`. |
| `/tracking-exceptions` | [`TrackingExceptionsTable.tsx`](../../src/components/tracking-exceptions/TrackingExceptionsTable.tsx) | hand-rolled `<table>` (516 lines) | `tracking_exceptions` | none | Dialog edit | **`migrate-to-LedgerGrid`** | Ops triage queue. Big file — split data/mutations out first. |
| ~~`/support?mode=warranty`~~ | ~~`WarrantyClaimsTable.tsx`~~ → [`WarrantyGridView.tsx`](../../src/components/warranty/grid/WarrantyGridView.tsx) | **MIGRATED 2026-08-01** — `LedgerGridSurface` + `support.warranty` descriptor | `WarrantyClaimListRow` | record plane (`?open=`) | ticket popover (row-scoped) | ✅ `done` | Wave 1. See [Phase 3 wave log](#phase-3-wave-log). |
| `/review?mode=catalog-link` | [`ReviewCatalogLinkTable.tsx`](../../src/features/review/catalog-link/ReviewCatalogLinkTable.tsx) | `divide-y <ul>` lists (621 lines) | unmatched listings / missing item-number sheet rows | none | link/resolve actions | **`migrate-to-LedgerGrid`** *(ask-first)* | Named "Table" but is a two-pane resolve UI. Confirm with human whether the job is *browse-a-queue* (migrate) or *resolve-one-at-a-time* (keep-sibling). |

---

## D. Admin / settings / reports — the `DataTable` wave (currently all hand-rolled)

None of these mount `DataTable`. All are small, non-virtualized lifecycle tables — exactly the
sibling's stated job.

| Route | File | `<table>` count | Horizon A |
|---|---|---|---|
| `/settings/staff` | `app/settings/staff/StaffTable.tsx` | 1 | `migrate-to-DataTable` |
| `/settings/audit` | `app/settings/audit/page.tsx` | 1 | `migrate-to-DataTable` |
| `/settings/ai` | `app/settings/ai/page.tsx` | 1 | `migrate-to-DataTable` |
| `/settings` → Kiosk devices | `components/settings/sections/KioskDevicesSection.tsx` | 1 | `migrate-to-DataTable` |
| `/settings` → Sessions | `components/settings/sections/SessionsSection.tsx` | 1 | `migrate-to-DataTable` |
| `/reports` | `app/reports/page.tsx` | 3 | `migrate-to-DataTable` |
| `/admin` → Compatibility | `components/admin/sourcing/CompatibilityManagementTab.tsx` | 1 | `migrate-to-DataTable` |
| `/admin/inventory` (hub) | `_inventory-admin/TableSections.tsx` · `StatusSections.tsx` | 4 + 1 | `migrate-to-DataTable` |
| `/admin/inventory/events` | `events/page.tsx` | 1 | `migrate-to-DataTable` |
| `/admin/inventory/holds` | `holds/page.tsx` | 1 | `migrate-to-DataTable` |
| `/admin/inventory/returns` | `returns/page.tsx` | 1 | `migrate-to-DataTable` |
| `/admin/inventory/cycle-counts` (+ `[id]`) | `cycle-counts/page.tsx` · `[id]/page.tsx` | 1 + 1 | `migrate-to-DataTable` |
| `/admin/inventory/bulk-allocate` | `bulk-allocate/page.tsx` | 1 | `migrate-to-DataTable` |
| `/admin/inventory/throughput` | `throughput/page.tsx` | 2 | `migrate-to-DataTable` |
| `/admin/inventory/sku/[sku]` | `sku/[sku]/page.tsx` | 5 | `migrate-to-DataTable` |

**Total ≈ 26 hand-rolled `<table>` elements across 15 files.** Recommend one wave for
`/admin/inventory/**` (largest, most uniform) and one for `/settings` + `/reports`.

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
3. `BinsTable` (retires a hand-rolled sort state machine)
4. `UnfoundQueueTable` (highest value — lights up `inCellEdit`)
5. `TrackingExceptionsTable`
6. `/admin/inventory/**` → `DataTable`
7. `/settings` + `/reports` → `DataTable`
8. `ReviewCatalogLinkTable` — **ask human first** (job classification unresolved)

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

---

## Compound opportunities

**Do now (in scope / low blast radius)**
- ~~Capabilities for the two undeclared LedgerGrid mounts (A1).~~ **Done.**
- ~~Structural guard: "no LedgerGrid mount without a declared bag".~~ **Done** — turns the next miss into a test failure instead of a review catch.
- One-line sort-vocabulary rule in `source-of-truth.md` (A3).
- **New, surfaced by the A1 fix:** `OrdersQueueTableRow` is now the only shared row component threading a capabilities bag. If a second family's row is ever reused across surfaces, thread the bag the same way — required prop, gated once at derivation — rather than importing a neighbour's const.

**Promote to DS next (2+ call sites)**
- `BinsTable`'s local `SortKey`/`SortDir` machine and `UnfoundQueueTable`'s debounced in-cell PATCH are each a second implementation of something the SoT owns (`useUrlColumnSort`, `LedgerCellEditor`). Migrate the call sites rather than porting the pattern.
- `DataTable` likely needs sort + selection parity before it can absorb 15 admin files — grow it once, then migrate.

**Deferred / ask-first**
- ~~**`LedgerGrid.empty` counts bands, not rows**~~ — **DONE 2026-08-01**: now `hasGridRows`, which repaired `/pickup` for free.
- Two other guards claim discovery but hand-list their scope: `grid-column-display` (`GRID_DIRS`) and `ledger-grid-column-header` (`ADAPTERS`). Widened for warranty this wave; making them walk the tree the way the capabilities guard now does would stop the next family being silently unguarded.
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

---

## Horizon C implications (pointer only — 2026-08-01)

Long-term multi-tenant extensibility (custom fields / optional custom tables / importable
displays) is **out of scope for this inventory’s A/B classifications**. It must still mount the
same pin (`LedgerGrid` / `LedgerGridSurface` + descriptor + capabilities + RightRailHost) and
must **not** delay Phase 3 migrations (Unfound, bins, tracking-exceptions, DataTable admin wave).

- Research briefing (Gemini — no repo access; facts embedded): [`tenant-table-extensibility-HORIZON-C-GEMINI-RESEARCH-BRIEFING.md`](tenant-table-extensibility-HORIZON-C-GEMINI-RESEARCH-BRIEFING.md)
- Plan (landed later from Gemini’s report by a repo-capable agent — do not invent content here): [`tenant-table-extensibility-HORIZON-C-PLAN.md`](tenant-table-extensibility-HORIZON-C-PLAN.md)
- Sequencing home: [`ledgergrid-unified-table-sot-RESEARCH-HANDOFF.md`](ledgergrid-unified-table-sot-RESEARCH-HANDOFF.md)
