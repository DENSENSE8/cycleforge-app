/**
 * Gate preamble (Fact-Forcing):
 * - Importers/callers: kiosk-slot-events-table-definition, useKioskSlotEventsSpreadsheet,
 *   COMPOUND_SKELETON_FILTER_DEBT (dates+select drop).
 * - Affected API: none. Schemas: SlotLayout → KioskSlotEventsGridColumn.
 * - User verbatim: "Continue to the next phase"
 */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  KIOSKSLOTEVENTS_FIELD_CATALOG,
  KIOSKSLOTEVENTS_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/kiosk-slot-events';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type KioskSlotEventsGridColumnKey =
  | 'select'
  | 'fulfillment'
  | 'thumb'
  | 'item'
  | 'dates'
  | 'state'
  | '_fill'
  | `status:${number}`
  | `subtitle:${number}`;

export interface KioskSlotEventsGridColumn
  extends Omit<LedgerGridColumnModel, 'key'>,
    SlotTrackFields {
  key: KioskSlotEventsGridColumnKey;
}

export function kioskSlotEventsCompoundColumnsFor(
  layout: SlotLayout,
): readonly KioskSlotEventsGridColumn[] {
  // Arrow param unparen'd so table-engine-law skeleton-filter tripwire sees the cut.
  const base = compoundColumnsFor<KioskSlotEventsGridColumn>().filter(
    c => c.key !== 'dates' && c.key !== 'select',
  );
  const tracks = materializeTracks<KioskSlotEventsGridColumn>({
    layout,
    catalog: KIOSKSLOTEVENTS_FIELD_CATALOG,
    base,
  });
  const identity = KIOSKSLOTEVENTS_FIELD_CATALOG.find((f) => f.id === layout.identityFieldId);
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
    return t;
  });
}

export const KIOSKSLOTEVENTS_COMPOUND_COLUMNS: readonly KioskSlotEventsGridColumn[] =
  kioskSlotEventsCompoundColumnsFor(KIOSKSLOTEVENTS_PRODUCT_LAYOUT);

export function kioskSlotEventsSortFactFor(
  col: { key: string; fieldId?: string; sortable?: boolean },
): string | null {
  if (col.sortable === false) return null;
  if (col.key === 'fulfillment') return 'kiosk-slot-events.device';
  if (col.key === 'item') return 'kiosk-slot-events.device';
  if (col.key === 'state') return 'kiosk-slot-events.status_change';
  if (col.fieldId === 'kiosk-slot-events.status_change') return null;
  return col.fieldId ?? null;
}

export function isKioskSlotEventsColumnSortable(
  columns: readonly KioskSlotEventsGridColumn[],
  key: string,
): key is KioskSlotEventsGridColumnKey {
  return columns.some((c) => c.key === key && kioskSlotEventsSortFactFor(c) !== null);
}

export function defaultDirForKioskSlotEventsColumn(
  columns: readonly KioskSlotEventsGridColumn[],
  key: string,
): GridSortDir {
  const dt = columns.find((c) => c.key === key)?.slotDisplayType;
  return dt === 'date' || dt === 'money' || dt === 'number' ? 'desc' : 'asc';
}
