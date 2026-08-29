'use client';

/**
 * Dashboard · Shipped — week-bucketed packer-log list on the shared outbound
 * spreadsheet ({@link OrdersGridHost} / LedgerGrid). Day bands and swimlane
 * board are retired; Date is a per-row column.
 *
 * Rebuilt 2026-08-29 (Phase 4a, `docs/todo/one-sheet-table-sot-PLAN.md`). The
 * feed, the filters, the grouping and the empty state are the pre-teardown ones
 * — they were never the thing being rewritten. What changed is the mount: the
 * lane's period control now portals into the Sheets toolbar rather than a Band-1
 * strip, and the row count it used to print in a footer is the bottom bar's job.
 */

import { useCallback, useMemo } from 'react';
import { Button } from '@/design-system/primitives';
import type { DashboardSearchSectionProps } from '@/components/dashboard/DashboardSearchSectionProps';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import { Loader2 } from '@/components/Icons';
import type { OutboundState } from '@/lib/outbound-state';
import { useShippedTableFilters } from '@/components/shipped/dashboard-table/useShippedTableFilters';
import { useShippedTableRecords } from '@/components/shipped/dashboard-table/useShippedTableRecords';
import { useShippedTableGrouping } from '@/components/shipped/dashboard-table/useShippedTableGrouping';
import { useShippedDetailsSelection } from '@/components/shipped/dashboard-table/useShippedDetailsSelection';
import { useShippedPeriodControls } from '@/components/shipped/dashboard-table/useShippedPeriodControls';
import { useRecordCursorKeyboard } from '@/hooks/useRecordCursorKeyboard';
import { ShippedTableEmptyState } from '@/components/shipped/dashboard-table/ShippedTableEmptyState';
import { OrdersGridHost } from '@/components/dashboard/orders-queue/OrdersGridHost';
import {
  derivedPackerRecordToQueueRow,
} from '@/components/shipped/shipped-record-mappers';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import type { DerivedPackerRecord } from '@/lib/shipped-records';

export interface DashboardShippedTableProps {
  packedBy?: number;
  testedBy?: number;
  /** Mobile tech/packer: compact shell without outbound portal toolbar. */
  embedded?: boolean;
  /** Pencil multi-select: rows render checkboxes; chrome owns the Select toggle. */
  selectMode?: boolean;
  /** Rail-selection model: the check-set is the single selection SoT and drives
   *  the right-rail inspector (History / order-rail SoT). */
  railSelection?: boolean;
  bannerTitle?: DashboardSearchSectionProps['bannerTitle'];
  bannerSubtitle?: DashboardSearchSectionProps['bannerSubtitle'];
  searchEmptyTitle?: DashboardSearchSectionProps['searchEmptyTitle'];
  searchResultLabel?: DashboardSearchSectionProps['searchResultLabel'];
  clearSearchLabel?: DashboardSearchSectionProps['clearSearchLabel'];
  /** Portal date controls into the dashboard outbound floating row. */
  toolbarPortalTarget?: HTMLElement | null;
  /**
   * Dashboard · Packed tab legacy lock — exact list for one outbound stage.
   * Prefer {@link PackedOrdersTable} for the staged orders API; this remains for
   * embedded callers that filter packer-log weeks by outbound state.
   */
  lockedOutboundStatus?: OutboundState | null;
}

export function DashboardShippedTable({
  packedBy,
  testedBy,
  embedded = false,
  selectMode = false,
  railSelection = false,
  searchEmptyTitle = 'No shipped orders found',
  searchResultLabel = 'shipped orders',
  clearSearchLabel = 'Show All Shipped Orders',
  toolbarPortalTarget,
  lockedOutboundStatus = null,
}: DashboardShippedTableProps = {}) {
  const filters = useShippedTableFilters({ packedBy, testedBy, lockedOutboundStatus });
  const { query, derivedRecords, searchMeta, pagination } = useShippedTableRecords(filters);
  const { orderedRecords, totalCount } = useShippedTableGrouping(derivedRecords);
  const { handleRowClick } = useShippedDetailsSelection();

  // The OrdersGridHost below publishes the cursor (it owns grouping + folds);
  // this lane only turns the keyboard on. `embedded` still gates it so a nested
  // mount does not bind a second ambient listener.
  useRecordCursorKeyboard({ enabled: !embedded, scope: 'record' });

  const period = useShippedPeriodControls(filters);
  const periodRange = period.activeRange ?? filters.weekRange;

  const byId = useMemo(() => {
    const map = new Map<number, DerivedPackerRecord>();
    for (const r of orderedRecords) map.set(Number(r.id), r);
    return map;
  }, [orderedRecords]);

  const gridRecords = useMemo(
    () => orderedRecords.map(derivedPackerRecordToQueueRow) as ShippedOrder[],
    [orderedRecords],
  );

  const onOpenRecord = useCallback(
    (order: ShippedOrder) => {
      const orig = byId.get(Number(order.id));
      if (orig) handleRowClick(orig);
    },
    [byId, handleRowClick],
  );

  const packedIdleEmpty =
    lockedOutboundStatus === 'PACKED_STAGED'
      ? {
          title: 'Nothing staged',
          body: 'Packed orders waiting for dock scan-out will land here. Open Scan-out to stage the next package.',
          actionLabel: 'Open Scan-out',
          onAction: () => {
            if (typeof window !== 'undefined') {
              window.location.assign('/shipping?mode=scan-out');
            }
          },
        }
      : null;

  const idleEmptyNode =
    !query.isLoading && orderedRecords.length === 0 && !filters.normalizedSearch ? (
      <ShippedTableEmptyState
        search={filters.search}
        searchEmptyTitle={searchEmptyTitle ?? 'No shipped orders found'}
        searchResultLabel={searchResultLabel ?? 'shipped orders'}
        clearSearchLabel={clearSearchLabel ?? 'Show All Shipped Orders'}
        onClearSearch={filters.clearSearch}
        searchMeta={searchMeta}
        onApplySuggestedFilter={filters.applyShippedFilter}
        idleEmpty={packedIdleEmpty}
      />
    ) : undefined;

  const loadMoreFooter = pagination.isTruncated ? (
    <div className="flex shrink-0 items-center justify-center gap-3 border-t border-border-soft bg-surface-card px-3 py-2">
      <span className="text-role-eyebrow font-semibold uppercase tracking-widest text-text-faint">
        Showing the most recent entries · older rows in this range are truncated
      </span>
      <Button
        variant="secondary"
        size="sm"
        onClick={pagination.loadMore}
        disabled={pagination.isLoadingMore}
        icon={pagination.isLoadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
      >
        Load more
      </Button>
    </div>
  ) : null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-canvas">
      {/* The period picker sits with the rows it scopes, not on a chrome row. */}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col" data-testid="column-table-body">
        <OrdersGridHost
          ariaLabel="Shipped orders"
          records={gridRecords}
          loading={query.isLoading}
          search={{ value: filters.search, onChange: filters.setSearch, placeholder: 'Filter shipped…' }}
          searchValue={filters.search}
          onClearSearch={filters.clearSearch}
          emptyMessage="No shipped orders"
          firstRunEmpty={idleEmptyNode}
          searchEmptyTitle={searchEmptyTitle}
          searchResultLabel={searchResultLabel}
          clearSearchLabel={clearSearchLabel}
          totalCount={totalCount}
          queueMode="shipped"
          sort="newest"
          selectMode={selectMode}
          selectionScope={DASHBOARD_ORDERS_SELECTION_SCOPE}
          railSelection={railSelection}
          data-testid="shipped-grid-body"
          onOpenRecord={onOpenRecord}
          onCloseRecord={() => undefined}
        />
      </div>
      {loadMoreFooter}
    </div>
  );
}
