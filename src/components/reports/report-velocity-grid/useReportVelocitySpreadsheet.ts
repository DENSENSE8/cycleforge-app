'use client';

/**
 * **SKU-velocity spreadsheet** — the family glue that resolves a
 * {@link DataTable} feed bag. Spread it onto the host; there is no second
 * table component.
 *
 * ```tsx
 * const sheet = useReportVelocitySpreadsheet({ rows, loading });
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
 * is a client `fetch` of up to 200 rows. Writing `?sort=` would make a header
 * click round-trip a URL nothing else reads, and `?search=` per keystroke
 * would re-render the whole desk for a filter over rows the client already
 * holds. The server query's own narrowing (`?tier=`) is untouched; the header
 * sorts the page in hand.
 */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import { resolveReportVelocitySlotValue } from '@/lib/tables/field-catalog/report-velocity-resolve';
import type { VelocityReportRow } from '@/lib/reports/report-rows';
import { reportVelocityCompoundView } from './report-velocity-row-view';
import {
  reportVelocityCompoundColumnsFor,
  reportVelocitySortFactFor,
  type ReportVelocityGridColumn,
  type ReportVelocityGridColumnKey,
} from './report-velocity-grid-layout';
import {
  REPORT_VELOCITY_GRID_CAPABILITIES,
  REPORT_VELOCITY_TABLE_BINDING,
} from './report-velocity-table-definition';
import { useReportVelocityTableLayout } from './useReportVelocityTableLayout';

export interface UseReportVelocitySpreadsheetOptions {
  /** One report page, already ordered by the route; a header click re-orders it. */
  rows: readonly VelocityReportRow[];
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
}

export function useReportVelocitySpreadsheet({
  rows,
  loading = false,
  emptyMessage = 'No data — try the daily refresh cron, or write some movement.',
  searchPlaceholder = 'Filter this report…',
}: UseReportVelocitySpreadsheetOptions): CompoundSpreadsheetFeed<
  VelocityReportRow,
  ReportVelocityGridColumnKey,
  ReportVelocityGridColumn
> {
  const [sort, setSort] = useState<ReportVelocityGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);
  const [query, setQuery] = useState('');

  const { effectiveLayout, subtitleFieldIds, fields } = useReportVelocityTableLayout();
  const columns = useMemo(
    () => reportVelocityCompoundColumnsFor(effectiveLayout),
    [effectiveLayout],
  );

  const onSortChange = useCallback(
    (key: ReportVelocityGridColumnKey, nextDir: 'asc' | 'desc') => {
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
    VelocityReportRow,
    ReportVelocityGridColumnKey,
    ReportVelocityGridColumn
  >({
    binding: REPORT_VELOCITY_TABLE_BINDING,
    columns,
    fields,
    rows,
    getRowId: (row) => row.sku,
    adapter: reportVelocityCompoundView,
    subtitleFieldIds,
    resolve: resolveReportVelocitySlotValue,
    sortFactFor: reportVelocitySortFactFor,
    capabilities: REPORT_VELOCITY_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange,
    search,
    loading,
    emptyMessage,
    ariaLabel: 'SKU velocity, last 30 days',
  });
}
