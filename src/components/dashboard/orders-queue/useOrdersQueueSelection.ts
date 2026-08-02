'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useEventBridge } from '@/hooks';
import { getOpenShippedDetailsPayload } from '@/utils/events';
import type { ShippedOrder } from '@/lib/neon/orders-queries';

export interface UseOrdersQueueSelectionOptions {
  /** Records still in the queue — used to re-resolve the selection on data changes. */
  visibleRecords: ShippedOrder[];
  onOpenRecord?: (record: ShippedOrder) => void;
  onCloseRecord?: (record: ShippedOrder | null) => void;
}

export interface OrdersQueueSelection {
  selectedRecord: ShippedOrder | null;
  /** Toggle the open detail for a row (re-click closes it). */
  handleRowClick: (record: ShippedOrder) => void;
  /**
   * Open a record unconditionally. Exposed for the rail-selection model, where
   * the check-set is the single selection SoT and the open record is DERIVED
   * from it — the caller has already decided, so it needs the half of
   * `handleRowClick` that opens without the toggle-to-close branch.
   */
  openRecord: (record: ShippedOrder) => void;
  /** Close whatever is open (no-op when nothing is). */
  closeRecord: () => void;
}

/**
 * Owns the open-detail selection for the queue: which record is open, keeping
 * it in sync as the underlying data refreshes, and the cross-pane window-event
 * bridge (`open` / `close` shipped-details) that the detail panel drives.
 *
 * **Stepping is no longer here.** This hook used to carry one of five hand-typed
 * copies of `findIndex → ±1 → open`, listening on `navigate-shipped-details`
 * over a `displayedRecords` list it was handed separately from the one the grid
 * paints. Because that list was fold-BLIND while `QueueGroupRow` renders a
 * multi-line order collapsed, ↓ stepped into rows the operator could not see —
 * the panel and the grid disagreed about what "next" meant
 * (`record-cursor-unification-PLAN.md` §2.2). The grid now publishes its order
 * once via `usePublishRecordCursor`, and the panel/keyboard read that cursor;
 * the `displayedRecords` option went with the branch, having had no other reader.
 */
export function useOrdersQueueSelection({
  visibleRecords,
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

  const openRecord = useCallback((record: ShippedOrder) => {
    onOpenRecord?.(record);
    setSelectedRecord(record);
  }, [onOpenRecord]);

  const closeRecord = useCallback(() => {
    if (!selectedRecord) return;
    onCloseRecord?.(selectedRecord);
    setSelectedRecord(null);
  }, [onCloseRecord, selectedRecord]);

  const handleRowClick = useCallback((record: ShippedOrder) => {
    if (selectedRecord && Number(selectedRecord.id) === Number(record.id)) {
      closeRecord();
      return;
    }
    openRecord(record);
  }, [closeRecord, openRecord, selectedRecord]);

  // Cross-pane event bridge. Handlers are held in a ref by useEventBridge, so
  // these always read the latest selectedRecord closure without re-subscribing
  // on every change.
  useEventBridge({
    'open-shipped-details': (e) => {
      const payload = getOpenShippedDetailsPayload((e as CustomEvent<ShippedOrder>).detail);
      if (payload?.order) setSelectedRecord(payload.order);
    },
    'close-shipped-details': () => setSelectedRecord(null),
  });

  return { selectedRecord, handleRowClick, openRecord, closeRecord };
}
