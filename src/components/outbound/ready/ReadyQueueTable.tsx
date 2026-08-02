'use client';

import { RefreshCw } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { ReadyGridView } from '@/components/outbound/ready/grid/ReadyGridView';
import type { AllocationHit } from '@/lib/channel-allocation';

interface ReadyQueueTableProps {
  hits: AllocationHit[];
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  /** True while a search or a non-`all` tab is narrowing the hits. */
  isFiltered?: boolean;
}

/**
 * Recently-tested history map — the thin host over the Workbench spreadsheet SoT
 * ({@link ReadyGridView} → `LedgerGridSurface`).
 *
 * The hand-rolled `<table>` this replaced had its own sticky header, its own
 * per-cell padding, no column config, and no durable sort; its loading state
 * swapped the whole table for a centred spinner, so the page reflowed when the
 * rows landed. The grid keeps its geometry across all four settled states.
 */
export function ReadyQueueTable({
  hits,
  isLoading,
  isError,
  isFetching,
  onRetry,
  isFiltered = false,
}: ReadyQueueTableProps) {
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

  return (
    <div className="flex min-h-[240px] min-w-0 flex-col" aria-busy={isFetching}>
      <ReadyGridView
        rows={hits}
        loading={isLoading}
        emptyMessage="No tested units yet — completed verdicts appear here newest first."
        searchEmptyMessage="No tested units match this view. Clear the search or choose All tested."
        isSearching={isFiltered}
      />
    </div>
  );
}
