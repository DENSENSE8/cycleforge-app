'use client';

/**
 * Support · Tickets identity — the dense identity block in the thread's
 * {@link PaneHeader} (Workbench branch `service-workspace`).
 *
 * Status dot · eyebrow carrying the short durable key · subject as the scannable
 * value; compact {@link SupportTicketIdMark} trailing. Open / details / close are
 * the header's icon actions.
 *
 * Composes {@link PaneHeaderLabel} rather than hand-rolling the type ladder —
 * the right-rail inspector law caps rail identity at caption density and bans a
 * wrapping hero title, and that rule belongs in one place. Until 2026-08-01 this
 * was a `StationContextBar` bookmark and had to be allowlisted in the station
 * chrome guard as the one sanctioned non-carton identity fork; it is not a fork
 * of anything now, because a ticket header and a carton header are simply
 * different SoTs.
 */

import { useZendeskTicketBundle } from '@/hooks/useZendeskQueries';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { TicketSubjectField } from '@/components/support/zendesk/chat/TicketSubjectField';
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
  // The `?ticket=` value IS the provider ticket id on `/support` — fall back to
  // it rather than waiting on the context bundle. Without this the identity row
  // read "(no subject)" for the whole first paint, and since the chat header
  // below no longer restates the subject, that was the operator's only copy of
  // it. Same resolution `SupportTicketFocus` uses for its own live bundle, so
  // both read one cache entry.
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
    <div className="flex min-w-0 w-full items-center gap-2 px-0.5">
      <HoverTooltip label={dot.label} focusable={false}>
        <span className={cn('h-2 w-2 shrink-0 rounded-full', dot.cls)} aria-hidden />
      </HoverTooltip>
      {/* The subject's ONE home on `/support`. It is click-to-edit here rather
          than in the Ticket tab's chat header, which used to draw the same
          string one row below this — the same fact twice, editable in only one
          of the two. Same field either way; never a second implementation. */}
      <TicketSubjectField ticketId={providerTicketId} subject={subject} compact />
      <SupportTicketIdMark label={displayLabel} />
    </div>
  );
}
