import { ItemRecordQtyBadge } from '@/design-system/components/item-record';

/**
 * Floor counted/expected qty — the receiving name for the shared item qty
 * badge, whose implementation moved to `design-system/components/item-record`
 * (2026-08-22). Copy uses **counted**, never the inventory noun Received
 * (Unboxed ≠ Received).
 *
 * `ScannedBadge` used to live here too. It painted `expected/expected` for
 * read-only triage rows, which is not a different badge — it is the same
 * counted/expected claim with the count satisfied. `PoLineRow` now says that
 * in the record it hands down, so there is no second component to keep in sync.
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
    <ItemRecordQtyBadge quantity={{ counted: received, expected }} className={className} />
  );
}
