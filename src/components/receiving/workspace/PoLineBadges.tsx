import { ItemRecordQtyBadge } from '@/design-system/components/item-record';
import { receivingQty } from '@/lib/item-record/receiving-qty';

/**
 * Floor got/listed qty — the receiving name for the shared item qty badge
 * (2026-08-22). Copy uses **got** / **listed**, never the inventory noun
 * Received (that is hop 2). Serial-unit `1/1` does not mount this wrapper.
 */
export function ProgressBadge({
  received,
  expected,
  className,
}: {
  received: number;
  expected: number | null;
  /** Override size/tone tokens — e.g. `text-role-micro` on a dense eyebrow. */
  className?: string;
}) {
  return (
    <ItemRecordQtyBadge
      quantity={receivingQty({ quantity_received: received, quantity_expected: expected })}
      className={className}
    />
  );
}
