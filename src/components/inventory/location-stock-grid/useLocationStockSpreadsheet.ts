'use client';

/**
 * **Stock-by-location spreadsheet** — the family glue that resolves a
 * {@link DataTable} feed bag. Spread it onto the host; there is no second table
 * component.
 *
 * ```tsx
 * const sheet = useLocationStockSpreadsheet({ rows, search });
 * return <DataTable {...sheet} totalCount={totalCount} filter={roomFunnel} />;
 * ```
 *
 * This is the whole of the desk's display code, and it is a `.ts` file: the
 * engine paints the rows, so the family contributes a catalog, a resolver, an
 * adapter and a column array — and nothing else.
 *
 * ## Why sort is URL-durable here and local state on `sku-bins`
 *
 * That family is a PANE among five on a detail page, so a header click writing
 * `?colsort=` would fight its siblings for one channel. This one IS the page
 * (`/inventory/stock`), which is where workbench law applies: a reload or a
 * shared link must reproduce the exact view, so the sort rides the ambient
 * `?colsort=` / `?coldir=` carries through {@link useUrlColumnSort}.
 *
 * SEARCH stays the caller's, because the page owns the URL key it writes and
 * the room funnel narrows the same list from the same place — the chrome half
 * of the split `useCompoundSpreadsheet` documents.
 */

import { useMemo } from 'react';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import {
  locationStockRowId,
  type LocationStockTableRow,
} from '@/lib/inventory/location-stock-row';
import { resolveLocationStockSlotValue } from '@/lib/tables/field-catalog/location-stock-resolve';
import { locationStockCompoundView } from './location-stock-row-view';
import {
  defaultDirForSlotTableColumn,
  isSlotTableColumnSortable,
  slotTableColumnsFor,
  slotTableSortFactFor,
  type SlotTableColumn,
  type SlotTableColumnKey,
} from '@/components/tables/compound/slot-table-columns';
import { useSlotTableLayout } from '@/components/tables/useSlotTableLayout';
import { LOCATION_STOCK_FAMILY } from '@/lib/tables/field-catalog/location-stock';
import {
  LOCATION_STOCK_GRID_CAPABILITIES,
  LOCATION_STOCK_TABLE_BINDING,
} from './location-stock-table-definition';
import { LOCATION_STOCK_SELECTION_SCOPE } from './useLocationStockSelection';

export interface UseLocationStockSpreadsheetOptions {
  /**
   * The rows to paint — ALREADY narrowed by the room funnel. The search box is
   * the engine's (it matches every fact the operator can read off a row); the
   * room selection is a facet the page owns, so it arrives pre-applied.
   */
  rows: readonly LocationStockTableRow[];
  /** Caller-owned so the page can keep it in the URL. Never a constant. */
  search: { value: string; onChange: (next: string) => void; placeholder?: string };
  loading?: boolean;
  /**
   * The desk's row selection ({@link useLocationStockSelection}) — the gutter
   * checkbox and the action strip read the same set, so the strip can never be
   * armed over rows the gutter does not show as ticked.
   *
   * Optional: a mount that only READS this family (a report pane) passes
   * nothing and gets the inert gutter the binding painted before the verbs
   * existed.
   */
  selection?: {
    isSelected: (row: LocationStockTableRow) => boolean;
    toggle: (row: LocationStockTableRow, event?: { shiftKey: boolean }) => void;
  };
  emptyMessage?: string;
}

export function useLocationStockSpreadsheet({
  rows,
  search,
  selection,
  loading = false,
  emptyMessage = 'No stock matches the current filters.',
}: UseLocationStockSpreadsheetOptions): CompoundSpreadsheetFeed<
  LocationStockTableRow,
  SlotTableColumnKey,
  SlotTableColumn
> {
  const { effectiveLayout, subtitleFieldIds, fields } = useSlotTableLayout(LOCATION_STOCK_FAMILY);
  const columns = useMemo(
    () => slotTableColumnsFor(LOCATION_STOCK_FAMILY, effectiveLayout),
    [effectiveLayout],
  );

  const { sort, dir, setSort } = useUrlColumnSort<SlotTableColumnKey>({
    isColumn: (raw) => isSlotTableColumnSortable(LOCATION_STOCK_FAMILY, columns, raw),
    defaultDir: (key) => defaultDirForSlotTableColumn(LOCATION_STOCK_FAMILY, columns, key),
  });

  return useCompoundSpreadsheet<LocationStockTableRow, SlotTableColumnKey, SlotTableColumn>({
    binding: LOCATION_STOCK_TABLE_BINDING,
    columns,
    fields,
    rows,
    getRowId: locationStockRowId,
    adapter: locationStockCompoundView,
    subtitleFieldIds,
    // The count under the title is ON HAND, not an order line: four on a shelf
    // is a shelf with four on it, so the number stays quiet at every value
    // (operator 2026-09-15 — it must not paint warning-yellow above one). Same
    // face, same width, different question.
    lineQtyMeaning: 'on-hand',
    // The SKU is painted by the adapter on the Id track's SECOND line
    // (`identitySubFace`), so no track names it and the search box would not
    // match a typed SKU without this. The operator asked for search over the
    // product title AND the qty; a visible, copyable handle that the box
    // ignores is the same defect one field over.
    adapterPaintedFieldIds: ['location-stock.sku'],
    resolve: resolveLocationStockSlotValue,
    sortFactFor: (col) => slotTableSortFactFor(LOCATION_STOCK_FAMILY, col),
    capabilities: LOCATION_STOCK_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange: setSort,
    search,
    loading,
    emptyMessage,
    // Selection is the page's, because the STRIP is the page's: the verbs
    // write `bin_contents` through the same endpoints the phone uses, and the
    // desk owns the refresh that follows. The engine only needs to know which
    // rows are ticked.
    ...(selection
      ? {
          selectionScope: LOCATION_STOCK_SELECTION_SCOPE,
          selection: {
            isSelected: selection.isSelected,
            onToggle: (row: LocationStockTableRow, event: { shiftKey: boolean }) =>
              selection.toggle(row, event),
          },
        }
      : null),
    ariaLabel: 'Stock by location',
  });
}
