/**
 * Every table SURFACE BINDING in the product, in migration order — the one list.
 *
 * **Reduced to two surfaces (2026-08-20).** Every other collection grid was
 * deleted while its display is rewritten; each route it served still mounts and
 * renders `TableRebuildPlaceholder`, so the routes, their permissions, their
 * nav positions and their data are untouched and a rewritten display drops back
 * into a seam that still exists. Re-register a surface here as it is rebuilt —
 * this list and the registry are cross-asserted by
 * `table-record-plane.guard.test.ts`, so a binding that is not here is not in
 * the product.
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
import { RECEIVING_TABLE_BINDING } from '@/components/station/receiving-grid/receiving-table-definition';
import {
  ORDERS_DEFAULT_TABLE_BINDING,
  ORDERS_TESTED_TABLE_BINDING,
} from '@/components/dashboard/orders-queue/orders-table-definition';
import {
  TO_SHIP_DESK_DEFAULT_BINDING,
  TO_SHIP_DESK_TESTED_BINDING,
} from '@/components/outbound/orders/to-ship/to-ship-desk-table-definition';

export const REGISTERED_BINDINGS = [
  // Unbox / History / Testing — the golden spreadsheet.
  RECEIVING_TABLE_BINDING,
  // Incoming Pipeline is not a separate table: `ReceivingLinesTable` is ONE
  // component serving both, switching column model and header by mode. It
  // survives because deleting it would mean cutting a branch out of the kept
  // surface, not removing a table.
  INCOMING_TABLE_BINDING,
  // To-Ship runs on the shared parametric Orders grid: `ToShipDeskTable` mounts
  // `OrdersGridHost`, which resolves `ordersTableBindingFor(mode)`. So the two
  // Orders definitions are To-Ship's ENGINE, not a second surface — the
  // dashboard Orders queue that used to mount them is gone.
  ORDERS_DEFAULT_TABLE_BINDING,
  ORDERS_TESTED_TABLE_BINDING,
  TO_SHIP_DESK_DEFAULT_BINDING,
  TO_SHIP_DESK_TESTED_BINDING,
  // Home → Daily: the shift checklist as a real collection, not a prose list.
  DAILY_TABLE_BINDING,
] as const;
