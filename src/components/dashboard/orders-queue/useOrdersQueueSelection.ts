'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useEventBridge } from '@/hooks';
import { getOpenShippedDetailsPayload } from '@/utils/events';
import type { ShippedOrder } from '@/lib/neon/orders-queries';

interface UseOrdersQueueSelectionOptions {
  /** Records still in the queue — used to re-resolve the selection on data changes. */
  visibleRecords: ShippedOrder[];
  onOpenRecord?: (record: ShippedOrder) => void;
  onCloseRecord?: (record: ShippedOrder | null) => void;
}

interface OrdersQueueSelection {
  selectedRecord: ShippedOrder | null;
  /** Toggle the open detail for a row (re-click closes it). */
  handleRowClick: (record: ShippedOrder) => void;
  /** Open a record unconditionally. */
  openRecord: (record: ShippedOrder) => void;
  /** Close whatever is open (no-op when nothing is). */
  closeRecord: () => void;
}

/** Owns the open-detail selection for the queue: */
export function useOrdersQueueSelection({
  visibleRecords,
  onOpenRecord,
  onCloseRecord,
}: UseOrdersQueueSelectionOptions): OrdersQueueSelection {
  const [selectedRecord, setSelectedRecord] = useState<ShippedOrder | null>(null);
  /** The selected id, but only once we have actually seen it in this queue. */
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
    // Not in the visible set.
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
