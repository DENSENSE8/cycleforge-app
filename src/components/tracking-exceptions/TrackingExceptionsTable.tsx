'use client';

import { useState } from 'react';
import { Button } from '@/design-system/primitives';
import { TrackingExceptionEditDialog } from './TrackingExceptionEditDialog';
import { TrackingExceptionsGridView } from './grid/TrackingExceptionsGridView';
import type { TrackingExceptionRow, TrackingExceptionStatusFilter } from './types';
import { useTrackingExceptions } from './useTrackingExceptions';

const STATUS_TABS: Array<{ id: TrackingExceptionStatusFilter; label: string }> = [
  { id: 'open', label: 'Open' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'discarded', label: 'Discarded' },
  { id: 'all', label: 'All' },
];

/**
 * Thin data host over the Tracking Exceptions Workbench spreadsheet
 * ({@link TrackingExceptionsGridView} → `LedgerGridSurface`).
 *
 * Status tabs · search · reload · edit dialog stay here; the grid is the
 * display map only. A failed fetch earns the retryable error state rather than
 * an empty grid that would read as "no exceptions"
 * (`display/workbench.md` settled states).
 */
export function TrackingExceptionsTable() {
  const [statusTab, setStatusTab] = useState<TrackingExceptionStatusFilter>('open');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<TrackingExceptionRow | null>(null);

  const {
    rows,
    total,
    loading,
    error,
    refreshingIds,
    fetchRows,
    refreshRow,
    saveRow,
    deleteRow,
  } = useTrackingExceptions(statusTab, search);

  if (error && rows.length === 0 && !loading) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <FilterBar
          statusTab={statusTab}
          setStatusTab={setStatusTab}
          search={search}
          setSearch={setSearch}
          loading={loading}
          total={total}
          onReload={() => void fetchRows()}
        />
        <div className="flex flex-1 items-center justify-center bg-surface-canvas p-8">
          <div className="rounded-xl border border-dashed border-border-danger bg-surface-danger px-4 py-6 text-center">
            <p className="text-sm font-semibold text-text-danger">{error}</p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="mt-3"
              onClick={() => void fetchRows()}
            >
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Search is the only refinement that changes the empty answer — status tabs
  // still mean "nothing in this view", not "clear your search".
  const isSearching = Boolean(search.trim());

  return (
    <div className="flex h-full min-h-0 flex-col">
      <FilterBar
        statusTab={statusTab}
        setStatusTab={setStatusTab}
        search={search}
        setSearch={setSearch}
        loading={loading}
        total={total}
        onReload={() => void fetchRows()}
      />

      {error ? (
        <div className="border-b border-red-200 bg-red-50 px-6 py-2 text-role-caption font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col bg-surface-canvas p-4">
        <TrackingExceptionsGridView
          rows={rows}
          loading={loading}
          editingId={editing?.id ?? null}
          refreshingIds={refreshingIds}
          onOpenEdit={setEditing}
          onRefresh={(row) => void refreshRow(row)}
          emptyMessage="No exceptions in this view."
          searchEmptyMessage="No exceptions match this search."
          isSearching={isSearching}
        />
      </div>

      {editing ? (
        <TrackingExceptionEditDialog
          row={editing}
          onClose={() => setEditing(null)}
          onSave={async (row, patch) => {
            await saveRow(row, patch);
            setEditing(null);
          }}
          onDelete={async (row) => {
            await deleteRow(row);
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function FilterBar({
  statusTab,
  setStatusTab,
  search,
  setSearch,
  loading,
  total,
  onReload,
}: {
  statusTab: TrackingExceptionStatusFilter;
  setStatusTab: (tab: TrackingExceptionStatusFilter) => void;
  search: string;
  setSearch: (value: string) => void;
  loading: boolean;
  total: number;
  onReload: () => void;
}) {
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-border-soft bg-surface-card px-6 py-3">
      <div className="flex items-center gap-1">
        {STATUS_TABS.map((tab) => (
          <Button
            key={tab.id}
            type="button"
            size="sm"
            variant={statusTab === tab.id ? 'brand' : 'secondary'}
            onClick={() => setStatusTab(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search tracking…"
        className="ml-auto w-64 rounded-md border border-border-soft bg-surface-card px-3 py-1.5 text-role-caption font-semibold text-text-default placeholder:text-text-faint focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500/10"
      />
      <Button
        type="button"
        size="sm"
        variant="brand"
        onClick={onReload}
        disabled={loading}
        aria-label="Reload list"
      >
        {loading ? 'Loading…' : 'Reload'}
      </Button>
      <span className="text-role-micro uppercase tracking-widest text-text-soft">
        {total} rows
      </span>
    </div>
  );
}
