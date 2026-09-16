/**
 * Tech / Packer bench column model — MATERIALIZED from a {@link SlotLayout}
 * onto the SHARED compound skeleton, never a hand array.
 *
 * This replaces `STATION_HISTORY_COLUMNS` — the last flat model in the repo,
 * an array whose track keys WERE field names (`tester`, `testedAt`,
 * `packStation`). A key that is a field is a frozen layout: it cannot be
 * rebound without a deploy, it gives the Fields picker nothing to offer, and
 * its sort vocabulary is derived from the array rather than from the facts.
 * Here the keys are slot indices (`status:N`) and what shows is an
 * org/staff/product layout document.
 *
 * **One engine, two families.** Tech and Packer are siblings, never a merge:
 * two benches answer two questions ("what did I test" vs "what did I pack"),
 * so each keeps its own catalog, its own prefs bucket and its own identity —
 * and they share this materializer, exactly as Receiving and Incoming share
 * `receiving-grid-layout.ts`.
 *
 * **The column type is {@link OrdersQueueColumn}, on purpose.** A bench row IS
 * an order line (`QueueRowRecord`; see `src/lib/station/record-to-queue-row.ts`),
 * so the benches paint the orders row shape. Declaring a third near-identical
 * `key`-narrowed interface would only re-type what that model already says.
 *
 * There is deliberately **no flat `*_GRID_COLUMNS` array here.** Every one in
 * the repo was deleted in wave B and the discover scanner fails the build on a
 * new one.
 */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import type { OrdersQueueColumn } from '@/lib/dashboard-order-row-layout';
import {
  PACKER_FIELD_CATALOG,
  PACKER_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/packer';
import {
  TECH_FIELD_CATALOG,
  TECH_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/tech';
import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import { materializeTracks } from '@/lib/tables/materialize-tracks';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

/**
 * The shared bench materialization. The whole compound skeleton mounts —
 * nothing is filtered off it, because a bench row wants every track the scan
 * list has: the select gutter (bulk copy-TSV), the order identity, the photo,
 * the item, the scan stamp and the state pill.
 *
 * `datesLabel` is the one thing the two families disagree about: the chrome
 * date track carries the SCAN instant, and that instant has a different name on
 * each bench ("Tested" / "Packed"). It is a header word, not a binding.
 */
function benchCompoundColumnsFor(
  layout: SlotLayout,
  catalog: FieldCatalog,
  datesLabel: string,
): readonly OrdersQueueColumn[] {
  const tracks = materializeTracks<OrdersQueueColumn>({
    layout,
    catalog,
    base: compoundColumnsFor<OrdersQueueColumn>(),
  });
  const identity = catalog.find((f) => f.id === layout.identityFieldId);
  return tracks.map((t) => {
    const key = t.key;
    // The identity slot IS the shared `fulfillment` track on a compound row.
    // Its header ("Order") and its `id` face already come from the skeleton;
    // stamping the bound field is what puts the order id into the search index
    // and gives the header something to sort by.
    if (key === 'fulfillment' && identity) {
      return {
        ...t,
        fieldId: identity.id,
        slotDisplayType: identity.displayType,
      };
    }
    if (key === 'dates') {
      return { ...t, label: datesLabel, gridLabel: datesLabel };
    }
    return t;
  });
}

export function techCompoundColumnsFor(layout: SlotLayout): readonly OrdersQueueColumn[] {
  return benchCompoundColumnsFor(layout, TECH_FIELD_CATALOG, 'Tested');
}

export function packerCompoundColumnsFor(layout: SlotLayout): readonly OrdersQueueColumn[] {
  return benchCompoundColumnsFor(layout, PACKER_FIELD_CATALOG, 'Packed');
}

/** The PRODUCT-DEFAULT materialization — what an org with no override mounts. */
export const TECH_COMPOUND_COLUMNS: readonly OrdersQueueColumn[] =
  techCompoundColumnsFor(TECH_PRODUCT_LAYOUT);

/** The PRODUCT-DEFAULT materialization — what an org with no override mounts. */
export const PACKER_COMPOUND_COLUMNS: readonly OrdersQueueColumn[] =
  packerCompoundColumnsFor(PACKER_PRODUCT_LAYOUT);

/**
 * The FACT a column sorts by, or `null` when it offers none.
 *
 * The fact id is handed straight to the family RESOLVER
 * (`useCompoundSpreadsheet` sorts on `resolve(row, fact)`), so it must be a
 * catalog field id — a row-shape key like `created_at` would resolve to
 * nothing and silently order the list by equal blanks. That is why the two
 * remaining chrome tracks fall through to `null`:
 *
 * - `item` — the product title is the compound item cell's first line, not a
 *   bound fact. Neither bench catalog has a `title` field, and the orders
 *   family does not either.
 * - `state` — the bench state pill is derived chrome; there is no
 *   `tech.stage` / `packer.stage` fact behind it.
 *
 * `dates` DOES sort: the scan stamp it paints is the bench's stage event
 * (`tech.tested` / `packer.packed`), a real resolvable field.
 */
function benchSortFactFor(
  col: { key: string; fieldId?: string; sortable?: boolean },
  identityFieldId: string,
  scanStampFieldId: string,
): string | null {
  if (col.sortable === false) return null;
  if (col.key === 'fulfillment') return identityFieldId;
  if (col.key === 'dates') return scanStampFieldId;
  return col.fieldId ?? null;
}

export function techSortFactFor(
  col: { key: string; fieldId?: string; sortable?: boolean },
): string | null {
  return benchSortFactFor(col, 'tech.order_id', 'tech.tested');
}

export function packerSortFactFor(
  col: { key: string; fieldId?: string; sortable?: boolean },
): string | null {
  return benchSortFactFor(col, 'packer.order_id', 'packer.packed');
}

/** Dates and counts read newest/highest first; names and ids alphabetically. */
export function defaultDirForBenchColumn(
  columns: readonly OrdersQueueColumn[],
  key: string,
): GridSortDir {
  const col = columns.find((c) => c.key === key);
  const dt = col?.slotDisplayType;
  // The chrome date track carries no bound field, so its display type is the
  // skeleton's `type: 'date'` rather than a `slotDisplayType`.
  if (key === 'dates') return 'desc';
  return dt === 'date' || dt === 'stage_event' || dt === 'money' || dt === 'number'
    ? 'desc'
    : 'asc';
}
