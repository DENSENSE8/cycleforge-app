'use client';

/**
 * Unshipped · Shelf Board — To Ship fulfillment queue as PENDING / TESTED /
 * BLOCKED swimlanes (drag-reorder, drag-resize, 1/2-up). Same SwimlaneBoard
 * system as before; toolbar portals into the unified outbound header.
 *
 * Workbench contract: URL-addressable selection (`?openOrderId`) + right-pane
 * detail. Do not refactor onto SidebarRailShell (single-list rail engine).
 */

import { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Check, ChevronDown, ChevronUp, Clock, Layers, List } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { ToolbarButton } from '@/components/ui/ToolbarButton';
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
import { BoardSelectToggle } from '@/components/board/BoardSelectToggle';
import { TableOptionsMenu } from '@/components/ui/table-options/TableOptionsMenu';
import { TableDensityProvider } from '@/components/ui/table-density/TableDensityProvider';
import { UNSHIPPED_VIEW_PARAMS } from '@/components/unshipped/outbound-sidebar-shared';
import {
  deriveFulfillmentState,
  FULFILLMENT_STATE_META,
  type FulfillmentState,
} from '@/lib/unshipped-state';
import { FULFILLMENT_BOARD_LANES, type FulfillmentLaneIconKey } from '@/lib/order-lifecycle';
import {
  parseOutboundSurface,
  SURFACE_PARAM,
  type OutboundSurface,
} from '@/lib/dashboard/outbound-queue-prefs';
import { useOutboundQueueKeyboard } from '@/hooks/useOutboundQueueKeyboard';
import { dispatchCloseShippedDetails } from '@/utils/events';
import { useEventBridge } from '@/hooks';
import type { ShippedOrder } from '@/types/orders';

const VIRTUAL_LANES = process.env.NEXT_PUBLIC_UNSHIPPED_VIRTUAL_LIST === '1';

const LANE_ICON: Record<FulfillmentLaneIconKey, React.ComponentType<{ className?: string }>> = {
  clock: Clock,
  check: Check,
  alert: AlertTriangle,
};

const UNSHIPPED_LANES: SwimlaneLaneDef<FulfillmentState>[] = FULFILLMENT_BOARD_LANES.map((lane) => ({
  id: lane.id,
  label: FULFILLMENT_STATE_META[lane.id].label,
  dot: FULFILLMENT_STATE_META[lane.id].dot,
  description: FULFILLMENT_STATE_META[lane.id].description,
  icon: LANE_ICON[lane.iconKey],
  iconClass: lane.iconClass,
}));

const UNSHIPPED_SORT_OPTIONS: SwimlaneSortOption<OrdersQueueSort>[] = ORDERS_QUEUE_SORTS.map((s) => ({
  id: s,
  label: ORDERS_QUEUE_SORT_LABEL[s],
}));

type FulfillmentRow = ShippedOrder & {
  has_tech_scan?: boolean | null;
  out_of_stock?: string | null;
};

function rowState(row: ShippedOrder): FulfillmentState {
  const r = row as FulfillmentRow;
  return deriveFulfillmentState({
    hasTechScan: Boolean(r.has_tech_scan),
    outOfStock: r.out_of_stock,
  });
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
  onToggleSelectMode?: () => void;
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
  clearSearchLabel = 'Show All To Ship Orders',
  selectMode = false,
  onToggleSelectMode,
  footer,
  toolbarPortalTarget,
}: UnshippedShelfBoardProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const focusLane = useMemo((): FulfillmentState | null => {
    const raw = String(searchParams.get('ustatus') || '').trim().toUpperCase();
    if (raw === 'PENDING' || raw === 'TESTED' || raw === 'BLOCKED') return raw;
    return null;
  }, [searchParams]);
  const lateOnly = searchParams.get('late') === '1';
  const surface: OutboundSurface = parseOutboundSurface(searchParams.get(SURFACE_PARAM));
  const visibleLanes = useMemo(
    () => (focusLane ? UNSHIPPED_LANES.filter((l) => l.id === focusLane) : UNSHIPPED_LANES),
    [focusLane],
  );

  const replaceParam = useCallback(
    (mutator: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutator(params);
      const qs = params.toString();
      router.replace(qs ? `${pathname || '/dashboard'}?${qs}` : pathname || '/dashboard', {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  const toggleLateOnly = useCallback(() => {
    replaceParam((params) => {
      if (params.get('late') === '1') params.delete('late');
      else params.set('late', '1');
    });
  }, [replaceParam]);

  const setSurface = useCallback(
    (next: OutboundSurface) => {
      replaceParam((params) => {
        if (next === 'lanes') params.delete(SURFACE_PARAM);
        else params.set(SURFACE_PARAM, next);
      });
    },
    [replaceParam],
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
    }: SwimlaneLaneBodyContext<ShippedOrder, FulfillmentState, OrdersQueueSort>) => {
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
              className="ds-raw-button inline-flex h-7 min-w-7 items-center justify-center gap-0.5 rounded-full border border-border-soft bg-surface-card px-1.5 text-text-soft shadow-sm transition hover:bg-surface-sunken hover:text-text-default"
            >
              {collapse.expanded ? (
                <ChevronUp className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="text-role-micro tabular-nums leading-none">
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
          stickyTopClass={growToContent ? 'top-[41px]' : 'top-0'}
        />
      );
    },
    [loading, searchValue, onClearSearch, searchEmptyTitle, searchResultLabel, clearSearchLabel, onOpenRecord, selectMode],
  );

  const getRowDate = useCallback((r: ShippedOrder) => r.created_at || r.deadline_at, []);

  const headerPersistentEndSlot = useMemo(() => <StaffFilterButton align="start" />, []);

  const headerEndSlot = useMemo(
    () => (
      <div className="flex items-center gap-2">
        <HoverTooltip
          label={surface === 'list' ? 'Lane stack (grouped by stage)' : 'Flat pick list (no lanes)'}
          asChild
        >
          <ToolbarButton
            iconOnly
            active={surface === 'list'}
            onClick={() => setSurface(surface === 'list' ? 'lanes' : 'list')}
            aria-pressed={surface === 'list'}
            aria-label={surface === 'list' ? 'Switch to lane stack' : 'Switch to flat list'}
          >
            {surface === 'list' ? <Layers className="h-3.5 w-3.5" /> : <List className="h-3.5 w-3.5" />}
          </ToolbarButton>
        </HoverTooltip>
        <HoverTooltip label="Show late orders only" asChild>
          <ToolbarButton
            iconOnly
            active={lateOnly}
            onClick={toggleLateOnly}
            aria-pressed={lateOnly}
            aria-label="Show late orders only"
          >
            <Clock className="h-3.5 w-3.5" />
          </ToolbarButton>
        </HoverTooltip>
        <HoverTooltip label="Configure columns" asChild>
          <span className="inline-flex">
            <ColumnConfigButton variant="toolbar" />
          </span>
        </HoverTooltip>
        {onToggleSelectMode ? (
          <BoardSelectToggle active={selectMode} onToggle={onToggleSelectMode} />
        ) : null}
        <HoverTooltip label="Table options" asChild>
          <span className="inline-flex">
            <TableOptionsMenu
              showDensity
              showColumnPresets
              savedViews={{ storageKey: 'unshipped_saved_views', paramKeys: UNSHIPPED_VIEW_PARAMS }}
            />
          </span>
        </HoverTooltip>
      </div>
    ),
    [selectMode, onToggleSelectMode, lateOnly, toggleLateOnly, surface, setSurface],
  );

  return (
    <TableColumnConfigProvider tableId="orders">
      <TableDensityProvider tableId="orders" urlSync={false}>
        {surface === 'list' ? (
          <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
            {toolbarPortalTarget
              ? createPortal(
                  <div className="flex items-center gap-2">
                    {headerPersistentEndSlot}
                    {headerEndSlot}
                  </div>,
                  toolbarPortalTarget,
                )
              : (
                <div className="flex shrink-0 items-center justify-end gap-2 border-b border-border-soft px-3 py-1.5">
                  {headerPersistentEndSlot}
                  {headerEndSlot}
                </div>
              )}
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
            />
            {footer}
          </div>
        ) : (
          <SwimlaneBoard<ShippedOrder, FulfillmentState, OrdersQueueSort>
            key={focusLane ?? 'all-lanes'}
            prefsKey="unshippedBoard"
            lanes={visibleLanes}
            bucket={rowState}
            records={records}
            // Single-column vertical stack only — no multi-up toggle, grid, or FLIP.
            maxColumns={1}
            defaultColumns={1}
            defaultExpanded={Boolean(focusLane)}
            sortOptions={UNSHIPPED_SORT_OPTIONS}
            defaultSort="priority"
            headerPersistentEndSlot={headerPersistentEndSlot}
            headerEndSlot={headerEndSlot}
            collapsibleControls
            getRowDate={getRowDate}
            renderLaneBody={renderLaneBody}
            footerSlot={footer}
            toolbarPortalTarget={toolbarPortalTarget}
          />
        )}
      </TableDensityProvider>
    </TableColumnConfigProvider>
  );
}
