'use client';

import type { ZendeskTicket } from '@/lib/zendesk';
import { ChevronLeft } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';
import { TicketSubjectField } from './TicketSubjectField';

/** Inline ticket title — one row, click-to-edit subject. */
export function SupportChatHeader({
  ticket,
  onBack,
  compact = false,
  readOnly = false,
}: {
  ticket: ZendeskTicket;
  onBack?: () => void;
  compact?: boolean;
  /** Station preview — same title row, no subject editor. */
  readOnly?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-1 bg-surface-card',
        compact ? 'min-h-8 px-3' : 'px-5 py-3.5',
      )}
    >
      {onBack ? (
        <IconButton
          icon={<ChevronLeft className="h-4 w-4" />}
          onClick={onBack}
          ariaLabel="Back to list"
          className="-ml-1 rounded-md p-1 hover:bg-surface-sunken lg:hidden"
        />
      ) : null}
      {readOnly ? (
        <h2 className="min-w-0 truncate text-role-body font-semibold text-text-default">
          {ticket.subject?.trim() || 'New support ticket'}
        </h2>
      ) : (
        <TicketSubjectField
          ticketId={ticket.id}
          subject={ticket.subject}
          compact={compact}
        />
      )}
    </div>
  );
}
