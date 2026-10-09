'use client';

/**
 * Buy label / Buy replacement label in the docs sheet's viewer column — the
 * right side, full height (operator 2026-10-08: the Live feed buys with the
 * same detailed form as the order record, outbound-specific, no purpose
 * switcher). The body is `ReplacementForm`, the one form `OrderLabelBuyDialog`
 * hosts too; this is its second host, headed like the viewer it stands in
 * for. Close (or Esc, or the form's Done) hands the column back to the
 * document preview.
 */

import { X } from 'lucide-react';
import { LABEL_BUY_TITLE } from '@/components/outbound/labels/OrderLabelBuyDialog';
import { ReplacementForm, type LabelBuyPurpose } from '@/components/outbound/labels/replacement/ReplacementForm';
import { IconButton } from '@/design-system/primitives/IconButton';
import type { OrderPacket } from '@/lib/label-prints/order-packet-contracts';

export function SheetLabelBuy({
  packet,
  purpose,
  onChange,
  onClose,
}: {
  packet: OrderPacket;
  purpose: LabelBuyPurpose;
  /** A buy, void or merge landed — the sheet re-reads. */
  onChange: () => void;
  onClose: () => void;
}) {
  return (
    <section
      aria-label={LABEL_BUY_TITLE[purpose]}
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-card"
      data-docs-label-buy
      data-testid="docs-label-buy"
    >
      <header className="flex min-h-12 min-w-0 items-center gap-2 border-b border-border-soft px-4 py-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="min-w-0 truncate text-role-data font-semibold text-text-default">{LABEL_BUY_TITLE[purpose]}</span>
          <span className="min-w-0 truncate text-role-caption text-text-muted">
            <span className="font-mono font-semibold text-text-default">{packet.orderRef}</span>
            {packet.lines[0]?.title ? ` · ${packet.lines[0].title}` : ''}
          </span>
        </div>
        <IconButton icon={<X />} size="sm" radius="control" ariaLabel="Close — back to the document" onClick={onClose} data-testid="docs-label-buy-close" />
      </header>
      <ReplacementForm
        key={`${packet.orderId}:${purpose}`}
        purpose={purpose}
        orderId={packet.orderId}
        orderNumber={packet.orderRef}
        currentTracking={packet.shipment?.trackingNumber ?? null}
        onChange={onChange}
        onDone={onClose}
      />
    </section>
  );
}
