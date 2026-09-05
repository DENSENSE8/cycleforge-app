'use client';

/**
 * **AI usage spreadsheet** — the family glue that resolves a
 * {@link DataTable} feed bag. Spread it onto the host; there is no second table
 * component.
 *
 * This is the whole of the port's display code, and it is a `.ts` file: the
 * engine paints the rows, so the family contributes a catalog, a resolver, an
 * adapter and a column array — and nothing else.
 *
 * Sort and search are local state: they narrow what is already on screen, and
 * writing them to the URL would round-trip the server for a client-side reorder.
 */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import type { CompoundRowAction } from '@/components/tables/compound/compound-row-model';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import { resolveAiUsageSlotValue } from '@/lib/tables/field-catalog/ai-usage-resolve';
import { aiUsageCompoundView } from '@/lib/ai/ai-usage-row-adapter';
import type { AiUsageTableRow } from '@/lib/ai/ai-usage-row';
import { AIUSAGE_GRID_CAPABILITIES } from './ai-usage-grid-descriptor';
import {
  aiUsageCompoundColumnsFor,
  aiUsageSortFactFor,
  type AiUsageGridColumn,
  type AiUsageGridColumnKey,
} from './ai-usage-grid-layout';
import { AIUSAGE_TABLE_BINDING } from './ai-usage-table-definition';
import { useAiUsageTableLayout } from './useAiUsageTableLayout';

export interface UseAiUsageSpreadsheetOptions {
  rows: readonly AiUsageTableRow[];
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
  /** The family's row verbs, resolved per row. See `useCompoundSpreadsheet`. */
  rowActions?: (row: AiUsageTableRow) => readonly CompoundRowAction[];
}

export function useAiUsageSpreadsheet({
  rows,
  loading = false,
  emptyMessage = 'No AI usage recorded yet.',
  searchPlaceholder = 'Filter usage…',
  rowActions,
}: UseAiUsageSpreadsheetOptions): CompoundSpreadsheetFeed<
  AiUsageTableRow,
  AiUsageGridColumnKey,
  AiUsageGridColumn
> {
  const [sort, setSort] = useState<AiUsageGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);
  const [query, setQuery] = useState('');

  const { effectiveLayout, subtitleFieldIds, fields } = useAiUsageTableLayout();
  const columns = useMemo(() => aiUsageCompoundColumnsFor(effectiveLayout), [effectiveLayout]);

  const onSortChange = useCallback((key: AiUsageGridColumnKey, nextDir: 'asc' | 'desc') => {
    setSort(key);
    setDir(nextDir);
  }, []);

  const search = useMemo(
    () => ({ value: query, onChange: setQuery, placeholder: searchPlaceholder }),
    [query, searchPlaceholder],
  );

  return useCompoundSpreadsheet<AiUsageTableRow, AiUsageGridColumnKey, AiUsageGridColumn>({
    binding: AIUSAGE_TABLE_BINDING,
    columns,
    fields,
    rows,
    getRowId: (row) => String(row.key),
    adapter: aiUsageCompoundView,
    subtitleFieldIds,
    resolve: resolveAiUsageSlotValue,
    sortFactFor: aiUsageSortFactFor,
    capabilities: AIUSAGE_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange,
    search,
    loading,
    emptyMessage,
    ariaLabel: 'AI usage',
    rowActions,
  });
}
