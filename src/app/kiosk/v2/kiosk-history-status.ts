/**
 * Status → chip tone, for the History rail AND its detail.
 *
 * Callers: `KioskHistoryRail`, `KioskHistoryDetail`. Affected API: none.
 * Schemas: none — it reads the free-text `repair_service.status` and
 * `counter_transactions.status` strings as they are stored.
 *
 * ONE table, because the operator reads the rail's chip and the detail's chip
 * as the same mark. Two tables is how `Awaiting Parts` ends up amber in a list
 * and grey on the record it opens, which teaches the counter that the colour
 * means nothing.
 *
 * Both books share it on purpose: a repair's `Awaiting Parts` and a
 * transaction's `staged` say the same thing to the person at the counter —
 * *not finished* — so they get the same tone. The return values are `Badge`
 * variants (`src/components/ui/badge.tsx`).
 */

export type KioskHistoryStatusTone = 'success' | 'warning' | 'destructive' | 'secondary';

export function kioskHistoryStatusTone(status: string): KioskHistoryStatusTone {
  const s = status.trim().toLowerCase();
  if (s === 'picked up' || s === 'shipped' || s === 'done' || s === 'paid') return 'success';
  if (s === 'cancelled' || s === 'voided' || s === 'refunded') return 'destructive';
  if (s.startsWith('awaiting') || s === 'incoming shipment' || s === 'repaired, contact customer') {
    return 'warning';
  }
  return 'secondary';
}
