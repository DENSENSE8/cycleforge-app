'use client';

/** **Bin-utilization spreadsheet** — the family glue that resolves a {@link DataTable} feed bag. */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import { resolveReportBinUtilizationSlotValue } from '@/lib/tables/field-catalog/report-bin-utilization-resolve';
import type { BinUtilizationReportRow } from '@/lib/reports/report-rows';
import { reportBinUtilizationCompoundView } from './report-bin-utilization-row-view';
import {
  reportBinUtilizationCompoundColumnsFor,
  reportBinUtilizationSortFactFor,
  type ReportBinUtilizationGridColumn,
  type ReportBinUtilizationGridColumnKey,
} from './report-bin-utilization-grid-layout';
import {
  REPORT_BIN_UTILIZATION_GRID_CAPABILITIES,
  REPORT_BIN_UTILIZATION_TABLE_BINDING,
} from './report-bin-utilization-table-definition';
import { useReportBinUtilizationTableLayout } from './useReportBinUtilizationTableLayout';

interface UseReportBinUtilizationSpreadsheetOptions {
  /** One report page, already ordered by the route; a header click re-orders it. */
  rows: readonly BinUtilizationReportRow[];
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
  /** The find text, owned by the page because it rides the report's fetch. */
  searchValue: string;
  onSearchChange: (next: string) => void;
  /** A request for the CURRENT text is in flight — holds the loading face. */
  searchPending?: boolean;
}

export function useReportBinUtilizationSpreadsheet({
  rows,
  loading = false,
  emptyMessage = 'No data — try the daily refresh cron, or write some movement.',
  searchPlaceholder = 'Filter this report…',
  searchValue,
  onSearchChange,
  searchPending = false,
}: UseReportBinUtilizationSpreadsheetOptions): CompoundSpreadsheetFeed<
  BinUtilizationReportRow,
  ReportBinUtilizationGridColumnKey,
  ReportBinUtilizationGridColumn
> {
  const [sort, setSort] = useState<ReportBinUtilizationGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);

  const { effectiveLayout, subtitleFieldIds, fields } = useReportBinUtilizationTableLayout();
  const columns = useMemo(
    () => reportBinUtilizationCompoundColumnsFor(effectiveLayout),
    [effectiveLayout],
  );

  const onSortChange = useCallback(
    (key: ReportBinUtilizationGridColumnKey, nextDir: 'asc' | 'desc') => {
      setSort(key);
      setDir(nextDir);
    },
    [],
  );

  const search = useMemo(
    () => ({
      value: searchValue,
      onChange: onSearchChange,
      placeholder: searchPlaceholder,
      answeredBy: 'server' as const,
      pending: searchPending,
    }),
    [searchValue, onSearchChange, searchPlaceholder, searchPending],
  );

  return useCompoundSpreadsheet<
    BinUtilizationReportRow,
    ReportBinUtilizationGridColumnKey,
    ReportBinUtilizationGridColumn
  >({
    binding: REPORT_BIN_UTILIZATION_TABLE_BINDING,
    columns,
    fields,
    rows,
    getRowId: (row) => String(row.bin_id),
    adapter: reportBinUtilizationCompoundView,
    subtitleFieldIds,
    resolve: resolveReportBinUtilizationSlotValue,
    sortFactFor: reportBinUtilizationSortFactFor,
    capabilities: REPORT_BIN_UTILIZATION_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange,
    search,
    findOwner: 'page',
    loading,
    emptyMessage,
    ariaLabel: 'Bin utilization',
  });
}
