/**
 * Industrial ledger state helpers — pure. The row, the group parent, the
 * evidence column and the SSR stand-in read an order's `LIFECYCLE` key here,
 * through {@link orderLifecycleState} (the one stage → key mapping).
 */

import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { resolveRowWorkflowStage, type QueueRowRecord } from '@/components/dashboard/orders-queue/helpers';
import { orderLifecycleState } from '@/lib/order-lifecycle';
import type { LifecycleState } from '@/design-system/tokens/lifecycle';

/** Worst-first — a group's shared spine wears its worst child. */
const STATE_RANK: Readonly<Record<LifecycleState, number>> = {
  outOfStock: 0,
  urgent: 1,
  packed: 2,
  picked: 3,
  toPick: 4,
  shipped: 5,
  onHold: 6,
};

export function recordState(record: ShippedOrder): LifecycleState {
  const r = record as QueueRowRecord;
  // Scanned out at the dock = shipped, whatever the pre-dock stage last read
  // (same rule as `workStageLifecycleState`'s SCANNED_OUT). Without it a
  // shipped order opened from Search / Shipped wore "TPK · To pick".
  if (record.ship_confirmed_at?.trim()) return 'shipped';
  return orderLifecycleState(resolveRowWorkflowStage(r), { urgent: Boolean(r.is_urgent) });
}

export function worstState(states: readonly LifecycleState[]): LifecycleState {
  return states.reduce<LifecycleState>(
    (worst, s) => (STATE_RANK[s] < STATE_RANK[worst] ? s : worst),
    'toPick',
  );
}

export function initials(title: string): string {
  return (
    title
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'CF'
  );
}
