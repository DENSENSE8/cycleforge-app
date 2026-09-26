'use client';

/** Support · Tickets identity — the dense identity block in the thread's {@link PaneHeader} (Workbench branch `service-workspace`). */

import { useZendeskTicketBundle } from '@/hooks/useZendeskQueries';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { StackedRowIdentity } from '@/components/ui/StackedRowIdentity';
import { TicketSubjectField } from '@/components/support/zendesk/chat/TicketSubjectField';
import {
  TicketPrioritySelect,
  TicketStatusSelect,
} from '@/components/support/zendesk/chat/SupportTicketFields';
import { resolveSupportTicketDisplayLabel } from '@/lib/support/ticket-refs';
import type { SupportContextTicket } from '@/lib/support/context-types';
import { cn } from '@/utils/_cn';
import { SupportTicketIdMark } from './SupportTicketIdMark';

/** Helpdesk status → semantic dot tone (mirrors the lifecycle-dot discipline). */
const STATUS_DOT: Record<string, { cls: string; label: string }> = {
  new: { cls: 'bg-blue-500', label: 'New' },
  open: { cls: 'bg-rose-500', label: 'Open' },
  pending: { cls: 'bg-amber-500', label: 'Pending' },
  hold: { cls: 'bg-violet-500', label: 'On hold' },
  solved: { cls: 'bg-emerald-500', label: 'Solved' },
  closed: { cls: 'bg-border-emphasis', label: 'Closed' },
};

export function SupportTicketIdentity({
  ticket,
  fallbackId,
}: {
  /** Resolved ticket identity from the SupportContext bundle (both ids + provider). */
  ticket: SupportContextTicket | null;
  /** `?ticket=` value — provider/display id while the bundle loads. */
  fallbackId: number;
}) {
  // The `?ticket=` value IS the provider ticket id on `/support` — fall back to it rather than waiting on the context bundle.
  const providerTicketId = ticket?.providerTicketId ?? fallbackId;
  const { data: liveBundle } = useZendeskTicketBundle(providerTicketId);
  const live = liveBundle?.ticket;

  const status = String(live?.status ?? ticket?.status ?? '').toLowerCase();
  const dot = STATUS_DOT[status] ?? { cls: 'bg-border-soft', label: ticket ? 'Unknown' : 'Loading…' };
  const subject = (live?.subject ?? ticket?.subject ?? '').trim();
  const displayLabel = resolveSupportTicketDisplayLabel({
    id: ticket?.id,
    label: ticket?.label,
    provider: ticket?.provider,
    externalTicketId: ticket?.externalTicketId,
    providerTicketId: ticket?.providerTicketId,
    fallbackId,
  });

  return (
    <StackedRowIdentity
      className="px-0.5"
      title={
        <div className="flex min-w-0 w-full items-center gap-2">
          {/* Status leads — the dot's old position, now the control itself. The
              dot survives only as the loading/unknown face, where there is no
              ticket to set a status on. */}
          {live ? (
            <div className="shrink-0">
              <TicketStatusSelect ticket={live} size="rail" />
            </div>
          ) : (
            <HoverTooltip label={dot.label} focusable={false}>
              <span className={cn('h-2 w-2 shrink-0 rounded-full', dot.cls)} aria-hidden />
            </HoverTooltip>
          )}
          {/* The subject's ONE home on `/support`. Never a second renderer in
              the Ticket tab chat header (`hideTitle`). */}
          <TicketSubjectField ticketId={providerTicketId} subject={subject} compact />
          {live ? (
            <div className="shrink-0">
              <TicketPrioritySelect ticket={live} size="rail" />
            </div>
          ) : null}
        </div>
      }
      keys={<SupportTicketIdMark label={displayLabel} />}
    />
  );
}
