'use client';

/**
 * Buy label / Buy replacement label — the dedicated form an order opens
 * (operator 2026-10-08): no purpose selector, no other choices. A large
 * centred panel (fixed title + order) over {@link ReplacementForm}: on a desk
 * the details (ship-to, parcel, insurance) on the left and the buy (rates →
 * confirm → the bought label) on the right; on a phone a stepper (Ship to →
 * Parcel → Rate → Confirm → Done).
 *
 * - `outbound`: the order's first label (no tracking linked yet) — no reason.
 * - `replacement`: a shipped order's new label, with the replacement reason and
 *   the stub-merge offer among the details.
 *
 * The buy is `POST /api/shipping/order-labels/purchase` with the purpose, so
 * the label lands on the order's label list (`shipment_links`: one order id,
 * many labels). After the buy the form stays open on the Done step (print,
 * download, slip, buyer email, void); its Done closes the panel.
 */

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/design-system/components/Dialog';
import { ReplacementForm, type LabelBuyPurpose } from './replacement/ReplacementForm';

/** The order a label ships against — a board card or an order record carries these. */
export interface LabelBuyOrder {
  /** `orders.id`. */
  orderRowId: number;
  /** The marketplace order number. */
  orderNumber: string | null;
  title: string;
  /** The tracking the order shipped on — shown when no label is in the ledger yet (an imported label). */
  tracking?: string | null;
}

/** The form's title per purpose — this dialog and the Live feed sheet's viewer column both print it. */
export const LABEL_BUY_TITLE: Readonly<Record<LabelBuyPurpose, string>> = {
  outbound: 'Buy label',
  replacement: 'Buy replacement label',
};

export function OrderLabelBuyDialog({
  purpose,
  order,
  open,
  onOpenChange,
  onChange,
}: {
  purpose: LabelBuyPurpose;
  order: LabelBuyOrder;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A buy, void or merge landed — the host refreshes its own list / record. */
  onChange: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[85vh] max-w-5xl flex-col gap-0 overflow-hidden p-0"
        data-testid={`${purpose}-label-buy-dialog`}
      >
        <header className="flex shrink-0 flex-col gap-0.5 border-b border-border-hairline px-5 pb-3 pr-12 pt-5">
          <DialogTitle>{LABEL_BUY_TITLE[purpose]}</DialogTitle>
          <DialogDescription className="flex min-w-0 items-baseline gap-2 text-sm">
            <span className="shrink-0 font-mono font-semibold text-text-default">
              {order.orderNumber ?? `Order ${order.orderRowId}`}
            </span>
            <span className="min-w-0 truncate">{order.title}</span>
          </DialogDescription>
        </header>
        {/* Radix unmounts the content when closed, so each opening starts a fresh form. */}
        <ReplacementForm
          key={order.orderRowId}
          purpose={purpose}
          orderId={order.orderRowId}
          orderNumber={order.orderNumber}
          currentTracking={order.tracking ?? null}
          onChange={onChange}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
