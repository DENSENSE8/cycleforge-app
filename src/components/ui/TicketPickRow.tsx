'use client';

/** Ticket pick-row identity — subject leads; typed {@link TicketChip} on the keys row. */

import type { ReactNode } from 'react';
import { TicketChip } from '@/components/ui/CopyChip';
import { StackedRowIdentity } from '@/components/ui/StackedRowIdentity';
import { supportTicketIdFace } from '@/lib/support/ticket-refs';
import { cn } from '@/utils/_cn';

export function TicketPickRow({
  ticketId,
  subject,
  meta,
  trailing,
  className,
  subjectClassName,
  emptySubject = 'Untitled ticket',
}: {
  /** Provider / display ticket id — face strips `#`, shows last-8. */
  ticketId: number | string;
  subject: string | null | undefined;
  /** Extra keys beside the TicketChip (status · priority · open link). */
  meta?: ReactNode;
  /** Trailing control (date · Change · Link). */
  trailing?: ReactNode;
  className?: string;
  subjectClassName?: string;
  emptySubject?: string;
}) {
  const face = supportTicketIdFace(String(ticketId));
  const title = (subject ?? '').trim() || emptySubject;

  return (
    <StackedRowIdentity
      className={className}
      title={
        <p
          className={cn(
            'truncate text-role-caption font-semibold text-text-default',
            subjectClassName,
          )}
          title={title}
        >
          {title}
        </p>
      }
      keys={
        <>
          <TicketChip value={face.value} display={face.display} dense />
          {meta}
        </>
      }
      trailing={trailing}
    />
  );
}
