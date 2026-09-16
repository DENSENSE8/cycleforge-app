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
 * ## Why sort and search are local state here
 *
 * `/reports` owns no search params at all — the tab is `useState` and the
 * three feeds are client `fetch`es of up to 500 rows. Writing `?sort=` would
 * make a header click round-trip a URL nothing else reads, and `?search=` per
 * keystroke would re-render the whole desk for a filter over rows the client
 * already holds. The server query's own narrowing (`?room=`, `?minFill=`) is
 * untouched; the header sorts the page in hand.
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
}

export function useReportBinUtilizationSpreadsheet({
  rows,
  loading = false,
  emptyMessage = 'No data — try the daily refresh cron, or write some movement.',
  searchPlaceholder = 'Filter this report…',
}: UseReportBinUtilizationSpreadsheetOptions): CompoundSpreadsheetFeed<
  BinUtilizationReportRow,
  ReportBinUtilizationGridColumnKey,
  ReportBinUtilizationGridColumn
> {
  const [sort, setSort] = useState<ReportBinUtilizationGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);
  const [query, setQuery] = useState('');

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
    () => ({ value: query, onChange: setQuery, placeholder: searchPlaceholder }),
    [query, searchPlaceholder],
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
