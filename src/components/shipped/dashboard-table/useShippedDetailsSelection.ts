'use client';

import { useCallback, useState } from 'react';
import { useEventBridge } from '@/hooks';
import { dispatchCloseShippedDetails, dispatchOpenShippedDetails, getOpenShippedDetailsPayload } from '@/utils/events';
import { toDetailRecord, getDetailId } from '@/components/shipped/shipped-record-mappers';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import type { DerivedPackerRecord } from '@/lib/shipped-records';

export interface ShippedDetailsSelection {
  /** Detail id of the currently open row, or null. */
  selectedDetailId: number | null;
  /** Toggle the open detail for a row (re-click closes it). */
  handleRowClick: (record: DerivedPackerRecord) => void;
}

/**
 * Owns the open-detail selection for the shipped table. Tracks which row's
 * detail is open (by detail id), and wires the cross-pane window-event bridge
 * (`open` / `close` shipped-details) that the detail panel drives — dispatching
 * open/close back out for siblings.
 *
 * **Stepping is no longer here, and the double-step went with it.** This hook
 * carried a `navigate-shipped-details` listener over `orderedRecords`
 * (`DerivedPackerRecord[]`) while the `OrdersGridView` this table mounts runs
 * `useOrdersQueueSelection`, which listened to the SAME event over the same rows
 * in a different shape (`ShippedOrder[]`). One keypress therefore ran two
 * independent steps on this lane. Both branches are deleted in favour of the one
 * cursor the grid publishes (`record-cursor-unification-PLAN.md` §1.1–1.2); a
 * spec that encoded the double-step was encoding the bug.
 *
 * Takes no arguments — `orderedRecords` had no other reader here.
 */
export function useShippedDetailsSelection(): ShippedDetailsSelection {
  const [selectedDetailId, setSelectedDetailId] = useState<number | null>(null);

  const handleRowClick = useCallback((record: DerivedPackerRecord) => {
    const detail = toDetailRecord(record);
    const detailId = getDetailId(record);
    if (selectedDetailId !== null && detailId === selectedDetailId) {
      dispatchCloseShippedDetails();
      return;
    }
    dispatchOpenShippedDetails(detail, 'shipped');
  }, [selectedDetailId]);

  // Handlers are held in a ref by useEventBridge, so they always read the
  // latest selectedDetailId without re-subscribing.
  useEventBridge({
    'open-shipped-details': (e) => {
      const payload = getOpenShippedDetailsPayload((e as CustomEvent<ShippedOrder>).detail);
      const nextId = Number(payload?.order?.id);
      setSelectedDetailId(Number.isFinite(nextId) ? nextId : null);
    },
    'close-shipped-details': () => setSelectedDetailId(null),
  });

  return { selectedDetailId, handleRowClick };
}
