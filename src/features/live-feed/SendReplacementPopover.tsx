'use client';

/**
 * Send replacement — the Find panel's CTA dialog: the order you just searched
 * gets a replacement label without leaving the board. The buy itself is
 * {@link BuyLabelSection} opened on the `replacement` purpose — rate-shop,
 * purchase (idempotent), print, void — so it behaves exactly like the
 * Outbound panel's buy and lands on the order's label list (`shipment_links`:
 * one order id, many labels). A box with no stored parcel weight cannot rate;
 * the weight field feeds the rate request the operator's scale instead.
 */

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/design-system/components/Dialog';
import { TextField } from '@/design-system/primitives/TextField';
import { BuyLabelSection } from '@/components/outbound/labels/BuyLabelSection';
import type { PackageCard } from '@/lib/live-feed/types';

export function SendReplacementPopover({
  card,
  open,
  onOpenChange,
  onChange,
}: {
  card: PackageCard;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A buy or void landed — the host refreshes the board / find results. */
  onChange: () => void;
}) {
  const [weight, setWeight] = useState('');
  const weightOz = Number(weight);
  const parcelWeight = Number.isFinite(weightOz) && weightOz > 0 ? weightOz : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-w-md flex-col gap-3 overflow-hidden" data-testid="send-replacement-dialog">
        <div className="flex min-w-0 flex-col gap-0.5">
          <DialogTitle>Send replacement</DialogTitle>
          <DialogDescription className="min-w-0 truncate text-sm">
            {card.orderNumber ?? 'This order'} · {card.title}
          </DialogDescription>
        </div>
        <TextField
          label="Parcel weight (oz)"
          value={weight}
          onChange={(next) => setWeight(next.replace(/[^0-9.]/g, ''))}
          placeholder="e.g. 48"
          data-testid="send-replacement-weight"
        />
        <BuyLabelSection
          orderId={card.orderRowId}
          orderRef={card.orderNumber ?? `order ${card.orderRowId}`}
          initialPurpose="replacement"
          weightOz={parcelWeight}
          onChange={onChange}
        />
      </DialogContent>
    </Dialog>
  );
}
