'use client';

/** Ticket-side Ecwid / operational order link action. */

import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { IconButton } from '@/design-system/primitives/IconButton';
import { RightPaneOverlay } from '@/components/ui/RightPaneOverlay';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { invalidateSupportContextCaches } from '@/hooks/useLinkTicketTrackingReference';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

export function TicketOrderLinkPopover({
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
  const qc = useQueryClient();
  const [orderDraft, setOrderDraft] = useState('');

  const linkOrder = useMutation({
    mutationFn: async (orderNumber: string) => {
      const lookupRes = await fetch(`/api/orders/lookup/${encodeURIComponent(orderNumber)}`);
      const lookup = await lookupRes.json().catch(() => null);
      if (!lookupRes.ok || !lookup?.ok || lookup?.order?.id == null) {
        throw new Error(
          lookup?.error === 'not_found'
            ? `Order #${orderNumber} not found`
            : lookup?.error || `Order #${orderNumber} not found`,
        );
      }
      const orderPk = Number(lookup.order.id);
      if (!Number.isFinite(orderPk) || orderPk <= 0) {
        throw new Error(`Order #${orderNumber} not found`);
      }

      const res = await fetch('/api/support/tickets/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId,
          anchor: { type: 'order', orderId: orderPk },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || data?.details || 'Could not link order');
      }
      return {
        orderNumber: String(lookup.order.order_id ?? orderNumber),
        entityType: data.entityType as string,
      };
    },
    onSuccess: (result) => {
      invalidateSupportContextCaches(qc);
      toast.success(`Linked Order #${result.orderNumber}`);
      setOrderDraft('');
      onClose();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not link order');
    },
  });

  useEffect(() => {
    if (open) setOrderDraft('');
  }, [open, ticketId]);

  const submit = () => {
    const orderNumber = orderDraft.trim().replace(/^#/, '');
    if (!orderNumber || linkOrder.isPending) return;
    linkOrder.mutate(orderNumber);
  };

  return (
    <RightPaneOverlay
      open={open}
      onClose={onClose}
      align="center"
      resizable
      storageKey="ticket-order-link-modal-size"
      minWidth={440}
      minHeight={280}
      className="-mt-8 h-[min(70vh,28rem)] w-[min(94vw,36rem)]"
      aria-label={`Link order to ${ticketLabel ?? `ticket #${ticketId}`}`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border-soft inset-field">
        <div className="min-w-0">
          <p className="text-role-eyebrow text-text-soft">
            Link order
          </p>
          <p className="truncate text-role-caption font-semibold text-text-default">
            {ticketLabel ?? `Ticket #${ticketId}`}
          </p>
        </div>
        <IconButton
          size="sm"
          onClick={onClose}
          ariaLabel="Close"
          disabled={linkOrder.isPending}
          icon={<X className="h-4 w-4" />}
        />
      </div>

      <form
        className="min-h-0 flex-1 space-y-3 overflow-y-auto inset-card text-role-data"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label
          htmlFor={inputId}
          className="block text-role-micro text-text-muted"
        >
          Order number
        </label>
        <input
          ref={inputRef}
          id={inputId}
          value={orderDraft}
          onChange={(event) => setOrderDraft(event.target.value)}
          placeholder="Paste Ecwid / order #…"
          autoFocus
          className={cn(
            'w-full rounded-md border border-border-default bg-surface-card inset-field text-role-caption font-semibold text-text-default placeholder:text-text-faint',
            focusRing('field', 'accent'),
          )}
        />
        <p className="text-role-micro font-medium text-text-faint">
          Links this ticket to the order. Walk-in and phone orders without
          tracking attach directly; shipped orders use the primary tracking.
        </p>
      </form>

      <div className="flex items-center justify-end gap-2 border-t border-border-soft inset-field">
        <Button variant="secondary" onClick={onClose} disabled={linkOrder.isPending}>
          Cancel
        </Button>
        <Button onClick={submit} loading={linkOrder.isPending} disabled={!orderDraft.trim()}>
          Link
        </Button>
      </div>
    </RightPaneOverlay>
  );
}
