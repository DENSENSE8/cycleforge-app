'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { LedgerGridSurface } from '@/design-system/components/grid';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import type { RowGroup } from '@/lib/group-rows';
import type { PatchBody, QueueRow } from '../queue-table/unfound-queue-shared';
import { makeUnfoundGridDescriptor } from './unfound-grid-descriptor';
import { UnfoundGridColumnHeader } from './UnfoundGridColumnHeader';
import { UnfoundGridRow, unfoundRowKey, unfoundRowTitle } from './UnfoundGridRow';
import {
  UNFOUND_GRID_COLUMNS,
  defaultDirForUnfoundGridSort,
  isUnfoundGridSortable,
  type UnfoundGridColumn,
  type UnfoundGridColumnKey,
} from './unfound-grid-layout';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

/** Staff-prefs identity — one Unfound spreadsheet, one Fields selection. */
const UNFOUND_TABLE_ID = 'unfound' as const;

interface UnfoundGridViewProps {
  rows: QueueRow[];
  loading: boolean;
  emptyMessage: string;
  searchEmptyMessage?: string;
  isSearching?: boolean;
  openRow: QueueRow | null;
  onOpen: (row: QueueRow) => void;
  onPatch: (row: QueueRow, patch: PatchBody) => Promise<void>;
  onPush: (row: QueueRow) => Promise<void>;
  pushingKey: string | null;
  savedKeys: Set<string>;
  /** FULL canonical column list — `LedgerGridSurface` resolves visibility. */
  columns?: readonly UnfoundGridColumn[];
}

function compareUnfoundRows(
  a: QueueRow,
  b: QueueRow,
  key: UnfoundGridColumnKey,
  dir: GridSortDir,
): number {
  const sign = dir === 'asc' ? 1 : -1;
  switch (key) {
    case 'title':
      return sign * unfoundRowTitle(a).localeCompare(unfoundRowTitle(b));
    case 'ticket':
      return sign * (a.zendesk_ticket_id || '').localeCompare(b.zendesk_ticket_id || '');
    case 'usaNote':
      return sign * (a.usa_team_note || '').localeCompare(b.usa_team_note || '');
    case 'vietnamNote':
      return sign * (a.vietnam_team_note || '').localeCompare(b.vietnam_team_note || '');
    case 'checked':
      return sign * (Number(a.checked) - Number(b.checked));
    default:
      return 0;
  }
}

/**
 * Unfound triage spreadsheet — receiving-native adapter over
 * {@link LedgerGridSurface}. Flat queue: no fold, no day band. In-cell edit is
 * on (`LedgerCellEditor` for ticket + notes); selection highlights the open
 * detail-plane row.
 */
export function UnfoundGridView({
  rows,
  loading,
  emptyMessage,
  searchEmptyMessage,
  isSearching,
  openRow,
  onOpen,
  onPatch,
  onPush,
  pushingKey,
  savedKeys,
  columns = UNFOUND_GRID_COLUMNS,
}: UnfoundGridViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    sort: columnSort,
    dir: sortDir,
    setSort,
  } = useUrlColumnSort<UnfoundGridColumnKey>({
    isColumn: isUnfoundGridSortable,
    defaultDir: defaultDirForUnfoundGridSort,
  });

  const [, settleTick] = useState(0);
  const hasRows = rows.length > 0;
  useEffect(() => {
    if (loading || !hasRows) return;
    const raf = requestAnimationFrame(() => settleTick((t) => t + 1));
    return () => cancelAnimationFrame(raf);
  }, [loading, hasRows]);

  const openKey = openRow ? unfoundRowKey(openRow) : null;

  const orderGroupsByDate = useMemo<[string, RowGroup<QueueRow>[]][]>(() => {
    const ordered =
      columnSort && sortDir
        ? [...rows].sort((a, b) => compareUnfoundRows(a, b, columnSort, sortDir))
        : rows;
    return [
      [
        '',
        ordered.map((row) => ({
          key: `unfound:${unfoundRowKey(row)}`,
          rows: [row],
        })),
      ],
    ];
  }, [rows, columnSort, sortDir]);

  const renderLeaf = (row: QueueRow, visible: readonly UnfoundGridColumn[]) => {
    const key = unfoundRowKey(row);
    return (
      <UnfoundGridRow
        key={key}
        row={row}
        isSelected={key === openKey}
        onOpen={onOpen}
        onPatch={onPatch}
        onPush={onPush}
        pushing={pushingKey === key}
        justSaved={savedKeys.has(key)}
        columns={visible}
      />
    );
  };

  return (
    <LedgerGridSurface<QueueRow, UnfoundGridColumnKey, UnfoundGridColumn>
      ariaLabel="Unfound queue"
      columns={columns}
      makeDescriptor={makeUnfoundGridDescriptor}
      orderGroupsByDate={orderGroupsByDate}
      rows={rows}
      getRowId={(r) => unfoundRowKey(r)}
      sort={columnSort}
      dir={sortDir}
      onSortChange={setSort}
      loading={loading}
      emptyMessage={emptyMessage}
      searchEmptyMessage={searchEmptyMessage}
      isSearching={isSearching}
      scrollRef={scrollRef}
      testId="unfound-grid-body"
      tableId={UNFOUND_TABLE_ID}
      renderColumnHeader={({ toggleColumnSort, onResizeColumn, onResetColumn, columns: visible }) => (
        <UnfoundGridColumnHeader
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
