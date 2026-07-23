'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LinkedTicketsPanel } from '@/components/linkage/LinkedTicketsPanel';
import { Link2, Unlink } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { AddValueChipFace } from '@/components/ui/CopyChip';
import { TicketStnLinkPopover } from '@/components/support/link/TicketStnLinkPopover';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/lib/toast';
import type { SupportContextBundle } from '@/lib/support/context-types';
import { primaryTicketLabel, secondaryProviderLabel } from '@/lib/support/ticket-refs';
import { TicketLinkPopover, invalidateSupportContextCaches } from './TicketLinkPopover';

/**
 * Closed-loop linkage strip + link/unlink affordances for the Support Context Hub.
 * Primary Kinetic Ledger action: dashed empty-slot chips (Link ticket / Link tracking).
 */
export function LinkageStrip({
  bundle,
  dense = false,
  hideTicketEmbed = false,
}: {
  bundle: SupportContextBundle;
  dense?: boolean;
  /**
   * Support station Summary / Connections: ticket `#` lives on the Ticket tab +
   * identity bar only — keep unlink/link actions without embedding the number.
   */
  hideTicketEmbed?: boolean;
}) {
  const qc = useQueryClient();
  const { has, isLoaded } = useAuth();
  const canZendesk = !isLoaded || has('integrations.zendesk');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [trackingOpen, setTrackingOpen] = useState(false);
  const { linkage, ticket, linkable } = bundle;
  // Display label for unlink popovers — provider-native when present.
  const ticketPrimary = ticket
    ? (ticket.label ||
        secondaryProviderLabel({
          provider: ticket.provider,
          externalTicketId: ticket.externalTicketId,
        }) ||
        primaryTicketLabel(ticket.id))
    : null;

  const unlink = useMutation({
    mutationFn: async () => {
      if (!ticket?.providerTicketId || !linkable) {
        throw new Error('Nothing to unlink');
      }
      const sp = new URLSearchParams();
      sp.set('ticketId', String(ticket.providerTicketId));
      sp.set('anchorType', linkable.anchorType);
      if (linkable.anchorType === 'receiving') {
        sp.set('receivingId', String(linkable.receivingId ?? linkable.anchorId));
        if (linkable.lineId != null) sp.set('lineId', String(linkable.lineId));
      } else if (linkable.anchorType === 'tracking') {
        sp.set('tracking', linkable.trackingNumber ?? '');
      } else if (linkable.anchorType === 'shipment') {
        sp.set('shipmentId', String(linkable.anchorId));
      } else {
        sp.set('orderId', String(linkable.anchorId));
      }
      const res = await fetch(`/api/support/tickets/link?${sp.toString()}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Could not unlink');
      }
    },
    onSuccess: () => {
      invalidateSupportContextCaches(qc);
      toast.success('Ticket unlinked');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Could not unlink');
    },
  });

  const order = linkage.order?.orderId ?? null;
  const tracking =
    linkage.trackings.find((t) => t.isPrimary)?.tracking ??
    linkage.trackings[0]?.tracking ??
    linkable?.trackingNumber ??
    null;
  const serial = linkage.serials[0]?.serial ?? null;

  const canLinkTicket = Boolean(canZendesk && !ticket && linkable?.canLinkTicket);
  // `!tracking` USED to gate this, which meant the control vanished the moment a
  // ticket resolved ANY tracking — so a second STN could never be added from the
  // support side. ticket_links is many-per-ticket now (one anchor + N shipment
  // references), so the only real precondition is a ticket to attach to.
  const canLinkTracking = Boolean(canZendesk && ticket?.providerTicketId != null);
  const showTeachingEmpty = !order && !tracking && !ticket;

  return (
    <div className={dense ? 'space-y-2' : 'space-y-3'}>
      <LinkedTicketsPanel
        order={order}
        tracking={tracking}
        serial={serial}
        dense
        hideWhenEmpty={false}
        hideTickets
      />

      <div className="flex flex-wrap items-center gap-2">
        {canLinkTicket && linkable ? (
          <div className="relative">
            <DashedLinkChip
              label="Link ticket"
              onClick={() => setPickerOpen((o) => !o)}
              aria-expanded={pickerOpen}
            />
            {pickerOpen ? (
              <div className="absolute left-0 z-panelPopover mt-2 w-[min(100%,22rem)]">
                <TicketLinkPopover
                  linkable={linkable}
                  open={pickerOpen}
                  onClose={() => setPickerOpen(false)}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {ticket && linkable && canZendesk ? (
          <div className="flex items-center gap-2">
            {hideTicketEmbed ? null : (
              <span className="text-role-caption font-semibold text-text-muted">
                Ticket {ticketPrimary}
                {ticket.subject ? ` · ${ticket.subject}` : ''}
              </span>
            )}
            <Button
              size="sm"
              variant="ghost"
              icon={<Unlink />}
              loading={unlink.isPending}
              onClick={() => unlink.mutate()}
              aria-label={ticketPrimary ? `Unlink ticket ${ticketPrimary}` : 'Unlink ticket'}
            >
              Unlink
            </Button>
          </div>
        ) : null}

        {canLinkTracking ? (
          <DashedLinkChip
            label="Link tracking"
            onClick={() => setTrackingOpen(true)}
            aria-expanded={trackingOpen}
          />
        ) : null}
      </div>

      {canLinkTicket ? (
        <p className="text-role-caption text-text-faint">
          {showTeachingEmpty
            ? 'Link ticket #… to connect this carton or order.'
            : 'No ticket linked yet — use Link ticket to paste #id or search.'}
        </p>
      ) : canLinkTracking ? (
        <p className="text-role-caption text-text-faint">
          Paste tracking to close the loop with this ticket.
        </p>
      ) : showTeachingEmpty ? (
        <p className="text-role-caption text-text-faint">
          No linked order or tracking yet — paste a tracking number when linking a ticket.
        </p>
      ) : null}

      {trackingOpen && ticket?.providerTicketId != null ? (
        <TicketStnLinkPopover
          open
          onClose={() => setTrackingOpen(false)}
          ticketId={ticket.providerTicketId}
          ticketLabel={`Ticket ${ticketPrimary}`}
        />
      ) : null}
    </div>
  );
}

/** Dashed empty-slot chip — Kinetic Ledger “nothing here yet, click to add”. */
export function DashedLinkChip({
  label,
  onClick,
  'aria-expanded': ariaExpanded,
}: {
  label: string;
  onClick: () => void;
  'aria-expanded'?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={ariaExpanded}
      className="ds-raw-button inline-flex shrink-0 items-center rounded-md px-1.5 py-1 transition-colors hover:bg-surface-hover"
    >
      <AddValueChipFace
        label={label}
        icon={<Link2 className="h-3.5 w-3.5 shrink-0" />}
        size="chip"
      />
    </button>
  );
}
