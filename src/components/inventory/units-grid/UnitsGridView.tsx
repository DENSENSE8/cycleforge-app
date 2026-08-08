'use client';

import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { NonlinearTableHost } from '@/components/tables/NonlinearTableHost';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import type { UnitsOverviewRow } from '@/hooks/useUnitsOverview';
import type { RowGroup } from '@/lib/group-rows';
import { UNITS_TABLE_BINDING } from './units-table-definition';
import { UnitsGridColumnHeader } from './UnitsGridColumnHeader';
import { UnitsGridRow } from './UnitsGridRow';
import {
  defaultDirForUnitsGridSort,
  isUnitsGridSortable,
  type UnitsGridColumn,
  type UnitsGridColumnKey,
} from './units-grid-layout';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

interface UnitsGridViewProps {
  rows: UnitsOverviewRow[];
  loading: boolean;
  onRowClick: (row: UnitsOverviewRow) => void;
  emptyMessage?: string;
  searchEmptyMessage?: string;
  isSearching?: boolean;
  /** FULL canonical column list — the host resolves visibility. */
  columns?: readonly UnitsGridColumn[];
  /** Band-3 triage controls slot — the column-display (▦) trigger portals there. */
  columnTriggerPortalTarget?: HTMLElement | null;
}

/** Row order for a column sort — string/number/date compares, unknown parks last. */
function compareUnitsRows(
  a: UnitsOverviewRow,
  b: UnitsOverviewRow,
  key: UnitsGridColumnKey,
  dir: GridSortDir,
): number {
  const sign = dir === 'asc' ? 1 : -1;
  const s = (v: string | null) => String(v ?? '');
  switch (key) {
    case 'serial':
      return sign * s(a.serial_number).localeCompare(s(b.serial_number));
    case 'product':
      return sign * s(a.product_title).localeCompare(s(b.product_title));
    case 'status':
      return sign * s(a.current_status).localeCompare(s(b.current_status));
    case 'condition':
      return sign * s(a.condition_grade).localeCompare(s(b.condition_grade));
    case 'location':
      return sign * s(a.current_location).localeCompare(s(b.current_location));
    case 'updated': {
      if (!a.updated_at && !b.updated_at) return 0;
      if (!a.updated_at) return 1;
      if (!b.updated_at) return -1;
      return sign * a.updated_at.localeCompare(b.updated_at);
    }
    default:
      return 0;
  }
}

/**
 * Inventory units spreadsheet — inventory-native adapter over
 * {@link LedgerGridSurface} (sibling of `BinsGridView`). Flat map: no fold, no
 * day band, browse-only. Row order is house state math; the shell recipe,
 * prefs bucket and column model come from {@link UNITS_TABLE_BINDING}.
 */
export function UnitsGridView({
  rows,
  loading,
  onRowClick,
  emptyMessage = 'No units match the current filters.',
  searchEmptyMessage,
  isSearching,
  columns,
  columnTriggerPortalTarget = null,
}: UnitsGridViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Column sort is DURABLE: `?colsort=`/`?coldir=`.
  const {
    sort: columnSort,
    dir: sortDir,
    setSort,
  } = useUrlColumnSort<UnitsGridColumnKey>({
    isColumn: isUnitsGridSortable,
    defaultDir: defaultDirForUnitsGridSort,
  });

  // One-shot settle re-render after first data — see BinsGridView.
  const [, settleTick] = useState(0);
  const hasRows = rows.length > 0;
  useEffect(() => {
    if (loading || !hasRows) return;
    const raf = requestAnimationFrame(() => settleTick((t) => t + 1));
    return () => cancelAnimationFrame(raf);
  }, [loading, hasRows]);

  const orderGroupsByDate = useMemo<[string, RowGroup<UnitsOverviewRow>[]][]>(() => {
    const ordered =
      columnSort && sortDir
        ? [...rows].sort((a, b) => compareUnitsRows(a, b, columnSort, sortDir))
        : rows;
    return [['', ordered.map((row) => ({ key: `unit:${row.id}`, rows: [row] }))]];
  }, [rows, columnSort, sortDir]);

  const onOpen = useCallback((row: UnitsOverviewRow) => onRowClick(row), [onRowClick]);

  const renderLeaf = (row: UnitsOverviewRow, visible: readonly UnitsGridColumn[]) => (
    <UnitsGridRow key={row.id} row={row} onOpen={onOpen} columns={visible} />
  );

  return (
    <NonlinearTableHost<UnitsOverviewRow, UnitsGridColumnKey, UnitsGridColumn>
      binding={UNITS_TABLE_BINDING}
      columns={columns}
      orderGroupsByDate={orderGroupsByDate}
      rows={rows}
      getRowId={(r) => String(r.id)}
      sort={columnSort}
      dir={sortDir}
      onSortChange={setSort}
      loading={loading}
      emptyMessage={emptyMessage}
      searchEmptyMessage={searchEmptyMessage}
      isSearching={isSearching}
      scrollRef={scrollRef}
      columnTriggerPortalTarget={columnTriggerPortalTarget}
      renderColumnHeader={({ toggleColumnSort, onResizeColumn, onResetColumn, columns: visible }) => (
        <UnitsGridColumnHeader
          columns={visible}
          activeSort={columnSort}
          sortDir={sortDir}
          onSortColumn={toggleColumnSort}
          onResizeColumn={onResizeColumn}
          onResetColumn={onResetColumn}
        />
      )}
      renderGroup={(group, _stripe, { columns: visible }) => (
        <>{group.rows.map((row) => renderLeaf(row, visible))}</>
      )}
      renderRow={(row, _stripe, { columns: visible }) => renderLeaf(row, visible)}
    />
  );
}
