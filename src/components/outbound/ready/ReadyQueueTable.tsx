'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import {
  DataTable,
  type DataTableFilterOption,
} from '@/components/tables/DataTable';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import type { RowGroup } from '@/lib/group-rows';
import type { AllocationHit } from '@/lib/channel-allocation';
import { READY_TABLE_BINDING } from '@/components/outbound/ready/grid/ready-table-definition';
import { ReadyGridRow } from '@/components/outbound/ready/grid/ReadyGridRow';
import {
  defaultDirForReadyColumn,
  isReadyColumnSortable,
  readySheetColumnsFor,
  readySortFactFor,
  type ReadyGridColumn,
  type ReadyGridColumnKey,
} from '@/components/outbound/ready/grid/ready-grid-layout';
import { useReadyTableLayout } from '@/components/outbound/ready/grid/useReadyTableLayout';
import {
  readyDestinationLabel,
  readyHitTitle,
  readyVerdictLabel,
} from '@/lib/tables/field-catalog/ready-resolve';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

interface ReadyQueueTableProps {
  hits: AllocationHit[];
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  /** True while a search or a non-`all` tab is narrowing the hits. */
  isFiltered?: boolean;
  /** The ONE filter control, as data (the FBA desk threads its mode options). */
  filter?: {
    options: readonly DataTableFilterOption[];
    onToggle: (id: string) => void;
    onClearAll: () => void;
  };
}

/** Row order for a column sort, keyed by SORT FACT — the structural `title` plus catalog field ids (`readySortFactFor` maps a mounted… */
function compareReadyRows(
  a: AllocationHit,
  b: AllocationHit,
  fact: string,
  dir: GridSortDir,
): number {
  const sign = dir === 'asc' ? 1 : -1;
  switch (fact) {
    case 'title':
      return sign * readyHitTitle(a).localeCompare(readyHitTitle(b));
    case 'ready.unit':
      return sign * (a.sku || '').localeCompare(b.sku || '');
    case 'ready.verdict':
      return sign * readyVerdictLabel(a.verdict).localeCompare(readyVerdictLabel(b.verdict));
    case 'ready.destination':
      return sign * readyDestinationLabel(a).localeCompare(readyDestinationLabel(b));
    case 'ready.velocity':
      return sign * (a.velocityTier || '').localeCompare(b.velocityTier || '');
    case 'ready.condition':
      return sign * (a.conditionGrade || '').localeCompare(b.conditionGrade || '');
    case 'ready.tested':
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

/** Recently-tested history map — the data host that mounts the Workbench spreadsheet SoT (`NonlinearTableHost` + the Ready table… */
export function ReadyQueueTable({
  hits,
  isLoading,
  isError,
  isFetching,
  onRetry,
  isFiltered = false,
  filter,
}: ReadyQueueTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // The COLUMNS are the effective slot layout's materialization (staff ??
  const { effectiveLayout, fields } = useReadyTableLayout();
  const columns = useMemo(() => readySheetColumnsFor(effectiveLayout), [effectiveLayout]);
  const sortFactByKey = useMemo(
    () => new Map(columns.map((c) => [c.key as string, readySortFactFor(c)])),
    [columns],
  );

  const {
    sort: columnSort,
    dir: sortDir,
    setSort,
  } = useUrlColumnSort<ReadyGridColumnKey>({
    isColumn: (raw) => isReadyColumnSortable(columns, raw),
    defaultDir: (key) => defaultDirForReadyColumn(columns, key),
  });

  // One-shot settle re-render after first data — the virtualized LedgerGrid mounts its scroll element in the same commit the data arrives,…
  const [, settleTick] = useState(0);
  const hasRows = hits.length > 0;
  useEffect(() => {
    if (isLoading || !hasRows) return;
    const raf = requestAnimationFrame(() => settleTick((t) => t + 1));
    return () => cancelAnimationFrame(raf);
  }, [isLoading, hasRows]);

  const orderGroupsByDate = useMemo<[string, RowGroup<AllocationHit>[]][]>(() => {
    const sortFact = columnSort ? (sortFactByKey.get(columnSort) ?? null) : null;
    const ordered =
      sortFact && sortDir
        ? [...hits].sort((a, b) => compareReadyRows(a, b, sortFact, sortDir))
        : hits;
    // One unnamed band — tested history has no fold axis. Safe when empty:
    // `LedgerGrid` decides emptiness from ROW count (`hasGridRows`).
    return [['', ordered.map((hit) => ({ key: `hit:${hit.testingResultId}`, rows: [hit] }))]];
  }, [hits, columnSort, sortFactByKey, sortDir]);

  // Degrade-not-fail: this list is the pane's PRIMARY resource, so a failed
  // fetch earns the retryable error state — never an empty grid, which would
  // read as "nothing tested" and is the lie the settled-state split prevents.
  if (isError) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <div className={cn('inset-empty border border-dashed border-border-danger bg-surface-danger text-center', cornerClass('card'))}>
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
        columns={columns}
        fields={fields}
        orderGroupsByDate={orderGroupsByDate}
        rows={hits}
        getRowId={(r) => String(r.testingResultId)}
        sort={columnSort}
        dir={sortDir}
        onSortChange={setSort}
        loading={isLoading}
        emptyMessage={
          isFiltered
            ? 'No tested units match this view. Clear the search or choose All tested.'
            : 'No tested units yet — completed verdicts appear here newest first.'
        }
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
