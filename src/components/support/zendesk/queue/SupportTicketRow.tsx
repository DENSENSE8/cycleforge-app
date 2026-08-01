'use client';

import { timeAgo } from '@/utils/_date';
import { cn } from '@/utils/_cn';
import { QUEUE_ROW } from '@/components/ui/queue-row-chrome';
import { priorityBadge, statusBadge, statusDot } from '../badges';

/**
 * One ticket row — house one-row anatomy: status dot → subject → priority chip,
 * with a status/id/time meta eyebrow beneath. Selection is background + ring only,
 * from the queue-row chrome SoT, so it never size-shifts.
 *
 * THE ticket row. Both consumers compose it: the full queue in `SupportTicketsBoard`
 * and the recent dock in `SupportTicketsRecentRail`, which carried a byte-identical
 * copy of this markup until 2026-08-01. (`badges.ts` had already de-forked the
 * `STATUS_DOT` map out of those same two files; the markup fork was left standing.)
 *
 * The one thing that genuinely differed between them is the trailing instant — the
 * queue shows when the ticket last changed, the dock shows when this operator opened
 * it — so `at` is a prop rather than something read off a ticket here.
 *
 * Takes primitives, not a `ZendeskTicket`: the recent dock's rows come from
 * localStorage (`RecentTicket`), not the API. (Unrelated to `SupportTicketRow` in
 * `src/lib/support/tickets.ts`, which is a DB row type that happens to share the name.)
 */
export function SupportTicketRow({
  id,
  subject,
  status,
  priority,
  at,
  selected,
  onSelect,
}: {
  id: number;
  subject: string | null;
  status?: string | null;
  priority?: string | null;
  /** ISO instant rendered at the row's trailing edge. */
  at: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const sb = statusBadge(status);
  const pb = priorityBadge(priority);
  const dot = statusDot(status);

  return (
    // ds-raw-button: text-left queue row (status dot + subject + #id), not a standard action Button
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'ds-raw-button block w-full py-2 text-left transition',
        QUEUE_ROW.px,
        selected ? QUEUE_ROW.selectedClass : 'hover:bg-surface-hover',
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn('h-2 w-2 shrink-0 rounded-full', dot)} />
        <span className="min-w-0 flex-1 truncate text-role-caption font-semibold text-text-default">
          {subject || '(no subject)'}
        </span>
        {pb ? (
          <span
            className={cn(
              'shrink-0 rounded px-1 py-0.5 text-role-micro uppercase tracking-widest',
              pb.className,
            )}
          >
            {pb.label}
          </span>
        ) : null}
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 pl-4 text-role-eyebrow uppercase tracking-widest text-text-soft">
        <span>{sb.label}</span>
        <span>·</span>
        <span>#{id}</span>
        <span className="ml-auto">{timeAgo(at)}</span>
      </div>
    </button>
  );
}
