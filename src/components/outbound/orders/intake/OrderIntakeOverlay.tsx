'use client';

/**
 * Order-intake **overlay** — the centered session host for `OrderIntakeForm`.
 * Operator override (2026-08-30, in chat): the intake session displays as a
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { OrderIntakeForm } from './OrderIntakeForm';

export function OrderIntakeOverlay({
  open,
  orderId,
  onClose,
  onOrderCreated,
}: {
  open: boolean;
  /** Order the session is bound to. `null` = start a new caged order. */
  orderId: number | null;
  /** Clears the `?triage=` param (Esc, ✕, or release). */
  onClose: () => void;
  /** Binds the URL to a created (or opened-existing) order id. */
  onOrderCreated?: (orderId: number) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent
        // A takeover session: wide, tall, its own scroll — never a cramped card.
        className="grid h-[min(85vh,52rem)] w-[min(94vw,46rem)] max-w-none grid-rows-[auto_minmax(0,1fr)] gap-0 p-0"
        onInteractOutside={(event) => event.preventDefault()}
        data-testid="order-intake-overlay"
      >
        <DialogHeader className="border-b border-border-hairline px-5 py-3.5">
          <div className="flex items-center gap-2 pr-8">
            <DialogTitle>Order intake</DialogTitle>
            <Badge variant={orderId ? 'default' : 'secondary'}>
              {orderId ? `Order #${orderId} · caged session` : 'New order'}
            </Badge>
          </div>
          <DialogDescription>
            Acknowledge, pair, parcel, assign — then release into To-ship. Progress lives on
            the caged order, so closing never loses a started session.
          </DialogDescription>
        </DialogHeader>
        <OrderIntakeForm
          orderId={orderId}
          onOrderCreated={onOrderCreated}
          onReleased={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
