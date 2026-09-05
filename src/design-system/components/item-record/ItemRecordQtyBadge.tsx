import { qtyProgress } from '@/design-system/tokens/typography/presets';
import { cn } from '@/utils/_cn';
import type { ItemRecordQuantity } from './item-record-types';

export type ReceiveQtyState = 'open' | 'partial' | 'complete';

/** Listed minus got, never below zero. Over-got still reads as 0 remaining. */
export function receiveQtyRemaining(counted: number, expected: number): number {
  return Math.max(0, expected - counted);
}

export function receiveQtyState(counted: number, expected: number): ReceiveQtyState {
  if (counted <= 0) return 'open';
  if (counted < expected) return 'partial';
  return 'complete';
}

/**
 * Quantity face for an item row. Three honest states, and they are different
 * claims — do not collapse them:
 *
 *   - receive + counted + expected → `got/listed` plus remaining (`0/1 · 1 left`)
 *   - counted + expected           → `2/3`, emerald once the count is satisfied
 *   - counted only                 → `2 counted` (nothing to satisfy)
 *   - expected only                → `3` (a record that states a quantity but counts
 *                                    nothing, e.g. a sales order line)
 *
 * Receiving copy says got / listed. Serial-unit `1/1` is one physical unit, not
 * PO receive. Never the inventory noun *received* (that is hop 2).
 */
export function ItemRecordQtyBadge({
  quantity,
  className,
}: {
  quantity?: ItemRecordQuantity | null;
  /** Override size/tone tokens — e.g. `text-role-micro` on a dense eyebrow. */
  className?: string;
}) {
  const qtyClass = cn(qtyProgress, 'normal-case tracking-normal', className);
  const counted = quantity?.counted;
  const expected = quantity?.expected;
  const hasCounted = typeof counted === 'number' && Number.isFinite(counted);
  const hasExpected =
    typeof expected === 'number' && Number.isFinite(expected) && expected > 0;

  if (!hasCounted && !hasExpected) {
    return <span className={cn(qtyClass, 'text-text-faint')}>—</span>;
  }
  if (!hasCounted) {
    return <span className={cn(qtyClass, 'text-text-soft')}>{expected}</span>;
  }
  if (!hasExpected) {
    return <span className={cn(qtyClass, 'text-text-soft')}>{counted} counted</span>;
  }

  const got = counted as number;
  const listed = expected as number;

  if (quantity?.receive) {
    const remaining = receiveQtyRemaining(got, listed);
    const state = receiveQtyState(got, listed);
    const tone =
      state === 'open'
        ? 'text-text-soft'
        : state === 'partial' || got > listed
          ? 'text-text-warning'
          : 'text-emerald-600/80';
    return (
      <span
        className={cn(qtyClass, tone)}
        data-qty-receive="true"
        data-qty-state={state}
        data-qty-remaining={remaining}
        aria-label={`${got} got of ${listed} listed, ${remaining} remaining`}
      >
        {got}/{listed}
        <span aria-hidden="true"> · {remaining} left</span>
      </span>
    );
  }

  const done = got >= listed;
  return (
    <span className={cn(qtyClass, done ? 'text-emerald-600/80' : 'text-text-soft')}>
      {got}/{listed}
    </span>
  );
}
