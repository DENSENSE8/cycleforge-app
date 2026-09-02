'use client';

/**
 * Unfound queue — the data host that mounts the one table display
 * (`DataTable` + the unfound table definition). Flat queue: no fold, no day
 * band. Every cell is READ-ONLY (`inCellEdit: false`): ticket id and the two
 * team notes are corrected on the record plane, and selection highlights the
 * open detail-plane row.
 *
 * Toolbar (filter pills, search, Refresh) lives in the sidebar via
 * UnfoundQueueSidebarToolbar. Kind is URL-backed while search is supplied as
 * local state by the host. Data + mutations live in
 * {@link useUnfoundQueueTable}. Column sort is DURABLE on `?colsort=`/`?coldir=`.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from '@/design-system/motion';
import { DataTable } from '@/components/tables/DataTable';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import type { RowGroup } from '@/lib/group-rows';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import { UnfoundQueueDetailsPanel } from './UnfoundQueueDetailsPanel';
import { useUnfoundQueueTable } from './queue-table/useUnfoundQueueTable';
import type { QueueRow } from './queue-table/unfound-queue-shared';
import { UNFOUND_TABLE_BINDING } from './grid/unfound-table-definition';
import { useUnfoundTableLayout } from './grid/useUnfoundTableLayout';
import { UnfoundGridRow, unfoundRowKey, unfoundRowTitle } from './grid/UnfoundGridRow';
import {
  defaultDirForUnfoundColumn,
  isUnfoundColumnSortable,
  unfoundSheetColumnsFor,
  unfoundSortFactFor,
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
  fact: string,
  dir: GridSortDir,
): number {
  const sign = dir === 'asc' ? 1 : -1;
  switch (fact) {
    case 'title':
      return sign * unfoundRowTitle(a).localeCompare(unfoundRowTitle(b));
    case 'unfound.ticket':
      return sign * (a.zendesk_ticket_id || '').localeCompare(b.zendesk_ticket_id || '');
    case 'unfound.usa_note':
      return sign * (a.usa_team_note || '').localeCompare(b.usa_team_note || '');
    case 'unfound.vietnam_note':
      return sign * (a.vietnam_team_note || '').localeCompare(b.vietnam_team_note || '');
    case 'unfound.checked':
      return sign * (Number(a.checked) - Number(b.checked));
    case 'unfound.created':
      return sign * (a.created_at || '').localeCompare(b.created_at || '');
    case 'unfound.item':
      return sign * a.source_id.localeCompare(b.source_id);
    default:
      return 0;
  }
}

interface UnfoundQueueTableProps {
  searchValue?: string;
  onSearchChange?: (next: string) => void;
}

export function UnfoundQueueTable({
  searchValue,
  onSearchChange,
}: UnfoundQueueTableProps = {}) {
  const [localSearch, setLocalSearch] = useState('');
  const search = searchValue ?? localSearch;
  const setSearch = onSearchChange ?? setLocalSearch;
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
  } = useUnfoundQueueTable(search);

  // ▦ portals into Band-1 controls (find / kind pills live in the admin sidebar).
  const scrollRef = useRef<HTMLDivElement>(null);

  // The COLUMNS are the effective slot layout's materialization (staff ?? org
  // ?? product — wave 1.4 hand-model kill). Sort keys are the mounted track
  // keys; each resolves to its bound field's fact through `unfoundSortFactFor`.
  const { effectiveLayout: unfoundLayout, fields: unfoundFields } = useUnfoundTableLayout();
  const columns = useMemo(() => unfoundSheetColumnsFor(unfoundLayout), [unfoundLayout]);
  const sortFactByKey = useMemo(
    () => new Map(columns.map((c) => [c.key as string, unfoundSortFactFor(c)])),
    [columns],
  );

  const {
    sort: columnSort,
    dir: sortDir,
    setSort,
  } = useUrlColumnSort<UnfoundGridColumnKey>({
    isColumn: (raw) => isUnfoundColumnSortable(columns, raw),
    defaultDir: (key) => defaultDirForUnfoundColumn(columns, key),
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
    const sortFact = columnSort ? (sortFactByKey.get(columnSort) ?? null) : null;
    const ordered =
      sortFact && sortDir
        ? [...rows].sort((a, b) => compareUnfoundRows(a, b, sortFact, sortDir))
        : rows;
    return [['', ordered.map((row) => ({ key: `unfound:${unfoundRowKey(row)}`, rows: [row] }))]];
  }, [rows, columnSort, sortFactByKey, sortDir]);

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
          columns={columns}
          fields={unfoundFields}
          orderGroupsByDate={orderGroupsByDate}
          rows={rows}
          getRowId={(r) => unfoundRowKey(r)}
          sort={columnSort}
          dir={sortDir}
          onSortChange={setSort}
          loading={loading}
          emptyMessage={error ? '—' : 'Nothing in the unfound queue. Nice.'}
          searchEmptyMessage="No unfound items match these filters."
          search={{ value: search, onChange: setSearch, placeholder: 'Filter queue…' }}
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
