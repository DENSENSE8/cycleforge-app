/**
 * How a visit's counter money verbs read on paper and in History — one
 * wording for the receipt and the History face, so the two never disagree.
 *
 *   adjust → `Adjusted from $5.59 · Price match`
 *   comp   → `Comp · Goodwill`
 *   custom → `Custom amount`
 *
 * Callers: `KioskHistoryDetail`, `visit-receipt`. Pure.
 */

import { AUDIT_ACTION } from '@/lib/audit-logs';
import type { CounterVisitAuditEntry, CounterVisitLineAdjustment } from './read-visit';

function money(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

export function visitLineAdjustmentText(adjustment: CounterVisitLineAdjustment | null): string | null {
  if (!adjustment) return null;
  const reason = adjustment.reason.trim();
  if (adjustment.kind === 'comp') return reason ? `Comp · ${reason}` : 'Comp';
  if (adjustment.kind === 'custom') return 'Custom amount';
  const from =
    adjustment.originalUnitAmountCents == null
      ? 'Adjusted'
      : `Adjusted from ${money(adjustment.originalUnitAmountCents)}`;
  return reason ? `${from} · ${reason}` : from;
}

/** One History row for a money verb on the visit: what, which line, why, who. */
export interface VisitMoneyEvent {
  id: number;
  label: 'Price change' | 'Comp' | 'Void';
  lineTitle: string | null;
  reason: string | null;
  staffName: string | null;
  at: string | null;
}

const LABEL: Record<string, VisitMoneyEvent['label']> = {
  [AUDIT_ACTION.COUNTER_LINE_PRICE_OVERRIDE]: 'Price change',
  [AUDIT_ACTION.COUNTER_LINE_COMP]: 'Comp',
  [AUDIT_ACTION.COUNTER_LINE_VOID]: 'Void',
};

function titleOf(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const title = (data as Record<string, unknown>).title;
  return typeof title === 'string' && title.trim() ? title.trim() : null;
}

/** The visit's price changes, comps and voids, oldest first; submits and checkouts are not line events. */
export function visitMoneyEvents(trail: readonly CounterVisitAuditEntry[]): VisitMoneyEvent[] {
  return trail.flatMap((entry) => {
    const label = LABEL[entry.action];
    if (!label) return [];
    return [
      {
        id: entry.id,
        label,
        lineTitle: titleOf(entry.before) ?? titleOf(entry.after),
        reason: entry.note?.trim() || null,
        staffName: entry.actorStaffName,
        at: entry.createdAt,
      },
    ];
  });
}
