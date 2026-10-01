/** The COLUMN ENGINE — one materializer, one sort law, every family. */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import { materializeTracks, type DataTableColumnFields } from '@/lib/tables/materialize-tracks';
import { isDataTableChromeColumn } from '@/lib/tables/data-table-header-sort';
import {
  DATA_TABLE_ID_HEADER_WORD,
  dataTableChromeField,
  dataTableIdentityField,
  type DataTableChromeKey,
  type DataTableFamily,
} from '@/lib/tables/data-table-family';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';
import type { FieldDisplayType } from '@/lib/tables/field-catalog/types';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

/**
 * The compound track keys, for every family. Bound tracks key by index
 * (`status:1`, `subtitle:2`) and never by field id, so rebinding a track keeps
 * its width and every staff preference.
 */
export type DataTableCompoundColumnKey =
  | 'select'
  | 'fulfillment'
  | 'thumb'
  | 'item'
  | 'dates'
  | 'state'
  | '_fill'
  | `status:${number}`
  | `subtitle:${number}`;

/** One mounted column. The house model, narrowed to the compound keys. */
export interface DataTableCompoundColumn extends Omit<LedgerGridColumnModel, 'key'>, DataTableColumnFields {
  key: DataTableCompoundColumnKey;
}

const DATA_CHROME_KEYS: readonly DataTableChromeKey[] = ['fulfillment', 'item', 'dates', 'state'];

function isDataChromeKey(key: string): key is DataTableChromeKey {
  return (DATA_CHROME_KEYS as readonly string[]).includes(key);
}

/** Materialize the mounted columns for a family + an effective layout. */
export function dataTableCompoundColumnsFor(
  family: DataTableFamily,
  layout: DataTableColumnLayout,
): readonly DataTableCompoundColumn[] {
  const tracks = materializeTracks<DataTableCompoundColumn>({
    layout,
    catalog: family.catalog,
    base: compoundColumnsFor<DataTableCompoundColumn>(),
  });
  const identity = dataTableIdentityField(family, layout);

  return tracks.map((track) => {
    if (!isDataChromeKey(track.key)) return track;

    // The identity header is the LAW's word on every peer.
    if (track.key === 'fulfillment' && identity) {
      return {
        ...track,
        label: DATA_TABLE_ID_HEADER_WORD,
        gridLabel: DATA_TABLE_ID_HEADER_WORD,
        type: 'id' as const,
        fieldId: identity.id,
        slotDisplayType: identity.displayType,
      };
    }

    // Identity is handled above. An unresolvable identity field keeps the
    // skeleton track, whose word is already the law's.
    if (track.key === 'fulfillment') return track;
    const binding = family.chrome?.[track.key];
    if (!binding) return track;
    const label = binding.label ?? dataTableChromeField(family, track.key)?.label ?? track.label;
    return {
      ...track,
      ...(label === undefined ? {} : { label }),
      gridLabel: binding.gridLabel ?? label ?? track.gridLabel,
      ...(binding.displayType === undefined ? {} : { slotDisplayType: binding.displayType }),
      ...(binding.sortable === false ? { sortable: false as const } : {}),
    };
  });
}

/** The FACT a column sorts by, or null when it offers no sort. */
export function dataTableCompoundSortFactFor(
  family: DataTableFamily,
  col: { key: string; fieldId?: string; sortable?: boolean },
): string | null {
  if (col.sortable === false) return null;
  if (isDataTableChromeColumn(col.key)) return null;
  if (isDataChromeKey(col.key)) return dataTableChromeField(family, col.key)?.id ?? null;
  return col.fieldId ?? null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isDataTableCompoundColumnSortable(
  family: DataTableFamily,
  columns: readonly DataTableCompoundColumn[],
  key: string,
): key is DataTableCompoundColumnKey {
  return columns.some((c) => c.key === key && dataTableCompoundSortFactFor(family, c) !== null);
}

const DESC_FIRST: readonly FieldDisplayType[] = ['date', 'money', 'number'];

/** Dates and counts read newest/highest first; names and ids alphabetically. */
export function defaultDirForDataTableCompoundColumn(
  family: DataTableFamily,
  columns: readonly DataTableCompoundColumn[],
  key: string,
): GridSortDir {
  const col = columns.find((c) => c.key === key);
  const displayType = isDataChromeKey(key)
    ? (col?.slotDisplayType ?? dataTableChromeField(family, key)?.displayType)
    : col?.slotDisplayType;
  return displayType && DESC_FIRST.includes(displayType) ? 'desc' : 'asc';
}
