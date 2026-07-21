'use client';

import { useCallback, type CSSProperties } from 'react';
import { getDaysLateNullable } from '@/utils/date';
import { useStaffNameMap } from '@/hooks/useStaffNameMap';
import { useUIModeOptional } from '@/design-system/providers/UIModeProvider';
import { useTableSelectMode } from '@/hooks/useTableSelectMode';
import { OrderSearchEmptyState } from '@/components/dashboard/OrderSearchEmptyState';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { LedgerGrid } from '@/design-system/components/grid';
import { ordersQueueColumnVars } from '@/lib/dashboard-order-row-layout';
import { useColumnWidths } from '@/components/ui/table-column-config/useColumnWidths';
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
 * **Pending → Grid view** — the flat, full-width spreadsheet sibling to the
 * vertical shelf-board, composed from the house {@link LedgerGrid} primitive.
 *
 * This is the surface where the frozen identity pane (`select · status · Product`)
 * is finally *active*: `scrollX` lets qty…tracking scroll horizontally under the
 * pinned pane. Rows use an OPAQUE zebra (`opaqueStripe`) so nothing bleeds through
 * the frozen cells. Column widths / visibility persist via the same `orders`
 * `staff_preferences` store as every other consumer (providers are inherited from
 * the enclosing {@link UnshippedShelfBoard}).
 *
 * Intentionally self-contained (its own `renderRow`) so Stage 1 touches none of
 * the live `OrdersQueueTable` code paths; the small row-builder overlap is retired
 * when `OrdersQueueTable` migrates onto `LedgerGrid` in Stage 2.
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
  const { widths, setWidth } = useColumnWidths('orders');

  const { orderGroupsByDate, displayedRecords } = useOrdersQueueRows({
    records,
    sort: 'priority',
    queueMode: 'fulfillment',
  });

  const { selectedRecord, handleRowClick } = useOrdersQueueSelection({
    visibleRecords: displayedRecords,
    displayedRecords,
    onOpenRecord,
    onCloseRecord,
  });

  const getRowId = useCallback((r: ShippedOrder) => Number(r.id), []);
  // The grid view keeps selection LIVE regardless of the pencil (Airtable-style
  // hover-select): the gutter checkboxes toggle the set even when `selectMode` is
  // off, so `useTableSelectMode` tracks + broadcasts unconditionally here. The
  // pencil (`selectMode`) still governs whether a row-BODY click toggles vs opens.
  const { selectedIds, toggle } = useTableSelectMode<ShippedOrder>({
    scope: selectionScope,
    selectMode: true,
    rows: displayedRecords,
    getId: getRowId,
  });

  const handleRowAction = useCallback(
    (record: ShippedOrder, event?: { shiftKey: boolean }) => {
      if (selectMode) {
        toggle(Number(record.id), event?.shiftKey ?? false);
        return;
      }
      handleRowClick(record);
    },
    [selectMode, toggle, handleRowClick],
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
          onRowClick={handleRowAction}
        />
      );
    },
    [getStaffName, selectMode, selectedIds, selectedRecord, isMobile, handleRowAction, handleToggleSelect],
  );

  const renderGroup = useCallback(
    (group: Parameters<typeof QueueGroupRow>[0]['group'], baseStripeIndex: number) => (
      <QueueGroupRow
        group={group}
        baseStripeIndex={baseStripeIndex}
        isMobile={isMobile}
        gridSkin
        renderRow={renderRow}
      />
    ),
    [isMobile, renderRow],
  );

  const columnVars = ordersQueueColumnVars(widths) as CSSProperties;

  return (
    <LedgerGrid<ShippedOrder>
      scrollX
      gridSkin="airtable"
      data-testid="pending-grid-body"
      columnVars={columnVars}
      orderGroupsByDate={orderGroupsByDate}
      isSearching={Boolean(searchValue.trim())}
      columnHeader={
        <OrdersQueueColumnHeader
          isMobile={isMobile}
          selectMode={selectMode}
          selectionScope={selectionScope}
          onResizeColumn={setWidth}
          gridSkin
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
  );
}
