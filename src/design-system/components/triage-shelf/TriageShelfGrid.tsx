'use client';

/**
 * The triage shelf's grid — `TriageShelfTile` cells on the ported track, the
 * one status line when there is nothing to show (loading / empty / error), an
 * error line over a grid that still has tiles, and "Load N more" under a page
 * that has another. `listboxId` turns the list into a find listbox (tiles pass
 * `option`).
 */

import type { ReactNode } from 'react';
import { Button } from '@/design-system/primitives/Button';
import { cn } from '@/utils/_cn';
import { TRIAGE_SHELF_GRID, TRIAGE_SHELF_TRACK } from './triage-shelf-tokens';

export interface TriageShelfGridProps {
  label: string;
  /** Tiles on screen — `0` shows `empty` (or the loading / error line). */
  count: number;
  loading: boolean;
  error: string | null;
  empty: string;
  /** Find listbox: the id the field's `aria-controls` names. */
  listboxId?: string;
  hasMore?: boolean;
  loadingMore?: boolean;
  pageSize?: number;
  onLoadMore?: () => void;
  testId: string;
  children: ReactNode;
}

export function TriageShelfGrid({
  label,
  count,
  loading,
  error,
  empty,
  listboxId,
  hasMore = false,
  loadingMore = false,
  pageSize,
  onLoadMore,
  testId,
  children,
}: TriageShelfGridProps) {
  if (count === 0) {
    return (
      <p
        className={cn('px-3 py-8 text-center text-role-caption', error ? 'text-text-danger' : 'text-mode-muted')}
        role={error ? 'alert' : 'status'}
        data-testid={`${testId}-status`}
      >
        {loading ? 'Loading…' : (error ?? empty)}
      </p>
    );
  }
  return (
    <div className={cn('flex flex-col', loading && 'opacity-60')} aria-busy={loading || undefined}>
      {error ? (
        <p className="border-b border-mode-rule px-3 py-2 text-role-caption text-text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <ul
        id={listboxId}
        role={listboxId ? 'listbox' : undefined}
        aria-label={label}
        className={TRIAGE_SHELF_GRID}
        style={TRIAGE_SHELF_TRACK}
        data-testid={testId}
      >
        {children}
      </ul>
      {hasMore && onLoadMore ? (
        <div className="px-2 pb-2">
          <Button variant="secondary" onClick={onLoadMore} loading={loadingMore} className="w-full" data-testid={`${testId}-more`}>
            {pageSize ? `Load ${pageSize} more` : 'Load more'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
