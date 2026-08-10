'use client';

import { timeAgo } from '@/utils/_date';
import { cn } from '@/utils/_cn';
import { QUEUE_ROW } from '@/components/ui/queue-row-chrome';
import { TicketPickRow } from '@/components/ui/TicketPickRow';
import { priorityBadge, statusBadge, statusDot } from '../badges';

/**
 * One ticket row — {@link TicketPickRow} / {@link StackedRowIdentity} SoT:
 * subject leads; typed {@link TicketChip} on the keys row (never mono `#{id}`).
 * Status · priority sit beside the chip; age trails. Leading status dot stays
 * outside the stack (queue chrome).
 *
 * Host is `div role=button` (not `<button>`) so TicketChip copy buttons nest
 * without invalid HTML — same pattern as station RailRow / InventoryPulseSidebar.
 *
 * THE ticket row. Both consumers compose it: the full queue in `SupportTicketsBoard`
 * and the recent dock in `SupportTicketsRecentRail`.
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
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        'flex w-full cursor-pointer items-start gap-2 py-2 text-left transition',
        QUEUE_ROW.px,
        selected ? QUEUE_ROW.selectedClass : 'hover:bg-surface-hover',
      )}
    >
      <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', dot)} />
      <TicketPickRow
        className="min-w-0 flex-1"
        ticketId={id}
        subject={subject}
        emptySubject="(no subject)"
        meta={
          <>
            <span className="text-role-eyebrow uppercase tracking-widest text-text-soft">
              {sb.label}
            </span>
            {pb ? (
              <span
                className={cn(
                  'rounded px-1 py-0.5 text-role-micro uppercase tracking-widest',
                  pb.className,
                )}
              >
                {pb.label}
              </span>
            ) : null}
          </>
        }
        trailing={
          <span className="text-role-eyebrow uppercase tracking-widest text-text-soft">
            {timeAgo(at)}
          </span>
        }
      />
    </div>
  );
}
