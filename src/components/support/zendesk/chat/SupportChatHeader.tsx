'use client';

import type { ZendeskTicket } from '@/lib/zendesk';
import { ChevronLeft } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';
import { TicketSubjectField } from './TicketSubjectField';

/**
 * Inline ticket title — one row, click-to-edit subject.
 *
 * Ticket # / opened date live on the host (carton context, `/support`
 * identity). Restating them under this title duplicated that chrome.
 * `/support` still hides this entirely (`hideTitle` + `hideRequesterBand`)
 * because the split header owns the subject.
 */
export function SupportChatHeader({
  ticket,
  onBack,
  compact = false,
  hideTitle = false,
  hideRequesterBand = false,
}: {
  ticket: ZendeskTicket;
  onBack?: () => void;
  /** Station ticket tab — tighter padding + smaller type. */
  compact?: boolean;
  /**
   * Hide the editable subject — for a host that already renders it.
   * `/support` does: the thread's split header carries the subject.
   */
  hideTitle?: boolean;
  /**
   * Kept so `/support` can hide this whole strip together with {@link hideTitle}.
   * Requester chrome is gone from this header; the flag no longer changes layout.
   */
  hideRequesterBand?: boolean;
}) {
  if (hideRequesterBand && hideTitle) return null;
  if (hideTitle) return null;

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
      <TicketSubjectField
        ticketId={ticket.id}
        subject={ticket.subject}
        compact={compact}
      />
    </div>
  );
}
