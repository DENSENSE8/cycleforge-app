/** Pure kiosk-local-pickup draft helpers. The server still lands this through ingestInboundOrder. */

import {
  emptyInboundOrderDraft,
  emptyInboundOrderLine,
  inboundOrderMissing,
  type InboundOrderDraft,
  type InboundOrderLine,
} from '@/lib/inbound/inbound-order-draft';

export interface KioskPickupProduct {
  id: string;
  name: string;
  sku: string;
  price: number | null;
}
/** A kiosk pickup is a manual inbound order; `manual` intentionally has no marketplace paint. */
export function createKioskPickupDraft(pickupDate: string): InboundOrderDraft {
  return {
    ...emptyInboundOrderDraft('PICKUP'),
    platform: 'manual',
    orderDate: pickupDate,
    tracking: [],
    lines: [],
  };
}

function lineForProduct(product: KioskPickupProduct): InboundOrderLine {
  return {
    ...emptyInboundOrderLine(),
    lineKey: product.id,
    sku: product.sku,
    title: product.name,
    quantity: 1,
    unitCostCents:
      product.price == null || !Number.isFinite(product.price)
        ? null
        : Math.max(0, Math.round(product.price * 100)),
  };
}

/**
 * Reconcile catalog/manual picks without discarding condition, quantity, or
 * cost already entered on a surviving line.
 */
export function syncKioskPickupProducts(
  draft: InboundOrderDraft,
  products: readonly KioskPickupProduct[],
): InboundOrderDraft {
  const existing = new Map(draft.lines.map((line) => [line.lineKey, line]));
  return {
    ...draft,
    lines: products.map((product) => existing.get(product.id) ?? lineForProduct(product)),
  };
}

export function kioskPickupReady(draft: InboundOrderDraft): boolean {
  return inboundOrderMissing(draft).length === 0;
}
