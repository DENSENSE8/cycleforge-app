/**
 * Every table SURFACE BINDING in the product, in migration order — the one list.
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
import { RECEIVING_TABLE_BINDING } from '@/components/station/receiving-grid/receiving-table-definition';
import { READY_TABLE_BINDING } from '@/components/outbound/ready/grid/ready-table-definition';
import { PICKUP_TABLE_BINDING } from '@/components/receiving/pickup/grid/pickup-table-definition';
import { UNFOUND_TABLE_BINDING } from '@/components/receiving/unfound/grid/unfound-table-definition';
import { TECH_ALL_TABLE_BINDING } from '@/components/tech/all/tech-all-table-definition';
import { TRACKING_EXCEPTIONS_TABLE_BINDING } from '@/components/tracking-exceptions/grid/tracking-exceptions-table-definition';
import { WARRANTY_TABLE_BINDING } from '@/components/warranty/grid/warranty-table-definition';
import { MY_DAY_TABLE_BINDING } from '@/features/my-day/grid/my-day-table-definition';
import { CATALOG_TABLE_BINDING } from '@/components/products/catalog/catalog-grid/catalog-table-definition';
import { REPAIR_TABLE_BINDING } from '@/components/repair/repair-grid/repair-table-definition';
import { BINS_TABLE_BINDING } from '@/components/warehouse/bins-grid/bins-table-definition';
import { UNITS_TABLE_BINDING } from '@/components/inventory/units-grid/units-table-definition';
import {
  CATALOG_LINK_TABLE_BINDING,
  IMPORT_EXCEPTION_TABLE_BINDING,
} from '@/features/review/catalog-link/grid/catalog-link-table-definition';
import {
  ORDERS_DEFAULT_TABLE_BINDING,
  ORDERS_TESTED_TABLE_BINDING,
} from '@/components/dashboard/orders-queue/orders-table-definition';
import { CSV_IMPORT_STAGING_TABLE_BINDING } from '@/components/outbound/orders/import-staging/csv-import-staging-table-definition';

export const REGISTERED_BINDINGS = [
  RECEIVING_TABLE_BINDING,
  INCOMING_TABLE_BINDING,
  // Wave 2 — the thin-adapter cluster (one template, seven surfaces).
  READY_TABLE_BINDING,
  PICKUP_TABLE_BINDING,
  UNFOUND_TABLE_BINDING,
  TECH_ALL_TABLE_BINDING,
  TRACKING_EXCEPTIONS_TABLE_BINDING,
  WARRANTY_TABLE_BINDING,
  MY_DAY_TABLE_BINDING,
  // Wave 3 — the second-shape adapters.
  CATALOG_TABLE_BINDING,
  REPAIR_TABLE_BINDING,
  BINS_TABLE_BINDING,
  // Wave 0 (SoT page-violation migrate) — Inventory units browse collection.
  UNITS_TABLE_BINDING,
  // Wave 4 — Review · Catalog-link: two definitions, one shared capabilities bag.
  CATALOG_LINK_TABLE_BINDING,
  IMPORT_EXCEPTION_TABLE_BINDING,
  // Wave 5 — Orders: two column-mode definitions for the shared parametric grid.
  ORDERS_DEFAULT_TABLE_BINDING,
  ORDERS_TESTED_TABLE_BINDING,
  // Wave 6 — To-Ship CSV import staging: a triage sheet over a session draft,
  // its own family so a staging column pref never touches the live queue.
  CSV_IMPORT_STAGING_TABLE_BINDING,
] as const;
