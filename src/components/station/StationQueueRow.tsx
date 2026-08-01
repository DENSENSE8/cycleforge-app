'use client';

import { SerialChip } from '@/components/ui/CopyChip';
import { OrdersQueueTableRow } from '@/components/dashboard/orders-queue/OrdersQueueTableRow';
import { STATION_HISTORY_GRID_CAPABILITIES } from '@/components/station/station-history-capabilities';
import { resolveStationSource, SOURCE_DOT_BG, SOURCE_DOT_LABEL } from '@/utils/source-dot';
import type { QueueRowRecord } from '@/components/dashboard/orders-queue/helpers';
import type { OrdersQueueColumn } from '@/lib/dashboard-order-row-layout';
import type { StationSourceKind } from '@/lib/station/record-to-queue-row';

/**
 * `StationQueueRow` — the converged station row: a Tech/Packer log rendered
 * through the SAME {@link OrdersQueueTableRow} the Unshipped board uses
 * (station-table-unification-plan §Phase 2/7, success criterion #1). The record
 * is already mapped to a {@link QueueRowRecord} by `record-to-queue-row`; here we
 * only supply the station-specific chrome the queue row leaves to the caller: the
 * SOURCE dot (platform origin) as its `rowStatus`, and — for Tech — the serial
 * chip in the 4th `serialChip` column (Packer rows omit it; their FNSKU already
 * rides the tracking column via the mapper). Reusing the queue row is what gives
 * the station benches selection checkboxes, keyboard focus, and deep-link anchors
 * for free.
 */
export function StationQueueRow({
  record,
  index,
  rowIndex,
  queueMode,
  selectMode,
  isChecked,
  isSelected,
  isMobile,
  columns,
  onToggleSelect,
  onRowClick,
}: {
  record: QueueRowRecord;
  index: number;
  /** Absolute row index inside the LedgerGrid `role="table"`. Supplying it is
   *  what makes the row claim `role="row"` + `aria-selected` instead of
   *  doubling as a `role="checkbox"` — the gutter checkbox owns selection. */
  rowIndex?: number;
  queueMode: StationSourceKind;
  selectMode: boolean;
  isChecked: boolean;
  isSelected: boolean;
  isMobile: boolean;
  /**
   * Visible column tracks, ALREADY resolved by the parent table through
   * `useGridColumnVisibility` with its own `tableId` ('tech' | 'packer').
   *
   * The station benches are the one place `OrdersQueueTableRow` renders outside
   * a LedgerGrid, and they DO have a live per-staff column config (the ⋮
   * TableOptionsMenu writes `staff_preferences.tableColumns[tableId].hidden`).
   * Resolving upstream is what keeps that working now that the row no longer
   * asks `useIsColumnHidden()` per cell — and it removes the whole track rather
   * than leaving the empty ruled band the old path produced.
   */
  columns?: readonly OrdersQueueColumn[];
  /** Left-gutter checkbox — toggles selection without opening the row. */
  onToggleSelect?: (event: { shiftKey: boolean }) => void;
  onRowClick: (record: QueueRowRecord, event?: { shiftKey: boolean }) => void;
}) {
  const src = resolveStationSource({
    orderId: record.order_id,
    accountSource: record.account_source,
    trackingType: record.tracking_type,
    scanRef:
      (typeof record.scan_ref === 'string' && record.scan_ref ? record.scan_ref : null) ??
      record.shipping_tracking_number ??
      '',
  });
  const rowStatus = {
    dot: SOURCE_DOT_BG[src.dotType],
    label: SOURCE_DOT_LABEL[src.dotType],
    description: SOURCE_DOT_LABEL[src.dotType],
    pill: 'bg-surface-canvas text-text-muted ring-border-soft',
  };
  const serialChip =
    queueMode === 'tech' ? <SerialChip value={String(record.serial_number || '')} width="w-fit max-w-full" /> : undefined;

  return (
    <OrdersQueueTableRow
      record={record}
      rowIndex={rowIndex}
      isSelected={isSelected}
      selectMode={selectMode}
      isChecked={isChecked}
      isMobile={isMobile}
      columns={columns}
      capabilities={STATION_HISTORY_GRID_CAPABILITIES}
      useAlternateStripe={index % 2 === 1}
      testerDisplay="---"
      packerDisplay="---"
      testerId={null}
      packerId={null}
      rowStatus={rowStatus}
      serialChip={serialChip}
      hasOutOfStock={false}
      notesValue={String(record.notes || '')}
      daysLate={null}
      disableEnterAnimation
      onToggleSelect={
        onToggleSelect
          ? (_rec, event) => onToggleSelect(event)
          : undefined
      }
      onRowClick={(_rec, event) => onRowClick(record, event)}
    />
  );
}
