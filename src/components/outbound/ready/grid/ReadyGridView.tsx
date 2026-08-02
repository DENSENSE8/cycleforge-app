'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { LedgerGridSurface, useGridColumnVisibility } from '@/design-system/components/grid';
import { GridColumnDetailsPanel } from '@/components/ui/table-column-config/GridColumnDetailsPanel';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import type { RowGroup } from '@/lib/group-rows';
import type { AllocationHit } from '@/lib/channel-allocation';
import { makeReadyGridDescriptor } from './ready-grid-descriptor';
import { ReadyGridColumnHeader } from './ReadyGridColumnHeader';
import {
  ReadyGridRow,
  readyFallbackStateLabel,
  readyHitTitle,
  readyVerdictLabel,
} from './ReadyGridRow';
import {
  READY_GRID_COLUMNS,
  defaultDirForReadyGridSort,
  isReadyGridSortable,
  type ReadyGridColumn,
  type ReadyGridColumnKey,
} from './ready-grid-layout';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

/** Staff-prefs identity — one Ready spreadsheet, one Fields selection. */
const READY_TABLE_ID = 'ready' as const;

interface ReadyGridViewProps {
  rows: AllocationHit[];
  loading: boolean;
  /** Settled with no tested history at all. */
  emptyMessage: string;
  /** Settled with none matching the search/tab — a different answer. */
  searchEmptyMessage?: string;
  isSearching?: boolean;
  /** FULL canonical column list — visibility is resolved here, not by callers. */
  columns?: readonly ReadyGridColumn[];
}

/**
 * Row order for a column sort.
 *
 * `destination` sorts on what the cell actually SHOWS, not on
 * `hit.disposition` alone: a hit with no disposition renders its allocation
 * state instead ("In FBA", "Not ready"), so ordering by the raw field would
 * scatter those rows against a column the operator can see is grouped.
 */
function compareReadyRows(
  a: AllocationHit,
  b: AllocationHit,
  key: ReadyGridColumnKey,
  dir: GridSortDir,
): number {
  const sign = dir === 'asc' ? 1 : -1;
  switch (key) {
    case 'title':
      return sign * readyHitTitle(a).localeCompare(readyHitTitle(b));
    case 'verdict':
      return sign * readyVerdictLabel(a.verdict).localeCompare(readyVerdictLabel(b.verdict));
    case 'destination': {
      const label = (h: AllocationHit) => h.disposition ?? readyFallbackStateLabel(h);
      return sign * label(a).localeCompare(label(b));
    }
    case 'velocity':
      return sign * (a.velocityTier || '').localeCompare(b.velocityTier || '');
    case 'condition':
      return sign * (a.conditionGrade || '').localeCompare(b.conditionGrade || '');
    case 'tested':
      // Untested rows have no instant to order by — park them last in BOTH
      // directions rather than letting the empty string sort as "oldest".
      if (!a.testedAt && !b.testedAt) return 0;
      if (!a.testedAt) return 1;
      if (!b.testedAt) return -1;
      return sign * a.testedAt.localeCompare(b.testedAt);
    default:
      return 0;
  }
}

/**
 * Recently-tested / Ready spreadsheet — outbound-native adapter over
 * {@link LedgerGridSurface}. Flat history: no fold, no day band, no selection.
 *
 * The tab + search filters live in `ReadyWorkspaceView` (URL state); this
 * receives the already-filtered hits and owns only display order.
 */
export function ReadyGridView({
  rows,
  loading,
  emptyMessage,
  searchEmptyMessage,
  isSearching,
  columns = READY_GRID_COLUMNS,
}: ReadyGridViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Column sort is DURABLE: `?colsort=`/`?coldir=`. NOT `?sort=` — the outbound
  // routes already spend that pair on the queue display-order vocabulary.
  const {
    sort: columnSort,
    dir: sortDir,
    setSort,
  } = useUrlColumnSort<ReadyGridColumnKey>({
    isColumn: isReadyGridSortable,
    defaultDir: defaultDirForReadyGridSort,
  });

  const [columnDetailsOpen, setColumnDetailsOpen] = useState(false);

  // ONE visibility resolution: descriptor default tier + this staffer's delta.
  const { columns: visible } = useGridColumnVisibility<ReadyGridColumn>({
    columns,
    tableId: READY_TABLE_ID,
  });

  const descriptor = useMemo(() => makeReadyGridDescriptor(visible), [visible]);

  // One-shot settle re-render after first data — see PickupGridView for why the
  // virtualizer can otherwise miss its scrollport on first paint.
  const [, settleTick] = useState(0);
  const hasRows = rows.length > 0;
  useEffect(() => {
    if (loading || !hasRows) return;
    const raf = requestAnimationFrame(() => settleTick((t) => t + 1));
    return () => cancelAnimationFrame(raf);
  }, [loading, hasRows]);

  const orderGroupsByDate = useMemo<[string, RowGroup<AllocationHit>[]][]>(() => {
    const ordered =
      columnSort && sortDir
        ? [...rows].sort((a, b) => compareReadyRows(a, b, columnSort, sortDir))
        : rows;
    // One unnamed band — tested history has no fold axis. Safe when empty:
    // `LedgerGrid` decides emptiness from ROW count (`hasGridRows`).
    return [['', ordered.map((hit) => ({ key: `hit:${hit.testingResultId}`, rows: [hit] }))]];
  }, [rows, columnSort, sortDir]);

  const renderLeaf = (hit: AllocationHit) => (
    <ReadyGridRow key={hit.testingResultId} hit={hit} columns={visible} />
  );

  return (
    <>
      <LedgerGridSurface<AllocationHit, ReadyGridColumnKey>
        ariaLabel="Recently tested units"
        descriptor={descriptor}
        orderGroupsByDate={orderGroupsByDate}
        rows={rows}
        getRowId={(r) => String(r.testingResultId)}
        sort={columnSort}
        dir={sortDir}
        onSortChange={setSort}
        loading={loading}
        emptyMessage={emptyMessage}
        searchEmptyMessage={searchEmptyMessage}
        isSearching={isSearching}
        scrollRef={scrollRef}
        testId="ready-grid-body"
        tableId={READY_TABLE_ID}
        columnDetails={{ open: columnDetailsOpen, onOpen: () => setColumnDetailsOpen(true) }}
        renderColumnHeader={({ toggleColumnSort, onResizeColumn }) => (
          <ReadyGridColumnHeader
            columns={visible}
            activeSort={columnSort}
            sortDir={sortDir}
            onSortColumn={toggleColumnSort}
            onResizeColumn={onResizeColumn}
          />
        )}
        renderGroup={(group) => <>{group.rows.map(renderLeaf)}</>}
        renderRow={(row) => renderLeaf(row)}
      />
      <GridColumnDetailsPanel
        open={columnDetailsOpen}
        onClose={() => setColumnDetailsOpen(false)}
        tableId={READY_TABLE_ID}
        columns={columns}
      />
    </>
  );
}
