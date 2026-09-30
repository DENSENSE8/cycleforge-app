import { ticketStatusFace } from '../tokens/ticket-status';
import { chipLabel, microBadge } from '../tokens/typography/presets';
import { cn } from '@/utils/_cn';

/**
 * A helpdesk ticket's status as a colour pill — New sky, Open rose, Pending
 * amber, On-hold purple, Solved emerald, Closed neutral — so the status reads
 * by colour before its word (owner 2026-09-30). `sm` (the micro badge face)
 * sits on an 11px row line; `md` (the chip label face) on a record line.
 * Paints nothing when there is no status.
 */
export function TicketStatusPill({
  status,
  size = 'sm',
  className,
}: {
  /** `support_tickets.status_cache`, as stored (any case). */
  status: string | null | undefined;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const face = ticketStatusFace(status);
  if (!face) return null;
  return (
    <span
      data-ticket-status={status?.trim().toLowerCase()}
      className={cn(
        'inline-flex shrink-0 items-center whitespace-nowrap rounded-full ring-1 ring-inset',
        size === 'sm' ? cn(microBadge, 'h-4 px-1.5 leading-none') : cn(chipLabel, 'h-5 px-2'),
        face.pill,
        face.ring,
        className,
      )}
    >
      {face.label}
    </span>
  );
}
