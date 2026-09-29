'use client';

/**
 * The painted queue read as the floor reads it — ORDER STATUS only (owner
 * 2026-09-28): Urgent · To pick · Picked · Packed · Out of stock. Late reads
 * off the card's ship-by corner and the Late section; No bin was dropped
 * (measured: it held for 173 of 173 orders — nothing is allocated, so it
 * carried no information).
 */

import { useMemo } from 'react';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { LIFECYCLE, type LifecycleState } from '@/design-system/tokens/lifecycle';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS, recordStateCodeClass } from '@/design-system/tokens/industrial-record';
import { cn } from '@/utils/_cn';
import { QUEUE_STATUS_CHIPS, emptyQueueCounts } from '@/lib/orders/to-ship-queue';
import { recordState } from './outbound-orders-ledger-state';

/** The status one row answers to — for the triage cut's `rowStatusKeys`. */
export function queueRowStatusKeys(record: ShippedOrder): LifecycleState[] {
  return [recordState(record)];
}
function useQueueCounts(records: readonly ShippedOrder[]): Record<LifecycleState, number> {
  return useMemo(() => {
    const counts = emptyQueueCounts();
    for (const record of records) counts[recordState(record)] += 1;
    return counts;
  }, [records]);
}

/** The empty split pane: one fact row per status. */
export function OrderQueueSummary({ records }: { records: readonly ShippedOrder[] }) {
  const counts = useQueueCounts(records);
  return (
    <div className="flex flex-1 flex-col bg-mode-bar text-mode-ink" data-testid="order-queue-summary">
      <p className={cn(RECORD_LABEL_CLASS, 'border-b border-mode-ink px-4 py-2 text-mode-muted')}>No order selected</p>
      <div className="flex flex-col px-4">
        {QUEUE_STATUS_CHIPS.map((state) => (
          <EvidenceFactRow key={state} label={LIFECYCLE[state].code}>
            <span className="flex items-center justify-between">
              <span className={cn(RECORD_LABEL_CLASS, recordStateCodeClass(LIFECYCLE[state]))}>{LIFECYCLE[state].label}</span>
              <span className={cn(RECORD_ID_CLASS, 'tabular-nums')}>{counts[state]}</span>
            </span>
          </EvidenceFactRow>
        ))}
      </div>
      <p className={cn(RECORD_LABEL_CLASS, 'mt-auto border-t border-mode-edge p-4 text-mode-muted')}>
        Open a record · J / K to step · Esc to close
      </p>
    </div>
  );
}

/** In place: the same counts as one status-bar readout. */
export function OrderQueueSummaryLine({ records }: { records: readonly ShippedOrder[] }) {
  const counts = useQueueCounts(records);
  return (
    <span className={cn(RECORD_LABEL_CLASS, 'flex min-w-0 items-center gap-3 truncate')} data-testid="order-queue-summary-line">
      {QUEUE_STATUS_CHIPS.map((state) => (
        <span key={state} className={recordStateCodeClass(LIFECYCLE[state])} title={LIFECYCLE[state].label}>
          {LIFECYCLE[state].code} <span className="tabular-nums">{counts[state]}</span>
        </span>
      ))}
    </span>
  );
}
