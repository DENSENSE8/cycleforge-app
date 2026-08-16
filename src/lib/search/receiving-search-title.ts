/**
 * Adaptive receiving title for search docs — mirrors
 * {@link receivingAdaptiveRailTitle} intent without importing ReceivingLineRow:
 * multi distinct SKU → PO/order identity; single product → item name.
 */

import { formatReturnSerialProductTitle } from '@/components/station/receiving-line-serials';

interface ReceivingSearchTitleInput {
  lineCount: number;
  distinctSkuCount: number;
  poNumber: string | null;
  sourceOrderId: string | null;
  sourcePlatform: string | null;
  firstItemName: string | null;
  /** Fallback when nothing else resolves (e.g. `Receiving #123`). */
  fallback: string;
}

/**
 * Left-chip identity for a receiving carton: Zoho PO# preferred, else
 * marketplace source_order_id.
 */
export function receivingOrderIdFromParts(
  poNumber: string | null | undefined,
  sourceOrderId: string | null | undefined,
): string {
  const po = (poNumber ?? '').trim();
  if (po) return po;
  return (sourceOrderId ?? '').trim();
}

/** PO/order summary title when the carton has multiple distinct products. */
export function receivingPoIdentityTitle(input: {
  poNumber: string | null;
  sourceOrderId: string | null;
  sourcePlatform: string | null;
}): string {
  const po = (input.poNumber ?? '').trim();
  const orderId = (input.sourceOrderId ?? '').trim();
  const platform = (input.sourcePlatform ?? '').trim();
  const idPart = po
    ? /^PO\b/i.test(po)
      ? po
      : `PO ${po}`
    : orderId
      ? `Order ${orderId}`
      : '';
  return [platform, idPart].filter(Boolean).join(' · ');
}

/**
 * Search receiving title:
 *   - multi distinct SKU + PO/order identity → PO title
 *   - otherwise → first product/item name (or fallback)
 */
export function receivingSearchTitle(input: ReceivingSearchTitleInput): string {
  const multi =
    input.lineCount > 1 &&
    input.distinctSkuCount > 1 &&
    Boolean(receivingOrderIdFromParts(input.poNumber, input.sourceOrderId));
  if (multi) {
    const poTitle = receivingPoIdentityTitle(input);
    if (poTitle) return poTitle;
  }
  const product = (input.firstItemName ?? '').trim();
  if (product) return formatReturnSerialProductTitle(product);
  const id = receivingOrderIdFromParts(input.poNumber, input.sourceOrderId);
  if (id) return id;
  return input.fallback;
}
