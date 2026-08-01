'use client';

/**
 * Dashboard · Shipped — week-bucketed packer-log list on the shared outbound
 * spreadsheet ({@link OrdersGridView} / LedgerGrid). Day bands and swimlane
 * board are retired; Date is a per-row column.
 */

import { useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/design-system/primitives';
import type { DashboardSearchSectionProps } from '@/components/dashboard/DashboardSearchSectionProps';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import { formatWeekRangeCompact } from '@/utils/date';
import { Loader2 } from '@/components/Icons';
import type { OutboundState } from '@/lib/outbound-state';
import { useShippedTableFilters } from '@/components/shipped/dashboard-table/useShippedTableFilters';
import { useShippedTableRecords } from '@/components/shipped/dashboard-table/useShippedTableRecords';
import { useShippedTableGrouping } from '@/components/shipped/dashboard-table/useShippedTableGrouping';
import { useShippedDetailsSelection } from '@/components/shipped/dashboard-table/useShippedDetailsSelection';
import { useShippedPeriodControls } from '@/components/shipped/dashboard-table/useShippedPeriodControls';
import { useOutboundQueueKeyboard } from '@/hooks/useOutboundQueueKeyboard';
import { ShippedTableEmptyState } from '@/components/shipped/dashboard-table/ShippedTableEmptyState';
import { DateRangePickerPill } from '@/components/ui/DateRangeHeader';
import { OrdersGridView } from '@/components/dashboard/orders-queue/OrdersGridView';
import { workbenchTableViewportClass } from '@/components/dashboard/workbench-shell';
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
  /** Reserve bottom room for the pinned bulk-selection capsule (see
   *  `workbenchTableViewportClass`). Ignored when `embedded` — that shell is a
   *  flex child with no bounded host of its own. */
  bulkBarInset?: boolean;
  /** Rail-selection model: the check-set is the single selection SoT and drives
   *  the right-rail inspector. See `docs/todo/order-rail-selection-plane-PLAN.md`. */
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
  bulkBarInset = false,
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
  const { selectedDetailId, handleRowClick } = useShippedDetailsSelection({ orderedRecords });

  useOutboundQueueKeyboard({
    enabled: !embedded,
    orderedRecords,
    selectedId: selectedDetailId,
    context: 'shipped',
  });

  const period = useShippedPeriodControls(filters);
  const periodRange = period.activeRange ?? filters.weekRange;
  const periodLabel = formatWeekRangeCompact(periodRange.startStr, periodRange.endStr);

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

  const shippedToolbarControls = (
    <div className="flex items-center gap-2">
      <DateRangePickerPill
        label={periodLabel}
        count={totalCount}
        presets={period.presets}
        onSelectCustomRange={period.onSelectCustomRange}
        activeRange={period.activeRange}
        onClear={period.onClear}
      />
    </div>
  );

  const portaledToolbar =
    !embedded && toolbarPortalTarget
      ? createPortal(shippedToolbarControls, toolbarPortalTarget)
      : null;

  return (
    <div className="flex min-w-0 flex-col bg-surface-canvas">
      {portaledToolbar}
      {!embedded && !toolbarPortalTarget ? (
        <div className="flex h-[40px] shrink-0 items-center justify-end gap-3 border-b border-border-default px-3">
          {shippedToolbarControls}
        </div>
      ) : null}
      <div
        className={
          embedded
            ? 'flex min-h-0 flex-1 flex-col'
            : workbenchTableViewportClass({ bulkBarInset })
        }
        data-testid="column-table-body"
      >
        <OrdersGridView
          ariaLabel="Shipped orders"
          records={gridRecords}
          loading={query.isLoading}
          searchValue={filters.search}
          onClearSearch={filters.clearSearch}
          emptyMessage="No shipped orders"
          firstRunEmpty={idleEmptyNode}
          searchEmptyTitle={searchEmptyTitle}
          searchResultLabel={searchResultLabel}
          clearSearchLabel={clearSearchLabel}
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
