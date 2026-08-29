'use client';

/**
 * Unfound queue — the data host that mounts the Workbench spreadsheet SoT
 * (`NonlinearTableHost` + the unfound table definition) directly. Flat queue:
 * no fold, no day band. In-cell edit is on (`LedgerCellEditor` for ticket +
 * notes); selection highlights the open detail-plane row.
 *
 * Toolbar (filter pills, search, Refresh) lives in the sidebar via
 * UnfoundQueueSidebarToolbar. Filter state is URL-backed (`uf_kind` / `uf_q`)
 * so both share one source of truth. Data + mutations live in
 * {@link useUnfoundQueueTable}; in-cell edit PATCHes through `LedgerCellEditor`
 * inside the grid row. Column sort is DURABLE on `?colsort=`/`?coldir=`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence } from '@/design-system/motion';
import { DataTable } from '@/components/tables/DataTable';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import type { RowGroup } from '@/lib/group-rows';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import { UnfoundQueueDetailsPanel } from './UnfoundQueueDetailsPanel';
import { useUnfoundQueueTable } from './queue-table/useUnfoundQueueTable';
import type { QueueRow } from './queue-table/unfound-queue-shared';
import { UNFOUND_TABLE_BINDING } from './grid/unfound-table-definition';
import { UnfoundGridRow, unfoundRowKey, unfoundRowTitle } from './grid/UnfoundGridRow';
import {
  defaultDirForUnfoundGridSort,
  isUnfoundGridSortable,
  type UnfoundGridColumn,
  type UnfoundGridColumnKey,
} from './grid/unfound-grid-layout';

export {
  ENABLED_KINDS,
  KIND_LABELS,
  type QueueKind,
} from './queue-table/unfound-queue-shared';

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

export function UnfoundQueueTable() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const {
    rows,
    loading,
    error,
    pushing,
    savedKeys,
    openRow,
    setOpenRow,
    patchRow,
    pushToZendesk,
    openSource,
    handleDeleted,
    handlePushedToZendesk,
  } = useUnfoundQueueTable();

  // ▦ portals into Band-1 controls (find / kind pills live in the admin sidebar).
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
    return [['', ordered.map((row) => ({ key: `unfound:${unfoundRowKey(row)}`, rows: [row] }))]];
  }, [rows, columnSort, sortDir]);

  // A filter is narrowing the list when search or a non-default kind tab is on —
  // that is what picks "no matches" over "nothing in the queue".
  const setUnfoundSearch = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const trimmed = next.trim();
      if (trimmed) params.set('uf_q', trimmed);
      else params.delete('uf_q');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const kind = searchParams.get('uf_kind');
  const search = (searchParams.get('uf_q') ?? '').trim();

  const renderLeaf = (row: QueueRow, visible: readonly UnfoundGridColumn[]) => {
    const key = unfoundRowKey(row);
    return (
      <UnfoundGridRow
        key={key}
        row={row}
        isSelected={key === openKey}
        onOpen={openSource}
        onPatch={patchRow}
        onPush={pushToZendesk}
        pushing={pushing === key}
        justSaved={savedKeys.has(key)}
        columns={visible}
      />
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-canvas">
      {/* Loading rail under chrome — replaces the toolbar's spinner now that
          the toolbar lives in the sidebar. */}
      {loading && (
        <div className="h-0.5 w-full bg-surface-sunken">
          <div className="recv-indet-bar h-full w-1/3 rounded-full bg-blue-500" />
        </div>
      )}

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {error && (
          <div className="mx-4 mt-4 rounded-md border border-red-200 bg-red-50 inset-field text-role-caption text-red-700">
            {error}
          </div>
        )}

        <DataTable<QueueRow, UnfoundGridColumnKey, UnfoundGridColumn>
          binding={UNFOUND_TABLE_BINDING}
          orderGroupsByDate={orderGroupsByDate}
          rows={rows}
          getRowId={(r) => unfoundRowKey(r)}
          sort={columnSort}
          dir={sortDir}
          onSortChange={setSort}
          loading={loading}
          emptyMessage={error ? '—' : 'Nothing in the unfound queue. Nice.'}
          searchEmptyMessage="No unfound items match these filters."
          search={{ value: search, onChange: setUnfoundSearch, placeholder: 'Filter queue…' }}
          scrollRef={scrollRef}
          renderGroup={(group, _stripe, { columns: visible }) => (
            <>{group.rows.map((row) => renderLeaf(row, visible))}</>
          )}
          renderRow={(row, _stripe, { columns: visible }) => renderLeaf(row, visible)}
        />
      </div>

      {/* Slide-in details panel (one mount at a time, AnimatePresence for the
          slide-out transition). Lives at the table root so the backdrop sits
          above the grid content but below any toaster. */}
      <AnimatePresence>
        {openRow && (
          <UnfoundQueueDetailsPanel
            key={`${openRow.kind}:${openRow.source_id}`}
            row={openRow}
            onClose={() => setOpenRow(null)}
            onDeleted={handleDeleted}
            onPushedToZendesk={handlePushedToZendesk}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
