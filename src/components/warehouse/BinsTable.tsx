'use client';

/** Enriched bin table for the inventory hub main area — the data host that mounts the Workbench spreadsheet SoT (`NonlinearTableHost` + the… */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DataTable } from '@/components/tables/DataTable';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import type { BinsOverviewRow } from '@/hooks/useBinsOverview';
import type { RowGroup } from '@/lib/group-rows';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import {
  emitSelection,
  emitSelectionTotal,
  onToggleAll,
} from '@/lib/selection/table-selection';
import { BINS_SELECTION_SCOPE } from './bins-grid/bins-grid-descriptor';
import { BINS_TABLE_BINDING } from './bins-grid/bins-table-definition';
import { BinsGridRow } from './bins-grid/BinsGridRow';
import {
  binsSortFactFor,
  defaultDirForBinsColumn,
  isBinsColumnSortable,
  type BinsGridColumn,
  type BinsGridColumnKey,
} from './bins-grid/bins-grid-layout';

interface Props {
  rows: BinsOverviewRow[];
  loading: boolean;
  /** Selection state (controlled by parent so the bulk action bar can read it). */
  selected: Set<number>;
  onSelectChange: (next: Set<number>) => void;
  onRowClick: (row: BinsOverviewRow) => void;
}

/**
 * Row order for a column sort. `location` sorts room → row → col — what the
 * cell shows as its primary + secondary lines — not barcode.
 */
function compareBinsRows(
  a: BinsOverviewRow,
  b: BinsOverviewRow,
  fact: string,
  dir: GridSortDir,
): number {
  const sign = dir === 'asc' ? 1 : -1;
  switch (fact) {
    case 'bins.barcode':
      return sign * String(a.barcode ?? '').localeCompare(String(b.barcode ?? ''));
    case 'bins.location':
      return (
        sign *
        (String(a.room ?? '').localeCompare(String(b.room ?? '')) ||
          String(a.row_label ?? '').localeCompare(String(b.row_label ?? '')) ||
          String(a.col_label ?? '').localeCompare(String(b.col_label ?? '')))
      );
    case 'bins.sku_count':
      return sign * (a.sku_count - b.sku_count);
    case 'bins.total_qty':
      return sign * (a.total_qty - b.total_qty);
    case 'bins.fill':
      // Unknown fill parks last in BOTH directions — not as -1 "emptiest".
      if (a.fill_pct == null && b.fill_pct == null) return 0;
      if (a.fill_pct == null) return 1;
      if (b.fill_pct == null) return -1;
      return sign * (a.fill_pct - b.fill_pct);
    case 'bins.last_counted': {
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

export function BinsTable({
  rows,
  loading,
  selected,
  onSelectChange,
  onRowClick,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const columns = BINS_TABLE_BINDING.columns;
  const sortFactByKey = useMemo(
    () => new Map(columns.map((c) => [c.key as string, binsSortFactFor(c)])),
    [columns],
  );

  const {
    sort: columnSort,
    dir: sortDir,
    setSort,
  } = useUrlColumnSort<BinsGridColumnKey>({
    isColumn: (raw) => isBinsColumnSortable(columns, raw),
    defaultDir: (key) => defaultDirForBinsColumn(columns, key),
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

  // One-shot settle re-render after first data — the virtualized LedgerGrid can
  // otherwise miss its scrollport on first paint when nothing else re-renders.
  const [, settleTick] = useState(0);
  const hasRows = rows.length > 0;
  useEffect(() => {
    if (loading || !hasRows) return;
    const raf = requestAnimationFrame(() => settleTick((t) => t + 1));
    return () => cancelAnimationFrame(raf);
  }, [loading, hasRows]);

  const orderGroupsByDate = useMemo<[string, RowGroup<BinsOverviewRow>[]][]>(() => {
    const sortFact = columnSort ? (sortFactByKey.get(columnSort) ?? null) : null;
    const ordered =
      sortFact && sortDir
        ? [...rows].sort((a, b) => compareBinsRows(a, b, sortFact, sortDir))
        : rows;
    return [['', ordered.map((row) => ({ key: `bin:${row.id}`, rows: [row] }))]];
  }, [rows, columnSort, sortFactByKey, sortDir]);

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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <DataTable<BinsOverviewRow, BinsGridColumnKey, BinsGridColumn>
        binding={BINS_TABLE_BINDING}
        columns={columns}
        orderGroupsByDate={orderGroupsByDate}
        rows={rows}
        getRowId={(r) => String(r.id)}
        sort={columnSort}
        dir={sortDir}
        onSortChange={setSort}
        loading={loading}
        emptyMessage="No bins match the current filters."
        scrollRef={scrollRef}
        selectionScope={BINS_SELECTION_SCOPE}
        renderGroup={(group, _stripe, { columns: visible }) => (
          <>{group.rows.map((row) => renderLeaf(row, visible))}</>
        )}
        renderRow={(row, _stripe, { columns: visible }) => renderLeaf(row, visible)}
      />
    </div>
  );
}
