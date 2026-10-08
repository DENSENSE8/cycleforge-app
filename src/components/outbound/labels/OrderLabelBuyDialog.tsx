'use client';

/**
 * Buy label / Buy replacement label — the dedicated form an order opens
 * (operator 2026-10-08): no purpose selector, no other choices. A large
 * centred panel (fixed title + order) over {@link ReplacementForm}: the labels
 * so far + the ship-to (editable); the parcel (oz, L × W × H) on one row and
 * the insurance; the rate shop — carrier chips, sort, built-in coverage — over
 * a scrolling rate list, a sticky Buy footer and a confirm step.
 *
 * - `outbound`: the order's first label (no tracking linked yet) — no reason.
 * - `replacement`: a shipped order's new label, with the replacement reason;
 *   the stub-merge offer stays at the bottom.
 *
 * The buy is `POST /api/shipping/order-labels/purchase` with the purpose, so
 * the label lands on the order's label list (`shipment_links`: one order id,
 * many labels). After the buy the form stays open on the bought label (print,
 * download, slip, buyer email, void).
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

const TITLE: Readonly<Record<LabelBuyPurpose, string>> = {
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
          <DialogTitle>{TITLE[purpose]}</DialogTitle>
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
        />
      </DialogContent>
    </Dialog>
  );
}
