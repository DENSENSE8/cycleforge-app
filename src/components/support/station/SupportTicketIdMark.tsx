'use client';

/**
 * Compact ticket id mark for Support station chrome — last-8 digits, no `#`,
 * full id on copy. Lives in {@link StationMoreDetails} (top-right), not the
 * identity subject row.
 */

import { TicketChip } from '@/components/ui/CopyChip';
import { supportTicketIdFace } from '@/lib/support/ticket-refs';

export function SupportTicketIdMark({
  label,
  className,
}: {
  /** Provider-native label, e.g. `#175` or `175` — `#` is never shown. */
  label: string;
  className?: string;
}) {
  const { value, display } = supportTicketIdFace(label);
  return (
    <span
      className={className ? `inline-flex shrink-0 ${className}` : 'inline-flex shrink-0'}
      data-testid="support-ticket-id-mark"
    >
      <TicketChip value={value} display={display} dense />
    </span>
  );
}
