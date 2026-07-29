'use client';

/**
 * Support · Tickets identity — condensed bookmark for {@link StationContextBar}.
 *
 * Status · subject on the left; compact {@link SupportTicketIdMark} on the right
 * (last-4, no `#`). Open / details / close live in {@link StationMoreDetails}.
 */

import { useZendeskTicketBundle } from '@/hooks/useZendeskQueries';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
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
  const providerTicketId = ticket?.providerTicketId ?? null;
  const { data: liveBundle } = useZendeskTicketBundle(providerTicketId);
  const live = liveBundle?.ticket;

  const status = String(live?.status ?? ticket?.status ?? '').toLowerCase();
  const dot = STATUS_DOT[status] ?? { cls: 'bg-border-soft', label: ticket ? 'Unknown' : 'Loading…' };
  const subject = (live?.subject ?? ticket?.subject ?? '').trim() || '(no subject)';
  const displayLabel = resolveSupportTicketDisplayLabel({
    id: ticket?.id,
    label: ticket?.label,
    provider: ticket?.provider,
    externalTicketId: ticket?.externalTicketId,
    providerTicketId: ticket?.providerTicketId,
    fallbackId,
  });

  return (
    <div className="flex min-w-0 w-full items-center gap-2 px-0.5">
      <HoverTooltip label={dot.label} focusable={false}>
        <span className={cn('h-2 w-2 shrink-0 rounded-full', dot.cls)} aria-hidden />
      </HoverTooltip>
      <p className="min-w-0 flex-1 truncate text-role-caption font-semibold text-text-default">
        {subject}
      </p>
      <SupportTicketIdMark label={displayLabel} />
    </div>
  );
}
