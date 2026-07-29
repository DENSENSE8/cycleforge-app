'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useEventBridge } from '@/hooks';
import { getOpenShippedDetailsPayload } from '@/utils/events';
import type { ShippedOrder } from '@/lib/neon/orders-queries';

export interface UseOrdersQueueSelectionOptions {
  /** Records still in the queue — used to re-resolve the selection on data changes. */
  visibleRecords: ShippedOrder[];
  /** Flat on-screen order — used for up/down keyboard navigation. */
  displayedRecords: ShippedOrder[];
  onOpenRecord?: (record: ShippedOrder) => void;
  onCloseRecord?: (record: ShippedOrder | null) => void;
}

export interface OrdersQueueSelection {
  selectedRecord: ShippedOrder | null;
  /** Toggle the open detail for a row (re-click closes it). */
  handleRowClick: (record: ShippedOrder) => void;
}

/**
 * Owns the open-detail selection for the queue: which record is open, keeping
 * it in sync as the underlying data refreshes, and the cross-pane window-event
 * bridge (`open` / `close` / `navigate` shipped-details) that the detail panel
 * and keyboard shortcuts drive.
 */
export function useOrdersQueueSelection({
  visibleRecords,
  displayedRecords,
  onOpenRecord,
  onCloseRecord,
}: UseOrdersQueueSelectionOptions): OrdersQueueSelection {
  const [selectedRecord, setSelectedRecord] = useState<ShippedOrder | null>(null);
  /**
   * The selected id, but only once we have actually seen it in this queue.
   * "Absent from the visible rows" means two very different things — the row was
   * removed while the operator watched it, or the rows simply are not here yet —
   * and only the first should close the detail.
   */
  const seenSelectedIdRef = useRef<number | null>(null);

  // Re-resolve (or drop) the selection whenever the visible records change so
  // the open detail tracks the latest row object — or closes if it's gone.
  useEffect(() => {
    if (!selectedRecord) {
      seenSelectedIdRef.current = null;
      return;
    }
    const selectedId = Number(selectedRecord.id);
    const nextSelected = visibleRecords.find((record) => Number(record.id) === selectedId);
    if (nextSelected) {
      seenSelectedIdRef.current = selectedId;
      if (nextSelected !== selectedRecord) setSelectedRecord(nextSelected);
      return;
    }
    // Not in the visible set. Closing here is only correct for a row that WAS in
    // this queue and left it (deleted, shipped on, filtered out under the
    // operator). On a deep link or a reload, `?openOrderId=` resolves and opens
    // the record before the queue's own fetch lands, so this effect used to fire
    // on boot: it dispatched close-shipped-details, whose handler strips
    // `openOrderId` from the URL — and the record the operator reloaded onto
    // silently vanished, taking the durable selection with it.
    if (seenSelectedIdRef.current === selectedId) {
      onCloseRecord?.(selectedRecord);
      setSelectedRecord(null);
      seenSelectedIdRef.current = null;
    }
  }, [onCloseRecord, selectedRecord, visibleRecords]);

  const handleRowClick = useCallback((record: ShippedOrder) => {
    if (selectedRecord && Number(selectedRecord.id) === Number(record.id)) {
      onCloseRecord?.(selectedRecord);
      setSelectedRecord(null);
      return;
    }
    onOpenRecord?.(record);
    setSelectedRecord(record);
  }, [onCloseRecord, onOpenRecord, selectedRecord]);

  // Cross-pane event bridge. Handlers are held in a ref by useEventBridge, so
  // these always read the latest selectedRecord / displayedRecords closures
  // without re-subscribing on every change.
  useEventBridge({
    'open-shipped-details': (e) => {
      const payload = getOpenShippedDetailsPayload((e as CustomEvent<ShippedOrder>).detail);
      if (payload?.order) setSelectedRecord(payload.order);
    },
    'close-shipped-details': () => setSelectedRecord(null),
    'navigate-shipped-details': (e) => {
      const direction = (e as CustomEvent<{ direction?: 'up' | 'down' }>).detail?.direction;
      if (!selectedRecord || displayedRecords.length === 0) return;

      const currentIndex = displayedRecords.findIndex(
        (record) => Number(record.id) === Number(selectedRecord.id),
      );
      if (currentIndex < 0) return;

      const step = direction === 'up' ? -1 : 1;
      const nextRecord = displayedRecords[currentIndex + step];
      if (!nextRecord) return;

      onOpenRecord?.(nextRecord);
      setSelectedRecord(nextRecord);
    },
  });

  return { selectedRecord, handleRowClick };
}
