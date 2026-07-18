'use client';

/**
 * Unshipped · Shelf Board — To Ship fulfillment queue as PENDING / TESTED /
 * BLOCKED swimlanes (drag-reorder, drag-resize). Same SwimlaneBoard system as
 * before; toolbar portals into the unified outbound header.
 *
 * Search flattens to one shared results table so empty lanes don't bury hits.
 * Clearing search restores the pipeline lane board.
 *
 * Workbench contract: URL-addressable selection (`?openOrderId`) + right-pane
 * detail. Do not refactor onto SidebarRailShell (single-list rail engine).
 */

import { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Check, ChevronDown, ChevronUp, Clock, Zap } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  SwimlaneBoard,
  type SwimlaneLaneBodyContext,
  type SwimlaneLaneDef,
  type SwimlaneSortOption,
} from '@/components/board/SwimlaneBoard';
import { OrdersQueueTable } from '@/components/dashboard/OrdersQueueTable';
import { ORDERS_QUEUE_SORTS, ORDERS_QUEUE_SORT_LABEL, type OrdersQueueSort } from '@/components/dashboard/orders-queue/helpers';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import { StaffFilterButton } from '@/components/ui/StaffFilterButton';
import { TableColumnConfigProvider } from '@/components/ui/table-column-config/TableColumnConfig';
import { ColumnConfigButton } from '@/components/ui/table-column-config/ColumnConfigButton';
import { TableOptionsMenu } from '@/components/ui/table-options/TableOptionsMenu';
import { TableDensityProvider } from '@/components/ui/table-density/TableDensityProvider';
import { UNSHIPPED_VIEW_PARAMS } from '@/components/unshipped/outbound-sidebar-shared';
import { MONITOR_SECTION_CARD_SCROLL_CLASS } from '@/design-system/components/monitor';
import {
  deriveFulfillmentState,
  FULFILLMENT_STATE_META,
  type FulfillmentState,
} from '@/lib/unshipped-state';
import { FULFILLMENT_BOARD_LANES, type FulfillmentLaneIconKey } from '@/lib/order-lifecycle';
import { useOutboundQueueKeyboard } from '@/hooks/useOutboundQueueKeyboard';
import { useDashboardScrollParentOptional } from '@/components/dashboard/DashboardScrollShell';
import { dispatchCloseShippedDetails } from '@/utils/events';
import { useEventBridge } from '@/hooks';
import type { ShippedOrder } from '@/types/orders';

const VIRTUAL_LANES = process.env.NEXT_PUBLIC_UNSHIPPED_VIRTUAL_LIST === '1';

const LANE_ICON: Record<FulfillmentLaneIconKey, React.ComponentType<{ className?: string }>> = {
  clock: Clock,
  check: Check,
  alert: AlertTriangle,
};

// Board-local lane key: the global FulfillmentState (PENDING/TESTED/BLOCKED) is
// a wide SoT (counts, filters, deriveFulfillmentState); URGENT is an orthogonal
// operator flag (orders.is_urgent) surfaced as its own board lane WITHOUT
// widening that SoT. Urgent rows collect here and drop out of their status lane.
type BoardLane = FulfillmentState | 'URGENT';

const URGENT_LANE: SwimlaneLaneDef<BoardLane> = {
  id: 'URGENT',
  label: 'Urgent',
  dot: 'bg-amber-500',
  description: 'Operator-flagged urgent / expedited orders',
  icon: Zap,
  iconClass: 'text-amber-500',
  hideWhenEmpty: true,
};

const UNSHIPPED_LANES: SwimlaneLaneDef<BoardLane>[] = [
  URGENT_LANE,
  ...FULFILLMENT_BOARD_LANES.map((lane) => ({
    id: lane.id,
    label: FULFILLMENT_STATE_META[lane.id].label,
    dot: FULFILLMENT_STATE_META[lane.id].dot,
    description: FULFILLMENT_STATE_META[lane.id].description,
    icon: LANE_ICON[lane.iconKey],
    iconClass: lane.iconClass,
    // Exception lane — hide the empty shell so it doesn't sit above Pending/Tested.
    hideWhenEmpty: lane.id === 'BLOCKED' ? true : undefined,
  })),
];

const UNSHIPPED_SORT_OPTIONS: SwimlaneSortOption<OrdersQueueSort>[] = ORDERS_QUEUE_SORTS.map((s) => ({
  id: s,
  label: ORDERS_QUEUE_SORT_LABEL[s],
}));

type FulfillmentRow = ShippedOrder & {
  has_tech_scan?: boolean | null;
  out_of_stock?: string | null;
  is_urgent?: boolean | null;
};

function rowState(row: ShippedOrder, focusLane: BoardLane | null): BoardLane {
  const r = row as FulfillmentRow;
  const fulfillment = deriveFulfillmentState({
    hasTechScan: Boolean(r.has_tech_scan),
    outOfStock: r.out_of_stock,
  });
  // When a KPI / toolbar lane filter is on, keep matching rows in that lane —
  // including urgent ones — so click-to-filter never hides the work it selected.
  // Without a focus lane, urgent still takes precedence into its own board lane.
  if (focusLane && focusLane !== 'URGENT') return fulfillment;
  if (r.is_urgent) return 'URGENT';
  return fulfillment;
}

export interface UnshippedShelfBoardProps {
  records: ShippedOrder[];
  loading: boolean;
  searchValue: string;
  onOpenRecord: (record: ShippedOrder) => void;
  onClearSearch: () => void;
  searchEmptyTitle?: string;
  searchResultLabel?: string;
  clearSearchLabel?: string;
  selectMode?: boolean;
  footer?: React.ReactNode;
  toolbarPortalTarget?: HTMLElement | null;
}

export function UnshippedShelfBoard({
  records,
  loading,
  searchValue,
  onOpenRecord,
  onClearSearch,
  searchEmptyTitle = 'No orders found',
  searchResultLabel = 'orders to ship',
  clearSearchLabel = 'Show All Pending Orders',
  selectMode = false,
  footer,
  toolbarPortalTarget,
}: UnshippedShelfBoardProps) {
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const focusLane = useMemo((): BoardLane | null => {
    const raw = String(searchParams.get('ustatus') || '').trim().toUpperCase();
    if (raw === 'PENDING' || raw === 'TESTED' || raw === 'BLOCKED' || raw === 'URGENT') return raw;
    return null;
  }, [searchParams]);
  const visibleLanes = useMemo(
    () => (focusLane ? UNSHIPPED_LANES.filter((l) => l.id === focusLane) : UNSHIPPED_LANES),
    [focusLane],
  );

  useEventBridge({
    'open-shipped-details': (e) => {
      const detail = (e as CustomEvent).detail;
      const id = Number(detail?.order?.id ?? detail?.id);
      setSelectedId(Number.isFinite(id) && id > 0 ? id : null);
    },
    'close-shipped-details': () => setSelectedId(null),
  });

  useOutboundQueueKeyboard({
    enabled: true,
    orderedRecords: records,
    selectedId,
    context: 'queue',
    openRecord: onOpenRecord,
  });

  const renderLaneBody = useCallback(
    ({
      laneLabel,
      rows,
      sort,
      maxBodyHeightClass,
      maxBodyHeightPx,
      growToContent,
      scrollParentRef,
      collapse,
    }: SwimlaneLaneBodyContext<ShippedOrder, BoardLane, OrdersQueueSort>) => {
      const dateHeaderEndSlot =
        collapse && collapse.canToggle ? (
          <HoverTooltip
            label={
              collapse.expanded
                ? `Show less · ${collapse.displayCount}`
                : `Show more · ${collapse.displayCount}`
            }
            asChild
          >
            <button
              type="button"
              onClick={collapse.onToggle}
              aria-expanded={collapse.expanded}
              aria-label={
                collapse.expanded
                  ? `Collapse ${collapse.laneLabel} lane to ${collapse.displayCount} rows`
                  : `Expand ${collapse.laneLabel} lane to ${collapse.displayCount} rows`
              }
              className="ds-raw-button inline-flex h-5 items-center justify-center gap-0.5 rounded-md px-1 text-role-micro tabular-nums leading-none text-text-muted transition hover:bg-surface-hover hover:text-text-default"
            >
              {collapse.expanded ? (
                <ChevronUp className="h-2.5 w-2.5 shrink-0" />
              ) : (
                <ChevronDown className="h-2.5 w-2.5 shrink-0" />
              )}
              <span className="tabular-nums text-text-faint">
                {collapse.displayCount}
              </span>
            </button>
          </HoverTooltip>
        ) : null;

      return (
        <OrdersQueueTable
          hideHeader
          inheritColumnConfig
          noHorizontalScroll
          virtualized={VIRTUAL_LANES}
          autoHeight
          maxBodyHeightClass={maxBodyHeightClass}
          maxBodyHeightPx={maxBodyHeightPx}
          growToContent={growToContent}
          scrollParentRef={scrollParentRef}
          records={rows}
          queueMode="fulfillment"
          sort={sort}
          selectMode={selectMode}
          selectionScope={DASHBOARD_ORDERS_SELECTION_SCOPE}
          loading={loading}
          isRefreshing={false}
          searchValue={searchValue}
          onClearSearch={onClearSearch}
          emptyMessage={`No ${laneLabel.toLowerCase()} orders`}
          searchEmptyTitle={searchEmptyTitle}
          searchResultLabel={searchResultLabel}
          clearSearchLabel={clearSearchLabel}
          onOpenRecord={onOpenRecord}
          dateHeaderEndSlot={dateHeaderEndSlot}
          // Lane chrome no longer sticks under pageScroll — day bands dock at top-0.
          stickyTopClass="top-0"
        />
      );
    },
    [loading, searchValue, onClearSearch, searchEmptyTitle, searchResultLabel, clearSearchLabel, onOpenRecord, selectMode],
  );

  const getRowDate = useCallback((r: ShippedOrder) => r.created_at || r.deadline_at, []);

  const headerPersistentEndSlot = useMemo(
    () => <StaffFilterButton iconOnly />,
    [],
  );
  const dashboardScrollRef = useDashboardScrollParentOptional();
  const pageScroll = Boolean(dashboardScrollRef);

  /** Display controls — always visible on the toolbar (Select lives in chrome). */
  const headerEndSlot = useMemo(
    () => (
      <div className="flex items-center gap-2">
        <ColumnConfigButton variant="toolbar" />
        <TableOptionsMenu
          showDensity
          showColumnPresets
          savedViews={{ storageKey: 'unshipped_saved_views', paramKeys: UNSHIPPED_VIEW_PARAMS }}
        />
      </div>
    ),
    [],
  );

  // Search answers "find this order" — flatten to one shared results table so
  // empty Urgent/Tested/Blocked lanes don't push hits below the fold. Clearing
  // search restores the pipeline lane board (not a permanent flat-list mode).
  const isSearching = Boolean(searchValue.trim());

  const searchToolbar = (
    <div className="flex items-center gap-2">
      {headerPersistentEndSlot}
      {headerEndSlot}
    </div>
  );

  return (
    <TableColumnConfigProvider tableId="orders">
      <TableDensityProvider tableId="orders" urlSync={false}>
        {isSearching ? (
          <div className="flex min-w-0 flex-col">
            {toolbarPortalTarget
              ? createPortal(searchToolbar, toolbarPortalTarget)
              : (
                <div className="flex shrink-0 items-center justify-end gap-2 border-b border-border-soft px-3 py-1.5">
                  {searchToolbar}
                </div>
              )}
            <div className={toolbarPortalTarget ? 'py-1' : 'p-4'}>
              {pageScroll ? <div className="h-1 shrink-0" aria-hidden /> : null}
              <div className={MONITOR_SECTION_CARD_SCROLL_CLASS}>
                <OrdersQueueTable
                  records={records}
                  loading={loading}
                  isRefreshing={false}
                  searchValue={searchValue}
                  onClearSearch={onClearSearch}
                  emptyMessage="No orders to ship"
                  searchEmptyTitle={searchEmptyTitle}
                  searchResultLabel={searchResultLabel}
                  clearSearchLabel={clearSearchLabel}
                  queueMode="fulfillment"
                  sort="priority"
                  selectMode={selectMode}
                  selectionScope={DASHBOARD_ORDERS_SELECTION_SCOPE}
                  onOpenRecord={(record) => {
                    setSelectedId(Number(record.id));
                    onOpenRecord(record);
                  }}
                  onCloseRecord={() => {
                    setSelectedId(null);
                    dispatchCloseShippedDetails();
                  }}
                  hideHeader
                  noHorizontalScroll
                  inheritColumnConfig
                  listShell="monitor"
                  growToContent={pageScroll}
                  scrollParentRef={dashboardScrollRef ?? undefined}
                  virtualized={VIRTUAL_LANES && pageScroll}
                />
              </div>
            </div>
            {footer}
          </div>
        ) : (
          <SwimlaneBoard<ShippedOrder, BoardLane, OrdersQueueSort>
            key={focusLane ?? 'all-lanes'}
            prefsKey="unshippedBoard"
            lanes={visibleLanes}
            bucket={(row) => rowState(row, focusLane)}
            records={records}
            // Single-column vertical stack only — no multi-up toggle, grid, or FLIP.
            maxColumns={1}
            defaultColumns={1}
            defaultExpanded={Boolean(focusLane)}
            sortOptions={UNSHIPPED_SORT_OPTIONS}
            defaultSort="priority"
            headerPersistentEndSlot={headerPersistentEndSlot}
            headerEndSlot={headerEndSlot}
            getRowDate={getRowDate}
            renderLaneBody={renderLaneBody}
            footerSlot={footer}
            toolbarPortalTarget={toolbarPortalTarget}
            pageScrollParentRef={dashboardScrollRef ?? undefined}
          />
        )}
      </TableDensityProvider>
    </TableColumnConfigProvider>
  );
}
