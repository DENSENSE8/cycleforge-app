'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { LedgerGridSurface } from '@/design-system/components/grid';
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
  /** FULL canonical column list — `LedgerGridSurface` resolves visibility. */
  columns?: readonly ReadyGridColumn[];
  /**
   * Portal target for the column-display (▦) trigger — lets the host seat it
   * in the triage band's controls slot instead of the card corner.
   */
  columnTriggerPortalTarget?: HTMLElement | null;
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
 * The tab + search filters live in `FbaWorkspaceHeader` / `ReadyWorkspaceBody`
 * (URL state); this
 * receives the already-filtered hits and owns only display order.
 */
export function ReadyGridView({
  rows,
  loading,
  emptyMessage,
  searchEmptyMessage,
  isSearching,
  columns = READY_GRID_COLUMNS,
  columnTriggerPortalTarget = null,
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

  const renderLeaf = (hit: AllocationHit, visible: readonly ReadyGridColumn[]) => (
    <ReadyGridRow key={hit.testingResultId} hit={hit} columns={visible} />
  );

  return (
    <LedgerGridSurface<AllocationHit, ReadyGridColumnKey, ReadyGridColumn>
      ariaLabel="Recently tested units"
      surface="sheet"
      columns={columns}
      makeDescriptor={makeReadyGridDescriptor}
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
      columnTriggerPortalTarget={columnTriggerPortalTarget}
      renderColumnHeader={({ toggleColumnSort, onResizeColumn, onResetColumn, columns: visible }) => (
        <ReadyGridColumnHeader
          columns={visible}
          activeSort={columnSort}
          sortDir={sortDir}
          onSortColumn={toggleColumnSort}
          onResizeColumn={onResizeColumn}
        onResetColumn={onResetColumn}
        />
      )}
      renderGroup={(group, _stripe, { columns: visible }) => (
        <>{group.rows.map((hit) => renderLeaf(hit, visible))}</>
      )}
      renderRow={(row, _stripe, { columns: visible }) => renderLeaf(row, visible)}
    />
  );
}
