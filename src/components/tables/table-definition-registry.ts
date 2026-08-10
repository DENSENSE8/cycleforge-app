/**
 * The table DEFINITION registry — one place that knows every Workbench
 * spreadsheet definition in the product, keyed by `<family>.<view>` id.
 *
 * Plan: `docs/todo/nonlinear-data-table-engine-PLAN.md` (Phase 1, candidate 1 —
 * a static TypeScript registry, Stripe-style). DB-backed org definitions are
 * Horizon C and are deliberately NOT here: the code registry is the kernel that
 * one compounds on, and building the runtime store first would leave nothing to
 * validate an authored payload against.
 *
 * `descriptor.id` has existed as a free-form string on every family descriptor
 * since Phase C and has never had a reader. This is the first one — which is
 * why ids are now shaped (`<family>.<view>`) and enumerated rather than typed
 * once per file and forgotten.
 *
 * ## What lives here vs at the mount
 *
 * The registry holds **bindings** (definition + typed columns + descriptor
 * factory). A page hands the binding to `NonlinearTableHost` and supplies only
 * its feed, its intents and its renderers. Adding a queue should be a registry
 * entry plus a thin binding — never a new `*GridView.tsx`.
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
import type { TableDefinition } from '@/lib/tables/table-definition';

/**
 * Every registered binding, in migration order.
 *
 * Typed loosely (`TableSurfaceBinding<never, never>` would not hold two row
 * shapes) — the map is for **enumeration and lookup of the data half**. A mount
 * imports its family's binding directly so `Row`/`C` stay checked at compile
 * time; see `table-surface-binding.ts` for why an id-keyed typed lookup would
 * be a cast pretending to be a guarantee.
 */
const REGISTERED_DEFINITIONS: readonly TableDefinition[] = [
  RECEIVING_TABLE_BINDING.definition,
  INCOMING_TABLE_BINDING.definition,
  // Wave 2 — the thin-adapter cluster (one template, seven surfaces).
  READY_TABLE_BINDING.definition,
  PICKUP_TABLE_BINDING.definition,
  UNFOUND_TABLE_BINDING.definition,
  TECH_ALL_TABLE_BINDING.definition,
  TRACKING_EXCEPTIONS_TABLE_BINDING.definition,
  WARRANTY_TABLE_BINDING.definition,
  MY_DAY_TABLE_BINDING.definition,
  // Wave 3 — the second-shape adapters.
  CATALOG_TABLE_BINDING.definition,
  REPAIR_TABLE_BINDING.definition,
  BINS_TABLE_BINDING.definition,
  // Wave 0 (SoT page-violation migrate) — Inventory units browse collection.
  UNITS_TABLE_BINDING.definition,
  // Wave 4 — Review · Catalog-link: two definitions, one shared capabilities bag.
  CATALOG_LINK_TABLE_BINDING.definition,
  IMPORT_EXCEPTION_TABLE_BINDING.definition,
  // Wave 5 — Orders: two column-mode definitions for the shared parametric grid.
  ORDERS_DEFAULT_TABLE_BINDING.definition,
  ORDERS_TESTED_TABLE_BINDING.definition,
  // Wave 6 — To-Ship CSV import staging: a triage sheet over a session draft,
  // its own family so a staging column pref never touches the live queue.
  CSV_IMPORT_STAGING_TABLE_BINDING.definition,
];

export const TABLE_DEFINITIONS: Readonly<Record<string, TableDefinition>> = Object.freeze(
  Object.fromEntries(REGISTERED_DEFINITIONS.map((d) => [d.id, d])),
);

/** Registered ids, sorted — the enumeration guards and Studio read. */
export function tableDefinitionIds(): string[] {
  return Object.keys(TABLE_DEFINITIONS).sort();
}

/**
 * Look up a definition's DATA by id. Returns `undefined` for an unknown id —
 * a caller resolving a stored/authored id must answer for the miss rather than
 * silently mounting a different grid.
 */
export function getTableDefinition(id: string): TableDefinition | undefined {
  return TABLE_DEFINITIONS[id];
}
