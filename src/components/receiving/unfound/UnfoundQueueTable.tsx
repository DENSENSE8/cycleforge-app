'use client';

/**
 * Unfound queue — thin data host over the Workbench spreadsheet SoT
 * ({@link UnfoundGridView} → `LedgerGridSurface`).
 *
 * Toolbar (filter pills, search, Refresh) lives in the sidebar via
 * UnfoundQueueSidebarToolbar. Filter state is URL-backed (`uf_kind` / `uf_q`)
 * so both share one source of truth. Data + mutations live in
 * {@link useUnfoundQueueTable}; in-cell edit PATCHes through `LedgerCellEditor`
 * inside the grid row.
 */

import { useSearchParams } from 'next/navigation';
import { AnimatePresence } from '@/design-system/motion';
import { UnfoundQueueDetailsPanel } from './UnfoundQueueDetailsPanel';
import { UnfoundGridView } from './grid/UnfoundGridView';
import { useUnfoundQueueTable } from './queue-table/useUnfoundQueueTable';

export {
  ENABLED_KINDS,
  KIND_LABELS,
  type QueueKind,
} from './queue-table/unfound-queue-shared';

export function UnfoundQueueTable() {
  const searchParams = useSearchParams();
  const {
    rows, loading, error, pushing, savedKeys,
    openRow, setOpenRow,
    patchRow, pushToZendesk, openSource, handleDeleted, handlePushedToZendesk,
  } = useUnfoundQueueTable();

  // A filter is narrowing the list when search or a non-default kind tab is on —
  // that is what picks "no matches" over "nothing in the queue".
  const kind = searchParams.get('uf_kind');
  const search = (searchParams.get('uf_q') ?? '').trim();
  const isSearching = Boolean(search) || (Boolean(kind) && kind !== 'all');

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-canvas">
      {/* Loading rail at the top — replaces the toolbar's spinner now that
          the toolbar lives in the sidebar. */}
      {loading && (
        <div className="h-0.5 w-full bg-surface-sunken">
          <div className="recv-indet-bar h-full w-1/3 rounded-full bg-blue-500" />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        {error && (
          <div className="mx-4 mt-4 rounded-md border border-red-200 bg-red-50 inset-field text-role-caption text-red-700">
            {error}
          </div>
        )}

        <UnfoundGridView
          rows={rows}
          loading={loading}
          openRow={openRow}
          onOpen={openSource}
          onPatch={patchRow}
          onPush={pushToZendesk}
          pushingKey={pushing}
          savedKeys={savedKeys}
          emptyMessage={error ? '—' : 'Nothing in the unfound queue. Nice.'}
          searchEmptyMessage="No unfound items match these filters."
          isSearching={isSearching && !error}
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
