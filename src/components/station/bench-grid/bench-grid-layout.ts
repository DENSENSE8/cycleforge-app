/** Tech / Packer bench column model — MATERIALIZED from a {@link DataTableColumnLayout} onto the SHARED compound skeleton, never a hand array. */

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
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

/** The shared bench materialization. */
function benchCompoundColumnsFor(
  layout: DataTableColumnLayout,
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

export function techCompoundColumnsFor(layout: DataTableColumnLayout): readonly OrdersQueueColumn[] { return benchCompoundColumnsFor(layout, TECH_FIELD_CATALOG, 'Tested'); }

export function packerCompoundColumnsFor(layout: DataTableColumnLayout): readonly OrdersQueueColumn[] { return benchCompoundColumnsFor(layout, PACKER_FIELD_CATALOG, 'Packed'); }

/** The PRODUCT-DEFAULT materialization — what an org with no override mounts. */
export const TECH_COMPOUND_COLUMNS: readonly OrdersQueueColumn[] =
  techCompoundColumnsFor(TECH_PRODUCT_LAYOUT);

/** The PRODUCT-DEFAULT materialization — what an org with no override mounts. */
export const PACKER_COMPOUND_COLUMNS: readonly OrdersQueueColumn[] =
  packerCompoundColumnsFor(PACKER_PRODUCT_LAYOUT);

/** The FACT a column sorts by, or `null` when it offers none. */
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
