'use client';

/**
 * **Cycle-count-lines spreadsheet** — the family glue that resolves a
 * {@link DataTable} feed bag. Spread it onto the host; there is no second
 * table component.
 *
 * This is the whole of the port's display code, and it is a `.ts` file: the
 * engine paints the rows, so the family contributes a catalog, a resolver, an
 * adapter and a column array — and nothing else.
 *
 * Sort and search are LOCAL state. `?status=` is the one URL fact this desk
 * owns and it selects the FEED (a SQL predicate in `loadLines`, plus the
 * filter pill row's counts); re-ordering or narrowing rows already in memory
 * must not round-trip an RSC render per keystroke.
 */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import type { CompoundRowAction } from '@/components/tables/compound/compound-row-model';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import type { CycleCountLineRow } from '@/lib/inventory/cycle-count-line-row';
import { resolveCycleCountLinesSlotValue } from '@/lib/tables/field-catalog/cycle-count-lines-resolve';
import { cycleCountLinesCompoundView } from './cycle-count-lines-row-view';
import {
  cycleCountLinesCompoundColumnsFor,
  cycleCountLinesSortFactFor,
  type CycleCountLinesGridColumn,
  type CycleCountLinesGridColumnKey,
} from './cycle-count-lines-grid-layout';
import {
  CYCLECOUNTLINES_GRID_CAPABILITIES,
  CYCLECOUNTLINES_TABLE_BINDING,
} from './cycle-count-lines-table-definition';
import { useCycleCountLinesTableLayout } from './useCycleCountLinesTableLayout';

export interface UseCycleCountLinesSpreadsheetOptions {
  rows: readonly CycleCountLineRow[];
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
  /** The family's row verbs, resolved per row. See `useCompoundSpreadsheet`. */
  rowActions?: (row: CycleCountLineRow) => readonly CompoundRowAction[];
}

export function useCycleCountLinesSpreadsheet({
  rows,
  loading = false,
  emptyMessage = 'No lines in this campaign yet.',
  searchPlaceholder = 'Filter lines…',
  rowActions,
}: UseCycleCountLinesSpreadsheetOptions): CompoundSpreadsheetFeed<
  CycleCountLineRow,
  CycleCountLinesGridColumnKey,
  CycleCountLinesGridColumn
> {
  const [sort, setSort] = useState<CycleCountLinesGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);
  const [query, setQuery] = useState('');

  const { effectiveLayout, subtitleFieldIds, fields } = useCycleCountLinesTableLayout();
  const columns = useMemo(
    () => cycleCountLinesCompoundColumnsFor(effectiveLayout),
    [effectiveLayout],
  );

  const onSortChange = useCallback(
    (key: CycleCountLinesGridColumnKey, nextDir: 'asc' | 'desc') => {
      setSort(key);
      setDir(nextDir);
    },
    [],
  );

  const search = useMemo(
    () => ({ value: query, onChange: setQuery, placeholder: searchPlaceholder }),
    [query, searchPlaceholder],
  );

  return useCompoundSpreadsheet<
    CycleCountLineRow,
    CycleCountLinesGridColumnKey,
    CycleCountLinesGridColumn
  >({
    binding: CYCLECOUNTLINES_TABLE_BINDING,
    columns,
    fields,
    rows,
    getRowId: (row) => String(row.id),
    adapter: cycleCountLinesCompoundView,
    subtitleFieldIds,
    resolve: resolveCycleCountLinesSlotValue,
    sortFactFor: cycleCountLinesSortFactFor,
    capabilities: CYCLECOUNTLINES_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange,
    search,
    loading,
    emptyMessage,
    ariaLabel: 'Cycle count lines',
    rowActions,
  });
}
