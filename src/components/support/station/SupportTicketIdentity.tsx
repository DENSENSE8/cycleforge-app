'use client';

/**
 * Support · Tickets identity — the condensed one-row bookmark for the ticket
 * focus pane, mounted in {@link StationContextBar}'s `identity` slot (the "pack
 * identity equivalent" the bar contract allows).
 *
 * A ticket is a genuinely different entity than a carton/order — it has no PO#,
 * tracking, or listing — so this is a **new sibling that composes the shared
 * StationContextBar SoT**, not a fork of `CartonContextCard`. It keeps the house
 * one-row anatomy (title → meta → chips) + the CopyChip ticket vocabulary + a
 * status dot via `HoverTooltip`.
 *
 * Dual-`#` identity (Phase 3): the operator PRIMARY is the internal registry id
 * (`#42`) resolved from the SupportContext bundle; the provider-native id
 * (`#9395`) is the SECONDARY chip, labelled by the runtime provider name — never
 * a hardcoded vendor string.
 */

import { useZendeskTicketBundle } from '@/hooks/useZendeskQueries';
import { TicketChip } from '@/components/ui/CopyChip';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { primaryTicketLabel, secondaryProviderLabel } from '@/lib/support/ticket-refs';
import type { SupportContextTicket } from '@/lib/support/context-types';
import { cn } from '@/utils/_cn';

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
  /** `?ticket=` value — a transient placeholder for the primary `#` while the bundle loads. */
  fallbackId: number;
}) {
  const providerTicketId = ticket?.providerTicketId ?? null;
  // Live status/subject from the provider conversation; shares the
  // ['zendesk','ticket',id] query cache with the Ticket tab (no extra round-trip).
  // Disabled for internal tickets (no provider id).
  const { data: liveBundle } = useZendeskTicketBundle(providerTicketId);
  const live = liveBundle?.ticket;

  const status = String(live?.status ?? ticket?.status ?? '').toLowerCase();
  const dot = STATUS_DOT[status] ?? { cls: 'bg-border-soft', label: ticket ? 'Unknown' : 'Loading…' };
  const subject = (live?.subject ?? ticket?.subject ?? '').trim() || '(no subject)';

  // Operator PRIMARY = internal registry id; provider-native id is SECONDARY.
  const internalId = ticket?.id ?? fallbackId;
  const primary = primaryTicketLabel(internalId);
  const secondary = ticket
    ? secondaryProviderLabel({ provider: ticket.provider, externalTicketId: ticket.externalTicketId })
    : null;

  return (
    <div className="flex min-w-0 w-full items-center gap-2 px-0.5">
      <HoverTooltip label={dot.label} focusable={false}>
        <span className={cn('h-2 w-2 shrink-0 rounded-full', dot.cls)} aria-hidden />
      </HoverTooltip>
      <TicketChip value={primary} display={primary} />
      {secondary ? (
        <HoverTooltip label={`${ticket?.providerLabel ?? 'Provider'} ticket ${secondary}`} focusable={false}>
          <span className="shrink-0 rounded bg-surface-strong/30 px-1.5 py-0.5 text-role-eyebrow font-black uppercase tracking-widest text-text-soft">
            {secondary}
          </span>
        </HoverTooltip>
      ) : null}
      <p className="min-w-0 flex-1 truncate text-role-caption font-bold text-text-default">
        {subject}
      </p>
    </div>
  );
}
