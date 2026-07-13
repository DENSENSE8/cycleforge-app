'use client';

import { OrderSearchEmptyState } from '@/components/dashboard/OrderSearchEmptyState';
import { Button } from '@/design-system/primitives';

/** The subset of the search meta this empty state reads. */
export interface ShippedSearchMeta {
  outOfScope?: boolean;
  outOfScopeSuggestion?: { filter: string; count: number } | null;
}

export interface ShippedTableEmptyStateProps {
  /** Raw search string — when present, render the search empty state. */
  search: string;
  searchEmptyTitle: string;
  searchResultLabel: string;
  clearSearchLabel: string;
  onClearSearch: () => void;
  searchMeta: ShippedSearchMeta | null;
  /** Switch to the suggested type filter when the match is out of scope. */
  onApplySuggestedFilter: (filter: string) => void;
  /**
   * When set (Packed tab, no search), teach next action instead of a blank week message.
   * e.g. CTA to open Scan-out for staging work.
   */
  idleEmpty?: { title: string; body: string; actionLabel?: string; onAction?: () => void } | null;
}

/**
 * Centered empty state for the shipped table. With an active search it shows
 * the {@link OrderSearchEmptyState} plus an optional "found N in the X tab —
 * switch?" affordance; otherwise the plain no-records-this-week message.
 */
export function ShippedTableEmptyState({
  search,
  searchEmptyTitle,
  searchResultLabel,
  clearSearchLabel,
  onClearSearch,
  searchMeta,
  onApplySuggestedFilter,
  idleEmpty = null,
}: ShippedTableEmptyStateProps) {
  const suggestion = searchMeta?.outOfScope ? searchMeta.outOfScopeSuggestion : null;

  return (
    <div className="flex flex-col items-center justify-center py-40 text-center">
      {search ? (
        <>
          <OrderSearchEmptyState
            query={search}
            title={searchEmptyTitle}
            resultLabel={searchResultLabel}
            clearLabel={clearSearchLabel}
            onClear={onClearSearch}
          />
          {suggestion ? (
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={() => onApplySuggestedFilter(suggestion.filter)}
              className="mt-4 h-auto whitespace-normal border border-border-warning bg-surface-warning px-3 py-2 text-text-warning hover:bg-surface-warning/80"
            >
              Found {suggestion.count} match{suggestion.count === 1 ? '' : 'es'} in the <span className="uppercase">{suggestion.filter}</span> tab — switch?
            </Button>
          ) : null}
        </>
      ) : idleEmpty ? (
        <div className="mx-auto max-w-sm rounded-xl border border-dashed border-border-soft bg-surface-canvas px-5 py-7 text-center">
          <p className="text-role-caption font-bold text-text-default">{idleEmpty.title}</p>
          <p className="mt-1.5 text-role-caption text-text-muted">{idleEmpty.body}</p>
          {idleEmpty.actionLabel && idleEmpty.onAction ? (
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={idleEmpty.onAction}
              className="mt-4"
            >
              {idleEmpty.actionLabel}
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="mx-auto max-w-xs rounded-xl border border-dashed border-border-soft bg-surface-canvas px-4 py-6 text-center text-role-caption text-text-muted">No shipped records for this week</div>
      )}
    </div>
  );
}
