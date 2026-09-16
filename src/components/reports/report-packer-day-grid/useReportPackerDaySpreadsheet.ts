'use client';

/**
 * **Packer-day spreadsheet** — the family glue that resolves a
 * {@link DataTable} feed bag. Spread it onto the host; there is no second
 * table component.
 *
 * ```tsx
 * const sheet = useReportPackerDaySpreadsheet({ rows, loading });
 * return <DataTable {...sheet} totalCount={rows.length} />;
 * ```
 *
 * Sort and search are LOCAL state, like the sibling reports: this desk owns no
 * report search params beyond `?tab=` and `?date=`, and a `?sort=` round-trip
 * would make a header click re-render the whole desk for an ordering the
 * client already holds.
 */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import { resolveReportPackerDaySlotValue } from '@/lib/tables/field-catalog/report-packer-day-resolve';
import type { PackingReportRow } from '@/lib/packing/packing-report-shared';
import { reportPackerDayCompoundView } from './report-packer-day-row-view';
import {
  reportPackerDayCompoundColumnsFor,
  reportPackerDaySortFactFor,
  type ReportPackerDayGridColumn,
  type ReportPackerDayGridColumnKey,
} from './report-packer-day-grid-layout';
import {
  REPORT_PACKER_DAY_GRID_CAPABILITIES,
  REPORT_PACKER_DAY_TABLE_BINDING,
} from './report-packer-day-table-definition';
import { useReportPackerDayTableLayout } from './useReportPackerDayTableLayout';

export interface UseReportPackerDaySpreadsheetOptions {
  /** One day's packs, newest first; a header click re-orders. */
  rows: readonly PackingReportRow[];
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
}

export function useReportPackerDaySpreadsheet({
  rows,
  loading = false,
  emptyMessage = 'No packs recorded on this day.',
  searchPlaceholder = 'Filter this day…',
}: UseReportPackerDaySpreadsheetOptions): CompoundSpreadsheetFeed<
  PackingReportRow,
  ReportPackerDayGridColumnKey,
  ReportPackerDayGridColumn
> {
  const [sort, setSort] = useState<ReportPackerDayGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);
  const [query, setQuery] = useState('');

  const { effectiveLayout, subtitleFieldIds, fields } = useReportPackerDayTableLayout();
  const columns = useMemo(
    () => reportPackerDayCompoundColumnsFor(effectiveLayout),
    [effectiveLayout],
  );

  const onSortChange = useCallback(
    (key: ReportPackerDayGridColumnKey, nextDir: 'asc' | 'desc') => {
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
    PackingReportRow,
    ReportPackerDayGridColumnKey,
    ReportPackerDayGridColumn
  >({
    binding: REPORT_PACKER_DAY_TABLE_BINDING,
    columns,
    fields,
    rows,
    // `salId` is the station_activity_logs id — one pack scan, one row, and a
    // stable key across a refetch.
    getRowId: (row) => String(row.salId),
    adapter: reportPackerDayCompoundView,
    subtitleFieldIds,
    resolve: resolveReportPackerDaySlotValue,
    sortFactFor: reportPackerDaySortFactFor,
    capabilities: REPORT_PACKER_DAY_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange,
    search,
    loading,
    emptyMessage,
    ariaLabel: 'Packer day, one row per pack',
  });
}
