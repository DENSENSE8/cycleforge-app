'use client';

/** **Dead-stock spreadsheet** — the family glue that resolves a {@link DataTable} feed bag. */

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

interface UseReportDeadStockSpreadsheetOptions {
  /** One report page, already ordered by the route; a header click re-orders it. */
  rows: readonly DeadStockReportRow[];
  loading?: boolean;
  emptyMessage?: string;
  searchValue: string;
  onSearchChange: (next: string) => void;
}

export function useReportDeadStockSpreadsheet({
  rows,
  loading = false,
  emptyMessage = 'No data — try the daily refresh cron, or write some movement.',
  searchValue,
  onSearchChange,
}: UseReportDeadStockSpreadsheetOptions): CompoundSpreadsheetFeed<
  DeadStockReportRow,
  ReportDeadStockGridColumnKey,
  ReportDeadStockGridColumn
> {
  const [sort, setSort] = useState<ReportDeadStockGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);

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
    () => ({ value: searchValue, onChange: onSearchChange, placeholder: 'Filter this report…' }),
    [searchValue, onSearchChange],
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
    findOwner: 'page',
    loading,
    emptyMessage,
    ariaLabel: 'Dead stock, dormant 90 days or more',
  });
}
