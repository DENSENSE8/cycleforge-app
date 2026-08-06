'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { LedgerGridSurface } from '@/design-system/components/grid';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import type { RowGroup } from '@/lib/group-rows';
import type { TechAllTriageRow } from '@/lib/tech/tech-all-triage';
import {
  TECH_ALL_GRID_COLUMNS,
  TECH_ALL_TABLE_ID,
  defaultDirForTechAllGridSort,
  isTechAllGridSortable,
  type TechAllGridColumn,
  type TechAllGridColumnKey,
} from '@/lib/tech/tech-all-grid-layout';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import { makeTechAllGridDescriptor } from './tech-all-grid-descriptor';
import { TechAllGridColumnHeader } from './TechAllGridColumnHeader';
import { TechAllGridRow } from './TechAllGridRow';

interface TechAllGridViewProps {
  rows: TechAllTriageRow[];
  loading: boolean;
  emptyMessage: string;
  searchEmptyMessage?: string;
  isSearching?: boolean;
  onOpen: (row: TechAllTriageRow) => void;
  columns?: readonly TechAllGridColumn[];
  /**
   * Band-3 triage controls slot — when set, the column-display (▦) trigger
   * portals there beside the surface's other refine icons instead of floating on
   * the card corner (Unbox History parity). Testing / Shipping "All" tabs pass
   * their triage-band controls slot.
   */
  columnTriggerPortalTarget?: HTMLElement | null;
}

function compareTechAllRows(
  a: TechAllTriageRow,
  b: TechAllTriageRow,
  key: TechAllGridColumnKey,
  dir: GridSortDir,
): number {
  const sign = dir === 'asc' ? 1 : -1;
  switch (key) {
    case 'identity':
      return sign * a.title.localeCompare(b.title);
    case 'type':
      return sign * a.typeLabel.localeCompare(b.typeLabel);
    case 'stage':
      return sign * a.stage.localeCompare(b.stage);
    case 'urgency':
      return sign * (a.urgencyRank - b.urgencyRank);
    default:
      return 0;
  }
}

/**
 * Tech All spreadsheet — typed cross-queue triage map on LedgerGridSurface
 * (`surface="sheet"`). Default order is urgency from the merge adapter; a
 * column header sort replaces it (URL-durable via `?colsort=` / `?coldir=`).
 */
export function TechAllGridView({
  rows,
  loading,
  emptyMessage,
  searchEmptyMessage,
  isSearching,
  onOpen,
  columns = TECH_ALL_GRID_COLUMNS,
  columnTriggerPortalTarget,
}: TechAllGridViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    sort: columnSort,
    dir: sortDir,
    setSort,
  } = useUrlColumnSort<TechAllGridColumnKey>({
    isColumn: isTechAllGridSortable,
    defaultDir: defaultDirForTechAllGridSort,
  });

  const [, settleTick] = useState(0);
  const hasRows = rows.length > 0;
  useEffect(() => {
    if (loading || !hasRows) return;
    const raf = requestAnimationFrame(() => settleTick((t) => t + 1));
    return () => cancelAnimationFrame(raf);
  }, [loading, hasRows]);

  const orderGroupsByDate = useMemo(() => {
    const ordered =
      columnSort && sortDir
        ? [...rows].sort((a, b) => compareTechAllRows(a, b, columnSort, sortDir))
        : rows;
    const groups: RowGroup<TechAllTriageRow>[] = ordered.map((row) => ({
      key: row.id,
      rows: [row],
    }));
    return [['', groups]] as [string, RowGroup<TechAllTriageRow>[]][];
  }, [rows, columnSort, sortDir]);

  return (
    <LedgerGridSurface<TechAllTriageRow, TechAllGridColumnKey, TechAllGridColumn>
      ariaLabel="Tech All triage"
      columns={columns}
      makeDescriptor={makeTechAllGridDescriptor}
      orderGroupsByDate={orderGroupsByDate}
      rows={rows}
      getRowId={(r) => r.id}
      sort={columnSort}
      dir={sortDir}
      onSortChange={setSort}
      loading={loading}
      emptyMessage={emptyMessage}
      emptyState={
        <div className="flex min-h-[240px] flex-col items-center justify-center gap-1 px-4 py-10 text-center">
          <p className="text-role-body font-medium text-text-default">{emptyMessage}</p>
          <p className="text-role-caption text-text-soft">
            All — prioritize across types. Queues are clear for this scope.
          </p>
        </div>
      }
      searchEmptyMessage={searchEmptyMessage}
      isSearching={isSearching}
      scrollRef={scrollRef}
      testId="tech-all-grid-body"
      tableId={TECH_ALL_TABLE_ID}
      surface="sheet"
      columnTriggerPortalTarget={columnTriggerPortalTarget ?? null}
      renderColumnHeader={({ toggleColumnSort, onResizeColumn, onResetColumn, columns: visible }) => (
        <TechAllGridColumnHeader
          columns={visible}
          activeSort={columnSort}
          sortDir={sortDir}
          onSortColumn={toggleColumnSort}
          onResizeColumn={onResizeColumn}
          onResetColumn={onResetColumn}
        />
      )}
      renderGroup={(group, _stripe, { columns: visible }) => (
        <TechAllGridRow key={group.rows[0].id} row={group.rows[0]} onOpen={onOpen} columns={visible} />
      )}
      renderRow={(row, _stripe, { columns: visible }) => (
        <TechAllGridRow row={row} onOpen={onOpen} columns={visible} />
      )}
    />
  );
}
