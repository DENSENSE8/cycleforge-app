'use client';

import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SkeletonList } from '@/design-system';
import { Button } from '@/design-system/primitives';
import type { DashboardSearchSectionProps } from '@/components/dashboard/DashboardSearchSectionProps';
import { useTableSelectMode } from '@/hooks/useTableSelectMode';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import { useUIModeOptional } from '@/design-system/providers/UIModeProvider';
import { formatWeekRangeCompact } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { AlertTriangle, Clock, Loader2, MapPin, Package, PackageCheck, Send, Truck } from '@/components/Icons';
import { OUTBOUND_STATE_META, type OutboundState } from '@/lib/outbound-state';
import { OUTBOUND_BOARD_LANES, type OutboundLaneIconKey } from '@/lib/order-lifecycle';
import type { DerivedPackerRecord } from '@/lib/shipped-records';
import { MONITOR_SECTION_CARD_SCROLL_CLASS } from '@/design-system/components/monitor';
import { useShippedTableFilters } from '@/components/shipped/dashboard-table/useShippedTableFilters';
import { useShippedTableRecords } from '@/components/shipped/dashboard-table/useShippedTableRecords';
import { useShippedTableGrouping } from '@/components/shipped/dashboard-table/useShippedTableGrouping';
import { useShippedDetailsSelection } from '@/components/shipped/dashboard-table/useShippedDetailsSelection';
import { useShippedPeriodControls } from '@/components/shipped/dashboard-table/useShippedPeriodControls';
import { useOutboundQueueKeyboard } from '@/hooks/useOutboundQueueKeyboard';
import { useDashboardScrollParentOptional } from '@/components/dashboard/DashboardScrollShell';
import { TableDensityProvider } from '@/components/ui/table-density/TableDensityProvider';
import { ShippedTableHeader } from '@/components/shipped/dashboard-table/ShippedTableHeader';
import { ShippedTableEmptyState } from '@/components/shipped/dashboard-table/ShippedTableEmptyState';
import { VirtualShippedSections } from '@/components/shipped/dashboard-table/VirtualShippedSections';
import { ShippedLaneTable } from '@/components/shipped/dashboard-table/ShippedLaneTable';
import { SwimlaneBoard, type SwimlaneLaneDef } from '@/components/board/SwimlaneBoard';
import { TableColumnConfigProvider } from '@/components/ui/table-column-config/TableColumnConfig';
import { ColumnConfigButton } from '@/components/ui/table-column-config/ColumnConfigButton';
import { TableOptionsMenu } from '@/components/ui/table-options/TableOptionsMenu';
import { DateRangePickerPill } from '@/components/ui/DateRangeHeader';
import { PaneHeader } from '@/components/ui/pane-header';
import { sectionLabel } from '@/design-system/tokens/typography/presets';

/** Params that define a Shipped saved view (type + status-dot filter, not search). */
const SHIPPED_VIEW_PARAMS = ['shippedFilter', 'shippedSearchField', 'ostatus'] as const;

/** Icon binding — maps the lib's outbound lane icon key to a concrete glyph. */
const OUTBOUND_LANE_ICON: Record<OutboundLaneIconKey, React.ComponentType<{ className?: string }>> = {
  staged: Clock,
  scanned_out: Send,
  in_custody: Truck,
  delivered: PackageCheck,
  exception: AlertTriangle,
  process_gap: Package,
  orphan: MapPin,
};

/**
 * Lane model handed to the board. Lane ORDER + icon binding come from the
 * canonical `OUTBOUND_BOARD_LANES` descriptor (`order-lifecycle.ts`); the
 * label/dot/description come from the `OUTBOUND_STATE_META` color SoT.
 */
const SHIPPED_LANES: SwimlaneLaneDef<OutboundState>[] = OUTBOUND_BOARD_LANES.map((lane) => ({
  id: lane.id,
  label: OUTBOUND_STATE_META[lane.id].label,
  dot: OUTBOUND_STATE_META[lane.id].dot,
  description: OUTBOUND_STATE_META[lane.id].description,
  icon: OUTBOUND_LANE_ICON[lane.iconKey],
}));

export interface DashboardShippedTableProps {
  packedBy?: number;
  testedBy?: number;
  /** Mobile tech/packer: one scroll column, no extra shell wrappers; WeekHeader matches other mobile week tables. */
  embedded?: boolean;
  /** Pencil multi-select: rows render checkboxes; chrome owns the Select toggle. */
  selectMode?: boolean;
  bannerTitle?: DashboardSearchSectionProps['bannerTitle'];
  bannerSubtitle?: DashboardSearchSectionProps['bannerSubtitle'];
  searchEmptyTitle?: DashboardSearchSectionProps['searchEmptyTitle'];
  searchResultLabel?: DashboardSearchSectionProps['searchResultLabel'];
  clearSearchLabel?: DashboardSearchSectionProps['clearSearchLabel'];
  /** Portal date + table controls into the dashboard outbound floating row. */
  toolbarPortalTarget?: HTMLElement | null;
  /**
   * Dashboard · Packed tab — exact list for one outbound stage (PACKED_STAGED).
   * Locks the filter and forces the flat day-banded list (no pipeline board).
   */
  lockedOutboundStatus?: OutboundState | null;
}

export function DashboardShippedTable({
  packedBy,
  testedBy,
  embedded = false,
  selectMode = false,
  bannerTitle,
  bannerSubtitle,
  searchEmptyTitle = 'No shipped orders found',
  searchResultLabel = 'shipped orders',
  clearSearchLabel = 'Show All Shipped Orders',
  toolbarPortalTarget,
  lockedOutboundStatus = null,
}: DashboardShippedTableProps = {}) {
  const { isMobile } = useUIModeOptional();
  const scrollRef = useRef<HTMLDivElement>(null);
  const dashboardScrollRef = useDashboardScrollParentOptional();
  const pageScroll = Boolean(dashboardScrollRef) && !embedded;
  const virtualScrollRef = pageScroll ? dashboardScrollRef! : scrollRef;

  const filters = useShippedTableFilters({ packedBy, testedBy, lockedOutboundStatus });
  const { query, derivedRecords, searchMeta, pagination } = useShippedTableRecords(filters);
  const { daySections, orderedRecords, totalCount } = useShippedTableGrouping(derivedRecords);
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

  const getRowId = useCallback((r: DerivedPackerRecord) => Number(r.id), []);
  const { selectedIds, toggle } = useTableSelectMode<DerivedPackerRecord>({
    scope: DASHBOARD_ORDERS_SELECTION_SCOPE,
    selectMode,
    rows: orderedRecords,
    getId: getRowId,
  });

  useEffect(() => {
    const container = virtualScrollRef.current;
    if (container) container.scrollTop = 0;
  }, [daySections, virtualScrollRef]);

  const showResultsHeader = Boolean(filters.normalizedSearch) || filters.anyCarrierFilter;
  const shippedView = filters.layout;

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

  const packedIdleEmpty =
    lockedOutboundStatus === 'PACKED_STAGED'
      ? {
          title: 'Nothing staged',
          body: 'Packed orders waiting for dock scan-out will land here. Open Scan-out to stage the next package.',
          actionLabel: 'Open Scan-out',
          onAction: () => {
            if (typeof window !== 'undefined') {
              window.location.assign('/outbound?mode=scan-out');
            }
          },
        }
      : null;

  const renderDayBandedBody = (listClassName: string) =>
    query.isLoading ? (
      <SkeletonList count={12} />
    ) : daySections.length === 0 ? (
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
    ) : (
      <div className={listClassName}>
        <VirtualShippedSections
          daySections={daySections}
          scrollParentRef={virtualScrollRef}
          useAncestorScroll={pageScroll}
          isMobile={isMobile}
          selectMode={selectMode}
          selectedIds={selectedIds}
          selectedDetailId={selectedDetailId}
          onRowClick={handleRowClick}
          onToggle={toggle}
        />
      </div>
    );

  const shippedToolbarControls = (
    <div className="flex items-center gap-2">
      <DateRangePickerPill
        label={periodLabel}
        count={shippedView === 'all' ? totalCount : undefined}
        presets={period.presets}
        onSelectCustomRange={period.onSelectCustomRange}
        activeRange={period.activeRange}
        onClear={period.onClear}
      />
      <ColumnConfigButton variant="toolbar" />
      <TableOptionsMenu
        showDensity
        showColumnPresets
        savedViews={{ storageKey: 'shipped_saved_views', paramKeys: SHIPPED_VIEW_PARAMS }}
      />
    </div>
  );

  const portaledToolbar =
    toolbarPortalTarget && shippedToolbarControls
      ? createPortal(shippedToolbarControls, toolbarPortalTarget)
      : null;

  /** Embedded / mobile — keep the legacy sticky header with an in-table date picker. */
  const shippedTableInner = (
    <TableColumnConfigProvider tableId="shipped">
      <TableDensityProvider tableId="shipped" urlSync={false}>
        <div className="relative flex min-h-0 flex-1 flex-col">
          <ShippedTableHeader
            bannerTitle={bannerTitle}
            bannerSubtitle={bannerSubtitle}
            showResultsHeader={showResultsHeader}
            totalCount={totalCount}
            weekRange={filters.weekRange}
            period={period}
          />
          <div
            ref={scrollRef}
            data-testid="column-table-body"
            className="min-h-0 w-full flex-1 overflow-x-auto overflow-y-auto scrollbar-hide"
          >
            {renderDayBandedBody('flex w-full flex-col pb-8')}
          </div>
        </div>
      </TableDensityProvider>
    </TableColumnConfigProvider>
  );

  /** All — card-wrapped day-banded list; date + controls live in the outbound row. */
  const shippedAllInner = (
    <TableColumnConfigProvider tableId="shipped">
      <TableDensityProvider tableId="shipped" urlSync={false}>
        <div className={pageScroll ? 'flex flex-col bg-surface-canvas' : 'flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-surface-canvas'}>
          {portaledToolbar}
          {!toolbarPortalTarget ? (
            <div className="flex h-[40px] shrink-0 items-center justify-end gap-3 border-b border-border-default px-3">
              {shippedToolbarControls}
            </div>
          ) : null}
          <div
            ref={pageScroll ? undefined : scrollRef}
            data-testid="column-table-body"
            className={cn(
              pageScroll ? 'overflow-x-clip w-full' : 'min-h-0 flex-1 overflow-x-auto overflow-y-auto scrollbar-hide',
              toolbarPortalTarget ? 'py-1' : 'p-4',
            )}
          >
            <div className={MONITOR_SECTION_CARD_SCROLL_CLASS}>
              {showResultsHeader ? (
                <PaneHeader
                  className="shrink-0 border-b-0"
                  rowClassName="border-b border-border-default"
                  leftSlot={
                    <p className={`${sectionLabel} text-text-muted`}>
                      {totalCount} result{totalCount !== 1 ? 's' : ''}
                    </p>
                  }
                />
              ) : null}
              {renderDayBandedBody('flex w-full flex-col px-2 pb-6')}
            </div>
          </div>
        </div>
      </TableDensityProvider>
    </TableColumnConfigProvider>
  );

  /** Pipeline — swimlane board with no local header band; controls portaled upward. */
  const shippedBoardInner = (
    <TableColumnConfigProvider tableId="shipped">
      <TableDensityProvider tableId="shipped" urlSync={false}>
        <SwimlaneBoard<DerivedPackerRecord, OutboundState, never>
          prefsKey="shippedBoard"
          lanes={SHIPPED_LANES}
          bucket={(r) => r.outboundState}
          records={derivedRecords}
          maxColumns={2}
          headerPersistentEndSlot={
            <DateRangePickerPill
              label={periodLabel}
              presets={period.presets}
              onSelectCustomRange={period.onSelectCustomRange}
              activeRange={period.activeRange}
              onClear={period.onClear}
            />
          }
          headerEndSlot={
            <div className="flex items-center gap-2">
              <ColumnConfigButton variant="toolbar" />
              <TableOptionsMenu
                showDensity
                showColumnPresets
                savedViews={{ storageKey: 'shipped_saved_views', paramKeys: SHIPPED_VIEW_PARAMS }}
              />
            </div>
          }
          toolbarPortalTarget={toolbarPortalTarget}
          pageScrollParentRef={pageScroll ? dashboardScrollRef ?? undefined : undefined}
          renderLaneBody={({ rows, laneLabel, maxBodyHeightClass, maxBodyHeightPx, growToContent, scrollParentRef }) => (
            <ShippedLaneTable
              records={rows}
              loading={query.isLoading}
              isMobile={isMobile}
              selectMode={selectMode}
              selectedIds={selectedIds}
              selectedDetailId={selectedDetailId}
              onRowClick={handleRowClick}
              onToggle={toggle}
              maxBodyHeightClass={maxBodyHeightClass}
              maxBodyHeightPx={maxBodyHeightPx}
              growToContent={growToContent}
              scrollParentRef={scrollParentRef}
              emptyMessage={`No ${laneLabel.toLowerCase()} orders`}
            />
          )}
        />
      </TableDensityProvider>
    </TableColumnConfigProvider>
  );

  if (embedded) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface-card">
        {shippedTableInner}
        {loadMoreFooter}
      </div>
    );
  }

  const mainContent = shippedView === 'all' ? shippedAllInner : shippedBoardInner;

  return (
    <div className={pageScroll ? 'flex min-w-0 flex-col' : 'flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden'}>
      {mainContent}
      {loadMoreFooter}
    </div>
  );
}