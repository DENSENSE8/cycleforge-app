'use client';

/**
 * **Cycle-counts spreadsheet** — the family glue that resolves a
 * {@link DataTable} feed bag. Spread it onto the host; there is no second
 * table component.
 *
 * This is the whole of the port's display code, and it is a `.ts` file: the
 * engine paints the rows, so the family contributes a catalog, a resolver, an
 * adapter and a column array — and nothing else.
 *
 * Sort and search are local state: they narrow what is already on screen, and
 * writing them to the URL would round-trip an RSC render for a client-side
 * reorder.
 */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import type { CycleCountCampaignRow } from '@/lib/inventory/cycle-count-campaign-row';
import { resolveCycleCountsSlotValue } from '@/lib/tables/field-catalog/cycle-counts-resolve';
import { cycleCountsCompoundView } from './cycle-counts-row-view';
import {
  cycleCountsCompoundColumnsFor,
  cycleCountsSortFactFor,
  type CycleCountsGridColumn,
  type CycleCountsGridColumnKey,
} from './cycle-counts-grid-layout';
import {
  CYCLECOUNTS_GRID_CAPABILITIES,
  CYCLECOUNTS_TABLE_BINDING,
} from './cycle-counts-table-definition';
import { useCycleCountsTableLayout } from './useCycleCountsTableLayout';

export interface UseCycleCountsSpreadsheetOptions {
  rows: readonly CycleCountCampaignRow[];
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
  /** Present ⇒ the title hover carries "Open" and a row click reports it. */
  onOpenRow?: (row: CycleCountCampaignRow) => void;
}

export function useCycleCountsSpreadsheet({
  rows,
  loading = false,
  emptyMessage = 'No campaigns yet. Use the form above to start one.',
  searchPlaceholder = 'Filter campaigns…',
  onOpenRow,
}: UseCycleCountsSpreadsheetOptions): CompoundSpreadsheetFeed<
  CycleCountCampaignRow,
  CycleCountsGridColumnKey,
  CycleCountsGridColumn
> {
  const [sort, setSort] = useState<CycleCountsGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);
  const [query, setQuery] = useState('');

  const { effectiveLayout, subtitleFieldIds, fields } = useCycleCountsTableLayout();
  const columns = useMemo(() => cycleCountsCompoundColumnsFor(effectiveLayout), [effectiveLayout]);

  const onSortChange = useCallback((key: CycleCountsGridColumnKey, nextDir: 'asc' | 'desc') => {
    setSort(key);
    setDir(nextDir);
  }, []);

  const search = useMemo(
    () => ({ value: query, onChange: setQuery, placeholder: searchPlaceholder }),
    [query, searchPlaceholder],
  );

  return useCompoundSpreadsheet<
    CycleCountCampaignRow,
    CycleCountsGridColumnKey,
    CycleCountsGridColumn
  >({
    binding: CYCLECOUNTS_TABLE_BINDING,
    columns,
    fields,
    rows,
    getRowId: (row) => String(row.id),
    adapter: cycleCountsCompoundView,
    subtitleFieldIds,
    resolve: resolveCycleCountsSlotValue,
    sortFactFor: cycleCountsSortFactFor,
    capabilities: CYCLECOUNTS_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange,
    search,
    loading,
    emptyMessage,
    ariaLabel: 'Cycle count campaigns',
    onOpenRow,
  });
}
