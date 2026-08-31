'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import {
  DataTable,
  type DataTableFilterOption,
  type DataTableSearch,
} from '@/components/tables/DataTable';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import type { RowGroup } from '@/lib/group-rows';
import type { AllocationHit } from '@/lib/channel-allocation';
import { READY_TABLE_BINDING } from '@/components/outbound/ready/grid/ready-table-definition';
import {
  ReadyGridRow,
  readyFallbackStateLabel,
  readyHitTitle,
  readyVerdictLabel,
} from '@/components/outbound/ready/grid/ReadyGridRow';
import {
  defaultDirForReadyGridSort,
  isReadyGridSortable,
  type ReadyGridColumn,
  type ReadyGridColumnKey,
} from '@/components/outbound/ready/grid/ready-grid-layout';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

interface ReadyQueueTableProps {
  hits: AllocationHit[];
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  /** True while a search or a non-`all` tab is narrowing the hits. */
  isFiltered?: boolean;
  /** The find field, as data — the workspace above owns the URL it writes. */
  search: DataTableSearch;
  /** The ONE filter control, as data (the FBA desk threads its mode options). */
  filter?: {
    options: readonly DataTableFilterOption[];
    onToggle: (id: string) => void;
    onClearAll: () => void;
  };
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
 * Recently-tested history map — the data host that mounts the Workbench
 * spreadsheet SoT (`NonlinearTableHost` + the Ready table definition) directly.
 * Flat history: no fold, no day band, no selection; owns only display order.
 *
 * The tab + search filters live in `FbaWorkspaceHeader` / `ReadyWorkspaceBody`
 * (URL state); this receives the already-filtered hits. Column sort is DURABLE
 * on `?colsort=`/`?coldir=` (NOT `?sort=` — the outbound routes already spend
 * that pair on the queue display-order vocabulary).
 */
export function ReadyQueueTable({
  hits,
  isLoading,
  isError,
  isFetching,
  onRetry,
  isFiltered = false,
  search,
  filter,
}: ReadyQueueTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    sort: columnSort,
    dir: sortDir,
    setSort,
  } = useUrlColumnSort<ReadyGridColumnKey>({
    isColumn: isReadyGridSortable,
    defaultDir: defaultDirForReadyGridSort,
  });

  // One-shot settle re-render after first data — the virtualized LedgerGrid
  // mounts its scroll element in the same commit the data arrives, and with no
  // async label/selection churn in this subtree its internal re-measure can
  // miss on first paint, leaving the body blank until the first interaction.
  const [, settleTick] = useState(0);
  const hasRows = hits.length > 0;
  useEffect(() => {
    if (isLoading || !hasRows) return;
    const raf = requestAnimationFrame(() => settleTick((t) => t + 1));
    return () => cancelAnimationFrame(raf);
  }, [isLoading, hasRows]);

  const orderGroupsByDate = useMemo<[string, RowGroup<AllocationHit>[]][]>(() => {
    const ordered =
      columnSort && sortDir
        ? [...hits].sort((a, b) => compareReadyRows(a, b, columnSort, sortDir))
        : hits;
    // One unnamed band — tested history has no fold axis. Safe when empty:
    // `LedgerGrid` decides emptiness from ROW count (`hasGridRows`).
    return [['', ordered.map((hit) => ({ key: `hit:${hit.testingResultId}`, rows: [hit] }))]];
  }, [hits, columnSort, sortDir]);

  // Degrade-not-fail: this list is the pane's PRIMARY resource, so a failed
  // fetch earns the retryable error state — never an empty grid, which would
  // read as "nothing tested" and is the lie the settled-state split prevents.
  if (isError) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <div className="inset-empty rounded-xl border border-dashed border-border-danger bg-surface-danger text-center">
          <p className="text-role-caption font-semibold text-text-danger">
            Could not load recently-tested history
          </p>
          <Button variant="secondary" size="sm" icon={<RefreshCw />} onClick={onRetry} className="mt-3">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const renderLeaf = (hit: AllocationHit, visible: readonly ReadyGridColumn[]) => (
    <ReadyGridRow key={hit.testingResultId} hit={hit} columns={visible} />
  );

  return (
    <div className="flex min-h-[240px] min-w-0 flex-col" aria-busy={isFetching}>
      <DataTable<AllocationHit, ReadyGridColumnKey, ReadyGridColumn>
        binding={READY_TABLE_BINDING}
        orderGroupsByDate={orderGroupsByDate}
        rows={hits}
        getRowId={(r) => String(r.testingResultId)}
        sort={columnSort}
        dir={sortDir}
        onSortChange={setSort}
        loading={isLoading}
        emptyMessage="No tested units yet — completed verdicts appear here newest first."
        searchEmptyMessage="No tested units match this view. Clear the search or choose All tested."
        search={search}
        filter={filter}
        scrollRef={scrollRef}
        renderGroup={(group, _stripe, { columns: visible }) => (
          <>{group.rows.map((hit) => renderLeaf(hit, visible))}</>
        )}
        renderRow={(row, _stripe, { columns: visible }) => renderLeaf(row, visible)}
      />
    </div>
  );
}
