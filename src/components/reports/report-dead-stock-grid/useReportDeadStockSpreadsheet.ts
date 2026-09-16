'use client';

/**
 * **Dead-stock spreadsheet** — the family glue that resolves a
 * {@link DataTable} feed bag. Spread it onto the host; there is no second
 * table component.
 *
 * ```tsx
 * const sheet = useReportDeadStockSpreadsheet({ rows, loading });
 * return <DataTable {...sheet} totalCount={rows.length} />;
 * ```
 *
 * This is the whole of the port's display code, and it is a `.ts` file: the
 * engine paints the rows, so the family contributes a catalog, a resolver, an
 * adapter and a column array — and nothing else. `/reports` mounts one of
 * THREE such hooks per tab and never a component that swaps column sets; a
 * single host taking three column arrays is the fork this port removed.
 *
 * ## Why sort and search are local state here
 *
 * `/reports` owns no search params at all — the tab is `useState` and the feed
 * is a client `fetch` of up to 500 rows. Writing `?sort=` would make a header
 * click round-trip a URL nothing else reads, and `?search=` per keystroke
 * would re-render the whole desk for a filter over rows the client already
 * holds. The server query's own narrowing (`?minDays=`,
 * `?includeNeverMoved=`) is untouched; the header sorts the page in hand.
 */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import { resolveReportDeadStockSlotValue } from '@/lib/tables/field-catalog/report-dead-stock-resolve';
import type { DeadStockReportRow } from '@/lib/reports/report-rows';
import { reportDeadStockCompoundView } from './report-dead-stock-row-view';
import {
  reportDeadStockCompoundColumnsFor,
  reportDeadStockSortFactFor,
  type ReportDeadStockGridColumn,
  type ReportDeadStockGridColumnKey,
} from './report-dead-stock-grid-layout';
import {
  REPORT_DEAD_STOCK_GRID_CAPABILITIES,
  REPORT_DEAD_STOCK_TABLE_BINDING,
} from './report-dead-stock-table-definition';
import { useReportDeadStockTableLayout } from './useReportDeadStockTableLayout';

export interface UseReportDeadStockSpreadsheetOptions {
  /** One report page, already ordered by the route; a header click re-orders it. */
  rows: readonly DeadStockReportRow[];
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
}

export function useReportDeadStockSpreadsheet({
  rows,
  loading = false,
  emptyMessage = 'No data — try the daily refresh cron, or write some movement.',
  searchPlaceholder = 'Filter this report…',
}: UseReportDeadStockSpreadsheetOptions): CompoundSpreadsheetFeed<
  DeadStockReportRow,
  ReportDeadStockGridColumnKey,
  ReportDeadStockGridColumn
> {
  const [sort, setSort] = useState<ReportDeadStockGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);
  const [query, setQuery] = useState('');

  const { effectiveLayout, subtitleFieldIds, fields } = useReportDeadStockTableLayout();
  const columns = useMemo(
    () => reportDeadStockCompoundColumnsFor(effectiveLayout),
    [effectiveLayout],
  );

  const onSortChange = useCallback(
    (key: ReportDeadStockGridColumnKey, nextDir: 'asc' | 'desc') => {
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
    DeadStockReportRow,
    ReportDeadStockGridColumnKey,
    ReportDeadStockGridColumn
  >({
    binding: REPORT_DEAD_STOCK_TABLE_BINDING,
    columns,
    fields,
    rows,
    getRowId: (row) => row.sku,
    adapter: reportDeadStockCompoundView,
    subtitleFieldIds,
    resolve: resolveReportDeadStockSlotValue,
    sortFactFor: reportDeadStockSortFactFor,
    capabilities: REPORT_DEAD_STOCK_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange,
    search,
    loading,
    emptyMessage,
    ariaLabel: 'Dead stock, dormant 90 days or more',
  });
}
