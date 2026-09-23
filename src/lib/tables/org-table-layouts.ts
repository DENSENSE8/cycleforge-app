/**
 * Org-wide slot layouts — the ORG layer of the slot-table cascade, stored in
 * the `organizations.settings.tableLayouts` JSONB bag (keyed by the same
 * tableId as `PRODUCT_TABLES`; no DDL — the bag is `.passthrough()`).
 *
 * The registry below names which tables HAVE opted into slot layouts and which
 * catalog validates their bindings. Opt-in is explicit and per-family
 * (`docs/todo/slot-based-metadata-table-PLAN.md` §6): a tableId absent here is
 * a 404 at the API, never a silently-accepted blob — Phase 3+ ports (pickup,
 * customers, …) add one entry each, per the plan's adoption checklist.
 *
 * Pure helpers only; the route owns the read/write of the org row.
 */

import {
  ORDERS_IMPORT_FIELD_CATALOG,
  ORDERS_IMPORT_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/orders-import';
import { ORDERS_FIELD_CATALOG, ORDERS_TABLE_LAYOUT_ID } from '@/lib/tables/field-catalog/orders';
import {
  AUTHSESSIONS_FIELD_CATALOG,
  AUTHSESSIONS_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/auth-sessions';
import {
  CYCLECOUNTS_FIELD_CATALOG,
  CYCLECOUNTS_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/cycle-counts';
import {
  ADMIN_RETURNS_FIELD_CATALOG,
  ADMIN_RETURNS_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/admin-returns';
import {
  PART_COMPATIBILITY_FIELD_CATALOG,
  PART_COMPATIBILITY_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/part-compatibility';
import {
  UNIT_ALLOCATIONS_FIELD_CATALOG,
  UNIT_ALLOCATIONS_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/unit-allocations';
import {
  UNIT_TSN_LINKS_FIELD_CATALOG,
  UNIT_TSN_LINKS_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/unit-tsn-links';
import {
  AUDITLOG_FIELD_CATALOG,
  AUDITLOG_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/audit-log';
import {
  ADMINHOLDS_FIELD_CATALOG,
  ADMINHOLDS_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/admin-holds';
import {
  ADMIN_BULK_ALLOCATE_FIELD_CATALOG,
  ADMIN_BULK_ALLOCATE_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/admin-bulk-allocate';
import {
  CYCLECOUNTLINES_FIELD_CATALOG,
  CYCLECOUNTLINES_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/cycle-count-lines';
import {
  ADMIN_DRIFT_ALERTS_FIELD_CATALOG,
  ADMIN_DRIFT_ALERTS_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/admin-drift-alerts';
import {
  ADMIN_SKU_DRIFT_FIELD_CATALOG,
  ADMIN_SKU_DRIFT_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/admin-sku-drift';
import {
  STAFF_DIRECTORY_FIELD_CATALOG,
  STAFF_DIRECTORY_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/staff-directory';
import {
  REPORT_BIN_UTILIZATION_FIELD_CATALOG,
  REPORT_BIN_UTILIZATION_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/report-bin-utilization';
import {
  REPORT_VELOCITY_FIELD_CATALOG,
  REPORT_VELOCITY_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/report-velocity';
import {
  REPORT_DEAD_STOCK_FIELD_CATALOG,
  REPORT_DEAD_STOCK_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/report-dead-stock';
import {
  REPORT_STAFF_DAY_FIELD_CATALOG,
  REPORT_STAFF_DAY_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/report-staff-day';
import {
  REPORT_PACKER_DAY_FIELD_CATALOG,
  REPORT_PACKER_DAY_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/report-packer-day';
import {
  REPORT_TASKS_FIELD_CATALOG,
  REPORT_TASKS_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/report-tasks';
import {
  SKU_BINS_FIELD_CATALOG,
  SKU_BINS_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/sku-bins';
import {
  LOCATION_STOCK_FIELD_CATALOG,
  LOCATION_STOCK_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/location-stock';
import {
  SKU_LEDGER_FIELD_CATALOG,
  SKU_LEDGER_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/sku-ledger';
import { SKU_ALLOCATIONS_TABLE_LAYOUT_ID } from '@/lib/tables/field-catalog/sku-allocations-layout';
import {
  SEARCH_HITS_FIELD_CATALOG,
  SEARCH_HITS_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/search-hits';
import { PICKUP_FIELD_CATALOG, PICKUP_TABLE_LAYOUT_ID } from '@/lib/tables/field-catalog/pickup';
import {
  CATALOG_LINK_FIELD_CATALOG,
  CATALOG_LINK_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/catalog-link';
import { BINS_FIELD_CATALOG, BINS_TABLE_LAYOUT_ID } from '@/lib/tables/field-catalog/bins';
import {
  INVENTORY_EVENTS_FIELD_CATALOG,
  INVENTORY_EVENTS_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/inventory-events';
import {
  CATALOG_FIELD_CATALOG,
  CATALOG_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/catalog';
import { DAILY_FIELD_CATALOG, DAILY_TABLE_LAYOUT_ID } from '@/lib/tables/field-catalog/daily';
import {
  IMPORT_EXCEPTION_FIELD_CATALOG,
  IMPORT_EXCEPTION_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/import-exception';
import { TASKS_FIELD_CATALOG, TASKS_TABLE_LAYOUT_ID } from '@/lib/tables/field-catalog/tasks';
import {
  TECH_ALL_FIELD_CATALOG,
  TECH_ALL_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/tech-all';
import {
  INCOMING_FIELD_CATALOG,
  INCOMING_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/incoming';
import {
  RECEIVING_FIELD_CATALOG,
  RECEIVING_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/receiving';
import { MY_DAY_FIELD_CATALOG, MY_DAY_TABLE_LAYOUT_ID } from '@/lib/tables/field-catalog/my-day';
import { READY_FIELD_CATALOG, READY_TABLE_LAYOUT_ID } from '@/lib/tables/field-catalog/ready';
import { REPAIR_FIELD_CATALOG, REPAIR_TABLE_LAYOUT_ID } from '@/lib/tables/field-catalog/repair';
import {
  TRACKING_EXCEPTIONS_FIELD_CATALOG,
  TRACKING_EXCEPTIONS_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/tracking-exceptions';
import { UNFOUND_FIELD_CATALOG, UNFOUND_TABLE_LAYOUT_ID } from '@/lib/tables/field-catalog/unfound';
import { UNITS_FIELD_CATALOG, UNITS_TABLE_LAYOUT_ID } from '@/lib/tables/field-catalog/units';
import {
  WARRANTY_FIELD_CATALOG,
  WARRANTY_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/warranty';
import {
  KIOSKDEVICES_FIELD_CATALOG,
  KIOSKDEVICES_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/kiosk-devices';
import {
  KIOSKSLOTEVENTS_FIELD_CATALOG,
  KIOSKSLOTEVENTS_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/kiosk-slot-events';
import {
  WALKINSALES_FIELD_CATALOG,
  WALKINSALES_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/walk-in-sales';
import { PACKER_FIELD_CATALOG, PACKER_TABLE_LAYOUT_ID } from '@/lib/tables/field-catalog/packer';
import { TECH_FIELD_CATALOG, TECH_TABLE_LAYOUT_ID } from '@/lib/tables/field-catalog/tech';
import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import { readStoredSlotLayout, type SlotLayout } from '@/lib/tables/slot-layout-core';

/**
 * Slot-opted-in tables: tableId → the catalog its bindings validate against,
 * and which morphs the table's mount can actually PAINT. To-ship renders the
 * compound morph only this ship (sheet paint is Phase 4); storing a `sheet`
 * layout would materialize subtitle tracks nothing draws — a header over
 * blank cells for the whole org — so the write gate refuses it here.
 */
export const SLOT_LAYOUT_TABLES: Readonly<
  Record<string, { catalog: FieldCatalog; morphs: readonly ('sheet' | 'compound')[] }>
> = {
  [ORDERS_TABLE_LAYOUT_ID]: { catalog: ORDERS_FIELD_CATALOG, morphs: ['compound'] },
  // Wave 2 (kill-list 07 §4): pickup renders the SHEET morph only — a stored
  // `compound` layout would promise a two-row item cell nothing draws.
  [PICKUP_TABLE_LAYOUT_ID]: { catalog: PICKUP_FIELD_CATALOG, morphs: ['sheet'] },
  // DELIBERATELY ABSENT: `fba` (Amazon Prep). Its catalog and product layout
  // survive in `field-catalog/fba.ts`, but the board DISPLAY was torn out
  // 2026-08-30 — and while the id stayed registered, `/api/tables/layouts`
  // accepted and stored an organization column layout for a table that renders
  // nothing. A manager could "save the columns" into a void, with no error
  // anywhere. Opt-in is per-MOUNT, not per-catalog (operator ruling
  // 2026-08-31, seller-table-program wave 1.2): unregistered, so the route
  // 404s until the board is rebuilt. Re-add one line with the rebuilt mount.
  // Wave 1.1 (seller-table-program §03): Ready renders the SHEET morph only —
  // a stored `compound` layout would promise a two-row item cell nothing draws.
  [READY_TABLE_LAYOUT_ID]: { catalog: READY_FIELD_CATALOG, morphs: ['sheet'] },
  // Wave 1.3: receiving is the COMPOUND golden — Unbox, History and Testing
  // all mount the same compound row, so a stored `sheet` layout would open
  // subtitle tracks nothing draws.
  [RECEIVING_TABLE_LAYOUT_ID]: { catalog: RECEIVING_FIELD_CATALOG, morphs: ['compound'] },
  // Incoming rides the same compound cells and the same row type as receiving,
  // and still gets its OWN document: "status" means the carrier's answer here
  // and the warehouse's answer there. Two tableIds, one cell map.
  [INCOMING_TABLE_LAYOUT_ID]: { catalog: INCOMING_FIELD_CATALOG, morphs: ['compound'] },
  // The shift checklist — an information table like every other, so "what we
  // check on the shift board" is layout, not a new column file.
  [DAILY_TABLE_LAYOUT_ID]: { catalog: DAILY_FIELD_CATALOG, morphs: ['compound'] },
  // Daily's sibling — same slots, different store, its OWN vocabulary: one is
  // the org's shift checklist with a roster, the other a staffer's own list.
  [TASKS_TABLE_LAYOUT_ID]: { catalog: TASKS_FIELD_CATALOG, morphs: ['compound'] },
  // Review · Listing match — matching chores are facts; the strip is slots.
  [CATALOG_LINK_TABLE_LAYOUT_ID]: {
    catalog: CATALOG_LINK_FIELD_CATALOG,
    morphs: ['compound'],
  },
  // Review's second queue, on the same page as the first: two catalogs, two
  // layouts — not two engines.
  [IMPORT_EXCEPTION_TABLE_LAYOUT_ID]: {
    catalog: IMPORT_EXCEPTION_FIELD_CATALOG,
    morphs: ['compound'],
  },
  // Wave 1.4 — the sheet families. Unit browse: bind into identity/status,
  // never another units-only header.
  [UNITS_TABLE_LAYOUT_ID]: { catalog: UNITS_FIELD_CATALOG, morphs: ['sheet'] },
  [BINS_TABLE_LAYOUT_ID]: { catalog: BINS_FIELD_CATALOG, morphs: ['sheet'] },
  [INVENTORY_EVENTS_TABLE_LAYOUT_ID]: {
    catalog: INVENTORY_EVENTS_FIELD_CATALOG,
    morphs: ['compound'],
  },
  [WARRANTY_TABLE_LAYOUT_ID]: { catalog: WARRANTY_FIELD_CATALOG, morphs: ['sheet'] },
  [CATALOG_TABLE_LAYOUT_ID]: { catalog: CATALOG_FIELD_CATALOG, morphs: ['sheet'] },
  [TECH_ALL_TABLE_LAYOUT_ID]: { catalog: TECH_ALL_FIELD_CATALOG, morphs: ['sheet'] },
  [UNFOUND_TABLE_LAYOUT_ID]: { catalog: UNFOUND_FIELD_CATALOG, morphs: ['sheet'] },
  [REPAIR_TABLE_LAYOUT_ID]: { catalog: REPAIR_FIELD_CATALOG, morphs: ['sheet'] },
  [MY_DAY_TABLE_LAYOUT_ID]: { catalog: MY_DAY_FIELD_CATALOG, morphs: ['sheet'] },
  [TRACKING_EXCEPTIONS_TABLE_LAYOUT_ID]: {
    catalog: TRACKING_EXCEPTIONS_FIELD_CATALOG,
    morphs: ['sheet'],
  },
  // Staging keeps its OWN document on purpose — hiding a staging column must
  // not densify live To-ship.
  [ORDERS_IMPORT_TABLE_LAYOUT_ID]: {
    catalog: ORDERS_IMPORT_FIELD_CATALOG,
    morphs: ['sheet'],
  },
  // Settings › Kiosk devices — compound only (no sheet paint on this mount).
  [KIOSKDEVICES_TABLE_LAYOUT_ID]: {
    catalog: KIOSKDEVICES_FIELD_CATALOG,
    morphs: ['compound'],
  },
  // Settings › Kiosk slot history — compound read map; no Revoke.
  [KIOSKSLOTEVENTS_TABLE_LAYOUT_ID]: {
    catalog: KIOSKSLOTEVENTS_FIELD_CATALOG,
    morphs: ['compound'],
  },
  // Dashboard › Sales — KEEP catalog on the engine. The desk still paints
  // WalkInFeedPane (no paint change this session).
  [WALKINSALES_TABLE_LAYOUT_ID]: {
    catalog: WALKINSALES_FIELD_CATALOG,
    morphs: ['compound'],
  },
  // Station › Tech bench history — COMPOUND only. A bench log is the same
  // two-row scan list Unbox / History / Testing paint, so a stored `sheet`
  // layout would open subtitle tracks nothing draws (receiving's reason).
  [TECH_TABLE_LAYOUT_ID]: { catalog: TECH_FIELD_CATALOG, morphs: ['compound'] },
  // Station › Packer bench history — same mount, its own document: hiding a
  // column on the pack bench must not densify the test bench.
  [PACKER_TABLE_LAYOUT_ID]: { catalog: PACKER_FIELD_CATALOG, morphs: ['compound'] },
  // Settings › Active sessions — compound only (no sheet paint on this mount).
  [AUTHSESSIONS_TABLE_LAYOUT_ID]: {
    catalog: AUTHSESSIONS_FIELD_CATALOG,
    morphs: ['compound'],
  },
  // Admin › Cycle count campaigns — COMPOUND only. A stored `sheet` layout
  // would open a subtitle track for the variance tolerance, which the compound
  // item cell paints inline.
  [CYCLECOUNTS_TABLE_LAYOUT_ID]: {
    catalog: CYCLECOUNTS_FIELD_CATALOG,
    morphs: ['compound'],
  },
  // Admin › Returns dock — COMPOUND only. It rides the Ledger's cells and
  // still gets its OWN document: hiding a fact on the dock must not densify
  // inventory-events. Two tableIds, one cell map.
  [ADMIN_RETURNS_TABLE_LAYOUT_ID]: {
    catalog: ADMIN_RETURNS_FIELD_CATALOG,
    morphs: ['compound'],
  },
  // Admin › Sourcing compatibility — COMPOUND only. A stored `sheet` layout
  // would open a `subtitle:1` track for the model name, which the compound
  // item cell paints inline.
  [PART_COMPATIBILITY_TABLE_LAYOUT_ID]: {
    catalog: PART_COMPATIBILITY_FIELD_CATALOG,
    morphs: ['compound'],
  },
  // Unit detail › Order allocations — COMPOUND only. ONE document for the
  // entity: the per-SKU mount reuses this catalog.
  [UNIT_ALLOCATIONS_TABLE_LAYOUT_ID]: {
    catalog: UNIT_ALLOCATIONS_FIELD_CATALOG,
    morphs: ['compound'],
  },
  // Unit detail › v1 tech_serial_numbers cross-refs — COMPOUND only. A legacy
  // read ledger (the kiosk-slot-events shape): no verbs, ever.
  [UNIT_TSN_LINKS_TABLE_LAYOUT_ID]: {
    catalog: UNIT_TSN_LINKS_FIELD_CATALOG,
    morphs: ['compound'],
  },
  // Settings › Audit log — COMPOUND only. A stored `sheet` layout would open
  // subtitle tracks for `source` / `actor_role`, which the compound item cell
  // paints inline under the action.
  [AUDITLOG_TABLE_LAYOUT_ID]: {
    catalog: AUDITLOG_FIELD_CATALOG,
    morphs: ['compound'],
  },
  // Admin › Inventory holds — COMPOUND only: a stored `sheet` layout would
  // open a `subtitle:N` track the compound item cell paints inline (the hold
  // reason under the serial), i.e. a header over blank cells for the whole org.
  [ADMINHOLDS_TABLE_LAYOUT_ID]: {
    catalog: ADMINHOLDS_FIELD_CATALOG,
    morphs: ['compound'],
  },
  // Admin › Bulk allocate — COMPOUND only. The qty + condition line the
  // compound item cell paints inline would become blank sheet tracks.
  [ADMIN_BULK_ALLOCATE_TABLE_LAYOUT_ID]: {
    catalog: ADMIN_BULK_ALLOCATE_FIELD_CATALOG,
    morphs: ['compound'],
  },
  // Admin › Cycle count lines — COMPOUND only. A stored `sheet` layout would
  // open a subtitle track for the variance tolerance, which the compound item
  // cell paints inline under the SKU.
  [CYCLECOUNTLINES_TABLE_LAYOUT_ID]: {
    catalog: CYCLECOUNTLINES_FIELD_CATALOG,
    morphs: ['compound'],
  },
  // Admin › Inventory open DRIFT alerts — COMPOUND only. A stored `sheet`
  // layout would open subtitle tracks the compound item cell paints inline
  // under the detail prose.
  [ADMIN_DRIFT_ALERTS_TABLE_LAYOUT_ID]: {
    catalog: ADMIN_DRIFT_ALERTS_FIELD_CATALOG,
    morphs: ['compound'],
  },
  // Admin › Inventory SKU stock drift — COMPOUND only, and its OWN document:
  // the two drift desks sit on one page over two entities (a live comparison
  // and the alert record about it), so hiding a counter on one must not
  // densify the other.
  [ADMIN_SKU_DRIFT_TABLE_LAYOUT_ID]: {
    catalog: ADMIN_SKU_DRIFT_FIELD_CATALOG,
    morphs: ['compound'],
  },
  // Settings › Team directory — COMPOUND only: this desk binds no subtitles
  // at all, and a stored `sheet` layout would open `subtitle:N` tracks the
  // compound item cell paints inline.
  [STAFF_DIRECTORY_TABLE_LAYOUT_ID]: {
    catalog: STAFF_DIRECTORY_FIELD_CATALOG,
    morphs: ['compound'],
  },
  // Reports › Bin utilization — COMPOUND only. A stored `sheet` layout would
  // open subtitle tracks nothing draws (this desk binds no subtitle at all).
  [REPORT_BIN_UTILIZATION_TABLE_LAYOUT_ID]: {
    catalog: REPORT_BIN_UTILIZATION_FIELD_CATALOG,
    morphs: ['compound'],
  },
  // Reports › Velocity (30d) — COMPOUND only, its OWN document: hiding `In`
  // on the velocity tab must not densify Dead stock.
  [REPORT_VELOCITY_TABLE_LAYOUT_ID]: {
    catalog: REPORT_VELOCITY_FIELD_CATALOG,
    morphs: ['compound'],
  },
  // Reports › Dead stock (90d+) — COMPOUND only. Sibling of Velocity, never a
  // merge: two windows over the same key, different facts.
  [REPORT_DEAD_STOCK_TABLE_LAYOUT_ID]: {
    catalog: REPORT_DEAD_STOCK_FIELD_CATALOG,
    morphs: ['compound'],
  },
  // Reports › Staff day — COMPOUND only. The shift checklist is already on
  // the engine; without this line org column layouts 404 while the catalog
  // sits as a false orphan (operator queue: layout-registry-gap:report-staff-day).
  [REPORT_STAFF_DAY_TABLE_LAYOUT_ID]: {
    catalog: REPORT_STAFF_DAY_FIELD_CATALOG,
    morphs: ['compound'],
  },
  // Reports › Packer day — COMPOUND only. Without this line the org column
  // layout 404s and the catalog reads as a false orphan; the cohort's
  // `eval:discover` names exactly that (`layout-registry-gap:report-packer-day`),
  // which is how this omission was caught rather than shipped.
  [REPORT_PACKER_DAY_TABLE_LAYOUT_ID]: {
    catalog: REPORT_PACKER_DAY_FIELD_CATALOG,
    morphs: ['compound'],
  },
  // Reports › Completed tasks — COMPOUND only, its OWN document: hiding
  // `Deadline` on the record of finished work must not densify the `tasks`
  // desk a staffer works their open queue on. Without this line the org column
  // layout 404s and the catalog reads as a false orphan
  // (`layout-registry-gap:report-tasks`).
  [REPORT_TASKS_TABLE_LAYOUT_ID]: {
    catalog: REPORT_TASKS_FIELD_CATALOG,
    morphs: ['compound'],
  },
  // Admin › per-SKU bin distribution — COMPOUND only.
  [SKU_BINS_TABLE_LAYOUT_ID]: {
    catalog: SKU_BINS_FIELD_CATALOG,
    morphs: ['compound'],
  },
  // Inventory › Stock by location — COMPOUND only. A stored `sheet` layout
  // would open a subtitle track for the line qty the item cell paints inline,
  // which is the "count became a column" failure the desk exists against.
  [LOCATION_STOCK_TABLE_LAYOUT_ID]: {
    catalog: LOCATION_STOCK_FIELD_CATALOG,
    morphs: ['compound'],
  },
  // Admin › per-SKU stock ledger — COMPOUND only. The three reference ids the
  // retired `refs` cell joined are separate facts, painted or bindable.
  [SKU_LEDGER_TABLE_LAYOUT_ID]: {
    catalog: SKU_LEDGER_FIELD_CATALOG,
    morphs: ['compound'],
  },
  // Admin › per-SKU open allocations — the SIBLING document over the
  // `unit-allocations` entity. Same catalog BY REFERENCE (one entity, one
  // family); only the stored layout differs, which is the whole reason the id
  // exists: this feed binds `allocated_by` and never the release facts, the
  // unit desk does the reverse, and one document would dash a track on one of
  // them.
  [SKU_ALLOCATIONS_TABLE_LAYOUT_ID]: {
    catalog: UNIT_ALLOCATIONS_FIELD_CATALOG,
    morphs: ['compound'],
  },
  // `/search` find plane — COMPOUND only. The rows are six entity families on
  // one wire shape, so this document is nobody's desk: binding `Channel` here
  // must not densify To-ship, and hiding `Matched` says nothing about a queue.
  [SEARCH_HITS_TABLE_LAYOUT_ID]: {
    catalog: SEARCH_HITS_FIELD_CATALOG,
    morphs: ['compound'],
  },
  // Later ports (receiving, customers, …) add one entry each, per the plan's
  // adoption checklist.
};

export function slotCatalogFor(tableId: string): FieldCatalog | null {
  return SLOT_LAYOUT_TABLES[tableId]?.catalog ?? null;
}

/** Morphs the table's mount can paint. Empty for tables not opted in. */
export function slotMorphsFor(tableId: string): readonly ('sheet' | 'compound')[] {
  return SLOT_LAYOUT_TABLES[tableId]?.morphs ?? [];
}

/**
 * Read one table's org layout out of a settings bag. Tolerant: a missing map,
 * a legacy blob, or a hostile value all read as `null` (the cascade then falls
 * through to the product default).
 */
export function readOrgTableLayout(
  settings: Record<string, unknown> | null | undefined,
  tableId: string,
): SlotLayout | null {
  const layouts = settings?.tableLayouts;
  if (!layouts || typeof layouts !== 'object' || Array.isArray(layouts)) return null;
  return readStoredSlotLayout((layouts as Record<string, unknown>)[tableId]);
}

/**
 * Build the next whole `tableLayouts` map for a write: the JSONB `||` merge is
 * shallow, so a one-table write must carry every sibling verbatim (normalizing
 * a sibling here could destroy another table's stored layout — pass raw
 * through untouched). `layout: null` deletes the key (reset to product
 * default).
 */
export function nextTableLayoutsMap(
  settings: Record<string, unknown> | null | undefined,
  tableId: string,
  layout: SlotLayout | null,
): Record<string, unknown> {
  const current = settings?.tableLayouts;
  const map: Record<string, unknown> =
    current && typeof current === 'object' && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {};
  if (layout === null) delete map[tableId];
  else map[tableId] = layout;
  return map;
}
