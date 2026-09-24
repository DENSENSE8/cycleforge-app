'use client';

/**
 * **Bin-utilization spreadsheet** — the family glue that resolves a
 * {@link DataTable} feed bag. Spread it onto the host; there is no second
 * table component.
 *
 * ```tsx
 * const sheet = useReportBinUtilizationSpreadsheet({ rows, loading });
 * return <DataTable {...sheet} totalCount={rows.length} />;
 * ```
 *
 * This is the whole of the port's display code, and it is a `.ts` file: the
 * engine paints the rows, so the family contributes a catalog, a resolver, an
 * adapter and a column array — and nothing else. `/reports` mounts one of
 * THREE such hooks per tab and never a component that swaps column sets; a
 * single host taking three column arrays is the fork this port removed.
 *
 * ## Why sort is local state and the FIND TEXT is not
 *
 * A header click writing `?sort=` would round-trip a URL nothing else reads,
 * so the header sorts the page in hand. The server query's own narrowing
 * (`?room=`, `?minFill=`) is untouched.
 *
 * The find text is different in kind, because the page in hand is a WINDOW:
 * this warehouse has more bins than the route's 500-row page, and the page is
 * ordered by FILL — so a browser-side filter could never reach the emptiest
 * bins, which are exactly the ones an operator goes looking for by name. The
 * text therefore rides the fetch (`?q=`) and the engine is told the rows it
 * receives are already the answer.
 */

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

export interface UseReportBinUtilizationSpreadsheetOptions {
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
    loading,
    emptyMessage,
    ariaLabel: 'Bin utilization',
  });
}
