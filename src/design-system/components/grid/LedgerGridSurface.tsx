'use client';

import { useCallback, useMemo, type ReactNode, type RefObject } from 'react';
import type { OnChangeFn, SortingState } from '@tanstack/react-table';
import { SkeletonList } from '@/design-system/components/Skeletons';
import { LedgerGrid } from '@/design-system/components/grid/LedgerGrid';
import { useGridSurface } from '@/design-system/components/grid/useGridSurface';
import type { GridSurfaceDescriptor } from '@/design-system/components/grid/grid-surface-descriptor';
import type { RowGroup } from '@/lib/group-rows';
import { cn } from '@/utils/_cn';
import { TABLE_SURFACE_CLIP_CLASS } from '@/design-system/tokens/table-surface';

/**
 * `LedgerGridSurface<Row>` — the descriptor-driven Workbench spreadsheet
 * composer (plan Phase C). One mounted shell, many
 * {@link GridSurfaceDescriptor}s: the surface owns the framed table shell
 * ({@link TABLE_SURFACE_CLIP_CLASS}), the loading skeleton, the teaching empty
 * box, the TanStack headless sort surface (`useGridSurface` — asc ↔ desc cycle,
 * per-column desc-first), and the `LedgerGrid` mount (airtable skin + `scrollX`
 * + content-min). The caller owns what is genuinely per-domain: data fetch,
 * house grouping/day-banding (OUTSIDE TanStack until plan Phase E), sort
 * durability (local state or URL), and the header / row / group renderers.
 *
 * Station adopters: Incoming POS (`IncomingGridView`) and Unbox / History /
 * Testing (`ReceivingGridView`). Outbound Pending composes `LedgerGrid`
 * directly with {@link TABLE_SURFACE_CLIP_CLASS} (ancestor page scroll,
 * URL `?sort=` SoT, viewport force-hide, drag column order).
 */
interface LedgerGridSurfaceProps<Row, K extends string> {
  descriptor: GridSurfaceDescriptor<Row>;
  /** House-computed date bands → folds (grouping stays outside TanStack). */
  orderGroupsByDate: [string, RowGroup<Row>[]][];
  /** Flat rows for the TanStack state instance (never re-ordered by it). */
  rows: Row[];
  getRowId?: (row: Row) => string;
  /** Controlled column sort (caller owns durability — local state or URL). */
  sort: K | null;
  dir: 'asc' | 'desc' | null;
  onSortChange: (key: K, dir: 'asc' | 'desc') => void;
  /** Sticky column header; call `toggleColumnSort` from header clicks. */
  renderColumnHeader: (api: { toggleColumnSort: (key: K) => void }) => ReactNode;
  renderGroup: (group: RowGroup<Row>, baseStripeIndex: number) => ReactNode;
  renderRow: (row: Row, stripeIndex: number) => ReactNode;
  loading: boolean;
  emptyMessage: string;
  /** Sticky day bands (Testing History). Auto-suppressed under a column sort. */
  showDayHeaders?: boolean;
  /** Mirror of the LedgerGrid scroll body (keyboard nav / scroll-to-top). */
  scrollRef?: RefObject<HTMLDivElement | null>;
  className?: string;
  /** Outer card testid; the scroll body gets `${testId}-scroll`. */
  testId: string;
}

export function LedgerGridSurface<Row, K extends string>({
  descriptor,
  orderGroupsByDate,
  rows,
  getRowId,
  sort,
  dir,
  onSortChange,
  renderColumnHeader,
  renderGroup,
  renderRow,
  loading,
  emptyMessage,
  showDayHeaders = false,
  scrollRef,
  className,
  testId,
}: LedgerGridSurfaceProps<Row, K>) {
  // Controlled sort mirror → TanStack state; header clicks route through the
  // table column (`toggleSorting`: asc ↔ desc, desc-first per def) and land
  // back in the caller's store via `onSortChange`.
  const sorting = useMemo<SortingState>(
    () => (sort && dir ? [{ id: sort, desc: dir === 'desc' }] : []),
    [sort, dir],
  );
  const handleSortingChange = useCallback<OnChangeFn<SortingState>>(
    (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      const first = next[0];
      if (first) onSortChange(first.id as K, first.desc ? 'desc' : 'asc');
    },
    [sorting, onSortChange],
  );

  const { table } = useGridSurface<Row>({
    data: rows,
    columns: descriptor.columnDefs,
    getRowId,
    sorting,
    onSortingChange: handleSortingChange,
  });

  const toggleColumnSort = useCallback(
    (key: K) => {
      table.getColumn(key)?.toggleSorting();
    },
    [table],
  );

  const isEmpty =
    orderGroupsByDate.length === 0 || orderGroupsByDate.every(([, g]) => g.length === 0);
  const showSkeleton = loading && isEmpty;
  // A flat column sort replaces the banded order — day chrome would lie.
  const dayHeadersActive = showDayHeaders && !(sort && dir);

  return (
    <div
      data-testid={testId}
      data-table-surface=""
      className={cn(
        'flex h-full min-h-0 min-w-0 flex-1 flex-col',
        TABLE_SURFACE_CLIP_CLASS,
        className,
      )}
    >
      {showSkeleton ? (
        <div className="p-3">
          <SkeletonList count={12} type="row" />
        </div>
      ) : (
        <LedgerGrid<Row>
          scrollX
          contentMinWidthRem={descriptor.contentMinWidthRem}
          gridSkin="airtable"
          showDayHeaders={dayHeadersActive}
          data-testid={`${testId}-scroll`}
          bodyRef={scrollRef}
          orderGroupsByDate={orderGroupsByDate}
          columnHeader={renderColumnHeader({ toggleColumnSort })}
          renderGroup={renderGroup}
          renderRow={renderRow}
          emptyState={
            <div className="mx-auto max-w-xs rounded-xl border border-dashed border-border-soft bg-surface-canvas px-4 py-6 text-center">
              <p className="text-sm font-semibold text-text-soft">{emptyMessage}</p>
            </div>
          }
        />
      )}
    </div>
  );
}
