'use client';

/** The painted queue read as the floor reads it — what needs hands: */

import { useMemo } from 'react';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { daysLateOn } from '@/components/dashboard/orders-queue/useOrdersQueueFeed';
import type { QueueRowRecord } from '@/components/dashboard/orders-queue/helpers';
import { formatOutboundStoragePath } from '@/lib/shipping/outbound-storage-path';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { LIFECYCLE, STATE_TONE_CLASSES, type LifecycleState } from '@/design-system/tokens/lifecycle';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS, recordStateCodeClass } from '@/design-system/tokens/industrial-record';
import { cn } from '@/utils/_cn';
import { recordState } from './outbound-orders-ledger-state';

/** Summary order: the states that need hands first. */
const SUMMARY_STATES: readonly LifecycleState[] = ['outOfStock', 'urgent', 'ready', 'packed'];

interface QueueSummaryProps {
  records: readonly ShippedOrder[];
  todayKey: string;
}

function useQueueSummary({ records, todayKey }: QueueSummaryProps) {
  return useMemo(() => {
    const byState: Record<LifecycleState, number> = { ready: 0, urgent: 0, packed: 0, outOfStock: 0, shipped: 0, onHold: 0 };
    let late = 0;
    let unlocated = 0;
    for (const record of records) {
      byState[recordState(record)] += 1;
      const r = record as QueueRowRecord;
      const days = daysLateOn(
        todayKey,
        (r.deadline_at as string | null | undefined) || (r.ship_by_date as string | null | undefined),
      );
      if (days != null && days > 0) late += 1;
      if (!formatOutboundStoragePath(record.storage_locations)) unlocated += 1;
    }
    return { byState, late, unlocated };
  }, [records, todayKey]);
}

/** The empty split pane: one fact row per count. */
export function OrderQueueSummary(props: QueueSummaryProps) {
  const summary = useQueueSummary(props);
  return (
    <div className="flex flex-1 flex-col bg-mode-bar text-mode-ink" data-testid="order-queue-summary">
      <p className={cn(RECORD_LABEL_CLASS, 'border-b border-mode-ink px-4 py-2 text-mode-muted')}>No order selected</p>
      <div className="flex flex-col px-4">
        {SUMMARY_STATES.map((state) => (
          <EvidenceFactRow key={state} label={LIFECYCLE[state].code}>
            <span className="flex items-center justify-between">
              <span className={cn(RECORD_LABEL_CLASS, recordStateCodeClass(LIFECYCLE[state]))}>{LIFECYCLE[state].label}</span>
              <span className={cn(RECORD_ID_CLASS, 'tabular-nums')}>{summary.byState[state]}</span>
            </span>
          </EvidenceFactRow>
        ))}
        <EvidenceFactRow label="Late">
          <span className="flex items-center justify-between">
            <span className={cn(RECORD_LABEL_CLASS, STATE_TONE_CLASSES.danger.text)}>Past ship-by</span>
            <span className={cn(RECORD_ID_CLASS, 'tabular-nums')}>{summary.late}</span>
          </span>
        </EvidenceFactRow>
        <EvidenceFactRow label="No bin">
          <span className="flex items-center justify-between">
            <span className={cn(RECORD_LABEL_CLASS, 'text-mode-warn')}>Unassigned location</span>
            <span className={cn(RECORD_ID_CLASS, 'tabular-nums')}>{summary.unlocated}</span>
          </span>
        </EvidenceFactRow>
      </div>
      <p className={cn(RECORD_LABEL_CLASS, 'mt-auto border-t border-mode-edge p-4 text-mode-muted')}>
        Open a record · J / K to step · Esc to close
      </p>
    </div>
  );
}

/** In place: the same counts as one status-bar readout. */
export function OrderQueueSummaryLine(props: QueueSummaryProps) {
  const summary = useQueueSummary(props);
  return (
    <span className={cn(RECORD_LABEL_CLASS, 'flex min-w-0 items-center gap-3 truncate')} data-testid="order-queue-summary-line">
      {SUMMARY_STATES.map((state) => (
        <span key={state} className={recordStateCodeClass(LIFECYCLE[state])} title={LIFECYCLE[state].label}>
          {LIFECYCLE[state].code} <span className="tabular-nums">{summary.byState[state]}</span>
        </span>
      ))}
      <span className={STATE_TONE_CLASSES.danger.text} title="Past ship-by">
        Late <span className="tabular-nums">{summary.late}</span>
      </span>
      <span className="text-mode-warn" title="Unassigned location">
        No bin <span className="tabular-nums">{summary.unlocated}</span>
      </span>
    </span>
  );
}
