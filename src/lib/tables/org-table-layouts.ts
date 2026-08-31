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

import { FBA_FIELD_CATALOG, FBA_TABLE_LAYOUT_ID } from '@/lib/tables/field-catalog/fba';
import { ORDERS_FIELD_CATALOG, ORDERS_TABLE_LAYOUT_ID } from '@/lib/tables/field-catalog/orders';
import { PICKUP_FIELD_CATALOG, PICKUP_TABLE_LAYOUT_ID } from '@/lib/tables/field-catalog/pickup';
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
  // The Amazon-Prep board (fork kill 2026-08-30) — sheet morph only.
  [FBA_TABLE_LAYOUT_ID]: { catalog: FBA_FIELD_CATALOG, morphs: ['sheet'] },
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
