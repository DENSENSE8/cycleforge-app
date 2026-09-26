import { qtyProgress } from '@/design-system/tokens/typography/presets';
import { cn } from '@/utils/_cn';
import type { ItemRecordQuantity } from './item-record-types';

/** Quantity face for an item row. */
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
  const done = (counted as number) >= (expected as number);
  return (
    <span className={cn(qtyClass, done ? 'text-emerald-600/80' : 'text-text-soft')}>
      {counted}/{expected}
    </span>
  );
}
