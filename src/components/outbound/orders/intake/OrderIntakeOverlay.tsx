'use client';

/**
 * Order-intake **stage-filling L2** — Center Lock host for {@link OrderIntakeForm}.
 *
 * Operator 2026-09-02: not a Dialog, not an inset popover card. Mounts
 * {@link DeskStageOverlay} with `fill="stage"` so the form covers the entire
 * To-ship `desk-page-stage` card (same footprint as the DataTable). Table
 * stays mounted underneath (Q5); Esc / ✕ close; scrim does not dismiss.
 *
 * Say this to agents: "stage-filling DeskStageOverlay L2" / "fill=stage" —
 * never "inline popover" or "plane XOR walk".
 */

import { DeskStageOverlay } from '@/design-system/components/DeskStageOverlay';
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
    <DeskStageOverlay
      open={open}
      onClose={onClose}
      title="Order intake"
      subtitle={
        orderId
          ? `Order #${orderId} · caged session`
          : 'Acknowledge, pair, parcel, assign — then release into To-ship'
      }
      closeOnScrim={false}
      fill="stage"
      testId="order-intake-overlay"
    >
      <OrderIntakeForm
        orderId={orderId}
        onOrderCreated={onOrderCreated}
        onReleased={onClose}
      />
    </DeskStageOverlay>
  );
}
