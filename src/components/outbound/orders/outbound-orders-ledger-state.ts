/**
 * Industrial ledger state helpers — pure. The row, the group parent, the
 * evidence column and the SSR stand-in read an order's `LIFECYCLE` key here,
 * through {@link orderLifecycleState} (the one stage → key mapping).
 */

import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { resolveRowWorkflowStage, type QueueRowRecord } from '@/components/dashboard/orders-queue/helpers';
import { orderLifecycleState } from '@/lib/order-lifecycle';
import { formatOutboundStoragePath } from '@/lib/shipping/outbound-storage-path';
import type { LifecycleState } from '@/design-system/tokens/lifecycle';

/** Worst-first — a group's shared spine wears its worst child. */
const STATE_RANK: Readonly<Record<LifecycleState, number>> = {
  outOfStock: 0,
  urgent: 1,
  packed: 2,
  ready: 3,
  shipped: 4,
};

export function recordState(record: ShippedOrder): LifecycleState {
  const r = record as QueueRowRecord;
  return orderLifecycleState(resolveRowWorkflowStage(r), { urgent: Boolean(r.is_urgent) });
}

export function worstState(states: readonly LifecycleState[]): LifecycleState {
  return states.reduce<LifecycleState>(
    (worst, s) => (STATE_RANK[s] < STATE_RANK[worst] ? s : worst),
    'ready',
  );
}

/**
 * A seed group's WHERE: every child's live allocation paths, deduped in
 * stable order, plus how many lines have nowhere to pick from. The parent
 * never guesses one bin for a multi-line order, and a partly-unallocated
 * order says so rather than reading as fully located.
 */
export function groupLocation(rows: readonly ShippedOrder[]): {
  path: string | null;
  unassigned: number;
} {
  const path = formatOutboundStoragePath(rows.flatMap((row) => row.storage_locations ?? []));
  const unassigned = rows.filter((row) => !formatOutboundStoragePath(row.storage_locations)).length;
  return { path, unassigned };
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
