/**
 * eBay buyer purchase → `InboundOrderDraft` — the ONE mapper every eBay
 * purchase trigger (the scheduled sync, the per-order resync, the manual
 * import route) runs before landing through `ingestInboundOrder`.
 *
 * One eBay order (Trading GetOrders OrderRole=Buyer) = one draft: platform
 * `ebay`, order number = the eBay order id, vendor = the seller, one line per
 * transaction keyed by its OrderLineItemID (the same key the 2026-09-27e
 * backfill gave pre-existing eBay lines, so a re-land updates them in place),
 * every distinct tracking number the order carries.
 *
 * Client-safe: no server imports.
 */

import type { BuyerPurchaseLine } from '@/lib/ebay/purchase-client';
import { INBOUND_PRIORITY_AUTO, type InboundOrderDraft, type InboundOrderLine } from './inbound-order-draft';

export interface EbayPurchaseOrderDraft {
  /** The eBay order id the lines were grouped on. */
  orderId: string;
  draft: InboundOrderDraft;
}

function clip(value: string | null | undefined, max: number): string {
  return (value ?? '').trim().slice(0, max);
}

function firstOf<T>(lines: readonly BuyerPurchaseLine[], pick: (l: BuyerPurchaseLine) => T | null | undefined): T | null {
  for (const l of lines) {
    const v = pick(l);
    if (v != null && v !== '') return v;
  }
  return null;
}

function draftLine(line: BuyerPurchaseLine, orderId: string): InboundOrderLine {
  const itemId = clip(line.itemId, 64);
  const title = clip(line.itemName, 500) || (itemId ? `eBay item ${itemId}` : `eBay order ${orderId}`);
  const qty = Math.floor(Number(line.quantity ?? 1));
  return {
    lineKey: clip(line.sourceLineItemId, 120),
    skuCatalogId: null,
    sku: clip(line.sku, 200),
    title,
    quantity: Number.isFinite(qty) && qty >= 1 ? Math.min(qty, 10_000) : 1,
    unitCostCents: line.unitCostCents != null && Number.isFinite(line.unitCostCents) && line.unitCostCents >= 0
      ? Math.round(line.unitCostCents)
      : null,
    listingUrl: clip(line.listingUrl, 2000),
    itemNumber: itemId,
    conditionGrade: null,
    partsStatus: null,
    missingPartsNote: '',
    conditionNote: '',
  };
}

/** Build the draft for one eBay order from its transaction lines (all sharing one sourceOrderId). */
export function ebayPurchaseToInboundOrderDraft(
  orderLines: readonly BuyerPurchaseLine[],
  accountName: string | null,
): InboundOrderDraft {
  const orderId = orderLines[0]?.sourceOrderId.trim() ?? '';

  // A re-paged order can repeat a transaction: the last copy of a line key wins.
  const byKey = new Map<string, BuyerPurchaseLine>();
  orderLines.forEach((l, i) => byKey.set(l.sourceLineItemId?.trim() || `#${i}`, l));
  const lines = [...byKey.values()];

  const tracking: InboundOrderDraft['tracking'] = [];
  for (const l of lines) {
    const number = clip(l.trackingNumber, 80);
    if (!number || tracking.some((t) => t.number === number) || tracking.length >= 500) continue;
    tracking.push({ number, carrier: clip(l.carrierCode, 40) });
  }

  const orderStatus = clip(firstOf(lines, (l) => l.purchaseOrderStatus), 80);
  const paymentStatus = clip(firstOf(lines, (l) => l.paymentStatus), 80);
  const currency = firstOf(lines, (l) => l.currency?.trim().toUpperCase());

  return {
    type: 'PO',
    platform: 'ebay',
    orderNumber: clip(orderId, 200),
    vendor: clip(firstOf(lines, (l) => l.vendorOrSellerName ?? l.sellerUsername), 200),
    accountName: clip(accountName, 200),
    priority: INBOUND_PRIORITY_AUTO,
    orderDate: firstOf(lines, (l) => l.orderDate),
    expectedDate: null,
    currency: currency && currency.length === 3 ? currency : 'USD',
    tracking,
    lines: lines.map((l) => draftLine(l, orderId)),
    notes: '',
    returnReason: '',
    rmaId: '',
    ...(orderStatus || paymentStatus ? { sourceStatus: { order: orderStatus, payment: paymentStatus } } : {}),
  };
}

/** Group a buyer account's fetched lines into one draft per eBay order, in fetch order. */
export function ebayPurchaseDrafts(
  lines: readonly BuyerPurchaseLine[],
  accountName: string | null,
): EbayPurchaseOrderDraft[] {
  const orders = new Map<string, BuyerPurchaseLine[]>();
  for (const line of lines) {
    const id = line.sourceOrderId?.trim();
    if (!id) continue;
    const group = orders.get(id);
    if (group) group.push(line);
    else orders.set(id, [line]);
  }
  return [...orders].map(([orderId, group]) => ({ orderId, draft: ebayPurchaseToInboundOrderDraft(group, accountName) }));
}
