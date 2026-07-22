'use client';

import { useCallback, useMemo } from 'react';
import { getDaysLateNullable } from '@/utils/date';
import { useStaffNameMap } from '@/hooks/useStaffNameMap';
import { useUIModeOptional } from '@/design-system/providers/UIModeProvider';
import { useTableSelectMode } from '@/hooks/useTableSelectMode';
import { useColumnOrder } from '@/components/ui/table-column-config/useColumnOrder';
import { OrderSearchEmptyState } from '@/components/dashboard/OrderSearchEmptyState';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { LedgerGrid } from '@/design-system/components/grid';
import { useQueueDisplaySort } from '@/hooks/useQueueDisplaySort';
import {
  ORDERS_QUEUE_COLUMNS,
  orderedOrdersQueueColumns,
  sanitizeOrdersQueueColumnOrder,
  type OrdersQueueColumnKey,
} from '@/lib/dashboard-order-row-layout';
import { toast } from '@/lib/toast';
import {
  normalizePersonName,
  resolveRowStatus,
  type QueueRowRecord,
} from './helpers';
import { OrdersQueueTableRow } from './OrdersQueueTableRow';
import { OrdersQueueColumnHeader } from './OrdersQueueColumnHeader';
import { QueueGroupRow } from './QueueGroupRow';
import { useOrdersQueueRows } from './useOrdersQueueRows';
import { useOrdersQueueSelection } from './useOrdersQueueSelection';

interface OrdersGridViewProps {
  records: ShippedOrder[];
  loading: boolean;
  searchValue: string;
  onOpenRecord: (record: ShippedOrder) => void;
  onCloseRecord?: (record: ShippedOrder | null) => void;
  onClearSearch: () => void;
  emptyMessage?: string;
  searchEmptyTitle?: string;
  searchResultLabel?: string;
  clearSearchLabel?: string;
  /** Pencil multi-select. Shares the page's selection scope + action bar. */
  selectMode?: boolean;
  selectionScope: string;
}

/**
 * **Pending grid** — the To Ship spreadsheet, composed from {@link LedgerGrid}.
 *
 * Frozen identity pane (`select · Product`) is active: `scrollX` lets
 * date…tracking scroll under the pinned pane. Opaque zebra so nothing bleeds
 * through frozen cells. Column tracks use the SoT defaults (no live resize /
 * column-config chrome). Absolute ship-by date is a per-row **Date** column —
 * no floating day bands.
 */
export function OrdersGridView({
  records,
  loading,
  searchValue,
  onOpenRecord,
  onCloseRecord,
  onClearSearch,
  emptyMessage = 'No orders to ship',
  searchEmptyTitle = 'Order not found',
  searchResultLabel = 'orders to ship',
  clearSearchLabel = 'Show All Pending Orders',
  selectMode = false,
  selectionScope,
}: OrdersGridViewProps) {
  const { isMobile } = useUIModeOptional();
  const { getStaffName } = useStaffNameMap();
  const { sort } = useQueueDisplaySort();

  const { orderGroupsByDate, displayedRecords } = useOrdersQueueRows({
    records,
    sort,
    queueMode: 'fulfillment',
  });

  const { selectedRecord, handleRowClick } = useOrdersQueueSelection({
    visibleRecords: displayedRecords,
    displayedRecords,
    onOpenRecord,
    onCloseRecord,
  });

  const getRowId = useCallback((r: ShippedOrder) => Number(r.id), []);
  // The grid view keeps selection LIVE (Airtable-style left gutter): checkboxes
  // toggle the set; row-body click opens the record.
  const { selectedIds, toggle } = useTableSelectMode<ShippedOrder>({
    scope: selectionScope,
    selectMode: true,
    rows: displayedRecords,
    getId: getRowId,
  });

  // Per-staff drag-reordered column order (locked `select · title` enforced by
  // the sanitizer; stale keys — e.g. the retired notes column — drop out).
  const { order: persistedOrder, setOrder, resetOrder } = useColumnOrder('orders');
  const orderedColumns = useMemo(() => orderedOrdersQueueColumns(persistedOrder), [persistedOrder]);
  const isCustomOrder = useMemo(
    () =>
      orderedColumns.some((col, i) => col.key !== ORDERS_QUEUE_COLUMNS[i]?.key),
    [orderedColumns],
  );

  const handleReorderColumns = useCallback(
    (nextMovable: OrdersQueueColumnKey[]) => {
      // Persist the FULL sanitized order (locked keys re-prepended) so the
      // stored pref is self-describing.
      setOrder(sanitizeOrdersQueueColumnOrder(nextMovable));
    },
    [setOrder],
  );

  const handleResetColumnOrder = useCallback(() => {
    resetOrder();
    toast.success('Column order reset');
  }, [resetOrder]);

  const handleRowAction = useCallback(
    (record: ShippedOrder, _event?: { shiftKey: boolean }) => {
      // Always-on left-gutter select: checkbox toggles; row body opens detail.
      handleRowClick(record);
    },
    [handleRowClick],
  );

  // Gutter checkbox → toggle this row's selection without opening the record.
  const handleToggleSelect = useCallback(
    (record: ShippedOrder, event: { shiftKey: boolean }) => {
      toggle(Number(record.id), event.shiftKey);
    },
    [toggle],
  );

  // Render one leaf row. Mirrors OrdersQueueTable's builder but always virtualized
  // (no layout animation) and with an OPAQUE stripe for the frozen pane.
  const renderRow = useCallback(
    (record: ShippedOrder, stripeIndex: number) => {
      const r = record as QueueRowRecord;
      const testerName =
        (r.tested_by_name as string | undefined) ||
        (r.tester_name as string | undefined) ||
        getStaffName(r.tested_by as number | null | undefined) ||
        getStaffName(r.tester_id as number | null | undefined);
      const packerName =
        (r.packed_by_name as string | undefined) ||
        (r.packer_name as string | undefined) ||
        getStaffName(r.packed_by as number | null | undefined) ||
        getStaffName(r.packer_id as number | null | undefined);
      const outOfStockValue = String(r.out_of_stock || '').trim();
      const notesValue = String(r.notes || '').trim();
      return (
        <OrdersQueueTableRow
          key={record.id}
          disableEnterAnimation
          disableLayoutAnimation
          opaqueStripe
          gridSkin
          onToggleSelect={handleToggleSelect}
          record={r}
          isSelected={selectedRecord?.id === record.id || selectedIds.has(Number(record.id))}
          selectMode={selectMode}
          isChecked={selectedIds.has(Number(record.id))}
          isMobile={isMobile}
          useAlternateStripe={stripeIndex % 2 === 0}
          testerDisplay={normalizePersonName(testerName)}
          packerDisplay={normalizePersonName(packerName)}
          testerId={(r.tested_by as number | null) ?? (r.tester_id as number | null)}
          packerId={(r.packed_by as number | null) ?? (r.packer_id as number | null)}
          rowStatus={resolveRowStatus(r, 'fulfillment')}
          hasOutOfStock={outOfStockValue !== ''}
          outOfStockValue={outOfStockValue}
          notesValue={notesValue}
          daysLate={getDaysLateNullable(r.deadline_at as string | null | undefined)}
          queueMode="fulfillment"
          columns={orderedColumns}
          onRowClick={handleRowAction}
        />
      );
    },
    [getStaffName, selectMode, selectedIds, selectedRecord, isMobile, handleRowAction, handleToggleSelect, orderedColumns],
  );

  const renderGroup = useCallback(
    (group: Parameters<typeof QueueGroupRow>[0]['group'], baseStripeIndex: number) => (
      <QueueGroupRow
        group={group}
        baseStripeIndex={baseStripeIndex}
        isMobile={isMobile}
        gridSkin
        columns={orderedColumns}
        renderRow={renderRow}
      />
    ),
    [isMobile, renderRow, orderedColumns],
  );

  return (
    // Outer shell owns border + radius + overflow clip so the LedgerGrid scroll
    // surface keeps overflow-x/y-auto (freeze + virtualization).
    <div
      data-testid="pending-grid-body"
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border-subtle bg-surface-card"
    >
      <LedgerGrid<ShippedOrder>
        scrollX
        gridSkin="airtable"
        data-testid="pending-grid-scroll"
        orderGroupsByDate={orderGroupsByDate}
        isSearching={Boolean(searchValue.trim())}
        columnHeader={
          <OrdersQueueColumnHeader
            isMobile={isMobile}
            selectMode={selectMode}
            selectionScope={selectionScope}
            gridSkin
            columns={orderedColumns}
            onReorderColumns={handleReorderColumns}
            onResetColumnOrder={isCustomOrder ? handleResetColumnOrder : undefined}
          />
        }
        renderRow={renderRow}
        renderGroup={renderGroup}
        emptyState={
          <div className="mx-auto max-w-xs rounded-xl border border-dashed border-border-soft bg-surface-canvas px-4 py-6 text-center text-role-caption text-text-muted">
            {loading ? 'Loading…' : emptyMessage}
          </div>
        }
        searchEmptyState={
          <OrderSearchEmptyState
            query={searchValue}
            title={searchEmptyTitle}
            resultLabel={searchResultLabel}
            clearLabel={clearSearchLabel}
            onClear={onClearSearch}
          />
        }
      />
    </div>
  );
}
