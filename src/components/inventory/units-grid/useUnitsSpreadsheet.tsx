'use client';

/**
 * **Inventory-units spreadsheet** — the family glue that resolves a
 * {@link DataTable} feed bag for serialized-unit browse. Spread it onto the
 * host; there is no second table component.
 *
 * ```tsx
 * const sheet = useUnitsSpreadsheet({ rows, loading, search, sort, dir, onSortChange, onOpen });
 * return <DataTable {...sheet} />;
 * ```
 *
 * Units is a SHEET morph, so the leaf is still the allowlisted
 * {@link UnitsGridRow} until a generic sheet row exists. This hook is the
 * feed: columns, sort-by-fact, grouping, the row renderer. Two mounts already
 * prove the seam — `/inventory/units` (URL sort + inspector) and the Inventory
 * shell's by-filter pane (local sort + `?unit=`). A third feed is a `rows`
 * prop, not a table.
 */

import { useEffect, useMemo, useState, type RefObject } from 'react';
import type { DataTableProps } from '@/components/tables/DataTable';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import type { RowGroup } from '@/lib/group-rows';
import type { UnitsOverviewRow } from '@/hooks/useUnitsOverview';
import { UnitsGridRow } from './UnitsGridRow';
import { UNITS_TABLE_BINDING } from './units-table-definition';
import { useUnitsTableLayout } from './useUnitsTableLayout';
import {
  unitsSheetColumnsFor,
  unitsSortFactFor,
  type UnitsGridColumn,
  type UnitsGridColumnKey,
} from './units-grid-layout';

function compareUnitsRows(
  a: UnitsOverviewRow,
  b: UnitsOverviewRow,
  fact: string,
  dir: GridSortDir,
): number {
  const sign = dir === 'asc' ? 1 : -1;
  const s = (v: string | null) => String(v ?? '');
  switch (fact) {
    case 'units.serial':
      return sign * s(a.serial_number).localeCompare(s(b.serial_number));
    case 'product':
      return sign * s(a.product_title).localeCompare(s(b.product_title));
    case 'units.status':
      return sign * s(a.current_status).localeCompare(s(b.current_status));
    case 'units.condition':
      return sign * s(a.condition_grade).localeCompare(s(b.condition_grade));
    case 'units.location':
      return sign * s(a.current_location).localeCompare(s(b.current_location));
    case 'units.updated': {
      if (!a.updated_at && !b.updated_at) return 0;
      if (!a.updated_at) return 1;
      if (!b.updated_at) return -1;
      return sign * a.updated_at.localeCompare(b.updated_at);
    }
    default:
      return 0;
  }
}

export interface UseUnitsSpreadsheetOptions {
  rows: readonly UnitsOverviewRow[];
  loading?: boolean;
  emptyMessage?: string;
  searchEmptyMessage?: string;
  search: { value: string; onChange: (next: string) => void; placeholder?: string };
  sort: UnitsGridColumnKey | null;
  dir: GridSortDir | null;
  onSortChange: (key: UnitsGridColumnKey, dir: 'asc' | 'desc') => void;
  onOpen: (row: UnitsOverviewRow) => void;
  scrollRef?: RefObject<HTMLDivElement | null>;
  totalCount?: number;
  onLoadMore?: () => void;
}

export function useUnitsSpreadsheet({
  rows,
  loading = false,
  emptyMessage = 'No units match the current filters.',
  searchEmptyMessage = 'No units match the current filters.',
  search,
  sort,
  dir,
  onSortChange,
  onOpen,
  scrollRef,
  totalCount,
  onLoadMore,
}: UseUnitsSpreadsheetOptions): DataTableProps<
  UnitsOverviewRow,
  UnitsGridColumnKey,
  UnitsGridColumn
> {
  const { effectiveLayout: unitsLayout, fields } = useUnitsTableLayout();
  const columns = useMemo(() => unitsSheetColumnsFor(unitsLayout), [unitsLayout]);
  const sortFactByKey = useMemo(
    () => new Map(columns.map((c) => [c.key as string, unitsSortFactFor(c)])),
    [columns],
  );

  const [, settleTick] = useState(0);
  const hasRows = rows.length > 0;
  useEffect(() => {
    if (loading || !hasRows) return;
    const raf = requestAnimationFrame(() => settleTick((t) => t + 1));
    return () => cancelAnimationFrame(raf);
  }, [loading, hasRows]);

  const orderGroupsByDate = useMemo<[string, RowGroup<UnitsOverviewRow>[]][]>(() => {
    const sortFact = sort ? (sortFactByKey.get(sort) ?? null) : null;
    const ordered =
      sortFact && dir ? [...rows].sort((a, b) => compareUnitsRows(a, b, sortFact, dir)) : [...rows];
    return [['', ordered.map((row) => ({ key: `unit:${row.id}`, rows: [row] }))]];
  }, [rows, sort, sortFactByKey, dir]);

  const renderLeaf = (row: UnitsOverviewRow, visible: readonly UnitsGridColumn[]) => (
    <UnitsGridRow key={row.id} row={row} onOpen={onOpen} columns={visible} />
  );

  return {
    binding: UNITS_TABLE_BINDING,
    columns,
    fields,
    orderGroupsByDate,
    rows: [...rows],
    getRowId: (r) => String(r.id),
    sort,
    dir,
    onSortChange,
    loading,
    emptyMessage,
    searchEmptyMessage,
    search,
    scrollRef,
    totalCount,
    onLoadMore,
    renderGroup: (group, _stripe, { columns: visible }) => (
      <>{group.rows.map((row) => renderLeaf(row, visible))}</>
    ),
    renderRow: (row, _stripe, { columns: visible }) => renderLeaf(row, visible),
  };
}
