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
import {
  ORDERS_DEFAULT_TABLE_BINDING,
  ORDERS_TESTED_TABLE_BINDING,
} from '@/components/dashboard/orders-queue/orders-table-definition';
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
import { WARRANTY_TABLE_BINDING } from '@/components/warranty/grid/warranty-table-definition';
import { MY_DAY_TABLE_BINDING } from '@/features/my-day/grid/my-day-table-definition';
import { FBA_BOARD_TABLE_BINDING } from '@/components/fba/fba-board-table-definition';


export const REGISTERED_BINDINGS = [
  // Unbox / History / Testing — the golden spreadsheet.
  RECEIVING_TABLE_BINDING,
  // Incoming Pipeline is not a separate table: `ReceivingLinesTable` is ONE
  // component serving both, switching column model and header by mode. It
  // survives because deleting it would mean cutting a branch out of the kept
  // surface, not removing a table.
  INCOMING_TABLE_BINDING,
  // To-Ship / Packed / station queues share this parametric Orders grid.
  // `UnshippedTable` → `useOrdersSpreadsheet` → `ordersTableBindingFor(mode)`
  // → `NonlinearTableHost`. There
  // is no desk-local `to-ship` family — that fork only isolated prefs while
  // painting the same cells, and it clipped ORDER identity.
  ORDERS_DEFAULT_TABLE_BINDING,
  ORDERS_TESTED_TABLE_BINDING,
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
  // Support › Warranty claims.
  WARRANTY_TABLE_BINDING,
  // Home › Today. Sibling of `home.daily`, never a merge with it — two stores
  // answering two questions.
  MY_DAY_TABLE_BINDING,
  // Amazon Prep › shipment board. The LAST surface to reach `LedgerGrid`
  // without a definition — it hand-rolled its track template and its header
  // spans until 2026-08-29, so a column model here would have been a stale
  // second declaration. Now that both derive from `FBA_BOARD_GRID_COLUMNS`, the
  // descriptor describes what renders and the board joins the waist.
  FBA_BOARD_TABLE_BINDING,
] as const;
