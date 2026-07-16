'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LinkedTicketsPanel } from '@/components/linkage/LinkedTicketsPanel';
import { Link2, Unlink } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { AddValueChipFace } from '@/components/ui/CopyChip';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/lib/toast';
import type { SupportContextBundle } from '@/lib/support/context-types';
import { TicketLinkPopover, invalidateSupportContextCaches } from './TicketLinkPopover';

/**
 * Closed-loop linkage strip + link/unlink affordances for the Support Context Hub.
 * Primary Kinetic Ledger action: dashed empty-slot chips (Link ticket / Link tracking).
 */
export function LinkageStrip({
  bundle,
  dense = false,
}: {
  bundle: SupportContextBundle;
  dense?: boolean;
}) {
  const qc = useQueryClient();
  const { has, isLoaded } = useAuth();
  const canZendesk = !isLoaded || has('integrations.zendesk');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [trackingDraft, setTrackingDraft] = useState('');
  const [trackingOpen, setTrackingOpen] = useState(false);
  const { linkage, ticket, linkable } = bundle;

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

  const linkTracking = useMutation({
    mutationFn: async (trackingNumber: string) => {
      const ticketId = ticket?.providerTicketId;
      if (ticketId == null) throw new Error('No ticket to attach tracking to');
      // `reference`, NOT `anchor`. The anchor path re-decides what the ticket is
      // ABOUT and throws 409 ("already linked to another item") whenever the
      // ticket already has one — which is every ticket that reached this strip
      // with a carton or order resolved. Attaching an extra STN must leave the
      // anchor alone. The route mints the STN from a raw tracking number here
      // exactly as the tracking anchor did, so pasting still works unchanged.
      const res = await fetch('/api/support/tickets/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId,
          reference: { trackingNumber },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || data?.details || 'Could not link tracking');
      }
      return data as { shipmentId: number; isPrimary: boolean; added: boolean };
    },
    onSuccess: () => {
      invalidateSupportContextCaches(qc);
      toast.success('Tracking linked');
      setTrackingDraft('');
      setTrackingOpen(false);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Could not link tracking');
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
            <span className="text-role-caption font-semibold text-text-muted">
              Ticket {ticket.label}
              {ticket.subject ? ` · ${ticket.subject}` : ''}
            </span>
            <Button
              size="sm"
              variant="ghost"
              icon={<Unlink />}
              loading={unlink.isPending}
              onClick={() => unlink.mutate()}
            >
              Unlink
            </Button>
          </div>
        ) : null}

        {canLinkTracking ? (
          <div className="relative flex flex-wrap items-center gap-2">
            {!trackingOpen ? (
              <DashedLinkChip
                label="Link tracking"
                onClick={() => setTrackingOpen(true)}
              />
            ) : (
              <form
                className="flex items-center gap-1.5 rounded-lg border border-dashed border-blue-400 bg-surface-canvas px-2 py-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  const trk = trackingDraft.trim();
                  if (!trk || linkTracking.isPending) return;
                  linkTracking.mutate(trk);
                }}
              >
                <input
                  value={trackingDraft}
                  onChange={(e) => setTrackingDraft(e.target.value)}
                  placeholder="Paste tracking…"
                  autoFocus
                  className="w-[11rem] bg-transparent text-role-caption font-semibold text-text-default outline-none placeholder:text-text-faint"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  type="submit"
                  loading={linkTracking.isPending}
                  disabled={!trackingDraft.trim()}
                >
                  Link
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  onClick={() => {
                    setTrackingOpen(false);
                    setTrackingDraft('');
                  }}
                >
                  Cancel
                </Button>
              </form>
            )}
          </div>
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
