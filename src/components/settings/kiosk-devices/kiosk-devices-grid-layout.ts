/**
 * Kiosk devices column model — MATERIALIZED from a {@link SlotLayout} onto the
 * SHARED compound skeleton, never a hand array.
 *
 * It replaced hand-written `AdminTableColumn` objects carrying JSX — a second
 * table engine's column type, with no header sort, no Fields picker and no org
 * binding, because that engine never grew them.
 */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  KIOSKDEVICES_FIELD_CATALOG,
  KIOSKDEVICES_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/kiosk-devices';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type KioskDevicesGridColumnKey =
  | 'select' | 'fulfillment' | 'thumb' | 'item' | 'dates' | 'state' | '_fill'
  | `status:${number}`
  | `subtitle:${number}`;

export interface KioskDevicesGridColumn extends Omit<LedgerGridColumnModel, 'key'>, SlotTrackFields {
  key: KioskDevicesGridColumnKey;
}

/**
 * Materialize the mounted columns from an effective layout. Tracks this family
 * has no fact for are filtered off the MOUNT — never removed from
 * `COMPOUND_TRACKS`.
 */
export function kioskDevicesCompoundColumnsFor(layout: SlotLayout): readonly KioskDevicesGridColumn[] {
  // Select stays — row multi-select. Thumb stays off (no photo gutter). Dates
  // stays — last seen · enrolled on the Hash line beside Device id.
  // Arrow param unparen'd so table-engine-law's skeleton-filter tripwire sees the cut.
  const base = compoundColumnsFor<KioskDevicesGridColumn>().filter(c => c.key !== 'thumb');
  const tracks = materializeTracks<KioskDevicesGridColumn>({
    layout,
    catalog: KIOSKDEVICES_FIELD_CATALOG,
    base,
  });
  // Identity chrome track still keys as `fulfillment` (shared skeleton), but its
  // header + type come from the catalog identity field — never the Orders "Order"
  // default. displayType `id` is what makes the cell an ID face.
  const identity = KIOSKDEVICES_FIELD_CATALOG.find((f) => f.id === layout.identityFieldId);
  return tracks.map((t) => {
    if (t.key === 'fulfillment' && identity) {
      return {
        ...t,
        label: identity.label,
        gridLabel: identity.label,
        type: 'id' as const,
        fieldId: identity.id,
        slotDisplayType: identity.displayType,
      };
    }
    if (t.key === 'dates') {
      return {
        ...t,
        label: 'Seen · Enrolled',
        gridLabel: 'Seen',
      };
    }
    return t;
  });
}

/** The PRODUCT-DEFAULT materialization — the canonical columns and guard SoT. */
export const KIOSKDEVICES_COMPOUND_COLUMNS: readonly KioskDevicesGridColumn[] =
  kioskDevicesCompoundColumnsFor(KIOSKDEVICES_PRODUCT_LAYOUT);

/**
 * The FACT a column sorts by, or null when it offers no sort. Chrome tracks
 * carry no `fieldId` and fall through to null, which is what keeps them out of
 * the header-sort law.
 */
export function kioskDevicesSortFactFor(
  col: { key: string; fieldId?: string; sortable?: boolean },
): string | null {
  if (col.sortable === false) return null;
  // The identity slot IS the shared fulfillment track on a compound row.
  if (col.key === 'fulfillment') return 'kiosk-devices.id';
  if (col.key === 'item') return 'kiosk-devices.label';
  if (col.key === 'state') return 'kiosk-devices.status';
  if (col.key === 'dates') return 'kiosk-devices.last_seen';
  return col.fieldId ?? null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isKioskDevicesColumnSortable(
  columns: readonly KioskDevicesGridColumn[],
  key: string,
): key is KioskDevicesGridColumnKey {
  return columns.some((c) => c.key === key && kioskDevicesSortFactFor(c) !== null);
}

/** Dates and counts read newest/highest first; names and ids alphabetically. */
export function defaultDirForKioskDevicesColumn(
  columns: readonly KioskDevicesGridColumn[],
  key: string,
): GridSortDir {
  const dt = columns.find((c) => c.key === key)?.slotDisplayType;
  return dt === 'date' || dt === 'money' || dt === 'number' ? 'desc' : 'asc';
}
