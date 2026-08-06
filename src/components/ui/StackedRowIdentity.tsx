'use client';

/**
 * Stacked list-row identity — **title leads; typed keys sit on a second row**.
 *
 * SoT for picker / sync / subject rows where the scannable string is a long
 * title (ticket subject, product name, sheet exception line) and the durable
 * handles are typed {@link CopyChip}s (ticket # · order # · PO · tracking).
 *
 * Golden consumers: Move photos carton targets, Orders import `SyncListRow`,
 * Support ticket subject + `#`. Ticket pick / link lists compose thin
 * {@link TicketPickRow} on top of this. Never park a short durable key on the
 * title row's trailing (or leading mono `#{id}`) edge — that steals width from
 * the title and invents a third identity grammar beside this stack and the rail
 * `PaneHeaderLabel` short key.
 *
 * Detail: `.claude/rules/source-of-truth.md` → Stacked row identity.
 */

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';

export function StackedRowIdentity({
  title,
  keys,
  trailing,
  className,
}: {
  /** Leading title / subject — truncates or clamps inside the slot. */
  title: ReactNode;
  /** Second-row typed keys — `TicketChip` · `OrderIdChip` · `PoChip` · `TrackingChip`. */
  keys: ReactNode;
  /** Optional trailing control (select chevron, clear, status badge). */
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('flex min-w-0 w-full items-start gap-2', className)}
      data-stacked-row-identity=""
    >
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <div className="min-w-0 w-full">{title}</div>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">{keys}</div>
      </div>
      {trailing ? <div className="shrink-0 pt-0.5">{trailing}</div> : null}
    </div>
  );
}
