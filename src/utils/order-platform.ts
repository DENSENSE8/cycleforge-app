import {
  inferMarketplaceFromOrderId,
  normalizeMarketplaceOrderId,
} from '@/lib/marketplace-order-id';
import { sourcePlatformMeta, sourcePlatformMetaFromLabel } from '@/lib/source-platform';

export function getOrderPlatformLabel(orderId: string | null | undefined, accountSource: string | null | undefined): string {
  const oid = normalizeMarketplaceOrderId(orderId);
  if (oid === 'Not available' || oid === 'N/A') return ''; // ds-allow-na: legacy protocol empty reader

  /** Pack/tech rows often lack a linked marketplace order id; still show channel from account_source. */
  if (!oid) {
    const src = String(accountSource || '').trim().toLowerCase();
    if (!src) return '';
    if (src === 'fba') return 'FBA';
    if (src === 'ecwid') return 'ECWID';
    return String(accountSource || '').trim();
  }

  // Exact marketplace shapes win over account_source / listing — a Zoho-imported
  // eBay 2-5-5 or Amazon 3-7-7 is still that marketplace's order number.
  const inferred = inferMarketplaceFromOrderId(oid);
  if (inferred) return sourcePlatformMeta(inferred).label;

  if (isFbaOrder(oid, accountSource)) {
    return 'FBA';
  }

  if (/^\d{15}$/.test(oid)) {
    return 'Walmart';
  }

  if (/^\d{4}$/.test(oid)) {
    return 'ECWID';
  }

  return accountSource || '';
}

export function isFbaOrder(orderId: string | null | undefined, accountSource: string | null | undefined): boolean {
  const normalizedOrderId = String(orderId || '').trim().toUpperCase();
  const normalizedAccountSource = String(accountSource || '').trim().toLowerCase();
  return normalizedOrderId.includes('FBA') || normalizedAccountSource === 'fba';
}

/**
 * Order-channel tones converge on the source-platform SoT
 * (`src/lib/source-platform.ts`) so a platform can never present two hues.
 */
const DEFAULT_PLATFORM_COLOR = { text: 'text-text-faint', border: 'border-border-emphasis' };

function orderPlatformTone(label: string): { text: string; border: string } {
  const key = label.toLowerCase().split(/\s*-\s*/)[0].trim();
  const meta = sourcePlatformMetaFromLabel(key);
  if (meta.value) return { text: meta.text, border: meta.border };
  return DEFAULT_PLATFORM_COLOR;
}

export function getOrderPlatformColor(label: string): string {
  return orderPlatformTone(label).text;
}

export function getOrderPlatformBorderColor(label: string): string {
  return orderPlatformTone(label).border;
}

export function getOrderSourceTag(
  orderId: string | null | undefined,
  accountSource: string | null | undefined,
): 'FBA' | 'Orders' {
  return isFbaOrder(orderId, accountSource) ? 'FBA' : 'Orders';
}

/**
 * Marketplace order detail URL for "Open on {platform}" from identity chips.
 * Returns null when the channel/id shape is unknown (menu row stays hidden).
 */
export function marketplaceOrderUrl(
  orderId: string | null | undefined,
  accountSource: string | null | undefined,
): string | null {
  const oid = normalizeMarketplaceOrderId(orderId);
  if (!oid || oid === 'Not available' || oid === 'N/A') return null; // ds-allow-na: legacy protocol empty reader
  if (isFbaOrder(oid, accountSource)) return null;

  const inferred = inferMarketplaceFromOrderId(oid);
  const label = getOrderPlatformLabel(oid, accountSource).toLowerCase();
  const src = String(accountSource || '').trim().toLowerCase();

  // Amazon SP-API AmazonOrderId — official 3-7-7
  if (inferred === 'amazon' || label === 'amazon') {
    return `https://sellercentral.amazon.com/orders-v3/order/${encodeURIComponent(oid)}`;
  }
  // eBay Seller Hub / receipt order number — 2-5-5
  if (inferred === 'ebay' || label === 'ebay' || src === 'ebay') {
    return `https://www.ebay.com/mesh/ord/details?orderid=${encodeURIComponent(oid)}`;
  }
  // Walmart 15-digit
  if (label === 'walmart' || src === 'walmart' || /^\d{15}$/.test(oid)) {
    return `https://seller.walmart.com/orders/manage-orders?orderId=${encodeURIComponent(oid)}`;
  }
  // Ecwid store admin — the store id reaches the client as
  // NEXT_PUBLIC_ECWID_STORE_ID (next.config.ts, from ECWID_STORE_ID).
  if (label === 'ecwid' || src === 'ecwid') {
    const storeId = process.env.NEXT_PUBLIC_ECWID_STORE_ID;
    return storeId
      ? `https://my.ecwid.com/store/${encodeURIComponent(storeId)}#order:id=${encodeURIComponent(oid)}&return=orders`
      : null;
  }

  return null;
}

