'use client';

/**
 * Return label — the order record's Return label verb (operator 2026-10-08):
 * the ShipStation rate shop opened on the `return` purpose over the record,
 * so the label (buyer → warehouse) lands on this order's label list.
 */

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/design-system/components/Dialog';
import { BuyLabelSection } from './BuyLabelSection';

export function ReturnLabelDialog({
  orderId,
  orderRef,
  onClose,
  onChange,
}: {
  orderId: number;
  orderRef: string;
  onClose: () => void;
  /** A buy or void landed — the host refreshes its record / list. */
  onChange: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-3 overflow-y-auto" data-testid="return-label-dialog">
        <div className="flex min-w-0 flex-col gap-0.5">
          <DialogTitle>Return label</DialogTitle>
          <DialogDescription className="min-w-0 truncate font-mono text-sm">{orderRef}</DialogDescription>
        </div>
        <BuyLabelSection orderId={orderId} orderRef={orderRef} initialPurpose="return" onChange={onChange} />
      </DialogContent>
    </Dialog>
  );
}
