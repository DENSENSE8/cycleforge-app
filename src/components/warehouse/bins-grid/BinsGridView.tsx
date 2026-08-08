'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NonlinearTableHost } from '@/components/tables/NonlinearTableHost';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import type { BinsOverviewRow } from '@/hooks/useBinsOverview';
import type { RowGroup } from '@/lib/group-rows';
import {
  emitSelection,
  emitSelectionTotal,
  onToggleAll,
} from '@/lib/selection/table-selection';
import { BINS_SELECTION_SCOPE } from './bins-grid-descriptor';
import { BINS_TABLE_BINDING } from './bins-table-definition';
import { BinsGridColumnHeader } from './BinsGridColumnHeader';
import { BinsGridRow } from './BinsGridRow';
import {
  defaultDirForBinsGridSort,
  isBinsGridSortable,
  type BinsGridColumn,
  type BinsGridColumnKey,
} from './bins-grid-layout';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

interface BinsGridViewProps {
  rows: BinsOverviewRow[];
  loading: boolean;
  /** Parent-controlled bulk membership (drives the warehouse bulk action bar). */
  selected: Set<number>;
  onSelectChange: (next: Set<number>) => void;
  onRowClick: (row: BinsOverviewRow) => void;
  emptyMessage?: string;
  /** FULL canonical column list — the host resolves visibility. */
  columns?: readonly BinsGridColumn[];
  /**
   * Band-3 triage controls slot — when set, the column-display (▦) trigger
   * portals there beside find / room filter instead of floating on the card corner.
   */
  columnTriggerPortalTarget?: HTMLElement | null;
}

/**
 * Row order for a column sort. `location` sorts room → row → col — what the
 * cell shows as its primary + secondary lines — not barcode.
 */
function compareBinsRows(
  a: BinsOverviewRow,
  b: BinsOverviewRow,
  key: BinsGridColumnKey,
  dir: GridSortDir,
): number {
  const sign = dir === 'asc' ? 1 : -1;
  switch (key) {
    case 'barcode':
      return sign * String(a.barcode ?? '').localeCompare(String(b.barcode ?? ''));
    case 'location':
      return (
        sign *
        (String(a.room ?? '').localeCompare(String(b.room ?? '')) ||
          String(a.row_label ?? '').localeCompare(String(b.row_label ?? '')) ||
          String(a.col_label ?? '').localeCompare(String(b.col_label ?? '')))
      );
    case 'sku_count':
      return sign * (a.sku_count - b.sku_count);
    case 'total_qty':
      return sign * (a.total_qty - b.total_qty);
    case 'fill':
      // Unknown fill parks last in BOTH directions — not as -1 "emptiest".
      if (a.fill_pct == null && b.fill_pct == null) return 0;
      if (a.fill_pct == null) return 1;
      if (b.fill_pct == null) return -1;
      return sign * (a.fill_pct - b.fill_pct);
    case 'last_counted': {
      // Never-counted parks last in BOTH directions — same unknown treatment.
      if (!a.last_counted && !b.last_counted) return 0;
      if (!a.last_counted) return 1;
      if (!b.last_counted) return -1;
      return sign * a.last_counted.localeCompare(b.last_counted);
    }
    default:
      return 0;
  }
}

/**
 * Warehouse bins spreadsheet — warehouse-native adapter over
 * {@link LedgerGridSurface}. Flat map: no fold, no day band. Multi-select is
 * parent-controlled (`selected` / `onSelectChange`); this view bridges that set
 * onto the header select-all bus so the sticky checkbox stays honest.
 */
export function BinsGridView({
  rows,
  loading,
  selected,
  onSelectChange,
  onRowClick,
  emptyMessage = 'No bins match the current filters.',
  columns,
  columnTriggerPortalTarget = null,
}: BinsGridViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Column sort is DURABLE: `?colsort=`/`?coldir=`.
  const {
    sort: columnSort,
    dir: sortDir,
    setSort,
  } = useUrlColumnSort<BinsGridColumnKey>({
    isColumn: isBinsGridSortable,
    defaultDir: defaultDirForBinsGridSort,
  });

  // Bridge parent Set → selection bus (header select-all + indeterminate).
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const onSelectChangeRef = useRef(onSelectChange);
  onSelectChangeRef.current = onSelectChange;

  useEffect(() => {
    const byId = new Map(rows.map((r) => [r.id, r] as const));
    const out: BinsOverviewRow[] = [];
    for (const id of selected) {
      const row = byId.get(id);
      if (row) out.push(row);
    }
    emitSelection(BINS_SELECTION_SCOPE, out);
  }, [rows, selected]);

  useEffect(() => {
    emitSelectionTotal(BINS_SELECTION_SCOPE, rows.length);
  }, [rows.length]);

  useEffect(() => {
    return onToggleAll(BINS_SELECTION_SCOPE, (mode) => {
      onSelectChangeRef.current(
        mode === 'all' ? new Set(rowsRef.current.map((r) => r.id)) : new Set(),
      );
    });
  }, []);

  // One-shot settle re-render after first data — see PickupGridView.
  const [, settleTick] = useState(0);
  const hasRows = rows.length > 0;
  useEffect(() => {
    if (loading || !hasRows) return;
    const raf = requestAnimationFrame(() => settleTick((t) => t + 1));
    return () => cancelAnimationFrame(raf);
  }, [loading, hasRows]);

  const orderGroupsByDate = useMemo<[string, RowGroup<BinsOverviewRow>[]][]>(() => {
    const ordered =
      columnSort && sortDir
        ? [...rows].sort((a, b) => compareBinsRows(a, b, columnSort, sortDir))
        : rows;
    return [['', ordered.map((row) => ({ key: `bin:${row.id}`, rows: [row] }))]];
  }, [rows, columnSort, sortDir]);

  const onOpen = useCallback((row: BinsOverviewRow) => onRowClick(row), [onRowClick]);
  const onToggleSelect = useCallback(
    (row: BinsOverviewRow) => {
      const next = new Set(selected);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      onSelectChange(next);
    },
    [selected, onSelectChange],
  );

  const renderLeaf = (row: BinsOverviewRow, visible: readonly BinsGridColumn[]) => (
    <BinsGridRow
      key={row.id}
      row={row}
      isChecked={selected.has(row.id)}
      onOpen={onOpen}
      onToggleSelect={onToggleSelect}
      columns={visible}
    />
  );

  return (
    <NonlinearTableHost<BinsOverviewRow, BinsGridColumnKey, BinsGridColumn>
      binding={BINS_TABLE_BINDING}
      columns={columns}
      orderGroupsByDate={orderGroupsByDate}
      rows={rows}
      getRowId={(r) => String(r.id)}
      sort={columnSort}
      dir={sortDir}
      onSortChange={setSort}
      loading={loading}
      emptyMessage={emptyMessage}
      scrollRef={scrollRef}
      columnTriggerPortalTarget={columnTriggerPortalTarget}
      renderColumnHeader={({ toggleColumnSort, onResizeColumn, onResetColumn, columns: visible }) => (
        <BinsGridColumnHeader
          selectionScope={BINS_SELECTION_SCOPE}
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
