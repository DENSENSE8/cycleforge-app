'use client';

/**
 * Dashboard · Shipped — week-bucketed packer-log list on the shared outbound
 * spreadsheet (`useOrdersSpreadsheet` / DataTable). Day bands and swimlane
 * board are retired; Date is a per-row column.
 *
 * Rebuilt 2026-08-29 (Phase 4a, `docs/todo/one-sheet-table-sot-PLAN.md`). The
 * feed, the filters, the grouping and the empty state are the pre-teardown ones
 * — they were never the thing being rewritten. What changed is the mount: the
 * row count it used to print in a footer is the bottom bar's job.
 *
 * ## The history well
 *
 * Promoted to its own desk at `/shipping/shipped` on 2026-08-30, this lane is
 * RAIL-LESS (Pattern E) — there is no left column for the shipped filter form
 * to live in any more. So the period control and the refinements ride one
 * compact row directly above the rows they scope: date/week · type · carrier ·
 * status · needs-attention. Find stays on the table's own toolbar, because
 * there is one find field per surface and {@link DataTable} owns it.
 *
 * The well is the WINDOW, and the window is the point: history opens on the
 * current week, never on an unbounded archive.
 *
 * A window is exactly what makes the find a SERVER question. The week arrives
 * as a page of the newest scans, so a substring pass over what landed could
 * only ever search page one — and it answered "no shipped orders found" for
 * rows it had never been handed. The text rides the fetch key instead
 * (`/api/packerlogs?q=`, week bounds kept, page bound dropped) and the desk
 * declares `answeredBy: 'server'` so nothing re-narrows that reply. It stays
 * session-local state either way: a find is never a navigation.
 *
 * `embedded` (mobile tech / packer) keeps the bare table — those hosts draw
 * their own chrome and scope the feed by props, not by URL.
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
import { useRecordCursorKeyboard } from '@/hooks/useRecordCursorKeyboard';
import { ShippedTableEmptyState } from '@/components/shipped/dashboard-table/ShippedTableEmptyState';
import { DataTable, type DataTableFilterOption } from '@/components/tables/DataTable';
import { useOrdersSpreadsheet } from '@/components/dashboard/orders-queue/useOrdersSpreadsheet';
import { OrderStatusTrailStage } from '@/components/orders/OrderStatusTrailOverlay';
import { useShippedFilterActions } from '@/components/shipping/shipped-filter/useShippedFilterActions';
import {
  CARRIERS,
  STATUS_CATEGORIES,
  TYPE_ITEMS,
  type ShippedTypeFilter,
} from '@/components/shipping/shipped-filter/shipped-filter-constants';
import {
  parseISODate,
  shippedWeekFilterActive,
  toISODate,
} from '@/lib/shipping/shipped-filter/shipped-filter-params';
import type {
  CarrierCode,
  ShipmentStatusCategory,
} from '@/components/shipping/ShipmentStatusBadge';
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
   * Kept for embedded callers that filter packer-log weeks by outbound state.
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
  const { orderedRecords } = useShippedTableGrouping(derivedRecords);
  const { handleRowClick } = useShippedDetailsSelection();

  // The spreadsheet hook publishes the cursor (it owns grouping + folds);
  // this lane only turns the keyboard on. `embedded` still gates it so a nested
  // mount does not bind a second ambient listener.
  useRecordCursorKeyboard({ enabled: !embedded, scope: 'record' });

  const refine = useShippedFilterActions();
  const weekFilterActive = shippedWeekFilterActive({
    allDates: filters.allDates,
    hasDateRange: filters.hasDateRange,
    anyCarrierFilter: filters.anyCarrierFilter,
  });

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

  /*
   * No second chrome row (operator ruling 2026-08-31).
   *
   * A period pill, a Needs-attention toggle and three selects used to sit on
   * their own band above the table — a second toolbar for one surface, which is
   * the fork the ONE `DataTable` toolbar exists to end. Every one of those
   * refinements narrows the SAME row set, so by the 2026-08-30 ruling they are
   * filters, and filters live in the one filter control.
   *
   * The period folds in as PRESETS rather than a picker: the menu takes data,
   * never JSX, and "this week / last week / this month" is what the pill's
   * stepper was actually being used for.
   */
  /*
   * The date chip is the house range picker.
   *
   * `useShippedFilterActions` already owns `dateFrom`/`dateTo` as URL state and
   * exposes them as a `DateRange`, so this is a straight hand-off — the control
   * gets the live range and the setter, and free-form selection lands in the
   * same two params a deep link uses.
   */
  const dateMenu = useMemo(() => {
    const range = filters.allDates
      ? undefined
      : filters.hasDateRange
        ? {
            from: parseISODate(filters.dateFrom),
            to: parseISODate(filters.dateTo),
          }
        : weekFilterActive
          ? {
              from: parseISODate(filters.weekRange.startStr),
              to: parseISODate(filters.weekRange.endStr),
            }
          : undefined;
    return {
      range,
      onRangeChange: (next: { from?: Date; to?: Date } | undefined) => {
        if (!next?.from) {
          filters.clearPeriod();
          return;
        }
        const from = toISODate(next.from);
        const to = toISODate(next.to ?? next.from);
        if (from && to) filters.setPeriodRange(from, to);
      },
    };
  }, [filters, weekFilterActive]);

  const shippedFilter = useMemo(() => {
    const options: DataTableFilterOption[] = [
      {
        id: 'period:week',
        group: 'Period',
        label: 'This week',
        active: weekFilterActive,
      },
      {
        id: 'attention',
        group: 'Needs attention',
        label: 'Exceptions only',
        active: refine.exceptionsOnly,
      },
      ...TYPE_ITEMS.filter((t) => t.id !== 'all').map((t) => ({
        id: `type:${t.id}`,
        group: 'Type',
        label: t.label,
        active: refine.typeFilter === t.id,
        identity: t.id === 'fba' ? { kind: 'platform' as const, label: 'Amazon', value: 'fba' } : undefined,
      })),
      ...CARRIERS.map((c) => ({
        id: `carrier:${c.value}`,
        group: 'Carrier',
        label: c.label,
        active: refine.carrier === c.value,
        identity: { kind: 'carrier' as const, label: c.label, value: c.value },
      })),
      ...STATUS_CATEGORIES.map((c) => ({
        id: `status:${c.value}`,
        group: 'Status',
        label: c.label,
        active: refine.statusCategory === c.value,
      })),
    ];
    return {
      options,
      onToggle: (id: string) => {
        if (id === 'period:week') {
          if (weekFilterActive) filters.clearPeriod();
          else filters.setPeriodWeek(0);
          return;
        }
        if (id === 'attention') return refine.toggleExceptions();
        const [kind, value] = id.split(':');
        if (kind === 'type') {
          refine.setTypeFilter(
            (refine.typeFilter === value ? 'all' : value) as ShippedTypeFilter,
          );
          return;
        }
        if (kind === 'carrier') {
          refine.setCarrier(refine.carrier === value ? null : (value as CarrierCode));
          return;
        }
        if (kind === 'status') {
          refine.setStatus(
            refine.statusCategory === value ? null : (value as ShipmentStatusCategory),
          );
        }
      },
      onClearAll: () => {
        refine.clearAll();
        filters.clearPeriod();
      },
    };
  }, [filters, refine, weekFilterActive]);

  const sheet = useOrdersSpreadsheet({
    ariaLabel: 'Shipped orders',
    records: gridRecords,
    loading: query.isLoading,
    searchValue: filters.search,
    /*
     * The week fetch already answered this text in SQL (`?q=`), so the engine's
     * substring pass must stand down. Left on, it would re-run a narrower rule
     * over the server's reply — fewer facts, one window — and could only take
     * rows AWAY from an answer that had already looked past the page bound.
     */
    searchAnsweredBy: 'server',
    onOpenRecord,
    onCloseRecord: () => undefined,
    onClearSearch: filters.clearSearch,
    emptyMessage: 'No shipped orders',
    firstRunEmpty: idleEmptyNode,
    searchEmptyTitle,
    searchResultLabel,
    clearSearchLabel,
    queueMode: 'shipped',
    selectMode,
    selectionScope: DASHBOARD_ORDERS_SELECTION_SCOPE,
    railSelection,
    'data-testid': 'shipped-grid-body',
  });

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-canvas">
      {/* The period picker sits with the rows it scopes, not on a chrome row. */}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col" data-testid="column-table-body">
        <OrderStatusTrailStage>
          <DataTable
            {...sheet}
            search={{
              value: filters.search,
              onChange: filters.setSearch,
              placeholder: 'Filter shipped…',
              answeredBy: 'server',
              // Hold the body while the searched week is in flight: the rows on
              // screen still answer the PREVIOUS text, and painting them under
              // the new one reads as a result set, not as a stale frame.
              pending: query.isFetching,
            }}
            filter={shippedFilter}
            dateMenu={dateMenu}
            exportFilename="shipped.csv"
          />
        </OrderStatusTrailStage>
      </div>
      {loadMoreFooter}
    </div>
  );
}
