'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { X } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { IconButton } from '@/design-system/primitives/IconButton';
import { RightPaneOverlay } from '@/components/ui/RightPaneOverlay';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { useLinkTicketTrackingReference } from '@/hooks';
import { cn } from '@/utils/_cn';

/**
 * Ticket-side STN reference action.
 *
 * Same centered {@link RightPaneOverlay} shell as {@link StnTicketLinkModal} /
 * ReceivingClaimModal — but the opposite direction: the ticket is fixed and
 * each pasted/scanned tracking number becomes a SHIPMENT reference so Receiving
 * Unbox can resolve the ticket when that STN is scanned.
 *
 * Deliberately NOT StnTicketLinkModal (shipment → pick ticket) and NOT the
 * claim wizard (photos / compose / seller). One job: attach tracking refs.
 */
export function TicketStnLinkPopover({
  open,
  onClose,
  ticketId,
  ticketLabel,
}: {
  open: boolean;
  onClose: () => void;
  ticketId: number;
  ticketLabel?: string;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [trackingDraft, setTrackingDraft] = useState('');
  const linkTracking = useLinkTicketTrackingReference({
    ticketId,
    onSuccess: () => {
      setTrackingDraft('');
      requestAnimationFrame(() => inputRef.current?.focus());
    },
  });

  useEffect(() => {
    if (open) setTrackingDraft('');
  }, [open, ticketId]);

  return (
    <RightPaneOverlay
      open={open}
      onClose={onClose}
      align="center"
      resizable
      storageKey="ticket-stn-link-modal-size"
      minWidth={440}
      minHeight={280}
      className="-mt-8 h-[min(70vh,28rem)] w-[min(94vw,36rem)]"
      aria-label={`Link tracking number to ${ticketLabel ?? `ticket #${ticketId}`}`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border-soft inset-field">
        <div className="min-w-0">
          <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
            Add tracking number
          </p>
          <p className="truncate text-role-caption font-semibold text-text-default">
            {ticketLabel ?? `Ticket #${ticketId}`}
          </p>
        </div>
        <IconButton
          size="sm"
          onClick={onClose}
          ariaLabel="Close"
          disabled={linkTracking.isPending}
          icon={<X className="h-4 w-4" />}
        />
      </div>

      <form
        className="min-h-0 flex-1 space-y-3 overflow-y-auto inset-card text-role-data"
        onSubmit={(event) => {
          event.preventDefault();
          const trackingNumber = trackingDraft.trim();
          if (!trackingNumber || linkTracking.isPending) return;
          linkTracking.mutate(trackingNumber);
        }}
      >
        <label
          htmlFor={inputId}
          className="block text-role-micro uppercase tracking-wider text-text-muted"
        >
          Tracking number
        </label>
        <input
          ref={inputRef}
          id={inputId}
          value={trackingDraft}
          onChange={(event) => setTrackingDraft(event.target.value)}
          placeholder="Paste or scan tracking…"
          autoFocus
          className={cn(
            'w-full rounded-md border border-border-default bg-surface-card inset-field text-role-caption font-semibold text-text-default placeholder:text-text-faint',
            focusRing('field', 'accent'),
          )}
        />
        <p className="text-role-micro font-medium text-text-faint">
          Link, then scan or paste another. Unbox will show this ticket when the
          STN is scanned.
        </p>
      </form>

      <div className="flex items-center justify-end gap-2 border-t border-border-soft inset-field">
        <Button variant="secondary" onClick={onClose} disabled={linkTracking.isPending}>
          Done
        </Button>
        <Button
          onClick={() => {
            const trackingNumber = trackingDraft.trim();
            if (!trackingNumber || linkTracking.isPending) return;
            linkTracking.mutate(trackingNumber);
          }}
          loading={linkTracking.isPending}
          disabled={!trackingDraft.trim()}
        >
          Link
        </Button>
      </div>
    </RightPaneOverlay>
  );
}
