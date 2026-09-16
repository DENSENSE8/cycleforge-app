/**
 * Every table SURFACE BINDING in the product, in migration order — the one list.
 *
 * Re-register a surface here as it is rebuilt. Routes that still render
 * `TableRebuildPlaceholder` keep their permissions, nav position and data;
 * a rewritten display drops back into a seam that still exists. This list
 * and the registry are the product's table catalog — a binding that is not
 * here is not in the product.
 *
 * ## Why this is its own module
 *
 * There were two lists: `REGISTERED_DEFINITIONS` inside the registry (which
 * mapped bindings to their `.definition`) and a hand-typed `BINDINGS` array
 * inside `table-definition-registry.guard.test.ts`. They were maintained by
 * hand, independently, and nothing compared them — so when `inventory.units`
 * and `outbound.csv-import-staging` were registered, the guard's copy was not
 * updated and those two surfaces silently escaped the definition↔columns drift
 * check for the whole of their life. The drift check is the guard's stated
 * reason for existing, so two tables had the protection its docblock promised
 * and none of the enforcement.
 *
 * One list, derived both ways, plus a coverage assertion in
 * `table-record-plane.guard.test.ts` that the registry and this array name the
 * same set. A hand-maintained "all of them" is only as good as the assertion
 * that it is all of them.
 *
 * Both of those guards — the drift check
 * (`table-definition-registry.guard.test.ts`) and that coverage assertion —
 * were named here for a long time and did not exist. They were written
 * 2026-08-31 (seller-table-program wave 1.5), which is the point at which this
 * docblock's account of what protects the list became true.
 *
 * ## Why `as const` and not an erased element type
 *
 * `TableSurfaceBinding<Row, C>` cannot be widened to hold heterogeneous row
 * shapes without erasing `makeDescriptor`'s parameter — which is contravariant,
 * so the widened form would be a cast pretending to be a guarantee (the same
 * reasoning that keeps the registry's *lookup* id-keyed rather than typed; see
 * `table-surface-binding.ts`). The tuple keeps every element exactly typed.
 */

import { INCOMING_TABLE_BINDING } from '@/components/station/incoming-grid/incoming-table-definition';
import { DAILY_TABLE_BINDING } from '@/features/home/grid/daily-table-definition';
import { TASKS_TABLE_BINDING } from '@/features/tasks/grid/tasks-table-definition';
import { RECEIVING_TABLE_BINDING } from '@/components/station/receiving-grid/receiving-table-definition';
import { ORDERS_DEFAULT_TABLE_BINDING } from '@/components/dashboard/orders-queue/orders-table-definition';
import { CATALOG_LINK_TABLE_BINDING } from '@/features/review/catalog-link/grid/catalog-link-table-definition';
import { IMPORT_EXCEPTION_TABLE_BINDING } from '@/features/review/catalog-link/grid/import-exception-table-definition';
import { UNITS_TABLE_BINDING } from '@/components/inventory/units-grid/units-table-definition';
import { CSV_IMPORT_STAGING_TABLE_BINDING } from '@/components/outbound/orders/import-staging/csv-import-staging-table-definition';
import { READY_TABLE_BINDING } from '@/components/outbound/ready/grid/ready-table-definition';
import { CATALOG_TABLE_BINDING } from '@/components/products/catalog/catalog-grid/catalog-table-definition';
import { PICKUP_TABLE_BINDING } from '@/components/receiving/pickup/grid/pickup-table-definition';
import { UNFOUND_TABLE_BINDING } from '@/components/receiving/unfound/grid/unfound-table-definition';
import { REPAIR_TABLE_BINDING } from '@/components/repair/repair-grid/repair-table-definition';
import { TECH_ALL_TABLE_BINDING } from '@/components/tech/all/tech-all-table-definition';
import { TRACKING_EXCEPTIONS_TABLE_BINDING } from '@/components/tracking-exceptions/grid/tracking-exceptions-table-definition';
import { BINS_TABLE_BINDING } from '@/components/warehouse/bins-grid/bins-table-definition';
import { INVENTORY_EVENTS_TABLE_BINDING } from '@/components/inventory/events-grid/inventory-events-table-definition';
import { WARRANTY_TABLE_BINDING } from '@/components/warranty/grid/warranty-table-definition';
import { MY_DAY_TABLE_BINDING } from '@/features/my-day/grid/my-day-table-definition';
import { KIOSKDEVICES_TABLE_BINDING } from '@/components/settings/kiosk-devices/kiosk-devices-table-definition';
import { KIOSKSLOTEVENTS_TABLE_BINDING } from '@/components/settings/kiosk-slot-events/kiosk-slot-events-table-definition';
import { WALKINSALES_TABLE_BINDING } from '@/components/walk-in/grid/walk-in-sales-table-definition';
import {
  PACKER_TABLE_BINDING,
  TECH_TABLE_BINDING,
} from '@/components/station/bench-grid/bench-table-definition';
import { AUTHSESSIONS_TABLE_BINDING } from '@/components/settings/sessions/auth-sessions-table-definition';
import { CYCLECOUNTS_TABLE_BINDING } from '@/components/inventory/cycle-counts/cycle-counts-table-definition';
import { ADMIN_RETURNS_TABLE_BINDING } from '@/components/inventory/returns-grid/admin-returns-table-definition';
import { PART_COMPATIBILITY_TABLE_BINDING } from '@/components/admin/sourcing/part-compatibility-table-definition';
import { UNIT_ALLOCATIONS_TABLE_BINDING } from '@/components/inventory/allocations-grid/unit-allocations-table-definition';
import { UNIT_TSN_LINKS_TABLE_BINDING } from '@/components/inventory/tsn-links-grid/unit-tsn-links-table-definition';
import { AUDITLOG_TABLE_BINDING } from '@/components/settings/audit-log/audit-log-table-definition';
import { ADMINHOLDS_TABLE_BINDING } from '@/components/inventory/holds-grid/admin-holds-table-definition';
import { ADMIN_BULK_ALLOCATE_TABLE_BINDING } from '@/components/inventory/bulk-allocate-grid/admin-bulk-allocate-table-definition';
import { CYCLECOUNTLINES_TABLE_BINDING } from '@/components/inventory/cycle-count-lines/cycle-count-lines-table-definition';
import { ADMIN_DRIFT_ALERTS_TABLE_BINDING } from '@/components/inventory/drift-grid/admin-drift-alerts-table-definition';
import { ADMIN_SKU_DRIFT_TABLE_BINDING } from '@/components/inventory/drift-grid/admin-sku-drift-table-definition';
import { STAFF_DIRECTORY_TABLE_BINDING } from '@/components/settings/staff-directory/staff-directory-table-definition';
import { REPORT_BIN_UTILIZATION_TABLE_BINDING } from '@/components/reports/report-bin-utilization-grid/report-bin-utilization-table-definition';
import { REPORT_VELOCITY_TABLE_BINDING } from '@/components/reports/report-velocity-grid/report-velocity-table-definition';
import { REPORT_DEAD_STOCK_TABLE_BINDING } from '@/components/reports/report-dead-stock-grid/report-dead-stock-table-definition';
import { REPORT_STAFF_DAY_TABLE_BINDING } from '@/components/reports/report-staff-day-grid/report-staff-day-table-definition';
import { SKU_BINS_TABLE_BINDING } from '@/components/inventory/sku-bins-grid/sku-bins-table-definition';
import { LOCATION_STOCK_TABLE_BINDING } from '@/components/inventory/location-stock-grid/location-stock-table-definition';
import { SKU_LEDGER_TABLE_BINDING } from '@/components/inventory/sku-ledger-grid/sku-ledger-table-definition';
import { SKU_ALLOCATIONS_TABLE_BINDING } from '@/components/inventory/sku-allocations-grid/sku-allocations-table-definition';
import { SEARCH_HITS_TABLE_BINDING } from '@/components/search/hits-grid/search-hits-table-definition';

export const REGISTERED_BINDINGS = [
  // Unbox / History / Testing — the golden spreadsheet.
  RECEIVING_TABLE_BINDING,
  // Incoming Pipeline is not a separate table: `ReceivingLinesTable` is ONE
  // component serving both, switching column model and header by mode. It
  // survives because deleting it would mean cutting a branch out of the kept
  // surface, not removing a table.
  INCOMING_TABLE_BINDING,
  // To-Ship / Packed / station queues share this parametric Orders grid —
  // ONE binding since the Wave-1 hand-model kill (`fulfillment.tested` was
  // layout as a second definition; `?ustatus=TESTED` narrows rows instead).
  // `UnshippedTable` → `useOrdersSpreadsheet` → `NonlinearTableHost`. There
  // is no desk-local `to-ship` family — that fork only isolated prefs while
  // painting the same cells, and it clipped ORDER identity.
  ORDERS_DEFAULT_TABLE_BINDING,
  // Home → Daily: the shift checklist as a real collection, not a prose list.
  DAILY_TABLE_BINDING,
  // Home → Tasks: one staffer's own `staff_todos`, ported off the hand-rolled
  // header-popover list. Sibling of `home.daily`, never a merge with it — two
  // stores answering two questions (personal list vs the org's rostered shift
  // checklist), sharing this engine and nothing else.
  TASKS_TABLE_BINDING,
  // Review · Listing match + Missing item number — two queues on one page,
  // two prefs buckets, two record planes.
  CATALOG_LINK_TABLE_BINDING,
  IMPORT_EXCEPTION_TABLE_BINDING,
  // ── Rebuilt 2026-08-29 (one-sheet-table-sot-PLAN Phase 4) ────────────────
  // Twenty-six surfaces were stubbed on `TableRebuildPlaceholder` while their
  // displays were rewritten. Each is back on the binding waist rather than as a
  // second view component with its own toolbar — the route, its permissions and
  // its data were never removed, so what returned is the display and nothing
  // else.
  //
  // Inventory › Units browse.
  UNITS_TABLE_BINDING,
  // To-Ship CSV import staging — its OWN prefs bucket, never `orders`: hiding a
  // column while triaging a file must not change the live queue's density.
  CSV_IMPORT_STAGING_TABLE_BINDING,
  // Outbound › Ready / recently-tested history.
  READY_TABLE_BINDING,
  // Products › Catalog browse. Display-safe: no triage, no dispatch.
  CATALOG_TABLE_BINDING,
  // Receiving › Local pickup (read map).
  PICKUP_TABLE_BINDING,
  // Receiving › Unfound triage — in-cell edit, no fold, no day band.
  UNFOUND_TABLE_BINDING,
  // Repair queue.
  REPAIR_TABLE_BINDING,
  // Tech / Unbox `All` triage — one strip over several stores.
  TECH_ALL_TABLE_BINDING,
  // Ops › Tracking exceptions.
  TRACKING_EXCEPTIONS_TABLE_BINDING,
  // Warehouse › Bins overview.
  BINS_TABLE_BINDING,
  // Inventory › Ledger activity — the event feed that used to be a card list.
  INVENTORY_EVENTS_TABLE_BINDING,
  // Support › Warranty claims.
  WARRANTY_TABLE_BINDING,
  // Home › Today. Sibling of `home.daily`, never a merge with it — two stores
  // answering two questions.
  MY_DAY_TABLE_BINDING,
  // Settings › Kiosk devices — enroll / revoke tablets (off AdminTable).
  KIOSKDEVICES_TABLE_BINDING,
  // Settings › Kiosk slot history — filter/export only; never Revoke.
  KIOSKSLOTEVENTS_TABLE_BINDING,
  // Dashboard › Sales walk-in history — completed visits as a slot peer.
  WALKINSALES_TABLE_BINDING,
  // Station › Tech bench history — the last third engine (StationHistoryTable →
  // StationListTable → raw LedgerGrid over the hand STATION_HISTORY_COLUMNS)
  // joining the waist. Its own prefs bucket, never the packer's.
  TECH_TABLE_BINDING,
  // Station › Packer bench history. Sibling of the tech bench, never a merge —
  // two stores answering two questions ("what did I test" / "what did I pack").
  PACKER_TABLE_BINDING,
  // Settings › Active sessions — revoke a signed-in device; Revoke is a row verb.
  AUTHSESSIONS_TABLE_BINDING,
  // Admin › Inventory cycle-count campaigns — off AdminTable (wave D). Zero
  // verbs in cells; the row navigates to the campaign's own count route.
  CYCLECOUNTS_TABLE_BINDING,
  // Admin › Returns dock — RETURNED events (off AdminTable).
  ADMIN_RETURNS_TABLE_BINDING,
  // Admin › Sourcing compatibility edges — model ↔ part (off AdminTable).
  PART_COMPATIBILITY_TABLE_BINDING,
  // Unit detail › Order allocations — off hand HTML (wave D). Shared with the
  // per-SKU allocations mount; no verbs.
  UNIT_ALLOCATIONS_TABLE_BINDING,
  // Unit detail › v1 TSN cross-refs — off hand HTML (wave D). Read-only.
  UNIT_TSN_LINKS_TABLE_BINDING,
  // Settings › Audit log — off AdminTable (wave D). Read-only: no row verbs,
  // and recordPlane 'none' because the before/after diff was never built.
  AUDITLOG_TABLE_BINDING,
  // Admin › Inventory holds — the quarantine queue (off AdminTable, wave D).
  // Release is a row verb behind a stage-overlay plane; the row navigates to
  // the unit's own timeline.
  ADMINHOLDS_TABLE_BINDING,
  // Admin › Bulk allocate — allocation candidates (off AdminTable, wave D).
  // One row verb (Allocate), invoked through the page's own server action.
  ADMIN_BULK_ALLOCATE_TABLE_BINDING,
  // Admin › Cycle count LINES — off AdminTable (wave D). Count / Approve /
  // Reject are row verbs; the count opens a DeskStageOverlay because its
  // payload needs a parameter and `inCellEdit` stays false.
  CYCLECOUNTLINES_TABLE_BINDING,
  // Admin › Inventory open DRIFT alerts — off AdminTable (wave D). Read-only:
  // the drift-check cron opens and resolves them, so no row verbs. The state
  // pill is the magnitude, because every row on the feed is unresolved.
  ADMIN_DRIFT_ALERTS_TABLE_BINDING,
  // Admin › Inventory sku_stock ↔ ledger drift — off AdminTable (wave D). A
  // read-time comparison with no id and no stamp; the retired clean-drift
  // paragraph is now the table's empty STATE, not an empty branch.
  ADMIN_SKU_DRIFT_TABLE_BINDING,
  // Settings › Team directory — off AdminTable (wave D). Sign-in policy and
  // Deactivate are row verbs behind stage-overlay planes; picking a row
  // NAVIGATES to Settings → Access, the destination the retired Role cell
  // linked to per row.
  STAFF_DIRECTORY_TABLE_BINDING,
  // Reports › Bin utilization / Velocity / Dead stock — off AdminTable (wave
  // D). THREE families, not one `reports` table: three row shapes cannot share
  // a layout document, and the Fields menu keys off tableId, so the tab switch
  // switches the picker with it. All read-only; recordPlane 'none' because the
  // rows are projections and the SKU / bin already have their own desks.
  REPORT_BIN_UTILIZATION_TABLE_BINDING,
  REPORT_VELOCITY_TABLE_BINDING,
   REPORT_DEAD_STOCK_TABLE_BINDING,
  // Reports › Staff day — the per-staff-per-day shift report (Track R4). Same
  // law as its three siblings: own tableId, read-only, recordPlane 'none' —
  // the row is a projection of the daily-check report, and the interactive
  // per-person view is /m/reports over the same buildStaffDay projection.
  REPORT_STAFF_DAY_TABLE_BINDING,
  // Admin › per-SKU bin distribution and stock ledger — the last two
  // AdminTable sections of /inventory/health/sku/[sku] (wave D). Read-only.
  SKU_BINS_TABLE_BINDING,
  SKU_LEDGER_TABLE_BINDING,
  // Admin › per-SKU open allocations — the SIBLING document over the
  // `unit-allocations` entity: same family, same catalog by reference, its own
  // stored layout and its own record plane (the unit desk declares 'none', a
  // per-SKU row opens `/inventory?unit=<id>`). The guard that forbids
  // two bindings sharing a tableId is why an honest per-desk plane needs it.
  SKU_ALLOCATIONS_TABLE_BINDING,
  // `/search` find plane — off a hand-rolled <ul> of result links
  // (`READ_PLANE_IS_A_MOUNT`). ONE family over six entity types: the row shape
  // is the search wire, and the adapter is where the six collapse. Read-only,
  // no verbs, and the record plane is the `?sel=` handoff a FIND surface
  // exists for.
  SEARCH_HITS_TABLE_BINDING,
  // Inventory › Stock — the warehouse-wide (location, sku) pair list. Read-only
  // and recordPlane 'none': `bin_contents` is written by counts and moves at
  // the stations that scan them, and no route opens a PAIR. Its own tableId
  // rather than a third mount of `bins`/`sku-bins`, which row a location and
  // one SKU respectively.
  LOCATION_STOCK_TABLE_BINDING,
] as const;
