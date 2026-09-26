import { ItemRecordQtyBadge } from '@/design-system/components/item-record';

/** Floor counted/expected qty — the receiving name for the shared item qty badge, whose implementation moved to… */
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
