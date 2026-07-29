'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, X } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { IconButton } from '@/design-system/primitives/IconButton';
import { RightPaneOverlay } from '@/components/ui/RightPaneOverlay';
import { invalidateSupportContextCaches } from '@/components/support/context/TicketLinkPopover';
import { TicketPicker } from './TicketPicker';
import { useTicketSearch, type TicketCandidate } from './useTicketSearch';

interface Props {
  open: boolean;
  onClose: () => void;
  /** The STN being linked (shipping_tracking_numbers.id). */
  shipmentId: number;
  /** Display only — the tracking number for the header. */
  trackingNumber?: string | null;
  /** Fired with the linked ticket number (e.g. "#12345") on success. */
  onLinked?: (ticketNumber: string) => void;
}

/**
 * Link an existing support ticket to THIS shipment (STN).
 *
 * Shipment-side direction: the operator is looking at a shipment and picks a
 * ticket. The ticket-side direction (looking at a ticket, adding STNs to it)
 * lives in the support hub's LinkageStrip.
 *
 * Composes the shared {@link TicketPicker} in `reference` mode, so a ticket that
 * is already anchored to a carton or order stays pickable — attaching an extra
 * shipment does not re-anchor it. That is the whole point of the many-STN model:
 * one ticket, N shipments (split shipments, re-ships, multi-box claims).
 *
 * Deliberately NOT the claim modal: no create-mode, no photo step, no seller
 * message, no NAS backup. Those are receiving-claim concerns.
 */
export function StnTicketLinkModal({
  open,
  onClose,
  shipmentId,
  trackingNumber,
  onLinked,
}: Props) {
  const qc = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useTicketSearch({
    open,
    enabled: open,
    buildUrl: (query) => {
      if (!shipmentId) return null;
      const params = new URLSearchParams({
        anchorType: 'shipment',
        shipmentId: String(shipmentId),
        mode: 'reference',
      });
      if (query) params.set('query', query);
      return `/api/support/tickets/link?${params}`;
    },
  });

  const { reset, selectedTicket, setSelectedTicket } = search;

  // Fresh state on every open — a stale selection from a previous shipment must
  // never be submittable against this one.
  useEffect(() => {
    if (open) {
      reset();
      setError(null);
    }
    // `reset` is a fresh closure each render; depending on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shipmentId]);

  const handleSelect = (t: TicketCandidate | null) => {
    setSelectedTicket(t);
    setError(null);
  };

  const handleLink = async () => {
    if (!selectedTicket || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/support/tickets/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId: selectedTicket.id,
          reference: { shipmentId },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(
          (typeof data?.error === 'string' && data.error.trim()) ||
            `Couldn't link the ticket (HTTP ${res.status})`,
        );
        return;
      }
      invalidateSupportContextCaches(qc);
      onLinked?.(`#${selectedTicket.id}`);
      onClose();
    } catch {
      setError("Couldn't link the ticket — check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <RightPaneOverlay
      open={open}
      onClose={onClose}
      align="center"
      resizable
      storageKey="stn-ticket-link-modal-size"
      minWidth={440}
      minHeight={380}
      className="-mt-8 h-[min(80vh,36rem)] w-[min(94vw,44rem)]"
      aria-label="Link a support ticket to this shipment"
    >
      <div className="flex items-start justify-between gap-3 border-b border-border-soft inset-field">
        <div className="min-w-0">
          <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
            Link support ticket
          </p>
          <p className="truncate text-role-caption font-semibold text-text-default">
            {trackingNumber ? trackingNumber : `Shipment #${shipmentId}`}
          </p>
        </div>
        <IconButton
          size="sm"
          onClick={onClose}
          ariaLabel="Close"
          disabled={submitting}
          icon={<X className="h-4 w-4" />}
        />
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto inset-card text-role-data">
        <TicketPicker
          search={search}
          onSelect={handleSelect}
          mode="reference"
          inputId="stn-ticket-link-search"
          label="Pick the ticket this shipment belongs to"
        />
        {error ? (
          <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-3 text-center text-role-micro font-medium text-rose-600">
            {error}
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border-soft inset-field">
        <p className="truncate text-role-micro font-medium text-text-faint">
          {selectedTicket
            ? `#${selectedTicket.id} — ${selectedTicket.subject || 'no subject'}`
            : 'Select a ticket to link.'}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleLink} disabled={!selectedTicket || submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Linking…
              </>
            ) : (
              'Link ticket'
            )}
          </Button>
        </div>
      </div>
    </RightPaneOverlay>
  );
}
